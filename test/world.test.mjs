'use strict';
// 世界制测试：引擎单元级（lib/world.js 直调）+ HTTP 级（/actions）。
// 全程隔离库 + 测试认领码 TEST123；不碰真实库与真实认领码。
// 覆盖：
//   - 同图同层两玩家看到同一只怪；打怪后死亡事件两边都可见（经验发放依据）
//   - hitMonster 校验：超射程 / 伤害 0 / 超限流 / 超大伤害钳制
//   - Boss 死后 15 分钟重刷；普通怪死后重刷；尸王殿每小时整波（只补常驻）
//   - worldMap 返回全图怪；不同层互相隔离
//   - 蓝装 Roll 整图结算；挂机玩家（60 秒无行动）收不到 Roll 弹窗
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  sleep, makeTmpDir, seedIsolated, startServer, stopServer,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);
const worldData = require('../shared/world-data.js');
const { createWorlds } = require('../lib/world.js');

const PORT = 18735;
const ME_A = { playerId: 'worldDevA01', name: '世界甲', classId: 'mage', level: 11, maxHp: 300 };
const ME_B = { playerId: 'worldDevB01', name: '世界乙', classId: 'warrior', level: 5, maxHp: 500 };
const ME_C = { playerId: 'worldDevC01', name: '世界丙', classId: 'taoist', level: 3, maxHp: 200 };

// ---- 引擎单元级（不经过 HTTP，直接调 lib/world.js，时间用显式 now 控制）----

test('引擎：进世界刷满怪 + 1 只 Boss（stage 19 应为 340 普 + 1 Boss）', () => {
  const eng = createWorlds(worldData);
  const w = eng.getOrCreate(19, 0);
  assert.ok(w, 'stage 19 layer 0 应存在');
  assert.equal(w.monsters.size, 341, '应刷满 341 只，实际 ' + w.monsters.size);
  assert.ok(w.boss, '应有 Boss');
  assert.equal(w.boss.bossName, '半兽勇士');
  assert.equal(w.bossState, 1);
  const bosses = [...w.monsters.values()].filter((m) => m.boss);
  assert.equal(bosses.length, 1);
  console.log('stage 19 世界：341 只怪，Boss 半兽勇士 hp=' + w.boss.hp);
});

test('引擎：尸王殿整波 32 只（1 通关 + 31 常驻），杀 1 只不单独补刷，整波时间到才补满', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(5, 3); // 僵尸洞穴 4 层 = 尸王殿
  assert.ok(w, '尸王殿世界应存在');
  assert.equal(w.monsters.size, 32, '进殿应刷满 32 只，实际 ' + w.monsters.size);
  const main = [...w.monsters.values()].filter((m) => m.boss && !m.farmBoss);
  const farm = [...w.monsters.values()].filter((m) => m.boss && m.farmBoss);
  assert.equal(main.length, 1, '通关尸王应只有 1 只');
  assert.equal(main[0].bossName, '尸王');
  assert.equal(main[0].hp, 1400, '通关尸王 hp 应为 1400（500×2.8）');
  assert.equal(farm.length, 31, '常驻尸王应为 31 只');
  assert.ok(farm.every((m) => m.hp === 1400 && m.bossName === '尸王'),
    '常驻尸王 hp 应为 1400、与通关尸王同名，仅以 farmBoss 区分');

  // 杀 1 只常驻，2 秒后不应单独补刷
  const p = { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: farm[0].x, y: farm[0].y, hp: 100, maxHp: 100 };
  eng.join(w, p, now);
  const r = eng.hitMonster(w, { playerId: 'u1', monsterId: farm[0].id, dmg: farm[0].hp }, now);
  assert.equal(r.ok, true);
  assert.equal(r.dead, true);
  eng.tick(w, now + 2000);
  let alive = [...w.monsters.values()].filter((m) => !m.dead);
  assert.equal(alive.length, 31, '杀 1 只后 2 秒内不应单独补刷，实际 ' + alive.length);
  assert.equal(alive.filter((m) => m.boss && !m.farmBoss).length, 1, '通关尸王活着不应重复刷');

  // 整波时间到：只补常驻，通关尸王不重复
  w.nextWaveAt = now + 2000;
  eng.tick(w, now + 3000);
  alive = [...w.monsters.values()].filter((m) => !m.dead);
  assert.equal(alive.length, 32, '整波时间到应补满 32 只，实际 ' + alive.length);
  assert.equal(alive.filter((m) => m.boss && !m.farmBoss).length, 1, '整波只补常驻，通关尸王仍 1 只');
  console.log('尸王殿：进殿 32 只，杀 1 只后 2 秒仍 31 只，整波到补满 32 只');
});

