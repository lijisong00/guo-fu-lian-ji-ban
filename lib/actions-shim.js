// ---------------------------------------------------------------------------
// 服务器版 artifact 的 POST /actions 兼容层（世界制，2026-11-24）。
//
// 服务器版客户端（React bundle）只调一个端点：POST ./actions，
// 请求体 {action, args, actionCallId}，响应取 body.data；body.error 有值时抛错。
// 本模块把 artifact server/src/actions.ts 的动作映射到联机版的
// 存档库 / 内存世界引擎（lib/world.js）/ 独立拍卖表 art_listings 上，客户端零改动。
//
// 世界制：没有房间、没有房间码、没有小队。进图 = 加入世界 (stageId:layerIdx)，
// 同世界所有玩家打同一批怪；经验全图全额共享；蓝装以上 Roll 按世界内活跃玩家。
// 认领码绝不出现在这里。
// ---------------------------------------------------------------------------
'use strict';

const backup = require('./backup.js');
const worldData = require('../shared/world-data.js');
const { createWorlds } = require('./world.js');

const MAX_SAVE_SLOTS = 5;
const MAX_SAVE_CHARS = 4000000;
const STALE_MS = 300000;
const ROLL_TTL_MS = 30000;       // 第一轮 Roll 截止（actions.ts 原口径）
const ROLL_REROLL_TTL_MS = 15000; // 平局重 Roll 每轮截止
const ROLL_RESOLVED_KEEP_MS = 300000; // 已结算 Roll 保留时长（供胜者领取）
const ACTIVE_WINDOW_MS = 60000;  // Roll 资格：60 秒内有行动才算活跃

function rollDice() { return 1 + Math.floor(Math.random() * 100); }
const CLS_MAP = { warrior: 'war', mage: 'mage', taoist: 'tao', war: 'war', tao: 'tao' };
const DEVICE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

function normCls(id) { return CLS_MAP[id] || id; }
function isDeviceId(v) { return typeof v === 'string' && DEVICE_RE.test(v); }
function isSlot(v) { return Number.isInteger(v) && v >= 1 && v <= MAX_SAVE_SLOTS; }
function isPlayerId(v) { return typeof v === 'string' && v.length >= 1 && v.length <= 64; }
function isName(v) { return typeof v === 'string' && v.length >= 1 && v.length <= 24; }

function deviceIdFromCookie(req) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  for (const part of String(raw).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== 'lg_device_id') continue;
    const v = decodeURIComponent(part.slice(eq + 1).trim());
    return isDeviceId(v) ? v : null;
  }
  return null;
}

function parseWorldKey(key) {
  const m = /^(\d+):(\d+)$/.exec(String(key || ''));
  if (!m) return null;
  return { stageId: Number(m[1]), layer: Number(m[2]) };
}

