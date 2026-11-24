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

test('actions 兼容层：存档 / 认领 / 房间 / 拍卖行', async (t) => {
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

  // --- 房间：建房 / 进房 / 心跳共享 / 换层 / 洞口 / 离房 / 满房 ---
  const meA = { playerId: PID_A, name: '慕尼黑好炸药', classId: 'mage', level: 11, maxHp: 300 };
  const meB = { playerId: PID_B, name: '路人乙', classId: 'warrior', level: 5, maxHp: 500 };
  const created = await actions(base, PID_A, 'createRoom', { ...meA, stageKey: '19', layer: 0 });
  assert.equal(created.ok, true);
  assert.match(created.code, /^[A-Z0-9]{5}$/);
  const code = created.code;
  const badJoin = await actions(base, PID_B, 'joinRoom', { ...meB, code: 'ZZZZZ' });
  assert.equal(badJoin.ok, false);
  const joined = await actions(base, PID_B, 'joinRoom', { ...meB, code });
  assert.equal(joined.ok, true);
  assert.equal(joined.stageKey, '19');
  assert.equal(joined.layer, 0);
  let hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, code, x: 10, y: 20, hp: 280, layer: 0,
    killsDelta: 5, bossSpawnMax: 1000, bossDamage: 300, advanceLayer: -1, holeKilled: false, gear: 'g1',
  });
  assert.equal(hb.ok, true);
  assert.equal(hb.sharedKills, 5);
  assert.equal(hb.bossMax, 1000);
  assert.equal(hb.bossHp, 700);
  assert.equal(hb.bossState, 1);
  assert.equal(hb.members.length, 2);
  hb = await actions(base, PID_B, 'heartbeat', {
    ...meB, code, x: 30, y: 40, hp: 500, layer: 0,
    killsDelta: 0, bossSpawnMax: 0, bossDamage: 700, advanceLayer: -1, holeKilled: true, gear: '',
  });
  assert.equal(hb.bossHp, 0);
  assert.equal(hb.bossState, 2);
  assert.equal(hb.holeKilled, true);
  assert.equal(hb.members.find((m) => m.playerId === PID_A).gear, 'g1', '空 gear 不覆盖已有外观');
  hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, code, x: 0, y: 0, hp: 300, layer: 1,
    killsDelta: 0, bossSpawnMax: 0, bossDamage: 0, advanceLayer: 1, holeKilled: false, gear: '',
  });
  assert.equal(hb.layer, 1);
  assert.equal(hb.sharedKills, 0, '换层清共享击杀');
  assert.equal(hb.bossState, 0, '换层清 Boss');
  await actions(base, PID_B, 'leaveRoom', { code, playerId: PID_B });
  hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, code, x: 0, y: 0, hp: 300, layer: 1,
    killsDelta: 0, bossSpawnMax: 0, bossDamage: 0, advanceLayer: -1, holeKilled: false, gear: '',
  });
  assert.equal(hb.members.length, 1);
  // 满 4 人：第 5 人拒绝
  for (let i = 0; i < 3; i++) {
    const p = `ptest-device-x0${i}`;
    const j = await actions(base, p, 'joinRoom', {
      code, playerId: p, name: `路人${i}`, classId: 'mage', level: 1, maxHp: 100,
    });
    assert.equal(j.ok, true, `第 ${i + 3} 人应能进房`);
  }
  const full = await actions(base, 'ptest-device-x99', 'joinRoom', {
    code, playerId: 'ptest-device-x99', name: '路人满', classId: 'mage', level: 1, maxHp: 100,
  });
  assert.equal(full.ok, false);
  assert.match(full.reason, /已满/);
  await actions(base, PID_A, 'leaveRoom', { code, playerId: PID_A });
  for (let i = 0; i < 3; i++) {
    await actions(base, `ptest-device-x0${i}`, 'leaveRoom', { code, playerId: `ptest-device-x0${i}` });
  }
  const gone = await actions(base, PID_B, 'joinRoom', { ...meB, code });
  assert.equal(gone.ok, false, '全员离房后房间应解散');

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

