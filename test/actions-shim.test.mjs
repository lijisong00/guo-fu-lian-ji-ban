'use strict';
// /actions 兼容层测试：服务器版客户端的 13 个动作 + 落地页守卫。
// 隔离铁律：mkdtemp 的 DATA_DIR + 测试认领码 TEST123，不碰真实库与真实认领码。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  makeTmpDir, seedIsolated, startServer, stopServer, sleep,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);
const DatabaseSync = require('node:sqlite').DatabaseSync;

const PORT = 18734;
const CLAIM_CODE = 'TEST123';
const PID_A = 'ptest-device-a01';
const PID_B = 'ptest-device-b01';

function saveObj(name, classId, level, gold, bag = []) {
  return {
    v: 1, name, classId, level, xp: 100, gold,
    hpPots: [0, 100, 0], mpPots: [0, 100, 0],
    skillsOn: true, soundOn: false, musicOn: false,
    books: [], learned: {}, active: [], worn: {}, bag,
    ores: [], cleared: [], bonusLit: [], run: null, deepest: {}, savedAt: Date.now(),
  };
}

async function actions(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `t-${Math.random()}` }),
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
    body: JSON.stringify({ action, args, actionCallId: `t-${Math.random()}` }),
  });
  const j = await r.json();
  return j.error || null;
}

