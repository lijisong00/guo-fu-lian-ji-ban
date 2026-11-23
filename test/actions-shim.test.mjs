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
