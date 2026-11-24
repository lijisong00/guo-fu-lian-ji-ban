'use strict';
// ---------------------------------------------------------------------------
// 世界制 · 世界引擎（联机版 JS 版；artifact 侧 server/src/world.ts 为同构 TS 版，
// 两边逻辑保持一致，改一处时同步另一处）。
//
// 模型：一个世界 = 一张图的一层 (stageId:layerIdx)，共 49 个世界实例。
// 世界里所有玩家打同一批怪：怪物只存在服务端，位置/血量/仇恨/死亡由服务端定，
// 客户端只做渲染与插值，不再本地刷怪、本地算怪 AI。
//
// 经验与掉落（用户 2026-11-24 决策）：整图共享为底，组队平分在其上。
//   - 经验：怪死时，未组队的在场成员每人得全额经验；组队者按同世界队员数
//     平分（每人 floor(xp/n)，至少 1 点），异图队员不分。死亡事件带 team
//     字段 {members, xp}，客户端按 monsterId 去重领取一次（自己在
//     team.members 里领 team.xp，否则领全额 xp）。
//   - 掉落：白/绿落地（归属杀手 1 分钟保护，沿用旧规则）；蓝装以上（极品 2 点+ /
//     强化过）由杀手发起 Roll，资格 = 世界内在场且近期有行动的玩家（60 秒内
//     移动过或造成过伤害；刚进世界的新玩家也算在场），30 秒未点自动代掷，
//     最高者进背包，平局重 Roll。挂机玩家（60 秒无行动）收不到 Roll 弹窗，
//     也不占 Roll 名额；经验仍按用户决定发给世界内所有人。
//   - 挂机蹭经验的缓解：经验照发（用户决定），但 Roll 资格与弹窗只给活跃玩家，
//     且世界内怪物由服务端 tick 主动攻击附近玩家（挂机站着会被怪打死回城，
//     不能无限蹭）。
//
// 服务端模拟：懒 tick——每次世界动作（joinWorld/worldSync/hitMonster/heartbeat）
// 进入时按流逝时间推进一次（dt 上限 2 秒），只 tick 有玩家的世界；
// 无人世界不推进，5 分钟无人后卸载（STALE_MS=300000，与房间保留口径一致）。
// 怪物间分离用空间哈希网格（格子 64px，只查邻格），不用 O(n²)。
// ---------------------------------------------------------------------------

const STALE_MS = 300000;          // 无人世界 5 分钟后卸载；离线玩家 5 分钟后清理
const WORLD_VIEW_R = 1000;        // worldSync 视野半径（px）
const AGGRO_RANGE = 120;
// 电僵尸闪电（2026-11-24）：与 artifact game-data.ts 同一口径——射程 r×14（BOLT_REACH_MUL=14；
// 电僵尸 r=18 → 252px，约 5 个身位），电线半宽 r×1（BOLT_HALF_WIDTH_MUL=1，整条线宽 2r ≈ 1 个身位）。
// 哪些怪放电由数据定（MONSTER_MAP def.bolt === true，目前只有 dianjiang），不硬编码怪名。
const BOLT_REACH_MUL = 14;
const BOLT_HALF_WIDTH_MUL = 1;
const ACTIVE_WINDOW_MS = 60000;   // Roll 资格：60 秒内移动过或造成过伤害算活跃
// 刷怪：一小时整波（用户 2026-11-24 决策）。怪死了就一直死着，不再 60–120 秒
// 单个重刷；到墙上时钟的整点（:00）整波一次性全部刷回来（普通怪 + Boss）。
// 尸王殿沿用自己已有的整波逻辑（见 tick 里的 bossAlive 分支），保持不动。
const CORPSE_WAVE_MS = 3600 * 1000;     // 尸王殿整波 1 小时
const MINE_REFILL_MS = 3600 * 1000;     // 矿脉每小时补满
const HOLE_TRIGGER_DIST = 240;
const HOLE_CLIMB_MS = 2200;
const HIT_RATE_LIMIT_PER_SEC = 30;
const GRID = 64;
const CORPSE_GRID_AXIS = [-250, -150, -50, 50, 150, 250];
// 多人血量加成（设计 §2.2）：世界里人多也不无限加，按 4 人封顶定血量，
// 与原来 4 人房上限一致：普通怪 ×1.75、Boss ×2.8。
const HP_MUL_CAP_NORMAL = 1.75;
const HP_MUL_CAP_BOSS = 2.8;
const BAIRI_STAGE_ID = 15;
const BAIRI_CITY = { hx: 280, hy: 220 };
const CORPSE_STAGE_ID = 5;

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
// 下一个墙上时钟整点（:00）的时间戳（毫秒），整波刷新用。
function nextHourTop(now) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}
function bairiCoastX(y, worldHalf) {
  return worldHalf * (0.66 + 0.09 * Math.sin(y * 0.0011 + 1.2) + 0.05 * Math.sin(y * 0.0027 + 0.4));
}
function inBairiCity(x, y) { return Math.abs(x) <= BAIRI_CITY.hx && Math.abs(y) <= BAIRI_CITY.hy; }
function isBairiField(stageId, layerIdx) { return stageId === BAIRI_STAGE_ID && layerIdx === 0; }
// 新手村东南角安全区（2026-11-24，与服务器版 artifact world.ts 同口径）：
// x 950–1350、y 950–1350——里面不刷怪、Boss 不刷进去、怪物进不来（tick 围栏推出）；
// 玩家在里面不受攻击由客户端 hurtPlayer 同口径拦截，服务端这边只管刷怪与围栏
const XINSHOU_STAGE_ID = 1;
const XINSHOU_SAFE = { x0: 950, y0: 950, x1: 1350, y1: 1350 };
function isXinshouField(stageId, layerIdx) { return stageId === XINSHOU_STAGE_ID && layerIdx === 0; }
function inXinshouSafe(x, y) {
  return x >= XINSHOU_SAFE.x0 && x <= XINSHOU_SAFE.x1 && y >= XINSHOU_SAFE.y0 && y <= XINSHOU_SAFE.y1;
}

