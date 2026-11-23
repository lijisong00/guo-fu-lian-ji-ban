'use strict';
/**
 * 国服服务器版 · 独立联机版 — 服务端入口（server.js）
 *
 * 无账号注册：玩家身份 = 客户端 localStorage 里的设备 ID（uuid），
 * 服务端信任客户端传来的 deviceId（休闲游戏，不做强校验）。
 * 认领：seed 里的三个角色以 device_id NULL 预置在库里，一次性认领码
 * 校验通过后绑定到认领设备的 1–3 号位（认领码只从环境变量 CLAIM_CODE
 * 或 seed/claim-code.json 读取，绝不写进代码、注释与日志）。
 *
 * 启动：npm install && node server.js
 * 环境变量：PORT（默认 3000，Render 会注入）、DATA_DIR（默认 ./data）、
 *   CLAIM_CODE（可选，优先于 seed/claim-code.json）。
 * 监听 0.0.0.0（Render 要求）。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const store = require('./lib/db.js');
const backup = require('./lib/backup.js');
const game = require('./lib/game.js');
const { createActionsShim, deviceIdFromCookie } = require('./lib/actions-shim.js');
// 服务器版客户端的 POST /actions 兼容层（见 docs/PORTING-V89.md）。
const actionsShim = createActionsShim(store);

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CLAIM_CODE_FILE = path.join(ROOT, 'seed', 'claim-code.json');

// ---- 认领码（启动时加载一次；只记「已加载」，绝不打印码本身） ----
let CLAIM_CODE = process.env.CLAIM_CODE || null;
let CLAIM_CODE_SOURCE = 'env';
if (!CLAIM_CODE) {
  try {
    const raw = JSON.parse(fs.readFileSync(CLAIM_CODE_FILE, 'utf8'));
    CLAIM_CODE = String(raw.claimCode || '');
    CLAIM_CODE_SOURCE = 'seed/claim-code.json';
  } catch (_) {
    CLAIM_CODE = '';
  }
}
if (!CLAIM_CODE) console.warn('[server] 警告：未找到认领码（CLAIM_CODE 或 seed/claim-code.json），认领接口将不可用');

// ---------------------------------------------------------------- 工具
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 1024 * 1024) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (_) { reject(new Error('JSON 格式不对')); }
    });
    req.on('error', reject);
  });
}
function validDeviceId(d) {
  return typeof d === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(d);
}
function deviceIdOf(req, body) {
  return (body && body.deviceId) || req.headers['x-device-id'] || null;
}
function validCharName(n) {
  return typeof n === 'string' && /^[\w\u4e00-\u9fa5]{1,12}$/.test(n.trim());
}
function normCls(cls) {
  return { warrior: 'war', mage: 'mage', taoist: 'tao', war: 'war', tao: 'tao' }[cls] || null;
}
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  // 服务器版游戏入口：无有效身份 cookie 时回落地页对齐身份（见 docs/PORTING-V89.md）。
  if (urlPath === '/game/index.html' && !deviceIdFromCookie(req)) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
  const file = path.join(PUBLIC_DIR, urlPath);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (urlPath === '/index.html') {
        return sendJson(res, 200, { ok: true, service: 'guo-fu-lian-ji-ban', version: '1.0.0', note: '客户端尚未放置到 public/，API 与 WS 已就绪' });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------- 拍卖行服务（HTTP 与 WS 共用）
// 在线玩家优先用内存里的存档（2026-11-23 移植冒烟发现）：DB 里的行最多
// 落后 30 秒自动存盘，拍卖三处原本只读 DB——在线玩家刚买/刚打到的东西
// 上架会报“背包里没有”，买东西扣的金币、领取的金币/物品还会在下次
// 自动存盘时被内存里的旧存档覆盖丢掉。离线玩家（无内存对象）仍走 DB。
function livePlayerFor(deviceId, slot) {
  const p = game.playersByDevice.get(deviceId);
  return p && p.slot === slot ? p : null;
}
function auctionPublic(l) {
  return {
    id: l.id, sellerName: l.sellerName, kind: l.kind, item: l.item,
    price: l.price, createdAt: l.createdAt, expiresAt: l.expiresAt,
  };
}
function createAuctionListing(deviceId, slot, uid, bookId, price) {
  if (!Number.isInteger(price) || price <= 0 || price > 999999999) {
    return { ok: false, error: '价格不对（需为正整数金币）' };
  }
  const live = livePlayerFor(deviceId, slot);
  const ch = live ? { data: live.save } : store.getCharacter(deviceId, slot);
  if (!ch || !ch.data) return { ok: false, error: '角色不存在' };
  const save = ch.data;
  if (uid !== undefined && uid !== null) {
    const idx = save.bag.findIndex((it) => it && String(it.uid) === String(uid));
    if (idx < 0) return { ok: false, error: '背包里没有这件装备（只能上架背包装备）' };
    const item = save.bag.splice(idx, 1)[0];
    store.saveCharacter(deviceId, slot, save);
    if (live) live.meDirty = true;
    const listing = store.createListing(deviceId, save.name, slot, 'equip', item, price);
    backup.writeBackup(store, { force: true });
    return { ok: true, listing: auctionPublic(listing) };
  }
  if (bookId) {
    const nid = game.normSkillId(bookId);
    const idx = (save.books || []).indexOf(nid);
    if (idx < 0) return { ok: false, error: '背包里没有这本技能书' };
    save.books.splice(idx, 1);
    store.saveCharacter(deviceId, slot, save);
    if (live) live.meDirty = true;
    const sk = game.Data.SKILLS[nid];
    const item = { bookId: nid, name: sk.name, cls: sk.cls, req: sk.req };
    const listing = store.createListing(deviceId, save.name, slot, 'skillbook', item, price);
    backup.writeBackup(store, { force: true });
    return { ok: true, listing: auctionPublic(listing) };
  }
  return { ok: false, error: '请指定要上架的装备 uid 或技能书 bookId' };
}
function buyAuctionListing(deviceId, slot, listingId) {
  const listing = store.getListing(listingId);
  if (!listing || listing.status !== 'active') return { ok: false, error: '物品已不在售' };
  if (listing.expiresAt <= Date.now()) return { ok: false, error: '物品已过期' };
  if (listing.sellerDeviceId === deviceId) return { ok: false, error: '不能买自己的物品' };
  const live = livePlayerFor(deviceId, slot);
  const ch = live ? { data: live.save } : store.getCharacter(deviceId, slot);
  if (!ch || !ch.data) return { ok: false, error: '角色不存在' };
  if ((ch.data.gold || 0) < listing.price) return { ok: false, error: '金币不够' };
  ch.data.gold -= listing.price;
  store.saveCharacter(deviceId, slot, ch.data);
  if (live) live.meDirty = true;
  const r = store.buyListingTx(listingId, deviceId, slot);
  if (!r.ok) {
    // 并发下被人先买走：退钱
    ch.data.gold += listing.price;
    store.saveCharacter(deviceId, slot, ch.data);
    if (live) live.meDirty = true;
    return r;
  }
  backup.writeBackup(store, { force: true });
  return { ok: true, listing: auctionPublic(r.listing) };
}
function claimAuctionClaim(deviceId, slot, claimId) {
  const claim = store.getClaim(claimId);
  if (!claim || claim.userDeviceId !== deviceId) return { ok: false, error: '待领取不存在' };
  if (claim.claimedAt) return { ok: false, error: '已经领取过了' };
  const live = livePlayerFor(deviceId, slot);
  const ch = live ? { data: live.save } : store.getCharacter(deviceId, slot);
  if (!ch || !ch.data) return { ok: false, error: '角色不存在' };
  const save = ch.data;
  if (claim.kind === 'gold') {
    save.gold = (save.gold || 0) + claim.payload;
  } else {
    const item = claim.payload;
    if (item && item.bookId) {
      const nid = game.normSkillId(item.bookId);
      if (!save.books.includes(nid)) save.books.push(nid);
    } else if (item && item.uid) {
      if (save.bag.length >= game.Data.BAG_CAP) return { ok: false, error: '背包满了，先腾出位置' };
      save.bag.push(item);
    } else {
      return { ok: false, error: '待领取物品格式不对' };
    }
  }
  store.saveCharacter(deviceId, slot, save);
  if (live) live.meDirty = true;
  if (!store.markClaimClaimed(claimId)) return { ok: false, error: '领取失败（已被领走）' };
  backup.writeBackup(store, { force: true });
  return { ok: true };
}

// ---------------------------------------------------------------- HTTP API
async function handleApi(req, res) {
  const url = req.url.split('?')[0];
  const query = new URL(req.url, 'http://x').searchParams;
  try {
    if (req.method === 'GET' && url === '/api/health') {
      return sendJson(res, 200, {
        ok: true, service: 'guo-fu-lian-ji-ban', version: '1.0.0',
        time: new Date().toISOString(),
        rooms: game.rooms.size,
        playersOnline: game.playersByDevice.size,
        claimUsed: store.isClaimUsed(),
      });
    }
    if (req.method === 'GET' && url === '/api/characters') {
      const deviceId = query.get('deviceId') || req.headers['x-device-id'];
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      return sendJson(res, 200, { ok: true, characters: store.listCharactersByDevice(deviceId) });
    }
    if (req.method === 'POST' && url === '/api/character') {
      const body = await parseJsonBody(req);
      const deviceId = deviceIdOf(req, body);
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        return sendJson(res, 400, { ok: false, error: '存档位只能是 1 到 5' });
      }
      if (store.countCharacters(deviceId) >= 5) {
        return sendJson(res, 400, { ok: false, error: '存档位已满，最多 5 个' });
      }
      if (!validCharName(body.name)) return sendJson(res, 400, { ok: false, error: '角色名 1-12 字（字母/数字/下划线/中文）' });
      const cls = normCls(body.cls);
      if (!cls) return sendJson(res, 400, { ok: false, error: '职业不对' });
      if (store.getCharacter(deviceId, slot)) return sendJson(res, 409, { ok: false, error: '该存档位已有角色' });
      if (store.nameTaken(deviceId, body.name.trim())) return sendJson(res, 409, { ok: false, error: '角色名已被占用' });
      const save = game.newCharacterSave(body.name.trim(), cls);
      const ch = store.createCharacter(deviceId, slot, save.name, cls, save);
      if (!ch) return sendJson(res, 409, { ok: false, error: '建角色失败（位被占或名字重复）' });
      backup.writeBackup(store, { force: true });
      return sendJson(res, 200, {
        ok: true,
        character: { slot: ch.slot, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp, gold: ch.gold },
      });
    }
    if (req.method === 'DELETE' && url.startsWith('/api/character/')) {
      const slot = Number(url.split('/')[3]);
      const body = await parseJsonBody(req).catch(() => ({}));
      const deviceId = deviceIdOf(req, body) || query.get('deviceId');
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        return sendJson(res, 400, { ok: false, error: '存档位只能是 1 到 5' });
      }
      if (!store.deleteCharacter(deviceId, slot)) {
        return sendJson(res, 404, { ok: false, error: '该存档位没有角色' });
      }
      backup.writeBackup(store, { force: true });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url === '/api/claim') {
      const body = await parseJsonBody(req);
      const deviceId = deviceIdOf(req, body);
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      if (!CLAIM_CODE) return sendJson(res, 500, { ok: false, error: '认领码未配置' });
      if (String(body.code || '') !== CLAIM_CODE) {
        return sendJson(res, 400, { ok: false, error: '认领码不对' });
      }
      const r = store.claimAll(deviceId);
      if (!r.ok) return sendJson(res, 400, { ok: false, error: r.error });
      backup.writeBackup(store, { force: true });
      return sendJson(res, 200, { ok: true, characters: r.characters });
    }
    if (req.method === 'GET' && url === '/api/stages') {
      return sendJson(res, 200, { ok: true, stages: game.listStages() });
    }
    if (req.method === 'GET' && url === '/api/auction') {
      store.expireDueListings();
      return sendJson(res, 200, {
        ok: true,
        listings: store.listActiveListings(200).map(auctionPublic),
      });
    }
    if (req.method === 'POST' && url === '/api/auction') {
      const body = await parseJsonBody(req);
      const deviceId = deviceIdOf(req, body);
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        return sendJson(res, 400, { ok: false, error: '存档位只能是 1 到 5' });
      }
      const r = createAuctionListing(deviceId, slot, body.uid, body.bookId, Number(body.price));
      if (!r.ok) return sendJson(res, 400, { ok: false, error: r.error });
      return sendJson(res, 200, { ok: true, listing: r.listing });
    }
    if (req.method === 'POST' && /^\/api\/auction\/\d+\/buy$/.test(url)) {
      const id = Number(url.split('/')[3]);
      const body = await parseJsonBody(req);
      const deviceId = deviceIdOf(req, body);
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        return sendJson(res, 400, { ok: false, error: '存档位只能是 1 到 5' });
      }
      const r = buyAuctionListing(deviceId, slot, id);
      if (!r.ok) return sendJson(res, 400, { ok: false, error: r.error });
      return sendJson(res, 200, { ok: true, listing: r.listing });
    }
    if (req.method === 'POST' && /^\/api\/auction\/\d+\/delist$/.test(url)) {
      const id = Number(url.split('/')[3]);
      const body = await parseJsonBody(req);
      const deviceId = deviceIdOf(req, body);
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      const r = store.delistListingTx(id, deviceId);
      if (!r.ok) return sendJson(res, 400, { ok: false, error: r.error });
      backup.writeBackup(store, { force: true });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url === '/api/auction/claims') {
      const deviceId = query.get('deviceId') || req.headers['x-device-id'];
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      return sendJson(res, 200, { ok: true, claims: store.listPendingClaims(deviceId) });
    }
    if (req.method === 'POST' && /^\/api\/auction\/claims\/\d+\/claim$/.test(url)) {
      const id = Number(url.split('/')[4]);
      const body = await parseJsonBody(req);
      const deviceId = deviceIdOf(req, body);
      if (!validDeviceId(deviceId)) return sendJson(res, 400, { ok: false, error: 'deviceId 不对' });
      const slot = Number(body.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        return sendJson(res, 400, { ok: false, error: '存档位只能是 1 到 5' });
      }
      const r = claimAuctionClaim(deviceId, slot, id);
      if (!r.ok) return sendJson(res, 400, { ok: false, error: r.error });
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url === '/api/debug/stats' && process.env.DEBUG === '1') {
      return sendJson(res, 200, {
        ok: true,
        rooms: [...game.rooms.values()].map((r) => ({
          code: r.code, stage: r.stageId, floor: r.floor,
          players: r.players.size, monsters: r.monsters.length, drops: r.drops.length,
        })),
      });
    }
    return sendJson(res, 404, { ok: false, error: 'unknown api' });
  } catch (e) {
    console.error('[api]', url, e.message);
    return sendJson(res, 400, { ok: false, error: e.message || '请求失败' });
  }
}

// ---------------------------------------------------------------- HTTP 服务
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  const noQuery = req.url.split('?')[0];
  if (noQuery === '/actions' || noQuery === '/game/actions') return actionsShim.handleActions(req, res);
  return serveStatic(req, res);
});

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });

function wsSend(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (_) { /* ignore */ }
  }
}
function flushPlayer(ws, player) {
  const { toasts, events } = game.flushPlayerMessages(player);
  for (const msg of toasts) wsSend(ws, { t: 'toast', msg });
  for (const ev of events) wsSend(ws, ev);
  const now = Date.now();
  if (player.meDirty || now - (player.lastMeAt || 0) > 1000) {
    wsSend(ws, game.meFor(player, game.roomOf(player)));
    player.lastMeAt = now;
    player.meDirty = false;
  }
}
function roomPlayers(room) {
  return [...room.players.values()].map((p) => p.save.name);
}
function broadcastRoom(room, obj, exceptDeviceId) {
  for (const p of room.players.values()) {
    if (exceptDeviceId && p.deviceId === exceptDeviceId) continue;
    if (p.ws) wsSend(p.ws, obj);
  }
}

