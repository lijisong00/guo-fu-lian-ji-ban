// ---------------------------------------------------------------------------
// 服务器版 artifact 的 POST /actions 兼容层。
//
// 服务器版客户端（React bundle）只调一个端点：POST ./actions，
// 请求体 {action, args, actionCallId}，响应取 body.data；body.error 有值时抛错。
// 本模块把 artifact server/src/actions.ts 的 16 个动作逐字映射到联机版的
// 存档库 / 内存房间 overlay / 独立拍卖表 art_listings 上，客户端零改动。
//
// 身份：存档类动作请求体里没有 playerId，用 cookie lg_device_id（落地页与
// 游戏 localStorage 的 rxcq_server_player_id 取同一值）；房间/拍卖行动作
// 用 args.playerId（对齐时与 cookie 相等）。
// ---------------------------------------------------------------------------
'use strict';

const backup = require('./backup.js');

const MAX_SAVE_SLOTS = 5;
const MAX_SAVE_CHARS = 4000000;
const STALE_MS = 300000;
const ROLL_TTL_MS = 30000;       // 第一轮 Roll 截止（actions.ts 原口径）
const ROLL_REROLL_TTL_MS = 15000; // 平局重 Roll 每轮截止
const ROLL_RESOLVED_KEEP_MS = 300000; // 已结算 Roll 保留时长（供胜者领取）

function rollDice() { return 1 + Math.floor(Math.random() * 100); }
const ROOM_MAX = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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

