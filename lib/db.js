'use strict';
/**
 * 国服服务器版 · 独立联机版 — SQLite 存档层（lib/db.js）
 *
 * 无账号体系：玩家身份就是客户端 localStorage 里的设备 ID（uuid），
 * 服务端信任客户端传来的 deviceId（休闲游戏，不做强校验）。
 *
 * 表：
 *   meta              — 键值杂项（认领码是否已用、每设备最后选的存档位）
 *   characters        — 角色。device_id 为 NULL = 迁移预置的未认领角色；
 *                       device_id 有值 = 已属于某设备。data 存整份角色
 *                       存档 JSON 原样（迁移时一个字节都不改）。
 *   auction_listings  — 拍卖行在售/已售/已下架/已过期
 *   auction_claims    — 待领取（金币 / 物品），claimed_at 为 NULL = 待领取
 *
 * 世界实例不落库，只在内存里跑（见 lib/world.js）。
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'game.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

/**
 * 重名去重（全服唯一索引建成前跑）：同一名字有多人时，保留最早建的，
 * 其余的改名（原名 + #2、#3……），name 列与 data JSON 里的 name 一起改，
 * 绝不删号。返回改名记录 [{id, oldName, newName}]（供启动日志与汇报）。
 */
function dedupNames() {
  const groups = db.prepare(
    'SELECT name, COUNT(*) AS n FROM characters GROUP BY name HAVING n > 1'
  ).all();
  if (groups.length === 0) return [];
  const taken = new Set(db.prepare('SELECT name FROM characters').all().map((r) => r.name));
  const renamed = [];
  for (const g of groups) {
    const rows = db.prepare(
      'SELECT id, name, data, created_at FROM characters WHERE name = ? ORDER BY created_at ASC, id ASC'
    ).all(g.name);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let suffix = 2;
      let newName = `${row.name}#${suffix}`;
      while (taken.has(newName)) { suffix += 1; newName = `${row.name}#${suffix}`; }
      let dataObj = null;
      try { dataObj = JSON.parse(row.data); } catch (_) { dataObj = null; }
      if (dataObj && typeof dataObj === 'object') dataObj.name = newName;
      const newData = dataObj ? JSON.stringify(dataObj) : row.data;
      db.prepare('UPDATE characters SET name = ?, data = ?, updated_at = ? WHERE id = ?')
        .run(newName, newData, Date.now(), row.id);
      taken.add(newName);
      renamed.push({ id: row.id, oldName: row.name, newName });
      console.log(`[db] 重名去重：角色 id=${row.id}「${row.name}」改名为「${newName}」（保留先建的）`);
    }
  }
  return renamed;
}

/** 把指定角色改名（name 列 + data JSON 里的 name 一起改），返回新名字。
 * 新名字取 baseName + #2、#3……（保证不与现有名字冲突）。 */