test('引擎：Boss 死后 15 分钟重刷；普通怪死后 60–120 秒重刷', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  const boss = w.boss;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: boss.x, y: boss.y, hp: 100, maxHp: 100 }, now);
  const r = eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 999999 }, now);
  assert.equal(r.ok, true, '超大伤害应被钳制后仍命中');
  assert.equal(r.dead, true, 'Boss 应被击杀');
  assert.equal(w.bossState, 2, 'Boss 死后状态应为 2（已死待重刷）');
  assert.equal(w.bossRespawnAt, now + 15 * 60 * 1000, 'Boss 重刷时间应为死后 15 分钟');
  // 14 分钟后仍未刷
  eng.tick(w, now + 14 * 60 * 1000);
  assert.equal(w.boss, null, '14 分钟后 Boss 不应重刷');
  // 15 分钟后刷回
  eng.tick(w, now + 15 * 60 * 1000 + 1000);
  assert.ok(w.boss, '15 分钟后 Boss 应重刷');
  assert.equal(w.bossState, 1);
  assert.equal(w.boss.bossName, '半兽勇士');

  // 普通怪：杀 1 只，模拟重刷时间到应补 1 只（同种），旧 id 消失
  const normal = [...w.monsters.values()].find((m) => !m.boss && !m.dead);
  const kind = normal.kind;
  const oldId = normal.id;
  const tKill = now + 15 * 60 * 1000 + 1000;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: normal.x, y: normal.y, hp: 100, maxHp: 100 }, tKill);
  const r2 = eng.hitMonster(w, { playerId: 'u1', monsterId: oldId, dmg: normal.hp }, tKill);
  assert.equal(r2.dead, true);
  const dead = w.monsters.get(oldId);
  dead.respawnAt = now + 15 * 60 * 1000 + 1000; // 模拟 60–120 秒已过
  const before = [...w.monsters.values()].filter((m) => !m.dead && !m.boss).length;
  eng.tick(w, now + 15 * 60 * 1000 + 2000);
  assert.equal(w.monsters.has(oldId), false, '重刷后旧 id 应被新怪替换');
  const after = [...w.monsters.values()].filter((m) => !m.dead && !m.boss).length;
  assert.equal(after, before + 1, '普通怪死后重刷应补满');
  assert.ok([...w.monsters.values()].some((m) => !m.dead && m.kind === kind), '应补同种怪');
  console.log('Boss 15 分钟重刷、普通怪重刷均通过');
});

test('引擎：hitMonster 校验——超射程 / 伤害 0 / 每秒 30 次限流', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  const boss = w.boss;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: 0, y: 0, hp: 100, maxHp: 100 }, now);
  // 超射程：玩家在 (0,0)，Boss 离得远（>285px）应被拒
  const far = eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 10 }, now);
  if (Math.hypot(boss.x, boss.y) > 285 + boss.r) {
    assert.equal(far.ok, false);
    assert.match(far.reason, /离怪太远/);
  }
  // 伤害 0 应被拒（换一秒，避免前面那次命中占用限流窗口）
  const now2 = now + 1000;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: boss.x, y: boss.y, hp: 100, maxHp: 100 }, now2);
  const zero = eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 0 }, now2);
  assert.equal(zero.ok, false);
  assert.match(zero.reason, /伤害不对/);
  // 限流：同一秒 30 次命中后，第 31 次被拒（再换一秒，避开伤害 0 那次占用的窗口）
  const now3 = now2 + 1000;
  for (let i = 0; i < 30; i++) {
    const r = eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 1 }, now3);
    assert.equal(r.ok, true, `第 ${i + 1} 次应命中`);
  }
  const over = eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 1 }, now3);
  assert.equal(over.ok, false);
  assert.match(over.reason, /打得太快/);
  console.log('hitMonster 校验通过：超射程/伤害 0/限流均被丢弃');
});

test('引擎：Roll 资格只给 60 秒内有行动的玩家（挂机过滤）', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: 0, y: 0, hp: 100, maxHp: 100 }, now);
  eng.join(w, { playerId: 'u2', name: '乙', classId: 'mage', level: 1, x: 0, y: 0, hp: 100, maxHp: 100 }, now);
  // u2 挂机 61 秒（lastActiveAt 停在过去），u1 刚造成过伤害
  const p2 = w.players.get('u2');
  p2.lastActiveAt = now - 61000;
  const boss = w.boss;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: boss.x, y: boss.y, hp: 100, maxHp: 100 }, now);
  eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 1 }, now);
  const active = eng.activePlayers(w, now).map((p) => p.playerId);
  assert.deepEqual(active, ['u1'], '60 秒无行动的 u2 不应算活跃，实际 ' + JSON.stringify(active));
  console.log('Roll 资格过滤通过：活跃=[u1]，挂机 u2 被排除');
});