wss.on('connection', (ws) => {
  let player = null;
  let authed = false;
  const authTimer = setTimeout(() => {
    if (!authed) { wsSend(ws, { t: 'error', msg: '请先鉴权' }); ws.close(); }
  }, 10000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) {
      wsSend(ws, { t: 'error', msg: '消息格式不对' });
      return;
    }
    if (!authed) {
      if (msg.t !== 'auth') {
        wsSend(ws, { t: 'error', msg: '连上后第一条必须是鉴权消息' });
        ws.close();
        return;
      }
      const deviceId = msg.deviceId;
      let slot = Number(msg.slot);
      if (!validDeviceId(deviceId)) {
        wsSend(ws, { t: 'error', msg: 'deviceId 不对' });
        ws.close();
        return;
      }
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
        slot = store.getLastSlot(deviceId) || 1;
      }
      const ch = store.getCharacter(deviceId, slot);
      if (!ch || !ch.data) {
        wsSend(ws, { t: 'error', msg: '该存档位没有属于这个设备的角色' });
        ws.close();
        return;
      }
      // 同一设备在别处已在线：顶掉旧连接
      const old = game.playersByDevice.get(deviceId);
      if (old && old.ws && old.ws !== ws) {
        try { wsSend(old.ws, { t: 'error', msg: '已在其他地方登录' }); old.ws.close(); } catch (_) { /* ignore */ }
      }
      player = game.newPlayer(deviceId, slot, ch);
      player.ws = ws;
      game.playersByDevice.set(deviceId, player);
      store.setLastSlot(deviceId, slot);
      authed = true;
      clearTimeout(authTimer);
      wsSend(ws, {
        t: 'authed',
        slot,
        character: { slot: ch.slot, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp, gold: ch.gold },
      });
      flushPlayer(ws, player);
      return;
    }

    try {
      switch (msg.t) {
        case 'select_character': {
          const slot = Number(msg.slot);
          if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
            wsSend(ws, { t: 'error', msg: '存档位只能是 1 到 5' });
            break;
          }
          const ch = store.getCharacter(player.deviceId, slot);
          if (!ch || !ch.data) {
            wsSend(ws, { t: 'error', msg: '该存档位没有属于这个设备的角色' });
            break;
          }
          if (player.roomCode) game.leaveRoom(player);
          game.playersByDevice.delete(player.deviceId);
          player = game.newPlayer(player.deviceId, slot, ch);
          player.ws = ws;
          game.playersByDevice.set(player.deviceId, player);
          store.setLastSlot(player.deviceId, slot);
          wsSend(ws, {
            t: 'authed', slot,
            character: { slot: ch.slot, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp, gold: ch.gold },
          });
          flushPlayer(ws, player);
          break;
        }
        case 'create_room': {
          const room = game.createRoom(player);
          wsSend(ws, { t: 'room_joined', code: room.code, players: roomPlayers(room) });
          flushPlayer(ws, player);
          break;
        }
        case 'join_room': {
          const code = String(msg.code || '').toUpperCase();
          const room = game.rooms.get(code);
          if (!room) { wsSend(ws, { t: 'error', msg: '房间码不对' }); break; }
          const r = game.joinRoom(room, player);
          if (!r.ok) { wsSend(ws, { t: 'error', msg: r.error }); break; }
          // 进房后落到房主所在的图/层：新进玩家与房内同步
          const cur = game.roomOf(player);
          if (cur) {
            player.x = 0; player.y = 0;
          }
          wsSend(ws, { t: 'room_joined', code: room.code, players: roomPlayers(room) });
          broadcastRoom(room, { t: 'room_update', players: roomPlayers(room) });
          flushPlayer(ws, player);
          break;
        }
        case 'leave_room': {
          const room = game.roomOf(player);
          game.leaveRoom(player);
          if (room) broadcastRoom(room, { t: 'room_update', players: roomPlayers(room) });
          wsSend(ws, { t: 'room_left' });
          flushPlayer(ws, player);
          break;
        }
        case 'auction_list': {
          store.expireDueListings();
          wsSend(ws, {
            t: 'auction_list',
            listings: store.listActiveListings(200).map(auctionPublic),
          });
          break;
        }
        case 'auction_create': {
          const slot = Number(msg.slot) || player.slot;
          const r = createAuctionListing(player.deviceId, slot, msg.uid, msg.bookId, Number(msg.price));
          if (!r.ok) wsSend(ws, { t: 'error', msg: r.error });
          else wsSend(ws, { t: 'auction_created', listing: r.listing });
          flushPlayer(ws, player);
          break;
        }
        case 'auction_buy': {
          const slot = Number(msg.slot) || player.slot;
          const r = buyAuctionListing(player.deviceId, slot, Number(msg.id));
          if (!r.ok) wsSend(ws, { t: 'error', msg: r.error });
          else wsSend(ws, { t: 'auction_bought', listing: r.listing });
          flushPlayer(ws, player);
          break;
        }
        case 'auction_delist': {
          const r = store.delistListingTx(Number(msg.id), player.deviceId);
          if (!r.ok) wsSend(ws, { t: 'error', msg: r.error });
          else {
            backup.writeBackup(store, { force: true });
            wsSend(ws, { t: 'auction_delisted', id: Number(msg.id) });
          }
          flushPlayer(ws, player);
          break;
        }
        case 'auction_claim': {
          const slot = Number(msg.slot) || player.slot;
          const r = claimAuctionClaim(player.deviceId, slot, Number(msg.claimId));
          if (!r.ok) wsSend(ws, { t: 'error', msg: r.error });
          else wsSend(ws, { t: 'auction_claimed', id: Number(msg.claimId) });
          flushPlayer(ws, player);
          break;
        }
        case 'auction_claims': {
          wsSend(ws, { t: 'auction_claims', claims: store.listPendingClaims(player.deviceId) });
          break;
        }
        default: {
          const room = game.roomOf(player);
          if (!room) {
            if (msg.t === 'ping') wsSend(ws, { t: 'pong' });
            else wsSend(ws, { t: 'error', msg: '请先创建或加入房间' });
            break;
          }
          const reply = game.handleAction(room, player, msg);
          if (reply) wsSend(ws, reply);
          flushPlayer(ws, player);
          break;
        }
      }
    } catch (e) {
      console.error('[ws]', msg && msg.t, e.message);
      wsSend(ws, { t: 'error', msg: e.message || '操作失败' });
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (player) {
      const room = game.roomOf(player);
      game.leaveRoom(player);
      if (room) broadcastRoom(room, { t: 'room_update', players: roomPlayers(room) });
      if (game.playersByDevice.get(player.deviceId) === player) {
        game.playersByDevice.delete(player.deviceId);
      }
    }
  });
  ws.on('error', () => { /* ignore */ });
});