function createWorlds(data) {
  const { STAGES, MONSTER_MAP, WORLD_HALF } = data;
  const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.id, s]));
  const worlds = new Map(); // key "stageId:layerIdx" -> world
  let deathSeq = 0;

  // ---- 队伍（全局，跨世界存在；经验只分同世界队员）----
  const TEAM_MAX = 4;            // 队伍上限 4 人
  const INVITE_TTL_MS = 30000;   // 邀请 30 秒过期（不点自动拒绝）
  const teams = new Map();       // teamId -> {id, leaderId, members: [{playerId, name, classId, level, joinedAt}], createdAt}
  const playerTeam = new Map();  // playerId -> teamId
  const invites = new Map();     // inviteId -> {id, fromId, toId, createdAt, expiresAt}
  let teamNextId = 1;
  let inviteNextId = 1;

  function worldKey(stageId, layerIdx) { return `${stageId}:${layerIdx}`; }

  function randomSpawnPos(world, minDistFromPlayers) {
    const half = world.worldHalf;
    for (let tries = 0; tries < 8; tries++) {
      let x = rand(-half + 60, half - 60);
      let y = rand(-half + 60, half - 60);
      if (isBairiField(world.stageId, world.layerIdx)) {
        if (inBairiCity(x, y) || x > bairiCoastX(y, half) - 40) continue;
      }
      if (isXinshouField(world.stageId, world.layerIdx)) {
        if (inXinshouSafe(x, y)) continue; // 新手村安全区内不刷怪
      }
      if (minDistFromPlayers > 0) {
        let ok = true;
        for (const p of world.players.values()) {
          if (Math.hypot(x - p.x, y - p.y) < minDistFromPlayers) { ok = false; break; }
        }
        if (!ok) continue;
      }
      return { x, y };
    }
    // 小图放不下间距时直接取一个合法点（白日门落城里/海里时挪到丛林）
    let x = rand(-half + 60, half - 60);
    let y = rand(-half + 60, half - 60);
    if (isBairiField(world.stageId, world.layerIdx)) {
      if (inBairiCity(x, y) || x > bairiCoastX(y, half) - 40) { x = -half * 0.5; y = half * 0.4; }
    }
    if (isXinshouField(world.stageId, world.layerIdx)) {
      if (inXinshouSafe(x, y)) { x = -half * 0.5; y = -half * 0.4; }
    }
    return { x, y };
  }

  function makeMonster(world, kind, opts = {}) {
    const def = MONSTER_MAP[kind];
    if (!def) return null;
    const layer = world.layer;
    const hp = Math.round(def.hp * layer.hpMul * HP_MUL_CAP_NORMAL);
    const pos = opts.at || randomSpawnPos(world, opts.minDist ?? 220);
    const m = {
      id: world.nextId++, kind, x: pos.x, y: pos.y,
      hp, maxHp: hp,
      spd: def.spd * rand(0.9, 1.1), dmg: def.dmg * layer.dmgMul,
      xp: Math.round(def.xp * (data.MONSTER_XP_MUL ?? 1)), r: def.r,
      boss: false, farmBoss: false, holeZombie: !!opts.holeZombie,
      aggro: !!opts.aggro, targetId: null,
      atkCd: rand(0.2, 0.8), slowT: 0, stunT: 0, teleportCd: 0,
      seed: Math.random() * 10, walkPhase: rand(0, Math.PI * 2),
      defV: def.def ?? 0, mdefV: def.mdef ?? 0,
      respawnAt: 0, dead: false, lastHitBy: null,
    };
    return m;
  }

  function makeBoss(world, opts = {}) {
    const bd = world.layer.boss;
    if (!bd || !bd.name) return null; // 无 Boss 的层（多层地图只留最后一层有 Boss）
    const hp = Math.round(bd.hp * HP_MUL_CAP_BOSS);
    let pos = opts.at;
    if (!pos) {
      // 刷在离玩家最远的候选点（850–1250 外取 10 个候选挑最远）
      let best = null; let bestD = -1;
      const players = [...world.players.values()];
      const cx0 = players[0] ? players[0].x : 0;
      const cy0 = players[0] ? players[0].y : 0;
      for (let i = 0; i < 10; i++) {
        const ang = rand(0, Math.PI * 2);
        const rr = rand(850, 1250);
        const x = clamp(cx0 + Math.cos(ang) * rr, -world.worldHalf + 90, world.worldHalf - 90);
        const y = clamp(cy0 + Math.sin(ang) * rr, -world.worldHalf + 90, world.worldHalf - 90);
        const dd = Math.hypot(x - cx0, y - cy0);
        if (dd > bestD) { bestD = dd; best = { x, y }; }
      }
      pos = best || { x: cx0, y: cy0 - 900 };
      if (isBairiField(world.stageId, world.layerIdx)) {
        if (inBairiCity(pos.x, pos.y)) pos.x = BAIRI_CITY.hx + 260;
        const bcx = bairiCoastX(pos.y, world.worldHalf) - 170;
        if (pos.x > bcx) pos.x = bcx;
      }
      if (isXinshouField(world.stageId, world.layerIdx)) {
        // 新手村 Boss 不刷进东南角安全区——挪到安全区西北外面
        if (inXinshouSafe(pos.x, pos.y)) { pos.x = XINSHOU_SAFE.x0 - 160; pos.y = XINSHOU_SAFE.y0 - 160; }
      }
    }
    const m = {
      id: world.nextId++, kind: 'boss', x: pos.x, y: pos.y,
      hp, maxHp: hp,
      spd: bd.spd, dmg: bd.dmg,
      xp: Math.round(bd.xp * (data.MONSTER_XP_MUL ?? 1)), r: bd.r,
      boss: true, farmBoss: !!opts.farmBoss, holeZombie: false,
      aggro: false, targetId: null,
      atkCd: 0.6, slowT: 0, stunT: 0, teleportCd: rand(1.6, 2.6),
      seed: Math.random() * 10, walkPhase: 0,
      defV: 0, mdefV: 0, bossName: bd.name, bossEmoji: bd.emoji,
      respawnAt: 0, dead: false, lastHitBy: null,
    };
    return m;
  }

  function corpseCells() {
    const cells = [];
    for (const x of CORPSE_GRID_AXIS)
      for (const y of CORPSE_GRID_AXIS)
        cells.push({ x, y, entrance: Math.abs(x) === 50 && Math.abs(y) === 50 });
    return cells;
  }

  function spawnCorpseWave(world, includeMain) {
    const cells = corpseCells().filter((c) => !c.entrance);
    const occupied = (x, y) => {
      for (const m of world.monsters.values()) {
        if (!m.dead && m.boss && Math.hypot(m.x - x, m.y - y) < 55) return true;
      }
      return false;
    };
    let spawned = 0;
    if (includeMain && !world.boss) {
      let best = null; let bestD = -1;
      for (const c of cells) {
        if (occupied(c.x, c.y)) continue;
        let dd = Infinity;
        for (const p of world.players.values()) dd = Math.min(dd, Math.hypot(c.x - p.x, c.y - p.y));
        if (dd > bestD) { bestD = dd; best = c; }
      }
      if (best) {
        const boss = makeBoss(world, { at: best });
        if (boss) {
          world.monsters.set(boss.id, boss);
          world.boss = boss; world.bossState = 1;
          spawned += 1;
        }
      }
    }
    // 常驻只补到 31 只：怪会游荡离格，只按“空位”补会在整波时越补越多
    //（实测曾一次补出 3 只、总数冲到 34），故再按存活数封顶。
    let aliveFarm = 0;
    for (const m of world.monsters.values()) if (!m.dead && m.boss && m.farmBoss) aliveFarm += 1;
    for (const c of cells) {
      if (aliveFarm >= 31) break;
      if (occupied(c.x, c.y)) continue;
      const m = makeBoss(world, { at: c, farmBoss: true });
      world.monsters.set(m.id, m);
      aliveFarm += 1;
      spawned += 1;
    }
    world.rev += 1;
    return spawned;
  }

  function spawnInitial(world) {
    const layer = world.layer;
    if (world.stage.safe) return; // 安全区（盟重土城）不刷怪不刷 Boss
    if (layer.bossAlive) {
      // 尸王殿：只刷尸王整波
      spawnCorpseWave(world, true);
      world.nextWaveAt = Date.now() + (layer.bossRespawnSec ?? 3600) * 1000;
      return;
    }
    const count = layer.monsterCount ?? 500;
    for (let i = 0; i < count; i++) {
      const key = layer.pool[Math.floor(Math.random() * layer.pool.length)];
      const m = makeMonster(world, key);
      if (m) world.monsters.set(m.id, m);
    }
    const boss = makeBoss(world, {});
    if (boss) {
      world.monsters.set(boss.id, boss);
      world.boss = boss; world.bossState = 1;
    }
    world.rev += 1;
  }

  // 整波刷新（每小时）：把本图所有死掉的怪一次性全部刷回来（普通怪 + Boss）。
  // 普通怪按死掉的种刷回同种新怪；Boss 用自己的 Boss 生成规则刷回来。
  // 不在这里推进 nextWaveAt，调用方在 tick 里把它推到下一个整点。
  function refillWave(world) {
    const target = world.layer.monsterCount ?? 500;
    let aliveNormal = 0;
    for (const m of world.monsters.values()) if (!m.dead && !m.boss) aliveNormal += 1;
    for (const m of [...world.monsters.values()]) {
      if (!m.dead || m.boss) continue;
      if (aliveNormal >= target) break;
      const nm = makeMonster(world, m.kind, { minDist: 120 });
      if (nm) { world.monsters.delete(m.id); world.monsters.set(nm.id, nm); aliveNormal += 1; }
    }
    if (world.bossState === 2) {
      const boss = makeBoss(world, {});
      if (boss) {
        world.monsters.set(boss.id, boss);
        world.boss = boss; world.bossState = 1;
      }
    }
    world.rev += 1;
  }

  function getOrCreate(stageId, layerIdx) {
    const key = worldKey(stageId, layerIdx);
    let w = worlds.get(key);
    if (w) return w;
    const stage = STAGE_MAP[stageId];
    if (!stage) return null;
    const layer = stage.layers[layerIdx];
    if (!layer) return null;
    const worldHalf = layer.worldHalf ?? WORLD_HALF;
    w = {
      key, stageId, layerIdx, stage, layer, worldHalf,
      monsters: new Map(), nextId: 1, rev: 1,
      players: new Map(), // playerId -> member
      createdAt: Date.now(), lastActiveAt: Date.now(), lastTick: Date.now(),
      boss: null, bossState: 0, bossRespawnAt: 0,
      nextWaveAt: 0, holeState: 0, holeClimbAt: 0, holeZombieId: 0, holeKilled: false,
      holePortal: null, // 洞口位置（客户端 joinWorld 时上报一次，供服务端判触发）
      mines: [], mineRefillAt: 0,
      deaths: [], // 近期死亡事件 {seq, monsterId, kind, boss, farmBoss, holeZombie, killerId, xp, x, y}
      hits: [], // 近期怪物打玩家事件 {seq, playerId, monsterId, dmg, ranged, boss}
      hitLog: new Map(), // playerId -> 最近 1 秒伤害事件时间戳数组（限流）
    };
    if (stage.mine) {
      for (let i = 0; i < 4; i++) {
        w.mines.push({ x: rand(-worldHalf + 70, worldHalf - 70), y: rand(-worldHalf + 70, worldHalf - 70), left: 3 });
      }
      w.mineRefillAt = Date.now() + MINE_REFILL_MS;
    }
    worlds.set(key, w);
    spawnInitial(w);
    // 普通图：下次整波 = 下一个墙上时钟整点（:00）。尸王殿的 nextWaveAt
    // 由 spawnInitial 按自己的整波间隔设好，这里不动它。
    if (!w.layer.bossAlive && !w.nextWaveAt) w.nextWaveAt = nextHourTop(Date.now());
    return w;
  }

  function prune(now) {
    pruneInvites(now);
    // 只清掉线玩家，不删空世界：怪的存活/死亡状态留在世界实例里，进图
    // 不再刷满（每小时整波才补）。世界数上限 49 张图，内存有界。
    for (const [key, w] of worlds) {
      for (const [pid, m] of w.players) {
        if (now - m.updatedAt > STALE_MS) w.players.delete(pid);
      }
    }
  }

  // ---- 队伍 ----
  function pruneInvites(now) {
    for (const [id, inv] of invites) {
      if (now >= inv.expiresAt) invites.delete(id);
    }
  }

  // 在所有世界里找玩家（队伍跨地图，成员可能在任何世界或不在线）
  function findPlayerWorld(playerId) {
    for (const w of worlds.values()) {
      const m = w.players.get(playerId);
      if (m) return { world: w, member: m };
    }
    return null;
  }

  function getTeamOf(playerId) {
    const tid = playerTeam.get(playerId);
    return tid ? teams.get(tid) || null : null;
  }

  // worldSync 用的队伍快照：队长排第一、其余按加入顺序；队员当前世界/血量取实时值，
  // 不在线的队员 worldKey 为 ''、hp 为 0（HUD 上灰显“异图”）。
  function teamInfoFor(playerId) {
    const team = getTeamOf(playerId);
    if (!team) return null;
    const members = team.members.map((m) => {
      const loc = findPlayerWorld(m.playerId);
      if (loc) {
        const mm = loc.member;
        return {
          playerId: m.playerId, name: mm.name || m.name, classId: mm.classId || m.classId,
          level: mm.level || m.level, hp: Math.round(mm.hp), maxHp: mm.maxHp,
          worldKey: loc.world.key,
        };
      }
      return {
        playerId: m.playerId, name: m.name, classId: m.classId, level: m.level,
        hp: 0, maxHp: 1, worldKey: '',
      };
    });
    return { id: team.id, leaderId: team.leaderId, members };
  }

  // 发给本人的待回应邀请（带邀请人名字，供客户端弹框）
  function invitesFor(playerId, now) {
    pruneInvites(now);
    const out = [];
    for (const inv of invites.values()) {
      if (inv.toId !== playerId) continue;
      const loc = findPlayerWorld(inv.fromId);
      out.push({
        id: inv.id, fromId: inv.fromId,
        fromName: loc ? (loc.member.name || '') : '',
        expiresAt: inv.expiresAt,
      });
    }
    return out.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  function inviteTeam(fromId, toId, now) {
    pruneInvites(now);
    const fromLoc = findPlayerWorld(fromId);
    if (!fromLoc) return { ok: false, inviteId: 0, reason: '你不在世界里' };
    const toLoc = findPlayerWorld(toId);
    if (!toLoc) return { ok: false, inviteId: 0, reason: '对方不在这个世界里' };
    if (toLoc.world.key !== fromLoc.world.key) return { ok: false, inviteId: 0, reason: '对方不在同一张地图' };
    if (playerTeam.has(toId)) return { ok: false, inviteId: 0, reason: '对方已有队伍' };
    const fromTeam = getTeamOf(fromId);
    if (fromTeam && fromTeam.members.length >= TEAM_MAX) return { ok: false, inviteId: 0, reason: '队伍已满（最多 4 人）' };
    for (const inv of invites.values()) {
      if (inv.fromId === fromId && inv.toId === toId) return { ok: true, inviteId: inv.id };
    }
    const inv = { id: inviteNextId++, fromId, toId, createdAt: now, expiresAt: now + INVITE_TTL_MS };
    invites.set(inv.id, inv);
    return { ok: true, inviteId: inv.id };
  }

  function respondInvite(inviteId, playerId, accept, now) {
    pruneInvites(now);
    const inv = invites.get(inviteId);
    if (!inv) return { ok: false, reason: '邀请已过期' };
    if (inv.toId !== playerId) return { ok: false, reason: '这不是发给你的邀请' };
    invites.delete(inviteId);
    if (!accept) return { ok: true, declined: true };
    if (playerTeam.has(playerId)) return { ok: false, reason: '你已有队伍' };
    const fromLoc = findPlayerWorld(inv.fromId);
    if (!fromLoc) return { ok: false, reason: '邀请人已离开' };
    let team = getTeamOf(inv.fromId);
    if (team && team.members.length >= TEAM_MAX) return { ok: false, reason: '队伍已满（最多 4 人）' };
    if (!team) {
      team = {
        id: teamNextId++, leaderId: inv.fromId, createdAt: now,
        members: [{
          playerId: inv.fromId, name: fromLoc.member.name || '',
          classId: fromLoc.member.classId || '', level: fromLoc.member.level || 1, joinedAt: now,
        }],
      };
      teams.set(team.id, team);
      playerTeam.set(inv.fromId, team.id);
    }
    const meLoc = findPlayerWorld(playerId);
    team.members.push({
      playerId, name: meLoc ? (meLoc.member.name || '') : '', classId: meLoc ? (meLoc.member.classId || '') : '',
      level: meLoc ? (meLoc.member.level || 1) : 1, joinedAt: now,
    });
    playerTeam.set(playerId, team.id);
    return { ok: true, team: teamInfoFor(playerId) };
  }

  function leaveTeam(playerId) {
    const team = getTeamOf(playerId);
    if (!team) return { ok: true };
    team.members = team.members.filter((m) => m.playerId !== playerId);
    playerTeam.delete(playerId);
    if (team.members.length === 0) { teams.delete(team.id); return { ok: true }; }
    if (team.leaderId === playerId) team.leaderId = team.members[0].playerId; // 队长顺延给最早加入的下一位
    return { ok: true };
  }

  function kickFromTeam(leaderId, targetId) {
    const team = getTeamOf(leaderId);
    if (!team) return { ok: false, reason: '你没有队伍' };
    if (team.leaderId !== leaderId) return { ok: false, reason: '只有队长可以踢人' };
    if (targetId === leaderId) return { ok: false, reason: '不能踢自己，请用离队' };
    if (playerTeam.get(targetId) !== team.id) return { ok: false, reason: '对方不在你的队伍里' };
    team.members = team.members.filter((m) => m.playerId !== targetId);
    playerTeam.delete(targetId);
    return { ok: true };
  }

  function activePlayers(world, now) {
    // Roll 资格：在场且近期有行动（60 秒内移动过或造成过伤害；刚进世界也算）
    return [...world.players.values()].filter((p) => now - p.lastActiveAt <= ACTIVE_WINDOW_MS);
  }

  function nearestPlayer(world, x, y, maxD) {
    let best = null; let bestD = maxD;
    for (const p of world.players.values()) {
      if (p.hp <= 0) continue;
      const dd = Math.hypot(p.x - x, p.y - y);
      if (dd < bestD) { bestD = dd; best = p; }
    }
    return best;
  }

  // 懒 tick：按流逝时间推进怪物（游荡/追击/攻击/重刷/Boss 重刷/尸王整波/洞口爬出/矿脉补满）
  function tick(world, now) {
    const dt = clamp((now - world.lastTick) / 1000, 0, 2);
    world.lastTick = now;
    if (world.players.size === 0 || dt <= 0) return;
    const half = world.worldHalf;
    // 整波刷新（每小时，普通图）：到整点把死掉的怪一次性全部刷回来
    //（普通怪 + Boss）。不到整点不补刷。尸王殿走自己的整波（下一段），不动。
    if (!world.layer.bossAlive && world.nextWaveAt > 0 && now >= world.nextWaveAt) {
      refillWave(world);
      world.nextWaveAt = nextHourTop(now);
    }
    // 尸王殿每小时整波补满（只补常驻尸王）
    if (world.layer.bossAlive && world.nextWaveAt > 0 && now >= world.nextWaveAt) {
      spawnCorpseWave(world, false);
      world.nextWaveAt = now + (world.layer.bossRespawnSec ?? 3600) * 1000;
    }
    // 矿脉每小时补满
    if (world.stage.mine && world.mineRefillAt > 0 && now >= world.mineRefillAt) {
      for (const v of world.mines) v.left = 3;
      world.mineRefillAt = now + MINE_REFILL_MS;
      world.rev += 1;
    }
    // 洞口黄衣僵尸：有人走近 240 内开始爬，2.2 秒后爬出变真怪
    if (world.holePortal && world.holeState === 0 && !world.holeKilled) {
      for (const p of world.players.values()) {
        if (Math.hypot(p.x - world.holePortal.x, p.y - world.holePortal.y) < HOLE_TRIGGER_DIST) {
          world.holeState = 1; world.holeClimbAt = now + HOLE_CLIMB_MS; world.rev += 1;
          break;
        }
      }
    }
    if (world.holeState === 1 && now >= world.holeClimbAt) {
      const m = makeMonster(world, 'jiangshi', { at: { x: world.holePortal.x + 26, y: world.holePortal.y - 4 }, aggro: true, holeZombie: true });
      if (m) {
        m.aggro = true;
        world.monsters.set(m.id, m);
        world.holeZombieId = m.id; world.holeState = 2; world.rev += 1;
      }
    }
    // 怪物移动与攻击（空间哈希分离，只处理玩家 400px 内的怪）
    const nearPlayers = [...world.players.values()].filter((p) => p.hp > 0);
    const grid = new Map();
    const cellKey = (x, y) => `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
    for (const m of world.monsters.values()) {
      if (m.dead) continue;
      const k = cellKey(m.x, m.y);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(m);
    }
    for (const m of world.monsters.values()) {
      if (m.dead) continue;
      m.atkCd -= dt;
      const target = nearestPlayer(world, m.x, m.y, 600);
      if (!m.aggro && target && Math.hypot(target.x - m.x, target.y - m.y) < AGGRO_RANGE) {
        m.aggro = true; m.targetId = target.playerId;
      }
      if (m.aggro && target) {
        const dx = target.x - m.x, dy = target.y - m.y;
        const dd = Math.hypot(dx, dy) || 1;
        m.targetId = target.playerId;
        // 沃玛教主瞬移：已惊动、离玩家 >190、冷却好时瞬移到玩家身边
        if (m.boss && m.bossName === '沃玛教主') {
          m.teleportCd -= dt;
          if (m.teleportCd <= 0 && dd > 190) {
            const ang = rand(0, Math.PI * 2);
            m.x = clamp(target.x + Math.cos(ang) * (m.r + 36), -half + 50, half - 50);
            m.y = clamp(target.y + Math.sin(ang) * (m.r + 36), -half + 50, half - 50);
            m.teleportCd = rand(3.5, 5);
            m.atkCd = Math.max(m.atkCd, 0.35);
            world.rev += 1;
          }
        }
        if (MONSTER_MAP[m.kind]?.bolt) {
          // 电僵尸：朝目标方向放一道直线闪电。射程 = r×14（r=18 时 252px，约 5 个身位）；
          // 宽约 1 个身位：垂距 ≤ 怪半径才命中；线上所有玩家都受伤。
          const boltRange = m.r * BOLT_REACH_MUL;
          if (dd <= boltRange) {
            if (m.atkCd <= 0) {
              m.atkCd = 1.5;
              const ux = dx / dd, uy = dy / dd;
              for (const p of world.players.values()) {
                if (p.hp <= 0) continue;
                const px = p.x - m.x, py = p.y - m.y;
                const along = px * ux + py * uy;
                if (along < 0 || along > boltRange) continue;
                if (Math.abs(px * uy - py * ux) > m.r * BOLT_HALF_WIDTH_MUL) continue;
                world.hits.push({ seq: ++deathSeq, at: now, playerId: p.playerId, monsterId: m.id, dmg: m.dmg, ranged: false, boss: m.boss, attackType: 'bolt' });
              }
            }
          } else {
            m.x += (dx / dd) * m.spd * dt;
            m.y += (dy / dd) * m.spd * dt;
          }
        } else if (dd > m.r + 16) {
          const range = m.boss ? 0 : (MONSTER_MAP[m.kind]?.range ?? 0);
          if (range > 0 && dd <= range) {
            if (dd < 110) { m.x -= (dx / dd) * m.spd * 0.7 * dt; m.y -= (dy / dd) * m.spd * 0.7 * dt; }
            if (m.atkCd <= 0) {
              m.atkCd = 1.5;
              world.hits.push({ seq: ++deathSeq, at: now, playerId: target.playerId, monsterId: m.id, dmg: m.dmg, ranged: true, boss: m.boss });
            }
          } else {
            m.x += (dx / dd) * m.spd * dt;
            m.y += (dy / dd) * m.spd * dt;
          }
        } else if (m.atkCd <= 0) {
          m.atkCd = 0.95;
          world.hits.push({ seq: ++deathSeq, at: now, playerId: target.playerId, monsterId: m.id, dmg: m.dmg, ranged: false, boss: m.boss });
        }
      } else if (!m.aggro) {
        // 未惊动：原地附近慢游
        const wa = m.seed + (now / 1000) * 0.35;
        m.x = clamp(m.x + Math.cos(wa) * m.spd * 0.22 * dt, -half, half);
        m.y = clamp(m.y + Math.sin(wa * 1.3) * m.spd * 0.22 * dt, -half, half);
      }
      m.walkPhase += dt * 5;
      // 白日门：怪进不了城、下不了海
      if (isBairiField(world.stageId, world.layerIdx)) {
        if (inBairiCity(m.x, m.y)) {
          const dxOut = BAIRI_CITY.hx + 4 - Math.abs(m.x);
          const dyOut = BAIRI_CITY.hy + 4 - Math.abs(m.y);
          if (dxOut < dyOut) m.x = (m.x >= 0 ? 1 : -1) * (BAIRI_CITY.hx + 4);
          else m.y = (m.y >= 0 ? 1 : -1) * (BAIRI_CITY.hy + 4);
        }
        const ecx = bairiCoastX(m.y, half) - m.r * 0.5;
        if (m.x > ecx) m.x = ecx;
      }
      // 新手村围栏：怪物进不了东南角安全区，从最近的一边推出去（与客户端同口径；
      // 东/南两边贴着地图边界，往那两边出会越界时改从西/北边出）
      if (isXinshouField(world.stageId, world.layerIdx)) {
        if (inXinshouSafe(m.x, m.y)) {
          const dW = m.x - XINSHOU_SAFE.x0, dE = XINSHOU_SAFE.x1 - m.x;
          const dN = m.y - XINSHOU_SAFE.y0, dS = XINSHOU_SAFE.y1 - m.y;
          if (Math.min(dW, dN) <= Math.min(dE, dS)) {
            if (dW < dN) m.x = XINSHOU_SAFE.x0 - 4; else m.y = XINSHOU_SAFE.y0 - 4;
          } else if (dE < dS) m.x = XINSHOU_SAFE.x1 + 4; else m.y = XINSHOU_SAFE.y1 + 4;
        }
      }
    }
    // 分离：只对玩家 400px 内的怪做邻格配对
    const nearSet = new Set();
    for (const p of nearPlayers) {
      for (const m of world.monsters.values()) {
        if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 400) nearSet.add(m);
      }
    }
    for (const a of nearSet) {
      const cx = Math.floor(a.x / GRID), cy = Math.floor(a.y / GRID);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(`${gx},${gy}`);
          if (!cell) continue;
          for (const c of cell) {
            if (c === a || c.dead || c.id <= a.id) continue;
            const dx = c.x - a.x, dy = c.y - a.y;
            const min = a.r + c.r;
            if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
            const dd = Math.hypot(dx, dy);
            if (dd > 0 && dd < min) {
              const push = ((min - dd) / 2) * 0.6;
              a.x -= (dx / dd) * push; a.y -= (dy / dd) * push;
              c.x += (dx / dd) * push; c.y += (dy / dd) * push;
            }
          }
        }
      }
    }
    // 受击事件只保留 5 秒内的：过期的客户端不会再领，清掉防 sync 一遍遍重发旧伤害
    if (world.hits.length > 0) world.hits = world.hits.filter((h) => now - h.at <= 5000);
    if (world.hits.length > 200) world.hits.splice(0, world.hits.length - 200);
    if (world.deaths.length > 200) world.deaths.splice(0, world.deaths.length - 200);
  }

  function monsterOut(m) {
    return {
      id: m.id, kind: m.kind, x: Math.round(m.x), y: Math.round(m.y),
      hp: Math.round(m.hp), maxHp: m.maxHp, aggro: m.aggro, boss: m.boss,
      farmBoss: m.farmBoss, holeZombie: m.holeZombie,
      name: m.boss ? m.bossName : undefined,
    };
  }

  // 玩家造成伤害：校验（怪存在活着、射程内、伤害上限宽松、每秒 30 次限流），
  // 通过扣血；怪死时记死亡事件（全员全额经验由 worldSync 的 deaths 带回）。
  function hitMonster(world, args, now) {
    const m = world.monsters.get(args.monsterId);
    if (!m || m.dead) return { ok: false, dead: false, reason: '怪已不存在' };
    const p = world.players.get(args.playerId);
    if (!p) return { ok: false, dead: false, reason: '不在这个世界里' };
    // 限流
    const log = world.hitLog.get(args.playerId) || [];
    const recent = log.filter((t) => now - t < 1000);
    if (recent.length >= HIT_RATE_LIMIT_PER_SEC) return { ok: false, dead: false, reason: '打得太快了' };
    recent.push(now);
    world.hitLog.set(args.playerId, recent);
    // 射程：技能射程 + 150 容差；普攻 135+150；火墙/毒等范围技能按 700
    const skillRange = args.skillId ? (SKILL_RANGES[args.skillId] ?? 565) : 135;
    const dd = Math.hypot(p.x - m.x, p.y - m.y);
    if (dd > skillRange + 150 + m.r) return { ok: false, dead: false, reason: '离怪太远了' };
    // 伤害上限：宽松拦离谱值（单次 200000）
    const dmg = Math.max(0, Math.min(Math.round(args.dmg || 0), 200000));
    if (dmg <= 0) return { ok: false, dead: false, reason: '伤害不对' };
    m.hp -= dmg;
    m.aggro = true; m.targetId = args.playerId; m.lastHitBy = args.playerId;
    p.lastActiveAt = now; // 造成伤害 = 有行动（Roll 资格）
    world.rev += 1;
    if (m.hp > 0) return { ok: true, dead: false, hp: Math.round(m.hp) };
    // 死亡（不再单个重刷：死着等整点整波；Boss 也在整波里回来）
    m.hp = 0; m.dead = true;
    // 组队经验平分：击杀者队伍里同在该世界的队员平分（每人 floor(xp/n)，至少 1 点）；
    // 同世界队员 <2 人（独队/队友都在别的图）时不分，全图仍按全额。
    let teamShare = null;
    const killerTeam = getTeamOf(args.playerId);
    if (killerTeam) {
      const inWorld = killerTeam.members
        .filter((mm) => { const loc = findPlayerWorld(mm.playerId); return loc && loc.world === world; })
        .map((mm) => mm.playerId);
      if (inWorld.length >= 2) {
        teamShare = { members: inWorld, xp: Math.max(1, Math.floor(m.xp / inWorld.length)) };
      }
    }
    const death = {
      seq: ++deathSeq, monsterId: m.id, kind: m.kind, boss: m.boss,
      farmBoss: m.farmBoss, holeZombie: m.holeZombie,
      killerId: args.playerId, xp: m.xp, x: Math.round(m.x), y: Math.round(m.y),
      team: teamShare,
    };
    world.deaths.push(death);
    if (m.boss && !m.farmBoss) {
      world.bossState = 2;
      world.boss = null;
    }
    if (m.holeZombie) {
      world.holeKilled = true; world.holeZombieId = 0;
    }
    world.rev += 1;
    return { ok: true, dead: true, death };
  }

  function join(world, member, now) {
    const prev = world.players.get(member.playerId);
    world.players.set(member.playerId, {
      ...(prev || { xpTotal: 0 }),
      ...member, updatedAt: now,
      // 活跃时间只在新加入 / 移动 / 造成伤害时刷新，心跳本身不刷新——
      // 否则站着不动的人永远算活跃，Roll 资格的挂机过滤就失效了。
      lastActiveAt: prev ? prev.lastActiveAt : now,
    });
    world.lastActiveAt = now;
    return world.players.get(member.playerId);
  }

  function leave(world, playerId) {
    world.players.delete(playerId);
    if (world.players.size === 0) world.lastActiveAt = Date.now();
  }

  // 清空某玩家还没被 sync 领走的受击事件（死亡/重进世界时调用）：
  // 免得复活或重进后，排队中的旧伤害又结算一遍
  function clearHits(world, playerId) {
    if (world.hits.some((h) => h.playerId === playerId))
      world.hits = world.hits.filter((h) => h.playerId !== playerId);
  }

  // 进世界落点安全：落点 200px 内的活怪挪到远离所有玩家的新位置（复用 randomSpawnPos 的 minDist），
  // 免得一进图就贴脸挨打。只在 joinWorld 时调，心跳不调。
  function ensureSpawnClear(world, x, y) {
    for (const m of world.monsters.values()) {
      if (m.dead) continue;
      if (Math.hypot(m.x - x, m.y - y) < 200) {
        const pos = randomSpawnPos(world, 220);
        m.x = pos.x; m.y = pos.y;
        world.rev += 1;
      }
    }
  }

  // worldSync：视野 1000px 内玩家 + 怪（增量：knownRev 对得上只发变化，否则全量）
  function sync(world, playerId, x, y, knownRev, now) {
    tick(world, now);
    const me = world.players.get(playerId);
    if (me) { me.x = x; me.y = y; me.updatedAt = now; }
    const inView = (mx, my) => Math.hypot(mx - x, my - y) <= WORLD_VIEW_R;
    const players = [...world.players.values()]
      .filter((p) => p.playerId !== playerId && inView(p.x, p.y))
      .map((p) => ({
        playerId: p.playerId, name: p.name, classId: p.classId, level: p.level,
        x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), maxHp: p.maxHp,
        layer: world.layerIdx, gear: p.gear || '', xpTotal: p.xpTotal || 0,
      }));
    const alive = [...world.monsters.values()].filter((m) => !m.dead && inView(m.x, m.y));
    const full = knownRev !== world.rev;
    // 增量判定：简单口径——rev 对不上就全量（500ms 轮询下 rev 几乎每轮都变，
    // 全量视野内 20–60 只怪约 1–2.5KB，免费版无压力；removed 仍单独给）
    const removed = [...world.monsters.values()]
      .filter((m) => m.dead && inView(m.x, m.y))
      .map((m) => m.id);
    const boss = world.boss
      ? { hp: Math.round(world.boss.hp), maxHp: world.boss.maxHp, state: 1, name: world.boss.bossName }
      : { hp: 0, maxHp: 0, state: world.bossState, name: world.layer.boss ? world.layer.boss.name : '' };
    // 只给本人的怪物打击事件 + 死亡事件（死亡事件全员可见：经验/掉落/通关都靠它）
    const myHits = world.hits.filter((h) => h.playerId === playerId).slice(-20);
    const deaths = world.deaths.slice(-30);
    return {
      rev: world.rev, full,
      players, monsters: alive.map(monsterOut), removed,
      boss, holeKilled: world.holeKilled, holeState: world.holeState,
      mines: world.mines.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), left: v.left })),
      events: myHits.map((h) => ({ t: 'hit', seq: h.seq, playerId: h.playerId, monsterId: h.monsterId, dmg: h.dmg, ranged: h.ranged, attackType: h.attackType })),
      deaths,
      memberCount: world.players.size,
      nextWaveAt: world.nextWaveAt || 0,
      team: teamInfoFor(playerId),
      invites: invitesFor(playerId, now),
    };
  }

  function worldMap(world, now) {
    tick(world, now);
    return {
      monsters: [...world.monsters.values()].filter((m) => !m.dead).map((m) => ({
        id: m.id, kind: m.kind, x: Math.round(m.x), y: Math.round(m.y), boss: m.boss,
      })),
      boss: world.boss ? { hp: Math.round(world.boss.hp), maxHp: world.boss.maxHp, state: 1 } : { hp: 0, maxHp: 0, state: world.bossState },
      players: [...world.players.values()].map((p) => ({ playerId: p.playerId, name: p.name, x: Math.round(p.x), y: Math.round(p.y) })),
    };
  }

  function mineVein(world, playerId, veinIdx, now) {
    const p = world.players.get(playerId);
    if (!p) return { ok: false, reason: '不在这个世界里' };
    const v = world.mines[veinIdx];
    if (!v || v.left <= 0) return { ok: false, reason: '这条矿脉已经挖空了' };
    if (Math.hypot(p.x - v.x, p.y - v.y) > 52) return { ok: false, reason: '离矿脉太远了' };
    v.left -= 1;
    p.lastActiveAt = now;
    world.rev += 1;
    return { ok: true, left: v.left };
  }

  function stats() {
    let players = 0;
    for (const w of worlds.values()) players += w.players.size;
    return { worlds: worlds.size, playersOnline: players };
  }

  return {
    worlds, worldKey, getOrCreate, prune, tick, join, leave,
    clearHits, ensureSpawnClear,
    hitMonster, sync, worldMap, mineVein, activePlayers, stats,
    inviteTeam, respondInvite, leaveTeam, kickFromTeam, getTeamOf, teamInfoFor, invitesFor,
    TEAM_MAX, INVITE_TTL_MS,
    STALE_MS, ACTIVE_WINDOW_MS,
  };
}

// 技能射程表（供 hitMonster 校验；与客户端 hasTarget/castSkill 的射程口径一致，
// 取宽松上限：火球/大火球 565、雷电/诱惑 505、直线/光束 475、半月 175 左右）。
// 未列出的技能按 565 计（不拦正常技能，只拦超远改包）。
const SKILL_RANGES = {
  fireball: 565, bigball: 565, thunder: 505, charm: 505, line: 475, beam: 475,
  hellfire: 475, dash: 435, homing: 505, nova: 200, ice: 120, knocknova: 200,
  blast: 585, holy: 585, firewall: 565, poison: 200, blades: 200, swing: 135,
  heavy: 145, flame: 175, groupinvis: 164, teleport: 78, reveal: 605,
};

module.exports = { createWorlds, STALE_MS, ACTIVE_WINDOW_MS, WORLD_VIEW_R };
