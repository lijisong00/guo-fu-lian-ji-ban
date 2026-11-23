'use strict';
// 冒烟测试：启动 / 角色 / 认领 / 房间（全程隔离库 + 测试认领码 TEST123）。
// 口径依据 docs/protocol.md：
//   - 每设备 5 位，第 6 个拒绝 '存档位已满，最多 5 个'
//   - 新角色金币 200、中瓶血/蓝各 100、1 级、开局本职业 1 级技能
//   - 认领码错码拒、二次认领拒 '认领码已失效'、认领要求 1-3 号位为空
//   - 房间码 5 位大写字母+数字，每房最多 4 人，房主离开房间解散
//   - 快照每 100ms 广播
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ROOT, sleep, waitFor, makeTmpDir, seedIsolated, startServer, stopServer,
  api, getText, createChar, listChars, WsClient,
} from './support/helpers.mjs';

const PORT = 18731;
const CLAIM = 'TEST123';
const DEV_FULL = 'smokeFullDev01';   // 5 位占满测试
const DEV_CLAIM = 'smokeClaimDev1';  // 认领设备
const DEV_PRE = 'smokePreDev001';    // 认领前无角色设备
const DEV_B = 'smokeRoomDevB1';
const DEV_C = 'smokeRoomDevC1';
const DEV_D = 'smokeRoomDevD1';
const DEV_E = 'smokeRoomDevE1';

let dir;
let srv;
const clients = [];
function track(c) { clients.push(c); return c; }

test.before(async () => {
  dir = makeTmpDir('smoke');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM);
});

test.after(async () => {
  for (const c of clients) c.close();
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('服务器启动：health / 首页 / stages', async () => {
  const h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.ok, true);
  assert.equal(h.service, 'guo-fu-lian-ji-ban');
  assert.equal(h.claimUsed, false);
  assert.equal(h.rooms, 0);

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

  // WS 上看开局药水与技能（protocol：中瓶血/蓝各 100）
  const ws = track(new WsClient(srv.base, DEV_FULL));
  await ws.connect(1);
  const me = await ws.waitMe((m) => m.hpPots !== undefined, 5000, '收到 me');
  assert.deepEqual(me.hpPots, [0, 100, 0], '开局中瓶血瓶×100');
  assert.deepEqual(me.mpPots, [0, 100, 0], '开局中瓶魔法瓶×100');
  assert.ok(me.learned.war_basic, '战士开局学会基本剑术');
  assert.equal(me.learned.war_basic.lv, 1);
  ws.close();

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
  // 认领前：无角色设备 WS 选 1 号位应被拒绝（预置角色未认领不许选）
  const pre = track(new WsClient(srv.base, DEV_PRE));
  const err = await pre.connect(1, true);
  assert.match(err.msg, /没有属于这个设备/);
  pre.close();

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

  // 认领后：同一设备 WS 可选 1 号位预置角色
  const post = track(new WsClient(srv.base, DEV_CLAIM));
  const authed = await post.connect(1);
  assert.equal(authed.character.name, '慕尼黑好炸药');
  assert.equal(authed.character.level, 11);
  post.close();
  console.log('认领成功：法师慕尼黑好炸药 Lv11、战士无名侠客 Lv2、道士慕尼黑火焰 Lv9');
});

test('房间：建房得 5 位码；第二人加入；快照 100ms 级；房主离开房间解散', async () => {
  const owner = track(new WsClient(srv.base, DEV_CLAIM));
  await owner.connect(1);
  owner.send({ t: 'create_room' });
  const joined = await owner.waitEvent((e) => e.t === 'room_joined', 5000, '房主 room_joined');
  assert.match(joined.code, /^[A-Z0-9]{5}$/, '房间码为 5 位大写字母+数字：' + joined.code);
  console.log('房间码样例：' + joined.code);

  const joiner = track(new WsClient(srv.base, DEV_FULL));
  await joiner.connect(1);
  joiner.send({ t: 'join_room', code: joined.code });
  const joined2 = await joiner.waitEvent((e) => e.t === 'room_joined', 5000, '加入者 room_joined');
  assert.equal(joined2.code, joined.code);
  assert.equal(joined2.players.length, 2);

  // 快照 100ms 级到达：连续 3 个 tick，间隔应在 50~300ms 内
  const ticks = [];
  await waitFor(() => {
    const s = joiner.lastSnapshot;
    if (s && (ticks.length === 0 || s.tick !== ticks[ticks.length - 1].tick)) {
      ticks.push({ tick: s.tick, at: s.at });
    }
    return ticks.length >= 3;
  }, { timeout: 5000, label: '收到 3 个快照 tick' });
  const gaps = [ticks[1].at - ticks[0].at, ticks[2].at - ticks[1].at];
  for (const g of gaps) assert.ok(g >= 50 && g <= 300, '快照间隔应在 50~300ms，实际 ' + g + 'ms');
  assert.equal(joiner.lastSnapshot.players.length, 2, '快照里应有 2 名玩家');
  assert.equal(joiner.lastSnapshot.stage, 'city');
  console.log('快照间隔：' + gaps.join('ms / ') + 'ms');

  // 房主离开 → 房间解散
  owner.send({ t: 'leave_room' });
  await owner.waitEvent((e) => e.t === 'room_left', 5000, '房主 room_left');
  await waitFor(async () => (await api(srv.base, 'GET', '/api/health')).rooms === 0, {
    timeout: 5000, label: 'health rooms 回 0',
  });
  owner.close();
  joiner.close();
});

test('房间：满 4 人后第 5 人进房拒绝', async () => {
  await createChar(srv.base, DEV_B, 1, 'SmokeRoomB', 'war');
  await createChar(srv.base, DEV_C, 1, 'SmokeRoomC', 'mage');
  await createChar(srv.base, DEV_D, 1, 'SmokeRoomD', 'tao');
  await createChar(srv.base, DEV_E, 1, 'SmokeRoomE', 'war');

  const owner = track(new WsClient(srv.base, DEV_CLAIM));
  await owner.connect(1);
  owner.send({ t: 'create_room' });
  const joined = await owner.waitEvent((e) => e.t === 'room_joined', 5000, '房主建房');
  const code = joined.code;

  const members = [];
  for (const dev of [DEV_B, DEV_C, DEV_D]) {
    const c = track(new WsClient(srv.base, dev));
    await c.connect(1);
    c.send({ t: 'join_room', code });
    await c.waitEvent((e) => e.t === 'room_joined', 5000, dev + ' 加入');
    members.push(c);
  }
  await waitFor(() => owner.lastSnapshot && owner.lastSnapshot.players.length === 4, {
    timeout: 5000, label: '快照里 4 名玩家',
  });

  const fifth = track(new WsClient(srv.base, DEV_E));
  await fifth.connect(1);
  const since = Date.now();
  fifth.send({ t: 'join_room', code });
  const err = await waitFor(() => fifth.errors.find((e) => e.at >= since), {
    timeout: 5000, label: '第 5 人收到 error',
  });
  assert.match(err.msg, /满/);
  console.log('满员拒绝：' + err.msg);

  for (const c of [owner, ...members, fifth]) c.close();
  await sleep(300);
  const h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.rooms, 0, '全部断开后房间应解散，实际 rooms=' + h.rooms);
});