function renameCharacter(id, baseName) {
  const taken = new Set(db.prepare('SELECT name FROM characters').all().map((r) => r.name));
  let suffix = 2;
  let newName = `${baseName}#${suffix}`;
  while (taken.has(newName)) { suffix += 1; newName = `${baseName}#${suffix}`; }
  const row = db.prepare('SELECT data FROM characters WHERE id = ?').get(id);
  let dataObj = null;
  try { dataObj = row ? JSON.parse(row.data) : null; } catch (_) { dataObj = null; }
  if (dataObj && typeof dataObj === 'object') dataObj.name = newName;
  const newData = dataObj ? JSON.stringify(dataObj) : (row ? row.data : '{}');
  db.prepare('UPDATE characters SET name = ?, data = ?, updated_at = ? WHERE id = ?')
    .run(newName, newData, Date.now(), id);
  return newName;
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
      name TEXT NOT NULL,
      cls TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      claimed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auction_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_device_id TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      seller_slot INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('equip', 'skillbook')),
      item_json TEXT NOT NULL,
      price INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'delisted', 'expired')),
      buyer_device_id TEXT,
      buyer_slot INTEGER
    );
    CREATE TABLE IF NOT EXISTS auction_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_device_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('gold', 'item')),
      amount_or_item_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER
    );
    -- 未认领的预置角色：同一 slot 只能有一个（device_id 为 NULL 时
    -- 普通 UNIQUE 会把 NULL 当互不相同，所以用部分唯一索引约束）。
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unclaimed_slot
      ON characters (slot) WHERE device_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_device_slot
      ON characters (device_id, slot) WHERE device_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_device_name
      ON characters (device_id, name) WHERE device_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_listings_status ON auction_listings (status, created_at);
    CREATE INDEX IF NOT EXISTS idx_claims_user ON auction_claims (user_device_id, claimed_at);
    -- 服务器版 artifact 拍卖行（/actions 兼容层专用，与上面联机版拍卖行表
    -- 完全隔离：artifact 模型是 listing 表 + 3 个领取标志位，无独立 claims 表）。
    CREATE TABLE IF NOT EXISTS art_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id TEXT NOT NULL,
      seller_slot INTEGER NOT NULL,
      seller_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      item_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'returned')),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      buyer_id TEXT,
      buyer_slot INTEGER,
      proceeds_claimed INTEGER NOT NULL DEFAULT 0,
      delivered INTEGER NOT NULL DEFAULT 0,
      returned_claimed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_art_listings_status ON art_listings (status, created_at);
  `);
  // 全服唯一名：先去重（保留先建的、后建的改名，绝不删号），再把原来
  // “device 内唯一”的 idx_device_name 换成全服唯一索引 idx_name_global。
  dedupNames();
  db.exec('DROP INDEX IF EXISTS idx_device_name;');
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_name_global ON characters (name);');
  } catch (e) {
    // 索引建失败也不让启动崩掉：应用层 nameTaken / findByName 仍会拦重名。
    console.error('[db] 全服唯一索引创建失败（应用层仍会拦重名）：' + e.message);
  }
}

// ---------------------------------------------------------------- meta
function metaGet(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}
function metaSet(key, value) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// ---------------------------------------------------------------- 角色
function rowToSummary(row) {
  if (!row) return null;
  return {
    slot: row.slot, name: row.name, cls: row.cls,
    level: row.level, xp: row.xp, gold: row.gold,
    claimedAt: row.claimed_at || null,
  };
}
function rowToCharacter(row) {
  if (!row) return null;
  let data = null;
  try { data = JSON.parse(row.data); } catch (_) { data = null; }
  return {
    id: row.id, deviceId: row.device_id, slot: row.slot,
    name: row.name, cls: row.cls, level: row.level, xp: row.xp, gold: row.gold,
    data, claimedAt: row.claimed_at || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/** 返回该设备的 5 个位：[{slot, …摘要} | null, …]，下标 0 = 1 号位。 */
function listCharactersByDevice(deviceId) {
  const rows = db.prepare(
    'SELECT * FROM characters WHERE device_id = ? ORDER BY slot'
  ).all(deviceId);
  const out = [null, null, null, null, null];
  for (const r of rows) out[r.slot - 1] = rowToSummary(r);
  return out;
}
function getCharacter(deviceId, slot) {
  const row = db.prepare(
    'SELECT * FROM characters WHERE device_id = ? AND slot = ?'
  ).get(deviceId, slot);
  return rowToCharacter(row);
}
/** /actions 兼容层用：返回存档 JSON 原字符串（不解析）与更新时间。 */
function getCharacterRaw(deviceId, slot) {
  const row = db.prepare(
    'SELECT data, updated_at FROM characters WHERE device_id = ? AND slot = ?'
  ).get(deviceId, slot);
  if (!row) return { slot, save: null, updatedAt: 0 };
  return { slot, save: row.data, updatedAt: row.updated_at || 0 };
}
function getUnclaimedCharacters() {
  return db.prepare(
    'SELECT * FROM characters WHERE device_id IS NULL ORDER BY slot'
  ).all().map(rowToCharacter);
}
function countCharacters(deviceId) {
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM characters WHERE device_id = ?'
  ).get(deviceId);
  return row.n;
}
/** 角色名全服唯一：任何两个角色（不管 device、slot）都不能同名。 */
function nameTaken(name) {
  const row = db.prepare(
    'SELECT id FROM characters WHERE name = ?'
  ).get(name);
  return !!row;
}

/** 按名字找角色（返回 {id, device_id, slot, name} 或 null），供建角/认领判重用。 */
function findByName(name) {
  const row = db.prepare(
    'SELECT id, device_id, slot, name FROM characters WHERE name = ?'
  ).get(name);
  return row || null;
}

/** 建角色。saveObj 为整份角色存档对象（调用方负责按现版本初始化）。 */
function createCharacter(deviceId, slot, name, cls, saveObj) {
  const now = Date.now();
  const data = JSON.stringify(saveObj);
  try {
    const r = db.prepare(
      `INSERT INTO characters
         (device_id, slot, name, cls, level, xp, gold, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(deviceId, slot, name, cls, saveObj.level || 1, saveObj.xp || 0,
      saveObj.gold || 0, data, now, now);
    return getCharacterById(r.lastInsertRowid);
  } catch (e) {
    return null; // 唯一约束冲突（位被占 / 名字重复）
  }
}
function getCharacterById(id) {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  return rowToCharacter(row);
}

