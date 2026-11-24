'use strict';
// 世界制测试：引擎单元级（lib/world.js 直调）+ HTTP 级（/actions）。
// 全程隔离库 + 测试认领码 TEST123；不碰真实库与真实认领码。
// 覆盖：
//   - 同图同层两玩家看到同一只怪；打怪后死亡事件两边都可见（经验发放依据）
//   - hitMonster 校验：超射程 / 伤害 0 / 超限流 / 超大伤害钳制
//   - 整波一小时刷新（Boss 与普通怪不到整点不回，整点一次性全回）；
//     进图/传送不刷怪（杀掉的还死着，世界实例不删）；尸王殿每小时整波（只补常驻）
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
  assert.equal(w.boss.bossName, '毒蜘蛛王');
  assert.equal(w.bossState, 1);
  const bosses = [...w.monsters.values()].filter((m) => m.boss);
  assert.equal(bosses.length, 1);
  console.log('stage 19 世界：341 只怪，Boss 毒蜘蛛王 hp=' + w.boss.hp);
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

test('引擎：整波一小时刷新——Boss 与普通怪死后不到整点不回，整点一次性全回', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  let waveAt = w.nextWaveAt;
  assert.ok(waveAt > now, '建世界时下次整波应为未来时间');
  assert.equal(new Date(waveAt).getMinutes(), 0, '下次整波应在整点 :00');
  assert.equal(new Date(waveAt).getSeconds(), 0);
  // 把下次整波钉到测试时钟的 1 小时后：否则测试跑在整点前 14 分钟内时，
  // 「+14 分钟」那步会跨过整点、整波合法刷回，测试会误判。
  w.nextWaveAt = now + 60 * 60 * 1000;
  waveAt = w.nextWaveAt;
  const boss = w.boss;
  const fullNormal = [...w.monsters.values()].filter((m) => !m.boss && !m.dead).length;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: boss.x, y: boss.y, hp: 100, maxHp: 100 }, now);
  // 杀 Boss：状态 2，不再有 15 分钟重刷时间
  const r = eng.hitMonster(w, { playerId: 'u1', monsterId: boss.id, dmg: 999999 }, now);
  assert.equal(r.ok, true, '超大伤害应被钳制后仍命中');
  assert.equal(r.dead, true, 'Boss 应被击杀');
  assert.equal(w.bossState, 2, 'Boss 死后状态应为 2（已死待整波）');
  assert.equal(w.boss, null);
  // 杀 1 只普通怪
  const normal = [...w.monsters.values()].find((m) => !m.boss && !m.dead);
  const kind = normal.kind;
  const oldId = normal.id;
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: normal.x, y: normal.y, hp: 100, maxHp: 100 }, now);
  const r2 = eng.hitMonster(w, { playerId: 'u1', monsterId: oldId, dmg: normal.hp }, now);
  assert.equal(r2.dead, true);
  // 14 分钟后（远超旧 60–120 秒单刷窗口）：Boss 与普通怪都不回
  eng.tick(w, now + 14 * 60 * 1000);
  assert.equal(w.boss, null, '14 分钟后 Boss 不应回来（等整波）');
  assert.equal(w.monsters.get(oldId).dead, true, '普通怪 14 分钟后仍应死着');
  assert.equal([...w.monsters.values()].filter((m) => !m.boss && !m.dead).length, fullNormal - 1);
  // 整点前 1 秒：仍不回
  eng.tick(w, waveAt - 1000);
  assert.equal(w.boss, null, '整点前 1 秒 Boss 不应回来');
  assert.equal(w.monsters.get(oldId).dead, true, '整点前 1 秒普通怪仍应死着');
  // 整点到：Boss 与普通怪一次性全回
  eng.tick(w, waveAt + 1000);
  assert.ok(w.boss, '整点到 Boss 应刷回');
  assert.equal(w.bossState, 1);
  assert.equal(w.boss.bossName, '毒蜘蛛王');
  assert.equal(w.monsters.has(oldId), false, '整波后旧 id 应被新怪替换');
  assert.equal([...w.monsters.values()].filter((m) => !m.boss && !m.dead).length, fullNormal, '普通怪应补满');
  assert.ok([...w.monsters.values()].some((m) => !m.dead && m.kind === kind), '应补同种怪');
  assert.ok(w.nextWaveAt > waveAt, '整波后下次整波应推到再下一个整点');
  console.log('整波一小时刷新通过：Boss 与普通怪不到整点不回，整点一次性全回');
});