test('actions 兼容层：存档 / 认领 / 世界 / 拍卖行', async (t) => {
  const dataDir = makeTmpDir('actions');
  await seedIsolated(dataDir);
  const srv = await startServer(dataDir, PORT, CLAIM_CODE);
  t.after(() => stopServer(srv));
  const { base } = srv;

  // --- 身份：无 cookie 调 listSaves 应报错 ---
  assert.ok(await actionsErr(base, null, 'listSaves', {}), '无 cookie 应报错');

  // --- 存档：空位 → putSave → 读回一致 → 更新 → resetSave ---
  let r = await actions(base, PID_A, 'listSaves', {});
  assert.equal(r.slots.length, 5);
  assert.ok(r.slots.every((s) => s.save === null), '新设备 5 位全空');
  const s1 = saveObj('测试法师', 'mage', 11, 8755);
  await actions(base, PID_A, 'putSave', { slot: 1, data: JSON.stringify(s1) });
  r = await actions(base, PID_A, 'listSaves', {});
  assert.equal(JSON.parse(r.slots[0].save).name, '测试法师');
  assert.equal(JSON.parse(r.slots[0].save).gold, 8755);
  assert.ok(r.slots[0].updatedAt > 0);
  const one = await actions(base, PID_A, 'getSave', { slot: 1 });
  assert.equal(JSON.parse(one.save).level, 11);
  const s1b = saveObj('测试法师', 'mage', 12, 9000);
  await actions(base, PID_A, 'putSave', { slot: 1, data: JSON.stringify(s1b) });
  r = await actions(base, PID_A, 'listSaves', {});
  assert.equal(JSON.parse(r.slots[0].save).level, 12);
  assert.equal(JSON.parse(r.slots[0].save).gold, 9000);
  // data 原样存：classId 保持 mage（artifact 值），不被归一化改掉
  assert.equal(JSON.parse(r.slots[0].save).classId, 'mage');
  await actions(base, PID_A, 'resetSave', { slot: 1 });
  r = await actions(base, PID_A, 'listSaves', {});
  assert.equal(r.slots[0].save, null);
  // 非法输入
  assert.ok(await actionsErr(base, PID_A, 'putSave', { slot: 6, data: '{}' }), 'slot 6 应报错');
  assert.ok(await actionsErr(base, PID_A, 'putSave', { slot: 1, data: 'not json' }), '非法 JSON 应报错');
  assert.ok(await actionsErr(base, PID_A, 'putSave', { slot: 1, data: JSON.stringify({ v: 1 }) }), '无 name 应报错');
  assert.ok(await actionsErr(base, PID_A, 'noSuchAction', {}), '未知动作应报错');
  // /game/actions 同路径也通
  const rg = await fetch(base + '/game/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `lg_device_id=${PID_A}` },
    body: JSON.stringify({ action: 'listSaves', args: {}, actionCallId: 't-g' }),
  });
  assert.equal(rg.status, 200);
  assert.equal((await rg.json()).data.slots.length, 5);

  // --- 认领：三角色认领到 PID_A 后，listSaves 看到它们 ---
  const claim = await fetch(base + '/api/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: CLAIM_CODE, deviceId: PID_A }),
  });
  const claimJ = await claim.json();
  assert.equal(claimJ.ok, true, '认领应成功：' + JSON.stringify(claimJ));
  r = await actions(base, PID_A, 'listSaves', {});
  assert.equal(JSON.parse(r.slots[0].save).name, '慕尼黑好炸药');
  assert.equal(JSON.parse(r.slots[0].save).level, 11);
  assert.equal(JSON.parse(r.slots[1].save).name, '无名侠客');
  assert.equal(JSON.parse(r.slots[2].save).name, '慕尼黑火焰');
  assert.equal(r.slots[3].save, null);
  // 另一设备看不到这三个角色（按设备隔离）
  const rb = await actions(base, PID_B, 'listSaves', {});
  assert.ok(rb.slots.every((s) => s.save === null), '未认领设备 5 位全空');

  // --- 世界：进图即进世界 / 心跳成员与 Boss / 全图怪 / 离图 / 无人数上限 / 层隔离 ---
  const meA = { playerId: PID_A, name: '慕尼黑好炸药', classId: 'mage', level: 11, maxHp: 300 };
  const meB = { playerId: PID_B, name: '路人乙', classId: 'warrior', level: 5, maxHp: 500 };
  assert.ok(await actionsErr(base, PID_A, 'joinWorld', { ...meA, worldKey: '99:0', x: 0, y: 0 }),
    '不存在的世界应报错');
  const jA = await actions(base, PID_A, 'joinWorld', { ...meA, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jA.ok, true);
  assert.equal(jA.worldKey, '19:0');
  assert.ok(jA.monsters.length > 0, '进世界应看到怪');
  assert.equal(jA.boss.state, 1, '进世界时 Boss 应活着');
  assert.equal(jA.memberCount, 1);
  const jB = await actions(base, PID_B, 'joinWorld', { ...meB, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jB.ok, true);
  assert.equal(jB.memberCount, 2);
  const idsA = new Set(jA.monsters.map((m) => m.id));
  assert.ok(jB.monsters.some((m) => idsA.has(m.id)), '同世界两人应看到同一批怪');
  // 心跳：世界全体成员、Boss 状态、共享击杀恒为 0（经验改走死亡事件）
  let hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, worldKey: '19:0', x: 10, y: 20, hp: 280, xpDelta: 0, gear: 'g1',
  });
  assert.equal(hb.ok, true);
  assert.equal(hb.stageKey, '19');
  assert.equal(hb.layer, 0);
  assert.equal(hb.sharedKills, 0);
  assert.ok(hb.bossHp > 0 && hb.bossMax > 0, 'Boss 血量应大于 0');
  assert.equal(hb.bossState, 1);
  assert.equal(hb.members.length, 2);
  assert.equal(hb.members.find((m) => m.playerId === PID_A).gear, 'g1');
  // worldMap：全图怪
  const map = await actions(base, PID_A, 'worldMap', { playerId: PID_A, worldKey: '19:0' });
  assert.equal(map.ok, true);
  assert.equal(map.monsters.length, 341, 'stage 19 全图应为 341 只怪');
  // 离图：A 离开后 worldSync 回 ok:false（已不在世界里），B 仍在世界里只剩 1 人；
  // 注意 heartbeat 会把人加回世界（重进），故不用 heartbeat 断言“已离开”
  await actions(base, PID_A, 'leaveWorld', { playerId: PID_A, worldKey: '19:0' });
  const gone = await actions(base, PID_A, 'worldSync', {
    playerId: PID_A, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(gone.ok, false, '离图后 worldSync 应回 ok:false');
  hb = await actions(base, PID_B, 'heartbeat', {
    ...meB, worldKey: '19:0', x: 30, y: 40, hp: 500, xpDelta: 0,
  });
  assert.equal(hb.members.length, 1);
  // heartbeat 即重进：A 再心跳一次就回世界（成员变回 2 人）
  hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, worldKey: '19:0', x: 0, y: 0, hp: 300, xpDelta: 0,
  });
  assert.equal(hb.ok, true, 'heartbeat 会把离图玩家加回世界');
  assert.equal(hb.members.length, 2);
  await actions(base, PID_A, 'leaveWorld', { playerId: PID_A, worldKey: '19:0' });
  // 世界无 4 人上限：第 3–7 人也能进同一世界
  await actions(base, PID_A, 'joinWorld', { ...meA, worldKey: '19:0', x: 0, y: 0 });
  for (let i = 0; i < 5; i++) {
    const pid = `ptest-device-x0${i}`;
    const j = await actions(base, pid, 'joinWorld', {
      playerId: pid, name: `路人${i}`, classId: 'mage', level: 1, maxHp: 100,
      worldKey: '19:0', x: 0, y: 0,
    });
    assert.equal(j.ok, true, `第 ${i + 3} 人应能进世界（无人数上限）`);
  }
  hb = await actions(base, PID_B, 'heartbeat', {
    ...meB, worldKey: '19:0', x: 30, y: 40, hp: 500, xpDelta: 0,
  });
  assert.equal(hb.members.length, 7, '同一世界应有 7 人');
  for (let i = 0; i < 5; i++) {
    await actions(base, `ptest-device-x0${i}`, 'leaveWorld', { playerId: `ptest-device-x0${i}`, worldKey: '19:0' });
  }
  await actions(base, PID_A, 'leaveWorld', { playerId: PID_A, worldKey: '19:0' });
  await actions(base, PID_B, 'leaveWorld', { playerId: PID_B, worldKey: '19:0' });
  // 层隔离：骷髅洞穴 0 层与 1 层是两个世界
  const j0 = await actions(base, PID_A, 'joinWorld', { ...meA, worldKey: '4:0', x: 0, y: 0 });
  const j1 = await actions(base, PID_B, 'joinWorld', { ...meB, worldKey: '4:1', x: 0, y: 0 });
  assert.equal(j0.memberCount, 1);
  assert.equal(j1.memberCount, 1);
  await actions(base, PID_A, 'leaveWorld', { playerId: PID_A, worldKey: '4:0' });
  await actions(base, PID_B, 'leaveWorld', { playerId: PID_B, worldKey: '4:1' });

  // --- 拍卖行：上架 → 列表 → 购买 → 双方领取；下架 → 领取退回；到期 → 领取退回 ---
  const sword = { uid: 101, name: '测试剑', slot: 'weapon', tier: 1, price: 0 };
  const sA = saveObj('慕尼黑好炸药', 'mage', 11, 8755, [sword]);
  await actions(base, PID_A, 'putSave', { slot: 1, data: JSON.stringify(sA) });
  const sB = saveObj('路人乙', 'warrior', 5, 10000, []);
  await actions(base, PID_B, 'putSave', { slot: 1, data: JSON.stringify(sB) });
  const listed = await actions(base, PID_A, 'createListing', {
    playerId: PID_A, slot: 1, sellerName: '慕尼黑好炸药', price: 500,
    itemJson: JSON.stringify(sword),
  });
  assert.equal(listed.ok, true);
  assert.ok(listed.id > 0);
  let auc = await actions(base, PID_A, 'listAuction', {});
  assert.equal(auc.listings.length, 1);
  assert.equal(auc.listings[0].price, 500);
  assert.equal(auc.listings[0].sellerName, '慕尼黑好炸药');
  assert.ok(await actionsErr(base, PID_A, 'createListing', {
    playerId: PID_A, slot: 1, sellerName: '慕尼黑好炸药', price: 1, itemJson: '{"nope":1}',
  }), '非法物品应上架失败');
  const selfBuy = await actions(base, PID_A, 'buyListing', { id: listed.id, playerId: PID_A, slot: 1 });
  assert.equal(selfBuy.ok, false, '不能买自己的');
  const bought = await actions(base, PID_B, 'buyListing', { id: listed.id, playerId: PID_B, slot: 1 });
  assert.equal(bought.ok, true);
  assert.equal(bought.price, 500);
  const claimA = await actions(base, PID_A, 'claimAuction', { playerId: PID_A, slot: 1 });
  assert.equal(claimA.gold, 500, '卖家领到全额成交金币');
  const claimB = await actions(base, PID_B, 'claimAuction', { playerId: PID_B, slot: 1 });
  assert.equal(claimB.items.length, 1);
  assert.equal(JSON.parse(claimB.items[0]).uid, 101, '买家领到装备');
  const claimB2 = await actions(base, PID_B, 'claimAuction', { playerId: PID_B, slot: 1 });
  assert.equal(claimB2.items.length, 0, '重复领取应为空');
  // 下架取回
  const listed2 = await actions(base, PID_A, 'createListing', {
    playerId: PID_A, slot: 1, sellerName: '慕尼黑好炸药', price: 100,
    itemJson: JSON.stringify({ uid: 102, name: '测试甲', slot: 'armor', tier: 1 }),
  });
  assert.equal(listed2.ok, true);
  const delisted = await actions(base, PID_A, 'delistListing', { id: listed2.id, playerId: PID_A, slot: 1 });
  assert.equal(delisted.ok, true);
  const claimA2 = await actions(base, PID_A, 'claimAuction', { playerId: PID_A, slot: 1 });
  assert.equal(claimA2.items.length, 1);
  assert.equal(JSON.parse(claimA2.items[0]).uid, 102, '下架后领回装备');
  // 到期退回：直接把 expires_at 改到过去，再领取
  const listed3 = await actions(base, PID_A, 'createListing', {
    playerId: PID_A, slot: 1, sellerName: '慕尼黑好炸药', price: 100,
    itemJson: JSON.stringify({ kind: 'book', skillId: 'war_liehuo', name: '烈火剑法' }),
  });
  assert.equal(listed3.ok, true);
  {
    const db = new DatabaseSync(`${dataDir}/game.db`);
    try {
      for (let i = 0; i < 5; i++) {
        try {
          db.prepare('UPDATE art_listings SET expires_at = ? WHERE id = ?')
            .run(Date.now() - 1000, listed3.id);
          break;
        } catch { await sleep(100); }
      }
    } finally { db.close(); }
  }
  const claimA3 = await actions(base, PID_A, 'claimAuction', { playerId: PID_A, slot: 1 });
  assert.equal(claimA3.items.length, 1);
  assert.equal(JSON.parse(claimA3.items[0]).skillId, 'war_liehuo', '到期技能书退回卖家');

  // --- 落地页与游戏入口守卫 ---
  const landing = await fetch(base + '/');
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /认领角色/);
  const noCookieGame = await fetch(base + '/game/', { redirect: 'manual' });
  assert.equal(noCookieGame.status, 302, '无 cookie 访问 /game/ 应 302 回落地页');
  assert.equal(noCookieGame.headers.get('location'), '/');
});