/** 写回整份角色存档（data 原样存 JSON，索引列同步更新）。 */
function saveCharacter(deviceId, slot, saveObj) {
  const now = Date.now();
  const data = JSON.stringify(saveObj);
  const r = db.prepare(
    `UPDATE characters SET name = ?, cls = ?, level = ?, xp = ?, gold = ?,
       data = ?, updated_at = ? WHERE device_id = ? AND slot = ?`
  ).run(saveObj.name, saveObj.classId, saveObj.level || 1, saveObj.xp || 0,
    saveObj.gold || 0, data, now, deviceId, slot);
  return r.changes > 0;
}
/** 与 saveCharacter 相同，但 cls 列用调用方给的值（data 仍原样存）。
 * /actions 兼容层用：artifact 存档的 classId 是 warrior/mage/taoist，
 * data 原样存、cls 列归一为 war/mage/tao（与 migrate 口径一致）。 */
function saveCharacterRaw(deviceId, slot, saveObj, cls) {
  const now = Date.now();
  const data = JSON.stringify(saveObj);
  const r = db.prepare(
    `UPDATE characters SET name = ?, cls = ?, level = ?, xp = ?, gold = ?,
       data = ?, updated_at = ? WHERE device_id = ? AND slot = ?`
  ).run(saveObj.name, cls, saveObj.level || 1, saveObj.xp || 0,
    saveObj.gold || 0, data, now, deviceId, slot);
  return r.changes > 0;
}
function deleteCharacter(deviceId, slot) {
  const r = db.prepare(
    'DELETE FROM characters WHERE device_id = ? AND slot = ?'
  ).run(deviceId, slot);
  return r.changes > 0;
}
function setLastSlot(deviceId, slot) { metaSet('last_slot:' + deviceId, slot); }
function getLastSlot(deviceId) {
  const v = metaGet('last_slot:' + deviceId);
  const n = v ? parseInt(v, 10) : NaN;
  return n >= 1 && n <= 5 ? n : null;
}

// ---------------------------------------------------------------- 认领
function isClaimUsed() { return metaGet('claim_used') === '1'; }

/**
 * 一次性认领：把全部预置未认领角色绑定到 deviceId。
 * 要求目标设备的 1–3 号位（即预置角色的 slot）都是空的，否则拒绝，
 * 避免覆盖该设备已有的角色。
 */
