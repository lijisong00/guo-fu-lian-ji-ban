'use strict';
// 冒烟测试：启动 / 角色 / 认领 / 世界（全程隔离库 + 测试认领码 TEST123）。
// 世界制后 WS 与房间已删除（Phase 6），进图即进世界，走 HTTP /actions。
// 口径依据 docs/protocol.md 与 docs/WORLD-DESIGN.md：
//   - 每设备 5 位，第 6 个拒绝 '存档位已满，最多 5 个'
//   - 新角色金币 200、中瓶血/蓝各 100、1 级、开局本职业 1 级技能
//   - 认领码错码拒、二次认领拒 '认领码已失效'、认领要求 1-3 号位为空
//   - 世界：同图同层进同一世界（进图即进，不用建房）；世界无人数上限
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  sleep, makeTmpDir, seedIsolated, startServer, stopServer,
  api, getText, createChar, listChars,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);
const character = require('../lib/character.js');

const PORT = 18731;
const CLAIM = 'TEST123';
const DEV_FULL = 'smokeFullDev01';   // 5 位占满测试
const DEV_CLAIM = 'smokeClaimDev1';  // 认领设备
const DEV_PRE = 'smokePreDev001';    // 认领前无角色设备
const DEV_B = 'smokeWorldDevB1';
const DEV_C = 'smokeWorldDevC1';
const DEV_D = 'smokeWorldDevD1';
const DEV_E = 'smokeWorldDevE1';

let dir;
let srv;

async function actions(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `smoke-${Math.random()}` }),
  });
  assert.equal(r.status, 200, `POST /actions ${action} 应返回 200`);
  const j = await r.json();
  if (j.error) throw new Error(`动作 ${action} 报错：${j.error}`);
  return j.data;
}

test.before(async () => {
  dir = makeTmpDir('smoke');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM);
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('服务器启动：health / 首页 / stages', async () => {
  const h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.ok, true);
  assert.equal(h.service, 'guo-fu-lian-ji-ban');
  assert.equal(h.claimUsed, false);
  assert.equal(h.worlds, 0, '无人时世界数为 0');
  assert.equal(h.playersOnline, 0, '无人时在线人数为 0');

  const home = await getText(srv.base, '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /热血传奇/);

  const st = await api(srv.base, 'GET', '/api/stages');
  assert.equal(st.ok, true);
  assert.equal(st.stages.length, 15, '地图应为 15 张，实际 ' + st.stages.length);
  const shiwang = st.stages.find((s) => s.id === 'shiwang');
  const andian = st.stages.find((s) => s.id === 'andian');
  const city = st.stages.find((s) => s.id === 'city');
  assert.equal(shiwang.teleport, false, '尸王殿不在传送列表（只能走僵尸洞三层洞口）');
  assert.equal(andian.hidden, true, '未知暗殿应为隐藏图');
  assert.equal(andian.teleport, false, '未知暗殿不在传送列表');
  assert.equal(city.teleport, false, '比奇城本身不是传送目的地（传送员在城里，目的地是其他图）');
  assert.equal(city.safe, true);
  const biqi = st.stages.find((s) => s.id === 'biqi_field');
  assert.equal(biqi.teleport, true, '比奇野外应在传送列表里');
  console.log('stages=15，尸王殿 teleport=false，未知暗殿 hidden=true');
});

test('角色：新设备 5 个空位；建战士；第 6 个位拒绝；删角色后位变空', async () => {
  const empty = await listChars(srv.base, DEV_FULL);
  assert.equal(empty.length, 5);
  assert.ok(empty.every((c) => c === null), '新设备 5 个位都应为空');

  const ch = await createChar(srv.base, DEV_FULL, 1, 'SmokeWar01', 'war');
  assert.equal(ch.gold, 200);
  assert.equal(ch.level, 1);
  assert.equal(ch.cls, 'war');

  // 开局药水与技能（protocol：中瓶血/蓝各 100，战士开局学会基本剑术）：
  // 世界制后服务端不再走 WS 发 me，改为直接断言建号存档模板
  const save = character.newCharacterSave('SmokeWar01', 'war');
  assert.deepEqual(save.hpPots, [0, 100, 0], '开局中瓶血瓶×100');
  assert.deepEqual(save.mpPots, [0, 100, 0], '开局中瓶魔法瓶×100');
  assert.ok(save.learned.war_basic, '战士开局学会基本剑术');
  assert.equal(save.learned.war_basic.lv, 1);

  await createChar(srv.base, DEV_FULL, 2, 'SmokeMag01', 'mage');
  await createChar(srv.base, DEV_FULL, 3, 'SmokeTao01', 'tao');
  await createChar(srv.base, DEV_FULL, 4, 'SmokeWar02', 'war');
  await createChar(srv.base, DEV_FULL, 5, 'SmokeMag02', 'mage');
  const full = await listChars(srv.base, DEV_FULL);
  assert.equal(full.filter(Boolean).length, 5);

  const sixth = await api(srv.base, 'POST', '/api/character', {
    deviceId: DEV_FULL, slot: 1, name: 'SmokeWar03', cls: 'war',
  });
  assert.equal(sixth.ok, false);
  assert.match(sixth.error, /已满/);

  const del = await api(srv.base, 'DELETE', '/api/character/5', { deviceId: DEV_FULL });
  assert.equal(del.ok, true);
  const afterDel = await listChars(srv.base, DEV_FULL);
  assert.equal(afterDel[4], null, '删角色后 5 号位变空');
  assert.equal(afterDel.filter(Boolean).length, 4);
});

test('认领：错码拒绝；测试码认领成功三角色与 seed 一致；二次认领拒绝', async () => {
  // 认领前：无角色设备 5 位全空
  const pre = await listChars(srv.base, DEV_PRE);
  assert.equal(pre.filter(Boolean).length, 0, '认领前设备应无角色');

  const wrong = await api(srv.base, 'POST', '/api/claim', { code: 'WRONG00', deviceId: DEV_CLAIM });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /认领码不对/);

  const ok = await api(srv.base, 'POST', '/api/claim', { code: CLAIM, deviceId: DEV_CLAIM });
  assert.equal(ok.ok, true);
  assert.equal(ok.characters.length, 3);
  const bySlot = {};
  for (const c of ok.characters) bySlot[c.slot] = c;
  assert.equal(bySlot[1].name, '慕尼黑好炸药');
  assert.equal(bySlot[1].cls, 'mage');
  assert.equal(bySlot[1].level, 11);
  assert.equal(bySlot[1].xp, 7242);
  assert.equal(bySlot[1].gold, 8755);
  assert.equal(bySlot[2].name, '无名侠客');
  assert.equal(bySlot[2].cls, 'war');
  assert.equal(bySlot[2].level, 2);
  assert.equal(bySlot[2].xp, 79);
  assert.equal(bySlot[2].gold, 3503);
  assert.equal(bySlot[3].name, '慕尼黑火焰');
  assert.equal(bySlot[3].cls, 'tao');
  assert.equal(bySlot[3].level, 9);
  assert.equal(bySlot[3].xp, 1384);
  assert.equal(bySlot[3].gold, 5709);

  const again = await api(srv.base, 'POST', '/api/claim', { code: CLAIM, deviceId: DEV_FULL });
  assert.equal(again.ok, false);
  assert.match(again.error, /认领码已失效/);

  const h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.claimUsed, true);

  // 认领后：同一设备角色列表里就是预置三角色
  const post = await listChars(srv.base, DEV_CLAIM);
  assert.equal(post[0].name, '慕尼黑好炸药');
  assert.equal(post[0].level, 11);
  console.log('认领成功：法师慕尼黑好炸药 Lv11、战士无名侠客 Lv2、道士慕尼黑火焰 Lv9');
});