// ---- HTTP 级（走 /actions，与客户端同一入口）----

let dir;
let srv;

async function actions(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `world-${Math.random()}` }),
  });
  assert.equal(r.status, 200, `POST /actions ${action} 应返回 200`);
  const j = await r.json();
  if (j.error) throw new Error(`动作 ${action} 报错：${j.error}`);
  return j.data;
}

async function actionsErr(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `world-err-${Math.random()}` }),
  });
  const j = await r.json();
  return j.error || null;
}

test.before(async () => {
  dir = makeTmpDir('world');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, 'TEST123');
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('HTTP：同图同层两玩家看到同一只怪（同 id 同血量）', async () => {
  const jA = await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jA.ok, true);
  assert.equal(jA.worldKey, '19:0');
  assert.ok(jA.monsters.length > 0);
  const jB = await actions(srv.base, ME_B.playerId, 'joinWorld', { ...ME_B, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jB.memberCount, 2);
  const idsA = new Map(jA.monsters.map((m) => [m.id, m.hp]));
  const shared = jB.monsters.filter((m) => idsA.has(m.id));
  assert.ok(shared.length > 50, '同世界两人视野内应大量重叠，实际重叠 ' + shared.length + ' 只');
  assert.ok(shared.every((m) => m.hp === idsA.get(m.id)), '同一只怪血量应一致');
  console.log(`同世界视野重叠 ${shared.length} 只怪，血量一致`);
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_B.playerId, 'leaveWorld', { playerId: ME_B.playerId, worldKey: '19:0' });
});

test('HTTP：打怪死亡事件两边都可见（经验发放依据）；Boss 死亡带 boss 标记', async () => {
  const jA = await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0 });
  await actions(srv.base, ME_B.playerId, 'joinWorld', { ...ME_B, worldKey: '19:0', x: 0, y: 0 });
  // 挑一只离 (0,0) 最近的怪，A 走过去一刀击杀
  const target = jA.monsters
    .map((m) => ({ m, d: Math.hypot(m.x, m.y) }))
    .sort((a, b) => a.d - b.d)[0].m;
  await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: target.x, y: target.y, knownRev: -1,
  });
  const hit = await actions(srv.base, ME_A.playerId, 'hitMonster', {
    playerId: ME_A.playerId, worldKey: '19:0', monsterId: target.id, dmg: target.hp,
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.dead, true, '一刀应击杀');
  assert.ok(hit.death.xp > 0, '死亡事件应带经验值');
  assert.equal(hit.death.killerId, ME_A.playerId);
  // B 的 worldSync 里也应看到同一死亡事件（全员得全额经验的依据）
  const syncB = await actions(srv.base, ME_B.playerId, 'worldSync', {
    playerId: ME_B.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  const deathB = syncB.deaths.find((d) => d.monsterId === target.id);
  assert.ok(deathB, '另一玩家也应看到死亡事件');
  assert.equal(deathB.xp, hit.death.xp, '两边看到的经验值应一致');
  assert.ok(syncB.removed.includes(target.id), '死怪应在 removed 里');
  console.log(`击杀怪 id=${target.id}，xp=${hit.death.xp}，两边死亡事件一致`);
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_B.playerId, 'leaveWorld', { playerId: ME_B.playerId, worldKey: '19:0' });
});