function genCode() {
  let out = '';
  for (let i = 0; i < 5; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

// ---------------------------------------------------------------- 房间 overlay
// 与 lib/game.js 的权威房间完全隔离：artifact 客户端自己在本地模拟战斗，
// 服务端只共享击杀数 / Boss 血量 / 成员位置 / 洞口状态 / 组队经验 / Roll 点
// （actions.ts 原口径；组队功能 2026-11-24：心跳 xpDelta 累计进成员 xpTotal，
// Roll 会话放内存 Map，动作 startRoll/submitRoll/claimRolls 与 artifact 同名）。
function createRoomOverlay() {
  const rooms = new Map(); // code -> room
  const rollSessions = new Map(); // id -> session
  let rollNextId = 1;

  function nameById(room) {
    const m = new Map();
    for (const [pid, mem] of room.members) m.set(pid, mem.name);
    return m;
  }

  // 结算一轮 Roll：给本轮没掷点的人自动掷点，唯一最高者胜出、平局者重掷一轮
  function settleRoll(room, session) {
    const now = Date.now();
    const names = nameById(room);
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

  // 房间解散时把未结算的 Roll 当场结算（胜者仍可领取）
  function settleRoomRolls(code) {
    const room = rooms.get(code);
    for (const s of rollSessions.values()) {
      if (s.roomCode !== code || s.status !== 'active') continue;
      settleRoll(room || { members: new Map() }, s);
    }
  }

  function prune(now) {
    for (const [code, room] of rooms) {
      for (const [pid, m] of room.members) {
        if (now - m.updatedAt > STALE_MS) room.members.delete(pid);
      }
      if (room.members.size === 0 && now - room.updatedAt > STALE_MS) {
        settleRoomRolls(code);
        rooms.delete(code);
      }
    }
    for (const [id, s] of rollSessions) {
      if (s.status === 'resolved' && s.resolvedAt > 0 && now - s.resolvedAt > ROLL_RESOLVED_KEEP_MS) {
        rollSessions.delete(id);
      }
    }
  }

  // 某玩家当前能看到的 Roll 列表：进行中的（顺带懒结算到点/全员已掷的）+ 刚结算 25 秒内的结果
  function loadRollsFor(room, playerId) {
    const now = Date.now();
    const names = nameById(room);
    const out = [];
    const rows = [...rollSessions.values()]
      .filter((s) => s.roomCode === room.code)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
    for (const session of rows) {
      if (!session.eligible.includes(playerId)) continue;
      if (session.status === 'active') {
        const allIn = session.participants.length > 0 &&
          session.participants.every((p) => session.entries[p] !== undefined);
        if (allIn || now >= session.expiresAt) settleRoll(room, session);
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

  function stateOf(room, forPlayerId) {
    return {
      ok: true,
      stageKey: room.stageKey,
      layer: room.layer,
      sharedKills: room.sharedKills,
      bossMax: room.bossMax,
      bossHp: room.bossHp,
      bossState: room.bossState,
      holeKilled: room.holeKilled,
      members: [...room.members.values()].map((m) => ({
        playerId: m.playerId, name: m.name, classId: m.classId, level: m.level,
        x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, layer: m.layer, gear: m.gear || '',
        xpTotal: m.xpTotal || 0,
      })),
      rolls: forPlayerId ? loadRollsFor(room, forPlayerId) : [],
    };
  }
  function emptyState(stageKey, layer) {
    return {
      ok: false, stageKey, layer, sharedKills: 0, bossMax: 0, bossHp: 0,
      bossState: 0, holeKilled: false, members: [], rolls: [],
    };
  }
  return {
    rooms, rollSessions, prune, stateOf, emptyState,
    settleRoll, settleRoomRolls, nextRollId: () => rollNextId++,
  };
}

// ---------------------------------------------------------------- 动作实现
function createActionsShim(store) {
  const overlay = createRoomOverlay();

  function needDevice(req) {
    const d = deviceIdFromCookie(req);
    if (!d) throw new Error('请先从首页进入游戏');
    return d;
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
        // 该位还没有行：新建（名字冲突时与 artifact 原版一致，静默返回 ok，记日志）。
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

    createRoom(req, args) {
      if (!isPlayerId(args.playerId) || !isName(args.name)) throw new Error('参数不对');
      if (typeof args.stageKey !== 'string' || typeof args.layer !== 'number' ||
          !Number.isInteger(args.layer) || args.layer < 0 || args.layer > 10)
        throw new Error('参数不对');
      if (typeof args.maxHp !== 'number' || !(args.maxHp > 0)) throw new Error('参数不对');
      const now = Date.now();
      let code = genCode();
      for (let tries = 0; tries < 8 && overlay.rooms.has(code); tries++) code = genCode();
      overlay.rooms.set(code, {
        code, stageKey: args.stageKey, layer: args.layer,
        sharedKills: 0, bossMax: 0, bossHp: 0, bossState: 0, holeKilled: false,
        updatedAt: now,
        members: new Map([[args.playerId, {
          playerId: args.playerId, name: args.name, classId: args.classId || '',
          level: args.level || 1, x: 0, y: 0, hp: args.maxHp, maxHp: args.maxHp,
          layer: args.layer, gear: '', xpTotal: 0, updatedAt: now,
        }]]),
      });
      return { ok: true, code };
    },

    joinRoom(req, args) {
      if (!isPlayerId(args.playerId) || !isName(args.name)) throw new Error('参数不对');
      const code = String(args.code || '').trim().toUpperCase();
      const now = Date.now();
      overlay.prune(now);
      const room = overlay.rooms.get(code);
      if (!room) return { ok: false, stageKey: '', layer: 0, reason: '房间不存在或已解散' };
      const already = room.members.has(args.playerId);
      if (!already && room.members.size >= ROOM_MAX)
        return { ok: false, stageKey: room.stageKey, layer: room.layer, reason: '房间已满（最多 4 人）' };
      if (!already) {
        room.members.set(args.playerId, {
          playerId: args.playerId, name: args.name, classId: args.classId || '',
          level: args.level || 1, x: 0, y: 0, hp: args.maxHp, maxHp: args.maxHp,
          layer: room.layer, gear: '', xpTotal: 0, updatedAt: now,
        });
        room.updatedAt = now;
      }
      return { ok: true, stageKey: room.stageKey, layer: room.layer, reason: '' };
    },

    heartbeat(req, args) {
      if (!isPlayerId(args.playerId) || !isName(args.name)) throw new Error('参数不对');
      const code = String(args.code || '').trim().toUpperCase();
      const now = Date.now();
      overlay.prune(now);
      const room = overlay.rooms.get(code);
      if (!room) return overlay.emptyState('', 0);
      const mine = room.members.get(args.playerId);
      // 组队共享经验：只累计自己打怪上报的 xpDelta（领到的队友经验客户端不会再上报，防回声放大）
      const xpUp = Number.isInteger(args.xpDelta) && args.xpDelta > 0
        ? Math.min(args.xpDelta, 10000000) : 0;
      const vals = {
        playerId: args.playerId, name: args.name, classId: args.classId || '',
        level: args.level || 1, x: args.x || 0, y: args.y || 0,
        hp: args.hp || 0, maxHp: args.maxHp || 1, layer: args.layer || 0,
        xpTotal: (mine ? mine.xpTotal || 0 : 0) + xpUp,
        updatedAt: now,
      };
      if (mine) {
        Object.assign(mine, vals);
        if (args.gear) mine.gear = args.gear;
      } else {
        room.members.set(args.playerId, { ...vals, gear: args.gear || '' });
      }
      if (args.killsDelta > 0) room.sharedKills += args.killsDelta;
      if (args.holeKilled && !room.holeKilled) room.holeKilled = true;
      if (typeof args.advanceLayer === 'number' && args.advanceLayer >= 0 &&
          args.advanceLayer !== room.layer) {
        room.layer = args.advanceLayer;
        room.sharedKills = 0; room.bossMax = 0; room.bossHp = 0; room.bossState = 0;
      } else {
        if (args.bossSpawnMax > 0 && room.bossState === 0) {
          room.bossMax = args.bossSpawnMax; room.bossHp = args.bossSpawnMax; room.bossState = 1;
        }
        if (args.bossDamage > 0 && room.bossState === 1) {
          room.bossHp = Math.max(0, room.bossHp - args.bossDamage);
          if (room.bossHp <= 0) room.bossState = 2;
        }
      }
      room.updatedAt = now;
      overlay.prune(now);
      const again = overlay.rooms.get(code);
      return again ? overlay.stateOf(again, args.playerId) : overlay.emptyState(room.stageKey, room.layer);
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
      const code = String(args.code || '').trim().toUpperCase();
      const now = Date.now();
      overlay.prune(now);
      const room = overlay.rooms.get(code);
      if (!room) return { ok: false, id: 0, reason: '房间已解散' };
      // 有资格 Roll 的 = 本房同层、还在线的成员（发起人必在内）
      const eligible = [...room.members.values()]
        .filter((m) => m.layer === args.layer && now - m.updatedAt <= STALE_MS)
        .map((m) => m.playerId);
      if (!eligible.includes(args.playerId)) eligible.push(args.playerId);
      const id = overlay.nextRollId();
      overlay.rollSessions.set(id, {
        id, roomCode: code, itemJson: args.itemJson, initiatorId: args.playerId,
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
      // 全员都掷完就立刻结算（不等倒计时）
      if (session.participants.every((p) => session.entries[p] !== undefined)) {
        const room = overlay.rooms.get(session.roomCode);
        overlay.settleRoll(room || { members: new Map() }, session);
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

    leaveRoom(req, args) {
      if (!isPlayerId(args.playerId)) throw new Error('参数不对');
      const code = String(args.code || '').trim().toUpperCase();
      const room = overlay.rooms.get(code);
      if (room) {
        room.members.delete(args.playerId);
        if (room.members.size === 0) {
          overlay.settleRoomRolls(code);
          overlay.rooms.delete(code);
        }
      }
      return { ok: true };
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

  return { handleActions, rooms: overlay.rooms, deviceIdFromCookie };
}

module.exports = { createActionsShim, deviceIdFromCookie };
