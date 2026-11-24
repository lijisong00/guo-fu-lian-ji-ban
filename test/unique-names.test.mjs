'use strict';
// 角色名全服唯一测试：store 级（去重/认领让名）+ HTTP 级（putSave/REST/改名）。
// 全程隔离库 + 测试认领码 TEST123；不碰真实库与真实认领码。
// 覆盖：
//   - store：已有重名时 initDb 去重（保留先建的，后建的改名 #2，绝不删号），
//     全服唯一索引建成；认领时种子名被占，占用者改名让名、认领成功
//   - HTTP putSave：两不同 device 同名 → 第二个被拒「名字已被占用，请换一个」；
//     不同名通过；同一 device 两 slot 同名被拒；改名成别人的名字被拒，
//     改成空闲名字通过（旧名字随即释放）；新建失败不再静默返回 ok
//   - HTTP REST /api/character：同名建角 409「名字已被占用，请换一个」
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  makeTmpDir, seedIsolated, startServer, stopServer, api,
} from './support/helpers.mjs';

// ---- store 级：单独的隔离 DATA_DIR，require 前定好（db.js 在 require 时建库）----
const storeDir = makeTmpDir('uniqstore');
process.env.DATA_DIR = storeDir;
const require = createRequire(import.meta.url);
const store = require('../lib/db.js');

function miniSave(name, classId, level = 1) {
  return {
    v: 1, name, classId, level, xp: 0, gold: 0,
    hpPots: [0, 100, 0], mpPots: [0, 100, 0],
    skillsOn: true, soundOn: false, musicOn: false,
    books: [], learned: {}, active: [], worn: {}, bag: [],
    ores: [], cleared: [], bonusLit: [], run: null, deepest: {}, savedAt: Date.now(),
  };
}

test('store：已有重名时 initDb 去重（保留先建，后建改名 #2），索引建成', () => {
  // 模拟全服唯一实施前的旧库：先拆掉唯一索引，再直接插两条同名
  store.db.exec('DROP INDEX IF EXISTS idx_name_global;');
  const s1 = store.createCharacter('uniqDupA01', 1, '重名', 'war', miniSave('重名', 'warrior', 5));
  const s2 = store.createCharacter('uniqDupB01', 1, '重名', 'mage', miniSave('重名', 'mage', 3));
  assert.ok(s1 && s2, '拆索引后两条同名应都能插进去');
  // 重跑 initDb：去重 + 重建唯一索引
  store.initDb();
  const rows = store.db.prepare(
    "SELECT id, device_id, name FROM characters WHERE name LIKE '重名%' ORDER BY created_at ASC, id ASC"
  ).all();
  assert.equal(rows.length, 2, '去重绝不能删号，应仍有 2 条');
  assert.equal(rows[0].name, '重名', '先建的保留原名');
  assert.equal(rows[0].device_id, 'uniqDupA01');
  assert.equal(rows[1].name, '重名#2', '后建的改名 #2');
  assert.equal(rows[1].device_id, 'uniqDupB01');
  // data JSON 里的名字也要跟着改
  const data2 = JSON.parse(store.db.prepare('SELECT data FROM characters WHERE id = ?').get(rows[1].id).data);
  assert.equal(data2.name, '重名#2', 'data JSON 里的名字应同步改名');
  const idx = store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_name_global'"
  ).get();
  assert.ok(idx, '全服唯一索引 idx_name_global 应存在');
  assert.equal(store.nameTaken('重名'), true);
  assert.equal(store.nameTaken('重名#2'), true);
  assert.equal(store.nameTaken('没人叫这名'), false);
  console.log('去重通过：先建保留「重名」，后建改名「重名#2」，索引已建');
});

test('store：认领时种子名被占，占用者改名让名、认领成功', () => {
  // 预置 3 个未认领种子（模拟 migrate），名字与线上种子一致
  const seeds = [
    { slot: 1, name: '慕尼黑好炸药', cls: 'mage' },
    { slot: 2, name: '无名侠客', cls: 'war' },
    { slot: 3, name: '慕尼黑火焰', cls: 'tao' },
  ];
  for (const s of seeds) {
    const ch = store.createCharacter(null, s.slot, s.name, s.cls, miniSave(s.name, s.cls, 9));
    assert.ok(ch, `种子 ${s.name} 应能预置`);
  }
  // 模拟“朋友先建了默认名无名侠客”：拆索引直接插一条（旧库遗留的重名状态）
  store.db.exec('DROP INDEX IF EXISTS idx_name_global;');
  const clash = store.createCharacter('uniqClash01', 1, '无名侠客', 'war', miniSave('无名侠客', 'warrior', 2));
  assert.ok(clash, '应能插一条与种子同名的旧角色');
  // 认领：种子（先建）保留原名，占用者（后建）改名让名，认领成功
  const r = store.claimAll('uniqClaim01');
  assert.equal(r.ok, true, '认领应成功：' + JSON.stringify(r));
  assert.equal(r.characters.filter(Boolean).length, 3, '应认领到 3 个角色');
  const names = r.characters.filter(Boolean).map((c) => c.name).sort();
  assert.deepEqual(names, ['慕尼黑好炸药', '慕尼黑火焰', '无名侠客'].sort(), '种子名应完整保留');
  const holder = store.db.prepare("SELECT name FROM characters WHERE device_id = 'uniqClash01'").get();
  assert.equal(holder.name, '无名侠客#2', '占用者应被改名让出种子名');
  store.initDb(); // 恢复唯一索引
  console.log('认领让名通过：占用者改名「无名侠客#2」，3 个种子完整认领');
});