test('HTTP：hitMonster 校验——超射程拒绝、伤害 0 拒绝、31 次并发限流', async () => {
  const jA = await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0 });
  // 超射程：挑一只离玩家 500px 以上的怪
  const far = jA.monsters.find((m) => Math.hypot(m.x, m.y) > 500);
  assert.ok(far, '视野内应有 500px 外的怪');
  const farHit = await actions(srv.base, ME_A.playerId, 'hitMonster', {
    playerId: ME_A.playerId, worldKey: '19:0', monsterId: far.id, dmg: 10,
  });
  assert.equal(farHit.ok, false);
  assert.match(farHit.reason, /离怪太远/);
  // 伤害 0：动作层直接拒绝
  const err0 = await actionsErr(srv.base, ME_A.playerId, 'hitMonster', {
    playerId: ME_A.playerId, worldKey: '19:0', monsterId: far.id, dmg: 0,
  });
  assert.ok(err0, '伤害 0 应报错');
  // 限流：走到一只血厚的怪身边，并发 31 次 1 点伤害，应恰好 30 次命中、1 次被拒
  // （stage 19 普通怪血量最高 96，取视野内血量最高的怪，30 次 1 点伤害打不死即可）
  const tank = jA.monsters.filter((m) => !m.boss).sort((a, b) => b.hp - a.hp)[0];
  assert.ok(tank && tank.hp > 30, '视野内应有血量 >30 的怪');
  // 等 1.1 秒清空限流窗口：前面那次超射程命中（被拒也占 1 个名额）与上个测试的
  // 击杀若落在同一秒内，会吃掉本次 31 次并发里的名额
  await sleep(1100);
  await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: tank.x, y: tank.y, knownRev: -1,
  });
  const results = await Promise.all(Array.from({ length: 31 }, () =>
    actions(srv.base, ME_A.playerId, 'hitMonster', {
      playerId: ME_A.playerId, worldKey: '19:0', monsterId: tank.id, dmg: 1,
    })));
  const okCount = results.filter((r) => r.ok).length;
  const limited = results.filter((r) => !r.ok && /打得太快/.test(r.reason || ''));
  assert.equal(okCount, 30, '同一秒应恰好 30 次命中，实际 ' + okCount);
  assert.equal(limited.length, 1, '第 31 次应被限流，实际被拒 ' + limited.length + ' 次');
  console.log('HTTP hitMonster 校验通过：超射程/伤害 0/限流均被丢弃');
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
});

test('HTTP：worldMap 返回全图怪（含 Boss）；不同层互相隔离', async () => {
  // 用未动过的 2:0 世界（380 普 + 1 Boss = 381），避开前面测试在 19:0 杀掉的那只怪
  await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '2:0', x: 0, y: 0 });
  const map = await actions(srv.base, ME_A.playerId, 'worldMap', { playerId: ME_A.playerId, worldKey: '2:0' });
  assert.equal(map.ok, true);
  assert.equal(map.monsters.length, 381, '全图怪应为 381 只，实际 ' + map.monsters.length);
  assert.equal(map.monsters.filter((m) => m.boss).length, 1, '全图应有 1 只 Boss');
  assert.equal(map.boss.state, 1);
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '2:0' });

  // 不同层隔离：骷髅洞穴 0 层与 1 层各 1 人，互相看不到
  const d0 = { playerId: 'worldDevD01', name: '世界丁', classId: 'warrior', level: 1, maxHp: 100 };
  const d1 = { playerId: 'worldDevE01', name: '世界戊', classId: 'mage', level: 1, maxHp: 100 };
  const j0 = await actions(srv.base, d0.playerId, 'joinWorld', { ...d0, worldKey: '4:0', x: 0, y: 0 });
  const j1 = await actions(srv.base, d1.playerId, 'joinWorld', { ...d1, worldKey: '4:1', x: 0, y: 0 });
  assert.equal(j0.memberCount, 1, '0 层应只有自己');
  assert.equal(j1.memberCount, 1, '1 层应只有自己');
  const s0 = await actions(srv.base, d0.playerId, 'worldSync', { playerId: d0.playerId, worldKey: '4:0', x: 0, y: 0, knownRev: -1 });
  const s1 = await actions(srv.base, d1.playerId, 'worldSync', { playerId: d1.playerId, worldKey: '4:1', x: 0, y: 0, knownRev: -1 });
  assert.equal(s0.players.length, 0, '0 层不应看到 1 层的人');
  assert.equal(s1.players.length, 0, '1 层不应看到 0 层的人');
  console.log('worldMap 全图 381 只怪；0/1 层隔离通过');
  await actions(srv.base, d0.playerId, 'leaveWorld', { playerId: d0.playerId, worldKey: '4:0' });
  await actions(srv.base, d1.playerId, 'leaveWorld', { playerId: d1.playerId, worldKey: '4:1' });
});

