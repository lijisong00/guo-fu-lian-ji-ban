'use strict';
// ---------------------------------------------------------------------------
// 世界制 · 世界引擎（联机版 JS 版；artifact 侧 server/src/world.ts 为同构 TS 版，
// 两边逻辑保持一致，改一处时同步另一处）。
//
// 模型：一个世界 = 一张图的一层 (stageId:layerIdx)，共 49 个世界实例。
// 世界里所有玩家打同一批怪：怪物只存在服务端，位置/血量/仇恨/死亡由服务端定，
// 客户端只做渲染与插值，不再本地刷怪、本地算怪 AI。
//
// 经验与掉落（用户 2026-11-24 决策）：按整图所有人共享，不保留小队。
//   - 经验：怪死时，在场的所有世界成员每人得全额经验（hitMonster 死亡事件里
//     记一笔 xpAward，worldSync 带回，客户端按 monsterId 去重领取一次）。
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
const ACTIVE_WINDOW_MS = 60000;   // Roll 资格：60 秒内移动过或造成过伤害算活跃
const RESPAWN_MIN_MS = 60000;     // 普通怪死后 60–120 秒随机重刷
const RESPAWN_MAX_MS = 120000;
const BOSS_RESPAWN_MS = 15 * 60 * 1000; // Boss 死后 15 分钟重刷
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
function bairiCoastX(y, worldHalf) {
  return worldHalf * (0.66 + 0.09 * Math.sin(y * 0.0011 + 1.2) + 0.05 * Math.sin(y * 0.0027 + 0.4));
}
function inBairiCity(x, y) { return Math.abs(x) <= BAIRI_CITY.hx && Math.abs(y) <= BAIRI_CITY.hy; }
function isBairiField(stageId, layerIdx) { return stageId === BAIRI_STAGE_ID && layerIdx === 0; }

function createWorlds(data) {
  const { STAGES, MONSTER_MAP, WORLD_HALF } = data;
  const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.id, s]));
  const worlds = new Map(); // key "stageId:layerIdx" -> world
  let deathSeq = 0;

  function worldKey(stageId, layerIdx) { return `${stageId}:${layerIdx}`; }

  function randomSpawnPos(world, minDistFromPlayers) {
    const half = world.worldHalf;
    for (let tries = 0; tries < 8; tries++) {
      let x = rand(-half + 60, half - 60);
      let y = rand(-half + 60, half - 60);
      if (isBairiField(world.stageId, world.layerIdx)) {
        if (inBairiCity(x, y) || x > bairiCoastX(y, half) - 40) continue;
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
        world.monsters.set(boss.id, boss);
        world.boss = boss; world.bossState = 1;
        spawned += 1;
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
    world.monsters.set(boss.id, boss);
    world.boss = boss; world.bossState = 1;
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
    return w;
  }

  function prune(now) {
    for (const [key, w] of worlds) {
      for (const [pid, m] of w.players) {
        if (now - m.updatedAt > STALE_MS) w.players.delete(pid);
      }
      if (w.players.size === 0 && now - w.lastActiveAt > STALE_MS) worlds.delete(key);
    }
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
    // 普通怪重刷
    let aliveNormal = 0;
    for (const m of world.monsters.values()) if (!m.dead && !m.boss) aliveNormal += 1;
    const target = world.layer.bossAlive ? 0 : (world.layer.monsterCount ?? 500);
    for (const m of [...world.monsters.values()]) {
      if (!m.dead || m.boss) continue;
      if (m.respawnAt > 0 && now >= m.respawnAt && aliveNormal < target) {
        const nm = makeMonster(world, m.kind, { minDist: 120 });
        if (nm) { world.monsters.delete(m.id); world.monsters.set(nm.id, nm); aliveNormal += 1; world.rev += 1; }
      }
    }
    // Boss 15 分钟重刷（通关尸王不重刷：尸王殿走整波）
    if (!world.layer.bossAlive && world.bossState === 2 && world.bossRespawnAt > 0 && now >= world.bossRespawnAt) {
      const boss = makeBoss(world, {});
      world.monsters.set(boss.id, boss);
      world.boss = boss; world.bossState = 1; world.bossRespawnAt = 0;
      world.rev += 1;
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
        const range = m.boss ? 0 : (MONSTER_MAP[m.kind]?.range ?? 0);
        if (dd > m.r + 16) {
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
    // 死亡
    m.hp = 0; m.dead = true; m.respawnAt = now + RESPAWN_MIN_MS + Math.random() * (RESPAWN_MAX_MS - RESPAWN_MIN_MS);
    const death = {
      seq: ++deathSeq, monsterId: m.id, kind: m.kind, boss: m.boss,
      farmBoss: m.farmBoss, holeZombie: m.holeZombie,
      killerId: args.playerId, xp: m.xp, x: Math.round(m.x), y: Math.round(m.y),
    };
    world.deaths.push(death);
    if (m.boss && !m.farmBoss) {
      world.bossState = 2;
      world.bossRespawnAt = now + BOSS_RESPAWN_MS;
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
      : { hp: 0, maxHp: 0, state: world.bossState, name: world.layer.boss.name };
    // 只给本人的怪物打击事件 + 死亡事件（死亡事件全员可见：经验/掉落/通关都靠它）
    const myHits = world.hits.filter((h) => h.playerId === playerId).slice(-20);
    const deaths = world.deaths.slice(-30);
    return {
      rev: world.rev, full,
      players, monsters: alive.map(monsterOut), removed,
      boss, holeKilled: world.holeKilled, holeState: world.holeState,
      mines: world.mines.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), left: v.left })),
      events: myHits.map((h) => ({ t: 'hit', seq: h.seq, playerId: h.playerId, monsterId: h.monsterId, dmg: h.dmg, ranged: h.ranged })),
      deaths,
      memberCount: world.players.size,
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

module.exports = { createWorlds, STALE_MS, ACTIVE_WINDOW_MS, WORLD_VIEW_R, BOSS_RESPAWN_MS };