function claimAll(deviceId) {
  if (isClaimUsed()) return { ok: false, error: '认领码已失效' };
  const unclaimed = getUnclaimedCharacters();
  if (unclaimed.length === 0) return { ok: false, error: '没有可认领的角色' };
  for (const ch of unclaimed) {
    if (getCharacter(deviceId, ch.slot)) {
      return { ok: false, error: '目标存档位已被占用（' + ch.slot + ' 号位）' };
    }
  }
  // 全服唯一：种子名若被别人先占了（例如有人新建了同名角色），把占名者
  // （后建的）改名让出名字，种子（先建的）保留原名；绝不因此拒绝认领。
  // 注意：同名可能不止一人，须把除种子自身外的所有占名者都改名
  //（findByName 只返回一行，种子排前面时会漏掉后面的占名者）。
  for (const ch of unclaimed) {
    const holders = db.prepare(
      'SELECT id FROM characters WHERE name = ? AND id != ?'
    ).all(ch.name, ch.id);
    for (const h of holders) {
      const newName = renameCharacter(h.id, ch.name);
      console.log(`[claim] 种子名「${ch.name}」被角色 id=${h.id} 占用，已将其改名为「${newName}」后认领`);
    }
  }
  const now = Date.now();
  try {
    db.exec('BEGIN');
    for (const ch of unclaimed) {
      db.prepare(
        'UPDATE characters SET device_id = ?, claimed_at = ?, updated_at = ? WHERE id = ?'
      ).run(deviceId, now, now, ch.id);
    }
    metaSet('claim_used', '1');
    metaSet('claim_used_at', String(now));
    metaSet('claim_used_by_device', deviceId);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    return { ok: false, error: '认领失败：' + e.message };
  }
  return { ok: true, characters: listCharactersByDevice(deviceId).filter(Boolean) };
}

// ---------------------------------------------------------------- 拍卖行
const AUCTION_TTL_MS = 24 * 60 * 60 * 1000;