// ---------------------------------------------------------------- 世界 + Roll
// 世界引擎（lib/world.js）管怪物/玩家位置/死亡/重刷；Roll 会话放内存 Map，
// 以 worldKey 为作用域：资格 = 世界内在场且 60 秒内有行动的玩家。
function createWorldOverlay() {
  const engine = createWorlds(worldData);
  const rollSessions = new Map(); // id -> session
  let rollNextId = 1;

  function nameById(world) {
    const m = new Map();
    for (const [pid, mem] of world.players) m.set(pid, mem.name);
    return m;
  }

  // 结算一轮 Roll：给本轮没掷点的人自动掷点，唯一最高者胜出、平局者重掷一轮
  function settleRoll(world, session) {
    const now = Date.now();
    const names = world ? nameById(world) : new Map();
    for (const pid of session.participants) {
      if (session.entries[pid] === undefined) session.entries[pid] = rollDice();
    }
    if (session.participants.length === 0) {
      session.status = 'resolved'; session.winnerId = ''; session.winnerName = '';
      session.resolvedAt = now;
      return session;
    }
    const max = Math.max(...session.participants.map((p) => session.entries[p] ?? 0));
    const tied = session.participants.filter((p) => (session.entries[p] ?? 0) === max);
    if (tied.length === 1) {
      session.status = 'resolved';
      session.winnerId = tied[0];
      session.winnerName = names.get(tied[0]) || '';
      session.resolvedAt = now;
      return session;
    }
    session.entries = {};
    session.participants = tied;
    session.round += 1;
    session.expiresAt = now + ROLL_REROLL_TTL_MS;
    return session;
  }

  function prune(now) {
    engine.prune(now);
    for (const [id, s] of rollSessions) {
      if (s.status === 'resolved' && s.resolvedAt > 0 && now - s.resolvedAt > ROLL_RESOLVED_KEEP_MS) {
        rollSessions.delete(id);
      }
    }
  }

  // 某玩家当前能看到的 Roll 列表：进行中的（顺带懒结算到点/全员已掷的）+ 刚结算 25 秒内的结果
  function loadRollsFor(worldKey, playerId) {
    const now = Date.now();
    const world = engine.worlds.get(worldKey);
    const names = world ? nameById(world) : new Map();
    const out = [];
    const rows = [...rollSessions.values()]
      .filter((s) => s.worldKey === worldKey)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
    for (const session of rows) {
      if (!session.eligible.includes(playerId)) continue;
      if (session.status === 'active') {
        const allIn = session.participants.length > 0 &&
          session.participants.every((p) => session.entries[p] !== undefined);
        if (allIn || now >= session.expiresAt) settleRoll(world, session);
      }
      if (session.status === 'resolved' && now - session.resolvedAt > 25000) continue;
      out.push({
        id: session.id,
        itemJson: session.itemJson,
        round: session.round,
        status: session.status,
        expiresAt: session.expiresAt,
        winnerId: session.winnerId || '',
        winnerName: session.winnerName || '',
        entries: session.participants.map((pid) => ({
          playerId: pid, name: names.get(pid) || '队友', value: session.entries[pid] ?? null,
        })),
      });
    }
    return out;
  }

  function worldOf(args) {
    const parsed = parseWorldKey(args.worldKey);
    if (!parsed) return null;
    return engine.getOrCreate(parsed.stageId, parsed.layer);
  }

  return {
    engine, rollSessions, prune, loadRollsFor, settleRoll, worldOf,
    nextRollId: () => rollNextId++,
  };
}