// ---- HTTP 级：走 /actions 与 /api/character，与客户端同一入口 ----
const PORT = 18738;
const CLAIM_CODE = 'TEST123';
const DEV_A = 'uniqDevA01';
const DEV_B = 'uniqDevB01';

let dir;
let srv;

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
    body: JSON.stringify({ action, args, actionCallId: `uniq-${Math.random()}` }),
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
    body: JSON.stringify({ action, args, actionCallId: `uniq-err-${Math.random()}` }),
  });
  const j = await r.json();
  return j.error || null;
}

async function putSave(base, pid, slot, save) {
  return actions(base, pid, 'putSave', { slot, data: JSON.stringify(save) });
}

test.before(async () => {
  dir = makeTmpDir('uniqname');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM_CODE);
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('HTTP putSave：两 device 同名被拒，不同名通过；同 device 两 slot 同名被拒', async () => {
  // A 建「重名甲」slot 1 成功
  const okA = await putSave(srv.base, DEV_A, 1, saveObj('重名甲', 'mage', 11, 100));
  assert.equal(okA.ok, true);
  // B 建同名「重名甲」slot 1 → 明确拒绝，不再静默成功
  const errB = await actionsErr(srv.base, DEV_B, 'putSave', {
    slot: 1, data: JSON.stringify(saveObj('重名甲', 'warrior', 5, 50)),
  });
  assert.ok(errB, '同名新建应报错');
  assert.match(errB, /名字已被占用，请换一个/);
  // B 用 listSaves 确认：他的 slot 1 仍是空的（没偷偷存进去）
  const listB = await actions(srv.base, DEV_B, 'listSaves', {});
  assert.equal(listB.slots[0].save, null, '被拒的同名角色不应存进库');
  // B 建不同名通过
  const okB = await putSave(srv.base, DEV_B, 1, saveObj('不重名乙', 'warrior', 5, 50));
  assert.equal(okB.ok, true);
  // A 在 slot 2 再建「重名甲」→ 同一玩家两 slot 也不能同名
  const errA2 = await actionsErr(srv.base, DEV_A, 'putSave', {
    slot: 2, data: JSON.stringify(saveObj('重名甲', 'taoist', 3, 10)),
  });
  assert.ok(errA2, '同一玩家两 slot 同名应报错');
  assert.match(errA2, /名字已被占用，请换一个/);
  // A 正常更新自己 slot 1（同名本位）应通过，不被自己的名字拦住
  const okA2 = await putSave(srv.base, DEV_A, 1, saveObj('重名甲', 'mage', 12, 200));
  assert.equal(okA2.ok, true, '本位更新同名不应被拦');
  console.log('putSave 判重通过：跨 device / 同 device 两 slot 同名都被拒，本位更新放行');
});

test('HTTP putSave：改名成别人的名字被拒，改成空闲名字通过且旧名释放', async () => {
  // A slot 1 叫「改名甲」，B slot 1 叫「改名乙」
  await putSave(srv.base, DEV_A, 1, saveObj('改名甲', 'mage', 11, 100));
  await putSave(srv.base, DEV_B, 1, saveObj('改名乙', 'warrior', 5, 50));
  // A 把名字改成 B 的「改名乙」→ 被拒
  const err = await actionsErr(srv.base, DEV_A, 'putSave', {
    slot: 1, data: JSON.stringify(saveObj('改名乙', 'mage', 11, 100)),
  });
  assert.ok(err, '改名成别人的名字应报错');
  assert.match(err, /名字已被占用，请换一个/);
  // A 改成空闲名字「改名丙」→ 通过
  const ok = await putSave(srv.base, DEV_A, 1, saveObj('改名丙', 'mage', 11, 100));
  assert.equal(ok.ok, true);
  // 旧名「改名甲」已释放：B 在 slot 2 建「改名甲」应通过
  const okFree = await putSave(srv.base, DEV_B, 2, saveObj('改名甲', 'taoist', 3, 10));
  assert.equal(okFree.ok, true, '改名后旧名应释放给别人用');
  console.log('改名判重通过：改别人的名被拒，改空闲名通过、旧名释放');
});

test('HTTP REST /api/character：同名建角 409，不同名通过', async () => {
  // 先用 REST 建一个「接口甲」
  const c1 = await api(srv.base, 'POST', '/api/character', {
    deviceId: DEV_A, slot: 3, name: '接口甲', cls: 'mage',
  });
  assert.equal(c1.ok, true, '首个建角应成功：' + JSON.stringify(c1));
  // 另一 device 建同名 → 409
  const c2 = await api(srv.base, 'POST', '/api/character', {
    deviceId: DEV_B, slot: 3, name: '接口甲', cls: 'warrior',
  });
  assert.equal(c2.status, 409);
  assert.match(c2.error || '', /名字已被占用，请换一个/);
  // 不同名通过
  const c3 = await api(srv.base, 'POST', '/api/character', {
    deviceId: DEV_B, slot: 3, name: '接口乙', cls: 'warrior',
  });
  assert.equal(c3.ok, true, '不同名建角应成功：' + JSON.stringify(c3));
  console.log('REST 建角判重通过：同名 409，不同名通过');
});