test('引擎：盟重土城安全区零怪 + 多层地图只留最后一层有 Boss', () => {
  const eng = createWorlds(worldData);
  // 地图从 16 段减到 15 段（删 id 22），主线 14 张（未知暗殿 id 14 不计）
  assert.equal(worldData.STAGES.length, 15);
  assert.equal(worldData.STAGES.find((s) => s.id === 22), undefined);
  assert.equal(worldData.STAGES.filter((s) => s.id !== 14).length, 14);
  const mz = worldData.STAGES.find((s) => s.id === 21);
  assert.equal(mz.name, '盟重土城');
  assert.equal(mz.safe, true);
  assert.equal(mz.full, '地图六 · 盟重土城');
  // 安全区：零怪零 Boss
  const city = eng.getOrCreate(21, 0);
  assert.equal(city.monsters.size, 0);
  assert.equal(city.boss, null);
  // 非最后一层无 Boss，小怪还在
  const noBoss = [[4, 0], [4, 1], [5, 0], [5, 1], [5, 2], [7, 0], [7, 1], [8, 0], [8, 1], [8, 2], [8, 3], [6, 0], [6, 7], [9, 0], [9, 6], [15, 0], [13, 0], [13, 5]];
  for (const [sid, li] of noBoss) {
    const w = eng.getOrCreate(sid, li);
    assert.equal(w.boss, null, `${sid}:${li} 不应有 Boss`);
    assert.equal([...w.monsters.values()].filter((m) => m.boss).length, 0, `${sid}:${li} 不应有 Boss 怪`);
    assert.ok([...w.monsters.values()].filter((m) => !m.boss && !m.dead).length > 0, `${sid}:${li} 小怪应还在`);
  }
  // 最后一层 Boss 留着
  const keepBoss = [[4, 2, '骷髅精灵'], [5, 3, '尸王'], [6, 8, '白野猪王'], [7, 2, '沃玛教主'], [8, 4, '触龙神'], [9, 7, '祖玛教主'], [13, 6, '赤月恶魔'], [15, 1, '邪恶巨人']];
  for (const [sid, li, name] of keepBoss) {
    const w = eng.getOrCreate(sid, li);
    assert.ok(w.boss, `${sid}:${li} 应有 Boss`);
    assert.equal(w.boss.bossName, name);
  }
  // 单层图 Boss 不动
  assert.equal(eng.getOrCreate(1, 0).boss.bossName, '钉耙猫王');
  assert.equal(eng.getOrCreate(19, 0).boss.bossName, '毒蜘蛛王');
  // 整波后无 Boss 的层仍不刷 Boss
  const now = Date.now();
  const w40 = eng.getOrCreate(4, 0);
  eng.join(w40, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: 0, y: 0, hp: 100, maxHp: 100 }, now);
  for (const m of w40.monsters.values()) m.dead = true;
  eng.tick(w40, w40.nextWaveAt + 1000);
  assert.equal(w40.boss, null, '整波后无 Boss 的层仍不应有 Boss');
  assert.ok([...w40.monsters.values()].filter((m) => !m.boss && !m.dead).length > 0, '整波后小怪应补满');
  console.log('盟重土城零怪 + 多层只留末层 Boss 通过');
});