test('组队经验与 Roll 点：xpDelta 累计 / startRoll / submitRoll / claimRolls', async (t) => {
  const dataDir = makeTmpDir('actions-team');
  await seedIsolated(dataDir);
  const srv = await startServer(dataDir, PORT + 2, CLAIM_CODE);
  t.after(() => stopServer(srv));
  const { base } = srv;

  const meA = { playerId: PID_A, name: '慕尼黑好炸药', classId: 'mage', level: 11, maxHp: 300 };
  const meB = { playerId: PID_B, name: '路人乙', classId: 'warrior', level: 5, maxHp: 500 };
  const meC = { playerId: 'ptest-device-c01', name: '路人丙', classId: 'taoist', level: 3, maxHp: 200 };
  const created = await actions(base, PID_A, 'createRoom', { ...meA, stageKey: '19', layer: 0 });
  assert.equal(created.ok, true);
  const code = created.code;
  await actions(base, PID_B, 'joinRoom', { ...meB, code });
  await actions(base, meC.playerId, 'joinRoom', { ...meC, code });
  // C 先心跳到 1 层，后面 Roll 只面向 0 层成员
  await actions(base, meC.playerId, 'heartbeat', {
    ...meC, code, x: 0, y: 0, hp: 200, layer: 1, xpDelta: 0,
  });

  // --- 组队经验：A 上报 xpDelta，B 的心跳里看到 A 的 xpTotal 累计 ---
  let hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, code, x: 0, y: 0, hp: 300, layer: 0, xpDelta: 120,
  });
  assert.equal(hb.members.find((m) => m.playerId === PID_A).xpTotal, 120);
  hb = await actions(base, PID_B, 'heartbeat', {
    ...meB, code, x: 0, y: 0, hp: 500, layer: 0, xpDelta: 0,
  });
  assert.equal(hb.members.find((m) => m.playerId === PID_A).xpTotal, 120);
  assert.equal(hb.members.find((m) => m.playerId === PID_B).xpTotal, 0);
  hb = await actions(base, PID_A, 'heartbeat', {
    ...meA, code, x: 0, y: 0, hp: 300, layer: 0, xpDelta: 80,
  });
  assert.equal(hb.members.find((m) => m.playerId === PID_A).xpTotal, 200, 'xpTotal 应累计');

  // --- Roll：非法物品拒绝；合法发起后同层双方在心跳里看到 Roll，不同层看不到 ---
  const item = { uid: 201, name: '测试紫装', slot: 'weapon', tier: 3 };
  const bad = await actions(base, PID_A, 'startRoll', {
    code, playerId: PID_A, name: meA.name, layer: 0, itemJson: '{"nope":1}',
  });
  assert.equal(bad.ok, false);
  const started = await actions(base, PID_A, 'startRoll', {
    code, playerId: PID_A, name: meA.name, layer: 0, itemJson: JSON.stringify(item),
  });
  assert.equal(started.ok, true);
  assert.ok(started.id > 0);
  const rollId = started.id;
  hb = await actions(base, PID_B, 'heartbeat', {
    ...meB, code, x: 0, y: 0, hp: 500, layer: 0, xpDelta: 0,
  });
  assert.equal(hb.rolls.length, 1);
  assert.equal(hb.rolls[0].status, 'active');
  assert.equal(hb.rolls[0].round, 1);
  assert.deepEqual(
    hb.rolls[0].entries.map((e) => e.value), [null, null], '未掷点前两人都是 null');
  const hbC = await actions(base, meC.playerId, 'heartbeat', {
    ...meC, code, x: 0, y: 0, hp: 200, layer: 1, xpDelta: 0,
  });
  assert.equal(hbC.rolls.length, 0, '不同层成员不应看到 Roll');
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
      ...meA, code, x: 0, y: 0, hp: 300, layer: 0, xpDelta: 0,
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