// ---------------------------------------------------------------- 动作实现
function createActionsShim(store) {
  const overlay = createWorldOverlay();

  function needDevice(req) {
    const d = deviceIdFromCookie(req);
    if (!d) throw new Error('请先从首页进入游戏');
    return d;
  }

  // 心跳/世界动作共用的成员上行：位置/血量/外观/经验增量
  function upsertMember(world, args, now) {
    const prev = world.players.get(args.playerId);
    const xpUp = Number.isInteger(args.xpDelta) && args.xpDelta > 0
      ? Math.min(args.xpDelta, 10000000) : 0;
    overlay.engine.join(world, {
      playerId: args.playerId, name: args.name, classId: args.classId || '',
      level: args.level || 1, x: args.x || 0, y: args.y || 0,
      hp: args.hp || 0, maxHp: args.maxHp || 1,
      gear: args.gear || (prev ? prev.gear : ''),
      xpTotal: (prev ? prev.xpTotal || 0 : 0) + xpUp,
    }, now);
    const me = world.players.get(args.playerId);
    // 玩家已死亡：清掉他还没被 sync 领走的受击事件，免得复活后被排队中的旧伤害再打一遍
    if (args.hp <= 0) overlay.engine.clearHits(world, args.playerId);
    // 移动 = 有行动（Roll 资格）；原地不动超过 60 秒算挂机
    if (prev && (prev.x !== me.x || prev.y !== me.y)) me.lastActiveAt = now;
    return me;
  }

  const handlers = {
    getSave(req, args) {
      const deviceId = needDevice(req);
      const slot = args.slot === undefined ? 1 : args.slot;
      if (!isSlot(slot)) throw new Error('存档位只能是 1 到 5');
      const r = store.getCharacterRaw(deviceId, slot);
      return { save: r.save, updatedAt: r.updatedAt };
    },

    listSaves(req) {
      const deviceId = needDevice(req);
      const slots = [];
      for (let slot = 1; slot <= MAX_SAVE_SLOTS; slot++) {
        slots.push(store.getCharacterRaw(deviceId, slot));
      }
      return { slots };
    },

    putSave(req, args) {
      const deviceId = needDevice(req);
      const slot = args.slot === undefined ? 1 : args.slot;
      if (!isSlot(slot)) throw new Error('存档位只能是 1 到 5');
      if (typeof args.data !== 'string' || args.data.length > MAX_SAVE_CHARS)
        throw new Error('存档数据不对');
      let save;
      try { save = JSON.parse(args.data); } catch (_) { throw new Error('存档数据不对'); }
      if (!save || typeof save !== 'object' || typeof save.name !== 'string' || !save.name)
        throw new Error('存档数据不对');
      const cls = normCls(save.classId);
      let ok = store.saveCharacterRaw(deviceId, slot, save, cls);
      if (!ok) {
        const created = store.createCharacter(deviceId, slot, save.name, cls, save);
        if (!created) console.log('[actions] putSave: createCharacter refused (name taken?)', deviceId, slot, save.name);
        ok = true;
      }
      try { backup.writeBackup(store, {}); } catch (_) { /* 备份失败不影响存档 */ }
      return { ok: true };
    },

    resetSave(req, args) {
      const deviceId = needDevice(req);
      const slot = args.slot === undefined ? 1 : args.slot;
      if (!isSlot(slot)) throw new Error('存档位只能是 1 到 5');
      store.deleteCharacter(deviceId, slot);
      try { backup.writeBackup(store, { force: true }); } catch (_) { /* ignore */ }
      return { ok: true };
    },

    // ---- 世界制 ----
    joinWorld(req, args) {
      if (!isPlayerId(args.playerId) || !isName(args.name)) throw new Error('参数不对');
      const parsed = parseWorldKey(args.worldKey);
      if (!parsed) throw new Error('世界不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.engine.getOrCreate(parsed.stageId, parsed.layer);
      if (!world) throw new Error('这张地图不存在');
      if (typeof args.holeX === 'number' && typeof args.holeY === 'number' && !world.holePortal) {
        world.holePortal = { x: args.holeX, y: args.holeY };
      }
      upsertMember(world, args, now);
      // 重进世界：清掉上一场还没领走的受击事件（防旧伤害在新一局里重复扣血），
      // 并保证落点 200px 内无怪（贴脸刷怪挪去远离玩家的位置），免得一进图就挨打
      overlay.engine.clearHits(world, args.playerId);
      overlay.engine.ensureSpawnClear(world, args.x || 0, args.y || 0);
      const snap = overlay.engine.sync(world, args.playerId, args.x || 0, args.y || 0, -1, now);
      return { ok: true, worldKey: world.key, ...snap };
    },

    worldSync(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.worldOf(args);
      if (!world || !world.players.has(args.playerId)) {
        return {
          ok: false, rev: 0, full: true, players: [], monsters: [], removed: [],
          boss: { hp: 0, maxHp: 0, state: 0, name: '' },
          holeKilled: false, holeState: 0, mines: [], events: [], deaths: [], memberCount: 0,
        };
      }
      upsertMember(world, args, now);
      const snap = overlay.engine.sync(world, args.playerId, args.x || 0, args.y || 0, args.knownRev ?? -1, now);
      return { ok: true, worldKey: world.key, ...snap };
    },

    worldMap(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.worldOf(args);
      if (!world) return { ok: false, monsters: [], boss: { hp: 0, maxHp: 0, state: 0 }, players: [] };
      return { ok: true, ...overlay.engine.worldMap(world, now) };
    },

    hitMonster(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      if (!Number.isInteger(args.monsterId) || args.monsterId <= 0) throw new Error('参数不对');
      if (typeof args.dmg !== 'number' || !(args.dmg > 0)) throw new Error('参数不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.worldOf(args);
      if (!world) return { ok: false, dead: false, reason: '不在这个世界里' };
      return overlay.engine.hitMonster(world, args, now);
    },

    mineVein(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      if (!Number.isInteger(args.veinIdx) || args.veinIdx < 0 || args.veinIdx > 3)
        throw new Error('参数不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.worldOf(args);
      if (!world) return { ok: false, reason: '不在这个世界里' };
      return overlay.engine.mineVein(world, args.playerId, args.veinIdx, now);
    },

    leaveWorld(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      const world = overlay.worldOf(args);
      if (world) overlay.engine.leave(world, args.playerId);
      return { ok: true };
    },

    heartbeat(req, args) {
      // 世界制心跳：上报位置/血量/外观（xpDelta 仅兼容旧客户端；世界制下经验
      // 由服务端死亡事件经 worldSync 发放，客户端不再上报 xpDelta），返回世界
      // 全体成员、Boss 状态、洞口状态与本人有资格的 Roll 列表。
      if (!isPlayerId(args.playerId) || !isName(args.name)) throw new Error('参数不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.worldOf(args);
      if (!world) {
        return {
          ok: false, stageKey: '', layer: 0, sharedKills: 0,
          bossMax: 0, bossHp: 0, bossState: 0, holeKilled: false,
          members: [], rolls: [],
        };
      }
      upsertMember(world, args, now);
      overlay.engine.tick(world, now);
      const parsed = parseWorldKey(args.worldKey);
      const boss = world.boss;
      return {
        ok: true,
        stageKey: String(parsed.stageId),
        layer: parsed.layer,
        sharedKills: 0,
        bossMax: boss ? boss.maxHp : 0,
        bossHp: boss ? Math.round(boss.hp) : 0,
        bossState: world.bossState,
        holeKilled: world.holeKilled,
        members: [...world.players.values()].map((m) => ({
          playerId: m.playerId, name: m.name, classId: m.classId, level: m.level,
          x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, layer: parsed.layer,
          gear: m.gear || '', xpTotal: m.xpTotal || 0,
        })),
        rolls: overlay.loadRollsFor(world.key, args.playerId),
      };
    },

    startRoll(req, args) {
      if (!isPlayerId(args.playerId) || !isName(args.name)) throw new Error('参数不对');
      if (typeof args.itemJson !== 'string' || args.itemJson.length < 2 || args.itemJson.length > 4000)
        throw new Error('物品数据不对，Roll 发起失败');
      let it;
      try { it = JSON.parse(args.itemJson); } catch (_) { throw new Error('物品数据不对，Roll 发起失败'); }
      if (typeof it.uid !== 'number' || typeof it.name !== 'string' || !it.name)
        return { ok: false, id: 0, reason: '物品数据不对，Roll 发起失败' };
      if (typeof args.layer !== 'number' || !Number.isInteger(args.layer) || args.layer < 0 || args.layer > 10)
        throw new Error('参数不对');
      const now = Date.now();
      overlay.prune(now);
      const world = overlay.worldOf(args);
      if (!world) return { ok: false, id: 0, reason: '不在这个世界里' };
      // 资格 = 世界内在场且 60 秒内有行动的玩家（挂机玩家不参与、不弹窗）；发起人必在内
      const eligible = overlay.engine.activePlayers(world, now)
        .filter((m) => m.layer === undefined || true)
        .map((m) => m.playerId);
      if (!eligible.includes(args.playerId)) eligible.push(args.playerId);
      const id = overlay.nextRollId();
      overlay.rollSessions.set(id, {
        id, worldKey: world.key, itemJson: args.itemJson, initiatorId: args.playerId,
        layer: args.layer, eligible: [...eligible], participants: [...eligible],
        entries: {}, round: 1, status: 'active', winnerId: '', winnerName: '',
        createdAt: now, expiresAt: now + ROLL_TTL_MS, resolvedAt: 0, claimed: 0,
      });
      return { ok: true, id, reason: '' };
    },

    submitRoll(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      if (!Number.isInteger(args.id) || args.id <= 0) throw new Error('参数不对');
      const session = overlay.rollSessions.get(args.id);
      if (!session) return { ok: false, value: 0, reason: '这次 Roll 已经结束了' };
      if (session.status !== 'active') return { ok: false, value: 0, reason: '这次 Roll 已经定出胜负了' };
      if (!session.participants.includes(args.playerId))
        return { ok: false, value: 0, reason: '你不在这一轮的名单里' };
      if (session.entries[args.playerId] !== undefined)
        return { ok: true, value: session.entries[args.playerId], reason: '' };
      const value = rollDice();
      session.entries[args.playerId] = value;
      if (session.participants.every((p) => session.entries[p] !== undefined)) {
        const world = overlay.engine.worlds.get(session.worldKey);
        overlay.settleRoll(world || null, session);
      }
      return { ok: true, value, reason: '' };
    },

    claimRolls(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      const items = [];
      for (const s of overlay.rollSessions.values()) {
        if (s.status === 'resolved' && s.winnerId === args.playerId && !s.claimed) {
          items.push(s.itemJson);
          s.claimed = 1;
        }
      }
      return { items };
    },

    listAuction() {
      return { listings: store.artListActive(200) };
    },

    createListing(req, args) {
      if (!isPlayerId(args.playerId) || !isSlot(args.slot) || !isName(args.sellerName))
        throw new Error('参数不对');
      if (!Number.isInteger(args.price) || args.price < 1 || args.price > 999999999)
        throw new Error('价格不对');
      if (typeof args.itemJson !== 'string' || args.itemJson.length < 2 || args.itemJson.length > 4000)
        throw new Error('物品数据不对，上架失败');
      let it;
      try { it = JSON.parse(args.itemJson); } catch (_) { throw new Error('物品数据不对，上架失败'); }
      const isEquip = typeof it.uid === 'number' && typeof it.name === 'string' && !!it.name;
      const isBook = it.kind === 'book' && typeof it.skillId === 'string' && !!it.skillId &&
        typeof it.name === 'string' && !!it.name;
      if (!isEquip && !isBook) throw new Error('物品数据不对，上架失败');
      const row = store.artCreateListing(args.playerId, args.slot, args.sellerName, args.price, args.itemJson);
      try { backup.writeBackup(store, { force: true }); } catch (_) { /* ignore */ }
      return { ok: !!row, id: row ? row.id : 0, reason: row ? '' : '上架失败，再试一次' };
    },

    buyListing(req, args) {
      if (!isPlayerId(args.playerId) || !isSlot(args.slot)) throw new Error('参数不对');
      if (!Number.isInteger(args.id) || args.id <= 0) throw new Error('参数不对');
      const r = store.artBuyListing(args.id, args.playerId, args.slot);
      if (!r.ok) return { ok: false, reason: r.reason, itemJson: '', price: 0 };
      try { backup.writeBackup(store, { force: true }); } catch (_) { /* ignore */ }
      return { ok: true, reason: '', itemJson: r.itemJson, price: r.price };
    },

    delistListing(req, args) {
      if (!isPlayerId(args.playerId) || !isSlot(args.slot)) throw new Error('参数不对');
      if (!Number.isInteger(args.id) || args.id <= 0) throw new Error('参数不对');
      const r = store.artDelistListing(args.id, args.playerId, args.slot);
      if (!r.ok) return { ok: false, reason: r.reason };
      try { backup.writeBackup(store, { force: true }); } catch (_) { /* ignore */ }
      return { ok: true, reason: '' };
    },

    claimAuction(req, args) {
      if (!isPlayerId(args.playerId) || !isSlot(args.slot)) throw new Error('参数不对');
      const r = store.artClaimAuction(args.playerId, args.slot);
      try { backup.writeBackup(store, { force: true }); } catch (_) { /* ignore */ }
      return { gold: r.gold, items: r.items };
    },
  };

  function handleActions(req, res) {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 8 * 1024 * 1024) { try { req.destroy(); } catch (_) { /* ignore */ } }
    });
    req.on('end', () => {
      const send = (obj) => {
        const s = JSON.stringify(obj);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
        res.end(s);
      };
      let parsed;
      try { parsed = JSON.parse(body || '{}'); } catch (_) { return send({ error: '请求格式不对' }); }
      const fn = handlers[parsed.action];
      if (typeof fn !== 'function') return send({ error: '未知动作' });
      try {
        const data = fn(req, parsed.args || {});
        send({ data });
      } catch (e) {
        send({ error: e && e.message ? String(e.message) : '操作失败' });
      }
    });
  }

  return { handleActions, worlds: overlay.engine.worlds, worldStats: overlay.engine.stats, deviceIdFromCookie };
}

module.exports = { createActionsShim, deviceIdFromCookie };