test('引擎：新手村东南角安全区零怪——普通怪与 Boss 都不刷进去，tick 把误入的怪推出去', () => {
  const eng = createWorlds(worldData);
  const inSafe = (x, y) => x >= 950 && x <= 1350 && y >= 950 && y <= 1350;
  const w = eng.getOrCreate(1, 0);
  const alive = [...w.monsters.values()].filter((m) => !m.dead);
  assert.ok(alive.length > 0, '新手村应有怪');
  assert.ok(alive.every((m) => !inSafe(m.x, m.y)),
    '新手村安全区内不应有怪，实际 ' + alive.filter((m) => inSafe(m.x, m.y)).length + ' 只');
  assert.ok(w.boss, '新手村应有 Boss');
  assert.equal(w.boss.bossName, '钉耙猫王');
  assert.ok(!inSafe(w.boss.x, w.boss.y), '钉耙猫王不应刷进安全区，实际 (' + Math.round(w.boss.x) + ',' + Math.round(w.boss.y) + ')');
  // tick 围栏：把一只怪手动放进安全区中心，tick 后应被推出去
  const now = Date.now();
  eng.join(w, { playerId: 'u1', name: '甲', classId: 'war', level: 1, x: 0, y: 0, hp: 100, maxHp: 100 }, now);
  const m = alive.find((mm) => !mm.boss);
  m.x = 1150; m.y = 1150; m.aggro = false; m.targetId = null;
  eng.tick(w, now + 1000);
  assert.ok(!inSafe(m.x, m.y), 'tick 后误入安全区的怪应被推出去，实际 (' + Math.round(m.x) + ',' + Math.round(m.y) + ')');
  console.log('新手村安全区通过：初始 ' + alive.length + ' 只怪零落区内，Boss 钉耙猫王在区外，tick 推出误入怪');
});

test('引擎：骷髅洞/僵尸洞 pool 删怪 + 电僵尸进二三层', () => {
  const eng = createWorlds(worldData);
  const kinds = (sid, li) => new Set([...eng.getOrCreate(sid, li).monsters.values()].filter((m) => !m.boss).map((m) => m.kind));
  assert.deepEqual([...kinds(4, 2)].sort(), ['dongqu', 'kulou', 'kuloujiang', 'toufu', 'xiezi']);
  assert.deepEqual([...kinds(5, 0)].sort(), ['dongqu', 'jiangshi', 'kuangjiang', 'paxing']);
  assert.deepEqual([...kinds(5, 1)].sort(), ['dianjiang', 'dongqu', 'jiangshi', 'paxing']);
  assert.deepEqual([...kinds(5, 2)].sort(), ['dianjiang', 'dongqu', 'jiangshi', 'kuangjiang', 'paxing']);
  assert.equal(kinds(5, 0).has('dianjiang'), false, '一层不应有电僵尸');
  const dj = worldData.MONSTER_MAP.dianjiang;
  assert.equal(dj.lv, 30);
  assert.equal(dj.r, 18);
  assert.equal(dj.dmg, 24);
  assert.equal(dj.bolt, true);
  console.log('骷髅洞/僵尸洞 pool + 电僵尸分布通过');
});