function createListing(sellerDeviceId, sellerName, sellerSlot, kind, itemObj, price) {
  const now = Date.now();
  const r = db.prepare(
    `INSERT INTO auction_listings
       (seller_device_id, seller_name, seller_slot, kind, item_json, price,
        created_at, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(sellerDeviceId, sellerName, sellerSlot, kind, JSON.stringify(itemObj),
    price, now, now + AUCTION_TTL_MS);
  return getListing(r.lastInsertRowid);
}
function listingToObj(row) {
  if (!row) return null;
  let item = null;
  try { item = JSON.parse(row.item_json); } catch (_) { item = null; }
  return {
    id: row.id, sellerDeviceId: row.seller_device_id, sellerName: row.seller_name,
    sellerSlot: row.seller_slot, kind: row.kind, item, price: row.price,
    createdAt: row.created_at, expiresAt: row.expires_at, status: row.status,
    buyerDeviceId: row.buyer_device_id || null, buyerSlot: row.buyer_slot || null,
  };
}
function getListing(id) {
  const row = db.prepare('SELECT * FROM auction_listings WHERE id = ?').get(id);
  return listingToObj(row);
}
function listActiveListings(limit = 200) {
  const rows = db.prepare(
    `SELECT * FROM auction_listings WHERE status = 'active'
     ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
  return rows.map(listingToObj);
}
/** 把到期的在售物品标为 expired，并为卖家生成一件待领取物品。返回过期条数。 */
function expireDueListings(now = Date.now()) {
  const due = db.prepare(
    `SELECT * FROM auction_listings WHERE status = 'active' AND expires_at <= ?`
  ).all(now);
  for (const row of due) {
    db.prepare("UPDATE auction_listings SET status = 'expired' WHERE id = ?").run(row.id);
    createClaim(row.seller_device_id, row.seller_slot, 'item', row.item_json);
  }
  return due.length;
}
function createClaim(userDeviceId, slot, kind, amountOrItemJson) {
  const r = db.prepare(
    `INSERT INTO auction_claims (user_device_id, slot, kind, amount_or_item_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userDeviceId, slot, kind,
    typeof amountOrItemJson === 'string' ? amountOrItemJson : String(amountOrItemJson),
    Date.now());
  return getClaim(r.lastInsertRowid);
}
function claimToObj(row) {
  if (!row) return null;
  let payload = row.amount_or_item_json;
  if (row.kind === 'item') { try { payload = JSON.parse(payload); } catch (_) { /* keep raw */ } }
  else payload = Number(payload);
  return {
    id: row.id, userDeviceId: row.user_device_id, slot: row.slot,
    kind: row.kind, payload, createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
  };
}
function getClaim(id) {
  const row = db.prepare('SELECT * FROM auction_claims WHERE id = ?').get(id);
  return claimToObj(row);
}
function listPendingClaims(deviceId) {
  const rows = db.prepare(
    `SELECT * FROM auction_claims WHERE user_device_id = ? AND claimed_at IS NULL
     ORDER BY created_at DESC`
  ).all(deviceId);
  return rows.map(claimToObj);
}
function markClaimClaimed(id) {
  const r = db.prepare(
    'UPDATE auction_claims SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL'
  ).run(Date.now(), id);
  return r.changes > 0;
}

/**
 * 买入（一个事务内完成）：校验在售、非本人、金币足够；扣买家金币、
 * 记卖家待领金币、记买家待领物品、listing 标 sold。
 * buyerSave / sellerSave 由调用方传入已加载的存档对象，扣款后由
 * 调用方用 saveCharacter 写回（本函数只改 listing 与 claims，
 * 金币扣减在调用方事务外完成——见 server.js 的 buyAuction 注释）。
 */
function buyListingTx(listingId, buyerDeviceId, buyerSlot) {
  const listing = getListing(listingId);
  if (!listing || listing.status !== 'active') return { ok: false, error: '物品已不在售' };
  if (listing.expiresAt <= Date.now()) return { ok: false, error: '物品已过期' };
  if (listing.sellerDeviceId === buyerDeviceId) return { ok: false, error: '不能买自己的物品' };
  try {
    db.exec('BEGIN');
    db.prepare(
      "UPDATE auction_listings SET status = 'sold', buyer_device_id = ?, buyer_slot = ? WHERE id = ? AND status = 'active'"
    ).run(buyerDeviceId, buyerSlot, listingId);
    createClaim(listing.sellerDeviceId, listing.sellerSlot, 'gold', listing.price);
    createClaim(buyerDeviceId, buyerSlot, 'item', JSON.stringify(listing.item));
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    return { ok: false, error: '购买失败：' + e.message };
  }
  return { ok: true, listing: getListing(listingId) };
}
function delistListingTx(listingId, sellerDeviceId) {
  const listing = getListing(listingId);
  if (!listing || listing.status !== 'active') return { ok: false, error: '物品已不在售' };
  if (listing.sellerDeviceId !== sellerDeviceId) return { ok: false, error: '只能下架自己的物品' };
  try {
    db.exec('BEGIN');
    db.prepare("UPDATE auction_listings SET status = 'delisted' WHERE id = ?").run(listingId);
    createClaim(sellerDeviceId, listing.sellerSlot, 'item', JSON.stringify(listing.item));
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    return { ok: false, error: '下架失败：' + e.message };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- 服务器版 artifact 拍卖行（/actions 兼容层）
// 与上面联机版拍卖行完全隔离：只读写 art_listings 表，领取标志位在行上，
// 不动 auction_claims。语义逐字对照 server/src/actions.ts。
const ART_AUCTION_TTL_MS = 24 * 3600 * 1000;
function artListingToObj(row) {
  if (!row) return null;
  return {
    id: row.id, sellerId: row.seller_id, sellerSlot: row.seller_slot,
    sellerName: row.seller_name, price: row.price, itemJson: row.item_json,
    createdAt: row.created_at, expiresAt: row.expires_at,
  };
}
function artGetListing(id) {
  const row = db.prepare('SELECT * FROM art_listings WHERE id = ?').get(id);
  return artListingToObj(row);
}
function artListActive(limit = 200) {
  const now = Date.now();
  const rows = db.prepare(
    `SELECT * FROM art_listings WHERE status = 'active' AND expires_at > ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(now, limit);
  return rows.map(artListingToObj);
}
function artCreateListing(sellerId, sellerSlot, sellerName, price, itemJson) {
  const now = Date.now();
  const r = db.prepare(
    `INSERT INTO art_listings
       (seller_id, seller_slot, seller_name, price, item_json, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(sellerId, sellerSlot, sellerName, price, itemJson, now, now + ART_AUCTION_TTL_MS);
  return artGetListing(r.lastInsertRowid);
}
function artBuyListing(id, buyerId, buyerSlot) {
  const row = db.prepare('SELECT * FROM art_listings WHERE id = ?').get(id);
  if (!row) return { ok: false, reason: '这件物品已经不在架上了' };
  if (row.status !== 'active') return { ok: false, reason: '这件物品刚刚被别人买走或已下架' };
  if (row.expires_at <= Date.now()) return { ok: false, reason: '这件物品已到期下架，退回卖家了' };
  if (row.seller_id === buyerId && row.seller_slot === buyerSlot)
    return { ok: false, reason: '不能购买自己上架的物品' };
  db.prepare(
    "UPDATE art_listings SET status = 'sold', buyer_id = ?, buyer_slot = ? WHERE id = ? AND status = 'active'"
  ).run(buyerId, buyerSlot, id);
  return { ok: true, itemJson: row.item_json, price: row.price };
}
function artDelistListing(id, sellerId, sellerSlot) {
  const row = db.prepare('SELECT * FROM art_listings WHERE id = ?').get(id);
  if (!row) return { ok: false, reason: '这件物品已经不在架上了' };
  if (row.seller_id !== sellerId || row.seller_slot !== sellerSlot)
    return { ok: false, reason: '只能下架自己上架的物品' };
  if (row.status !== 'active') return { ok: false, reason: '这件物品已成交或已退回，不能下架' };
  db.prepare("UPDATE art_listings SET status = 'returned' WHERE id = ?").run(id);
  return { ok: true };
}
/** 领取：返回 {gold, items[]}。调用方（客户端）自己把金币/物品写进存档。 */
function artClaimAuction(playerId, slot) {
  const now = Date.now();
  // 到期未卖出：先翻成退回状态（只动自己名下的）。
  db.prepare(
    `UPDATE art_listings SET status = 'returned' WHERE seller_id = ? AND seller_slot = ?
     AND status = 'active' AND expires_at <= ?`
  ).run(playerId, slot, now);
  const items = [];
  let gold = 0;
  const returned = db.prepare(
    `SELECT * FROM art_listings WHERE seller_id = ? AND seller_slot = ?
     AND status = 'returned' AND returned_claimed = 0`
  ).all(playerId, slot);
  for (const r of returned) {
    items.push(r.item_json);
    db.prepare('UPDATE art_listings SET returned_claimed = 1 WHERE id = ?').run(r.id);
  }
  const sold = db.prepare(
    `SELECT * FROM art_listings WHERE seller_id = ? AND seller_slot = ?
     AND status = 'sold' AND proceeds_claimed = 0`
  ).all(playerId, slot);
  for (const r of sold) {
    gold += r.price;
    db.prepare('UPDATE art_listings SET proceeds_claimed = 1 WHERE id = ?').run(r.id);
  }
  const bought = db.prepare(
    `SELECT * FROM art_listings WHERE status = 'sold' AND delivered = 0
     AND buyer_id = ? AND buyer_slot = ?`
  ).all(playerId, slot);
  for (const r of bought) {
    items.push(r.item_json);
    db.prepare('UPDATE art_listings SET delivered = 1 WHERE id = ?').run(r.id);
  }
  return { gold, items };
}

// ---------------------------------------------------------------- 备份用
function counts() {
  const c = db.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
  const l = db.prepare('SELECT COUNT(*) AS n FROM auction_listings').get().n;
  const m = db.prepare('SELECT COUNT(*) AS n FROM auction_claims').get().n;
  return { characters: c, listings: l, claims: m };
}
function dumpAll() {
  return {
    characters: db.prepare('SELECT * FROM characters ORDER BY slot').all(),
    listings: db.prepare('SELECT * FROM auction_listings ORDER BY id').all(),
    claims: db.prepare('SELECT * FROM auction_claims ORDER BY id').all(),
    artListings: db.prepare('SELECT * FROM art_listings ORDER BY id').all(),
    meta: db.prepare("SELECT * FROM meta WHERE key LIKE 'claim%'").all(),
  };
}
/** 只在库完全为空时由备份恢复调用。 */
function restoreAll(backup) {
  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const ch of backup.characters || []) {
      db.prepare(
        `INSERT INTO characters
           (device_id, slot, name, cls, level, xp, gold, data, claimed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(ch.device_id ?? null, ch.slot, ch.name, ch.cls, ch.level, ch.xp, ch.gold,
        typeof ch.data === 'string' ? ch.data : JSON.stringify(ch.data),
        ch.claimed_at ?? null, ch.created_at || now, ch.updated_at || now);
    }
    for (const l of backup.listings || []) {
      db.prepare(
        `INSERT INTO auction_listings
           (seller_device_id, seller_name, seller_slot, kind, item_json, price,
            created_at, expires_at, status, buyer_device_id, buyer_slot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(l.seller_device_id, l.seller_name, l.seller_slot, l.kind,
        typeof l.item_json === 'string' ? l.item_json : JSON.stringify(l.item_json),
        l.price, l.created_at, l.expires_at, l.status,
        l.buyer_device_id ?? null, l.buyer_slot ?? null);
    }
    for (const c of backup.claims || []) {
      db.prepare(
        `INSERT INTO auction_claims
           (user_device_id, slot, kind, amount_or_item_json, created_at, claimed_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(c.user_device_id, c.slot, c.kind,
        typeof c.amount_or_item_json === 'string' ? c.amount_or_item_json : String(c.amount_or_item_json),
        c.created_at, c.claimed_at ?? null);
    }
    for (const a of backup.artListings || []) {
      db.prepare(
        `INSERT INTO art_listings
           (seller_id, seller_slot, seller_name, price, item_json, status,
            created_at, expires_at, buyer_id, buyer_slot,
            proceeds_claimed, delivered, returned_claimed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(a.seller_id, a.seller_slot, a.seller_name, a.price, a.item_json, a.status,
        a.created_at, a.expires_at, a.buyer_id ?? null, a.buyer_slot ?? null,
        a.proceeds_claimed || 0, a.delivered || 0, a.returned_claimed || 0);
    }
    for (const m of backup.meta || []) metaSet(m.key, m.value);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  }
  return counts();
}

initDb();

module.exports = {
  db, DATA_DIR, DB_PATH, initDb, dedupNames,
  metaGet, metaSet,
  listCharactersByDevice, getCharacter, getCharacterRaw, getCharacterById, getUnclaimedCharacters,
  countCharacters, nameTaken, findByName, renameCharacter, createCharacter, saveCharacter, saveCharacterRaw, deleteCharacter,
  setLastSlot, getLastSlot,
  isClaimUsed, claimAll,
  AUCTION_TTL_MS, createListing, getListing, listActiveListings, expireDueListings,
  createClaim, getClaim, listPendingClaims, markClaimClaimed,
  buyListingTx, delistListingTx,
  ART_AUCTION_TTL_MS, artGetListing, artListActive, artCreateListing,
  artBuyListing, artDelistListing, artClaimAuction,
  counts, dumpAll, restoreAll,
};