test('世界 Roll 点：startRoll / submitRoll / claimRolls（整图共享，不同世界看不到）', async (t) => {
  const dataDir = makeTmpDir('actions-team');
  await seedIsolated(dataDir);
  const srv = await startServer(dataDir, PORT + 2, CLAIM_CODE);
  t.after(() => stopServer(srv));
  const { base } = srv;

  const meA = { playerId: PID_A, name: '慕尼黑好炸药', classId: 'mage', level: 11, maxHp: 300 };
  const meB = { playerId: PID_B, name: '路人乙', classId: 'warrior', level: 5, maxHp: 500 };
  const meC = { playerId: 'ptest-device-c01', name: '路人丙', classId: 'taoist', level: 3, maxHp: 200 };
  await actions(base, PID_A, 'joinWorld', { ...meA, worldKey: '19:0', x: 0, y: 0 });
  await actions(base, PID_B, 'joinWorld', { ...meB, worldKey: '19:0', x: 0, y: 0 });
  // C 在另一个世界（stage 20），不应看到 19:0 世界的 Roll
  await actions(base, meC.playerId, 'joinWorld', { ...meC, worldKey: '20:0', x: 0, y: 0 });

  // --- Roll：非法物品拒绝；合法发起后同世界双方在心跳里看到 Roll，不同世界看不到 ---
  const item = { uid: 201, name: '测试紫装', slot: 'weapon', tier: 3 };
  const bad = await actions(base, PID_A, 'startRoll', {
    worldKey: '19:0', playerId: PID_A, name: meA.name, layer: 0, itemJson: '{"nope":1}',
  });
  assert.equal(bad.ok, false);
  const started = await actions(base, PID_A, 'startRoll', {
    worldKey: '19:0', playerId: PID_A, name: meA.name, layer: 0, itemJson: JSON.stringify(item),
  });
  assert.equal(started.ok, true);
  assert.ok(started.id > 0);
  const rollId = started.id;
  let hb = await actions(base, PID_B, 'heartbeat', {
    ...meB, worldKey: '19:0', x: 0, y: 0, hp: 500, xpDelta: 0,
  });
  assert.equal(hb.rolls.length, 1);
  assert.equal(hb.rolls[0].status, 'active');
  assert.equal(hb.rolls[0].round, 1);
  assert.deepEqual(
    hb.rolls[0].entries.map((e) => e.value), [null, null], '未掷点前两人都是 null');
  const hbC = await actions(base, meC.playerId, 'heartbeat', {
    ...meC, worldKey: '20:0', x: 0, y: 0, hp: 200, xpDelta: 0,
  });
  assert.equal(hbC.rolls.length, 0, '不同世界成员不应看到 Roll');
  // 非参与者掷点应被拒绝
  const outsider = await actions(base, meC.playerId, 'submitRoll', { id: rollId, playerId: meC.playerId });
  assert.equal(outsider.ok, false);
  // 双方掷点；平局则重掷，最多 5 轮
  let winnerId = null;
  for (let round = 0; round < 5; round++) {
    const ra = await actions(base, PID_A, 'submitRoll', { id: rollId, playerId: PID_A });
    assert.equal(ra.ok, true);
    assert.ok(ra.value >= 1 && ra.value <= 100);
    const ra2 = await actions(base, PID_A, 'submitRoll', { id: rollId, playerId: PID_A });
    assert.equal(ra2.value, ra.value, '重复提交返回已掷点数');
    const rb = await actions(base, PID_B, 'submitRoll', { id: rollId, playerId: PID_B });
    assert.equal(rb.ok, true);
    hb = await actions(base, PID_A, 'heartbeat', {
      ...meA, worldKey: '19:0', x: 0, y: 0, hp: 300, xpDelta: 0,
    });
    const roll = hb.rolls.find((r) => r.id === rollId);
    assert.ok(roll, '心跳应带回 Roll');
    if (roll.status === 'resolved') { winnerId = roll.winnerId; break; }
    assert.equal(roll.status, 'active', '未结算时应为 active（平局进下一轮）');
  }
  assert.ok(winnerId === PID_A || winnerId === PID_B, '应决出胜者');
  // 胜者领一次，重复领为空；负者领为空
  const loserId = winnerId === PID_A ? PID_B : PID_A;
  const winClaim = await actions(base, winnerId, 'claimRolls', { playerId: winnerId });
  assert.equal(winClaim.items.length, 1);
  assert.equal(JSON.parse(winClaim.items[0]).uid, 201);
  const winClaim2 = await actions(base, winnerId, 'claimRolls', { playerId: winnerId });
  assert.equal(winClaim2.items.length, 0, '重复领取应为空');
  const loseClaim = await actions(base, loserId, 'claimRolls', { playerId: loserId });
  assert.equal(loseClaim.items.length, 0, '负者领不到装备');
  // 不存在的 Roll 掷点应失败
  const noRoll = await actions(base, PID_A, 'submitRoll', { id: 999999, playerId: PID_A });
  assert.equal(noRoll.ok, false);
});

test('actions 兼容层：旧接口不受影响', async (t) => {
  const dataDir = makeTmpDir('actions-old');
  await seedIsolated(dataDir);
  const srv = await startServer(dataDir, PORT + 1, CLAIM_CODE);
  t.after(() => stopServer(srv));
  const h = await fetch(srv.base + '/api/health');
  assert.equal(h.status, 200);
  const j = await h.json();
  assert.equal(j.ok, true);
  assert.equal(j.claimUsed, false);
});