test('引擎：电僵尸直线闪电——线上命中、线外/背后不命中、冷却内不连发', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(5, 1); // 矿区二层
  const bolt = [...w.monsters.values()].find((m) => m.kind === 'dianjiang' && !m.boss);
  assert.ok(bolt, '矿区二层应刷出电僵尸');
  for (const m of w.monsters.values()) if (m !== bolt) m.dead = true;
  bolt.x = 0; bolt.y = 0; bolt.atkCd = 0; bolt.aggro = true;
  // 射程 r×14=252、半宽 r=18：A 线上、D 线宽内应中电；E 垂距 25 刚出线、B 线外、
  // C 背后、F 超出射程 252 均不应中电。
  eng.join(w, { playerId: 'A', name: '甲', classId: 'war', level: 1, x: 150, y: 0, hp: 100, maxHp: 100 }, now);
  eng.join(w, { playerId: 'D', name: '丁', classId: 'war', level: 1, x: 150, y: 10, hp: 100, maxHp: 100 }, now);
  eng.join(w, { playerId: 'E', name: '戊', classId: 'war', level: 1, x: 150, y: 25, hp: 100, maxHp: 100 }, now);
  eng.join(w, { playerId: 'B', name: '乙', classId: 'war', level: 1, x: 150, y: 100, hp: 100, maxHp: 100 }, now);
  eng.join(w, { playerId: 'C', name: '丙', classId: 'war', level: 1, x: -200, y: 0, hp: 100, maxHp: 100 }, now);
  eng.join(w, { playerId: 'F', name: '己', classId: 'war', level: 1, x: 300, y: 0, hp: 100, maxHp: 100 }, now);
  w.lastTick = now;
  eng.tick(w, now + 100);
  const hits = w.hits.filter((h) => h.attackType === 'bolt');
  assert.deepEqual(hits.map((h) => h.playerId).sort(), ['A', 'D'], '线上 A 与线宽内 D 应中电，刚出线 E、线外 B、背后 C、超射程 F 不应');
  assert.ok(hits.every((h) => h.ranged === false && h.dmg > 0 && h.monsterId === bolt.id));
  // 同步事件里也带 attackType
  const snap = eng.sync(w, 'A', 150, 0, -1, now + 150);
  assert.ok(snap.events.some((e) => e.t === 'hit' && e.attackType === 'bolt' && e.monsterId === bolt.id), 'worldSync 事件应带 attackType bolt');
  // 冷却 1.5s 内再 tick 不连发
  const n = w.hits.length;
  w.lastTick = now + 150;
  eng.tick(w, now + 250);
  assert.equal(w.hits.length, n, '冷却内不应再放电');
  // 冷却过后能再放
  w.lastTick = now + 250;
  eng.tick(w, now + 1900);
  assert.ok(w.hits.filter((h) => h.attackType === 'bolt').length > hits.length, '冷却过后应能再放电');
  console.log('电僵尸直线闪电通过：线上命中、线外/背后不中、冷却 1.5s');
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

test('HTTP：进图/传送不刷怪——杀掉的离图再回来还死着；三次进出只减不增；sync 带 nextWaveAt', async () => {
  // 用未动过的 1:0 世界（新手村），避免前面测试的击杀干扰计数
  const jA = await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '1:0', x: 0, y: 0 });
  assert.equal(jA.ok, true);
  assert.ok(jA.nextWaveAt > Date.now(), 'sync 应带下次整波时间 nextWaveAt');
  assert.equal(new Date(jA.nextWaveAt).getMinutes(), 0, 'nextWaveAt 应在整点 :00');
  const fullCount = jA.monsters.length;
  assert.ok(fullCount > 50, '新手村进图应有满图怪，实际 ' + fullCount + ' 只');

  // 连续进出三次、每次杀 1 只：活怪数只减不增
  let prevCount = fullCount;
  for (let round = 1; round <= 3; round++) {
    const sync = await actions(srv.base, ME_A.playerId, 'worldSync', {
      playerId: ME_A.playerId, worldKey: '1:0', x: 0, y: 0, knownRev: -1,
    });
    assert.equal(sync.monsters.length, prevCount, `第 ${round} 次进图活怪数应为 ${prevCount}，实际 ${sync.monsters.length}`);
    assert.equal(sync.nextWaveAt, jA.nextWaveAt, '三次进出 nextWaveAt 应不变');
    // 杀离 (0,0) 最近的一只
    const target = sync.monsters
      .map((m) => ({ m, d: Math.hypot(m.x, m.y) }))
      .sort((a, b) => a.d - b.d)[0].m;
    await actions(srv.base, ME_A.playerId, 'worldSync', {
      playerId: ME_A.playerId, worldKey: '1:0', x: target.x, y: target.y, knownRev: -1,
    });
    const hit = await actions(srv.base, ME_A.playerId, 'hitMonster', {
      playerId: ME_A.playerId, worldKey: '1:0', monsterId: target.id, dmg: target.hp,
    });
    assert.equal(hit.dead, true, `第 ${round} 次应击杀 1 只`);
    // 离图再回来：杀掉的那只还死着（不在活怪里、在 removed 里），总数减 1
    await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '1:0' });
    const back = await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '1:0', x: 0, y: 0 });
    assert.equal(back.ok, true);
    assert.equal(back.monsters.length, prevCount - 1, `第 ${round} 次回来活怪应减 1（${prevCount}→${prevCount - 1}），实际 ${back.monsters.length}`);
    assert.ok(!back.monsters.some((m) => m.id === target.id), '杀掉的怪重进后不应复活');
    assert.ok(back.removed.includes(target.id), '杀掉的怪应在 removed 里');
    prevCount -= 1;
  }
  console.log(`进图不刷怪通过：新手村 ${fullCount} 只 → 三次进出杀 3 只剩 ${prevCount} 只，整点前不回`);
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '1:0' });
});