// ---- 每 100ms 广播 snapshot ----
setInterval(() => {
  for (const room of [...game.rooms.values()]) {
    try {
      game.tickRoom(room);
    } catch (e) {
      console.error('[tick]', room.code, e.message);
      continue;
    }
    const snap = game.snapshotFor(room);
    for (const p of [...room.players.values()]) {
      if (!p.ws) continue;
      wsSend(p.ws, snap);
      flushPlayer(p.ws, p);
    }
  }
  // 拍卖行过期清理（每分钟级频率即可，这里顺带每 tick 检查一次到期表）
  try { store.expireDueListings(); } catch (_) { /* ignore */ }
}, game.TICK_MS);

// ---------------------------------------------------------------- 启动
const restored = backup.restoreIfEmpty(store);
server.listen(PORT, HOST, () => {
  const c = store.counts();
  console.log('[server] 国服服务器版独立联机版已启动：http://' + HOST + ':' + PORT);
  console.log('[server] 数据目录：' + store.DATA_DIR + '（角色 ' + c.characters + ' 个、拍卖记录 ' + c.listings + ' 条、待领取 ' + c.claims + ' 条）');
  console.log('[server] 认领码来源：' + CLAIM_CODE_SOURCE + '，已' + (store.isClaimUsed() ? '使用' : '未使用'));
  if (restored) {
    console.log('[server] 启动恢复：' + restored.file + '（角色 ' + restored.characters + ' 个、拍卖 ' + restored.listings + ' 条、待领取 ' + restored.claims + ' 条）');
  }
});