test('世界：进图即进世界；同图同层两人同世界、看到同一批怪；离图后在线人数归零；世界无 4 人上限', async () => {
  const meA = { playerId: DEV_CLAIM, name: '慕尼黑好炸药', classId: 'mage', level: 11, maxHp: 300 };
  const meB = { playerId: DEV_FULL, name: 'SmokeWar01', classId: 'warrior', level: 1, maxHp: 100 };
  const jA = await actions(srv.base, DEV_CLAIM, 'joinWorld', { ...meA, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jA.ok, true);
  assert.equal(jA.worldKey, '19:0');
  assert.ok(jA.monsters.length > 0, '进世界应看到怪');
  assert.equal(jA.memberCount, 1);

  const jB = await actions(srv.base, DEV_FULL, 'joinWorld', { ...meB, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jB.ok, true);
  assert.equal(jB.memberCount, 2);
  const idsA = new Set(jA.monsters.map((m) => m.id));
  const shared = jB.monsters.filter((m) => idsA.has(m.id));
  assert.ok(shared.length > 0, '同世界两人应看到同一批怪');
  assert.equal(jB.monsters.find((m) => m.id === shared[0].id).hp, shared[0].hp, '同一只怪血量应一致');

  let h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.worlds, 1, '同图同层只建 1 个世界');
  assert.equal(h.playersOnline, 2);

  // 世界无 4 人上限：第 3、4、5 人也能进同一世界
  for (const dev of [DEV_B, DEV_C, DEV_D]) {
    const j = await actions(srv.base, dev, 'joinWorld', {
      playerId: dev, name: '路人' + dev.slice(-1), classId: 'mage', level: 1, maxHp: 100,
      worldKey: '19:0', x: 0, y: 0,
    });
    assert.equal(j.ok, true, dev + ' 应能进世界（无 4 人上限）');
  }
  h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.playersOnline, 5);
  assert.equal(h.worlds, 1);

  // 全部离图 → 在线人数归零；空世界 5 分钟后才卸载（STALE_MS），不是立即删
  for (const dev of [DEV_CLAIM, DEV_FULL, DEV_B, DEV_C, DEV_D]) {
    await actions(srv.base, dev, 'leaveWorld', { playerId: dev, worldKey: '19:0' });
  }
  await sleep(300);
  h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.playersOnline, 0, '全员离图后在线人数应为 0');
  console.log('世界冒烟通过：同世界两人共怪、5 人同世界无上限、全员离图后在线人数归零');
});