test('HTTP：蓝装 Roll 整图结算；挂机 60 秒玩家收不到 Roll 弹窗', async () => {
  // A、B、C 同进世界 19:0；C 进来后全程不动（挂机），A、B 每 10 秒移动一次保持活跃
  await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0 });
  await actions(srv.base, ME_B.playerId, 'joinWorld', { ...ME_B, worldKey: '19:0', x: 0, y: 0 });
  await actions(srv.base, ME_C.playerId, 'joinWorld', { ...ME_C, worldKey: '19:0', x: 0, y: 0 });
  let ax = 0;
  for (let i = 0; i < 7; i++) {
    await sleep(10000);
    ax += 10;
    // A、B 移动 = 有行动（Roll 资格保持）；C 不动，60 秒后算挂机
    await actions(srv.base, ME_A.playerId, 'worldSync', {
      playerId: ME_A.playerId, worldKey: '19:0', x: ax, y: 0, knownRev: -1,
    });
    await actions(srv.base, ME_B.playerId, 'worldSync', {
      playerId: ME_B.playerId, worldKey: '19:0', x: ax, y: 0, knownRev: -1,
    });
  }
  const item = { uid: 301, name: '测试蓝装', slot: 'weapon', tier: 2 };
  const started = await actions(srv.base, ME_A.playerId, 'startRoll', {
    playerId: ME_A.playerId, name: ME_A.name, worldKey: '19:0', layer: 0,
    itemJson: JSON.stringify(item),
  });
  assert.equal(started.ok, true);
  assert.ok(started.id > 0);
  const rollId = started.id;
  // B（活跃）应看到 Roll，且只有 A、B 两个名额
  const hbB = await actions(srv.base, ME_B.playerId, 'heartbeat', {
    ...ME_B, worldKey: '19:0', x: ax, y: 0, hp: 500, xpDelta: 0,
  });
  assert.equal(hbB.ok, true);
  assert.equal(hbB.rolls.length, 1, '活跃玩家应看到 Roll');
  assert.equal(hbB.rolls[0].status, 'active');
  assert.equal(hbB.rolls[0].entries.length, 2, 'Roll 名额应只有活跃的 A、B 两人');
  assert.deepEqual(
    hbB.rolls[0].entries.map((e) => e.value), [null, null], '未掷点前两人都是 null');
  // C（挂机 70 秒）应收不到 Roll 弹窗
  const hbC = await actions(srv.base, ME_C.playerId, 'heartbeat', {
    ...ME_C, worldKey: '19:0', x: 0, y: 0, hp: 200, xpDelta: 0,
  });
  assert.equal(hbC.rolls.length, 0, '挂机玩家不应收到 Roll 弹窗');
  const outsider = await actions(srv.base, ME_C.playerId, 'submitRoll', { id: rollId, playerId: ME_C.playerId });
  assert.equal(outsider.ok, false, '挂机玩家掷点应被拒绝');
  // A、B 掷点；平局则重掷，最多 5 轮
  let winnerId = null;
  for (let round = 0; round < 5; round++) {
    const ra = await actions(srv.base, ME_A.playerId, 'submitRoll', { id: rollId, playerId: ME_A.playerId });
    assert.equal(ra.ok, true);
    assert.ok(ra.value >= 1 && ra.value <= 100);
    const rb = await actions(srv.base, ME_B.playerId, 'submitRoll', { id: rollId, playerId: ME_B.playerId });
    assert.equal(rb.ok, true);
    const hb = await actions(srv.base, ME_A.playerId, 'heartbeat', {
      ...ME_A, worldKey: '19:0', x: ax, y: 0, hp: 300, xpDelta: 0,
    });
    const roll = hb.rolls.find((r) => r.id === rollId);
    assert.ok(roll, '心跳应带回 Roll');
    if (roll.status === 'resolved') { winnerId = roll.winnerId; break; }
    assert.equal(roll.status, 'active', '未结算时应为 active（平局进下一轮）');
  }
  assert.ok(winnerId === ME_A.playerId || winnerId === ME_B.playerId, '应决出胜者');
  const loserId = winnerId === ME_A.playerId ? ME_B.playerId : ME_A.playerId;
  const winClaim = await actions(srv.base, winnerId, 'claimRolls', { playerId: winnerId });
  assert.equal(winClaim.items.length, 1);
  assert.equal(JSON.parse(winClaim.items[0]).uid, 301);
  const winClaim2 = await actions(srv.base, winnerId, 'claimRolls', { playerId: winnerId });
  assert.equal(winClaim2.items.length, 0, '重复领取应为空');
  const loseClaim = await actions(srv.base, loserId, 'claimRolls', { playerId: loserId });
  assert.equal(loseClaim.items.length, 0, '负者领不到装备');
  console.log(`整图 Roll 通过：胜者=${winnerId === ME_A.playerId ? '甲' : '乙'}，挂机丙无弹窗、无名额`);
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_B.playerId, 'leaveWorld', { playerId: ME_B.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_C.playerId, 'leaveWorld', { playerId: ME_C.playerId, worldKey: '19:0' });
});
