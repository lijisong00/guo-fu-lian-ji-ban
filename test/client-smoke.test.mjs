'use strict';
// 客户端联调：按 docs/protocol.md 的 WS 协议走一遍 auth → create_room → move →
// snapshot（收到玩家与怪物）；静态文件：落地页 200、v89 游戏页 /game/ 需 cookie
// 才能进、无 cookie 302 回 /，旧简化版客户端文件已下线。
// 口径依据 docs/protocol.md：WS 首条必须是 {t:'auth', deviceId, slot}，
// 快照每 100ms；比奇城为安全区不刷怪，传送后到比奇野外才有怪。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  sleep, waitFor, makeTmpDir, seedIsolated, startServer, stopServer,
  getText, createChar, WsClient,
} from './support/helpers.mjs';

const PORT = 18733;
const CLAIM = 'TEST123';
const DEV = 'clientSmokeDev1';

let dir;
let srv;
const clients = [];
function track(c) { clients.push(c); return c; }

test.before(async () => {
  dir = makeTmpDir('client');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM);
  await createChar(srv.base, DEV, 1, 'ClientWar01', 'war');
});

test.after(async () => {
  for (const c of clients) c.close();
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('WS 走通 app.js 协议：auth → create_room → teleport → move → snapshot 有玩家与怪物', async () => {
  const ws = track(new WsClient(srv.base, DEV));
  // 按 docs/protocol.md：连上后第一条发 {t:'auth', deviceId, slot}
  const authed = await ws.connect(1);
  assert.equal(authed.character.name, 'ClientWar01');
  assert.equal(authed.slot, 1);

  ws.send({ t: 'create_room' });
  const joined = await ws.waitEvent((e) => e.t === 'room_joined', 5000, 'room_joined');
  assert.match(joined.code, /^[A-Z0-9]{5}$/);
  console.log('客户端联调房间码：' + joined.code);

  // 比奇城安全区无怪；传送到比奇野外后快照应有怪物
  const citySnap = await ws.waitSnapshot((s) => s.stage === 'city', 5000, '比奇城快照');
  assert.equal(citySnap.monsters.length, 0, '比奇城安全区不刷怪');
  ws.send({ t: 'teleport', stageId: 'biqi_field' });
  const snap = await ws.waitSnapshot(
    (s) => s.stage === 'biqi_field' && s.monsters.length > 0,
    10000, '比奇野外快照有怪',
  );
  assert.ok(snap.monsters.length > 0, '比奇野外快照应有怪物');
  assert.ok(snap.players.length >= 1, '快照应有玩家');
  const me = snap.players.find((p) => p.name === 'ClientWar01');
  assert.ok(me, '快照玩家里应有自己');
  const x0 = me.x;

  // 摇杆移动：向右走 1.2 秒，x 应明显增大
  ws.send({ t: 'move', x: 1, y: 0 });
  await sleep(1200);
  ws.send({ t: 'move', x: 0, y: 0 });
  const moved = await ws.waitSnapshot(
    (s) => {
      const p = s.players.find((pp) => pp.name === 'ClientWar01');
      return p && p.x > x0 + 100 ? s : null;
    },
    5000, '移动后快照 x 增大',
  );
  const x1 = moved.players.find((p) => p.name === 'ClientWar01').x;
  assert.ok(x1 > x0 + 100, `向右移动后 x 应增大 100 以上：${x0} → ${x1}`);
  console.log(`移动验证：x ${x0} → ${x1}`);

  // ping/pong
  ws.send({ t: 'ping' });
  await ws.waitEvent((e) => e.t === 'pong', 5000, 'pong');
  ws.close();
});

test('拍卖行：在线玩家商店买完直接上架（不用先离房存盘）', async () => {
  // 回归：服务端拍卖三处曾只读 DB，内存里的新装备（商店刚买的、30 秒内未自动存盘）
  // 上架会报“背包里没有这件装备”，领取的金币/物品还会被下次自动存盘覆盖丢掉。
  // 修复后在线玩家走内存存档，离线玩家仍走 DB。
  const ws = track(new WsClient(srv.base, DEV));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, 'room_joined');
  ws.send({ t: 'shop' });
  const shop = await ws.waitEvent((e) => e.t === 'shop', 5000, 'shop 回包');
  // 买一件 1 级穿不上的（reqLv>1），这样它进背包而不是直接穿上身
  const cands = shop.items.filter((i) => i.reqLv > 1 && i.price <= 200).sort((a, b) => a.price - b.price);
  const cheapest = cands[0];
  assert.ok(cheapest, '应有买得起、且 1 级穿不上的装备（进背包才能上架）');
  ws.send({ t: 'buy', equipId: cheapest.id });
  const me = await ws.waitMe((m) => m.bag.length === 1, 5000, '买装备进背包');
  assert.ok(me.bag[0].uid, '背包装备应有 uid');
  // 关键：不离房、直接上架
  ws.send({ t: 'auction_create', uid: me.bag[0].uid, price: 50 });
  const created = await ws.waitEvent((e) => e.t === 'auction_created', 5000, 'auction_created');
  assert.equal(created.listing.price, 50);
  assert.equal(ws.errors.length, 0, '不应有 error：' + JSON.stringify(ws.errors));
  const me2 = await ws.waitMe((m) => m.bag.length === 0, 5000, '上架后背包空了');
  assert.equal(me2.bag.length, 0, '上架后装备应离开背包');
  ws.close();
});

test('回城：野外可直接传送回比奇城', async () => {
  // 回归：teleport 曾只能从比奇城出发，出城后永远回不来（商店/拍卖行全在城里）。
  const ws = track(new WsClient(srv.base, DEV));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, 'room_joined');
  ws.send({ t: 'teleport', stageId: 'biqi_field' });
  await ws.waitSnapshot((s) => s.stage === 'biqi_field', 5000, '先到野外');
  ws.send({ t: 'teleport', stageId: 'city' });
  const back = await ws.waitSnapshot((s) => s.stage === 'city', 5000, '回城快照');
  assert.equal(back.stage, 'city');
  assert.equal(back.monsters.length, 0, '比奇城安全区不刷怪');
  assert.equal(ws.errors.length, 0, '不应有 error：' + JSON.stringify(ws.errors));
  ws.close();
});

test('静态文件：v89 客户端 /game/ 需 cookie，旧简化版文件已下线', async () => {
  // 落地页仍为 200
  const home = await getText(srv.base, '/');
  assert.equal(home.status, 200);
  assert.match(home.text, /<title>热血传奇/);

  // 无 cookie：/game/ 302 回落地页
  const noCookie = await fetch(srv.base + '/game/', { redirect: 'manual' });
  assert.equal(noCookie.status, 302, '无 cookie 进 /game/ 应 302');
  assert.equal(noCookie.headers.get('location'), '/');
  await noCookie.text();

  // 有 cookie：/game/ 200，内容含游戏标题，并引用 ./assets/index-*.js
  const withCookie = await fetch(srv.base + '/game/', {
    headers: { Cookie: 'lg_device_id=' + DEV },
  });
  assert.equal(withCookie.status, 200, '有 cookie 进 /game/ 应 200');
  const gameHtml = await withCookie.text();
  assert.match(gameHtml, /热血传奇/);
  const bundleMatch = gameHtml.match(/\.\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  assert.ok(bundleMatch, '游戏页应引用 ./assets/index-*.js');
  const bundle = await getText(srv.base, '/game/assets/' + bundleMatch[1]);
  assert.equal(bundle.status, 200);
  assert.ok(bundle.text.length > 1000, '游戏 bundle 应有实质内容');
  const cssMatch = gameHtml.match(/\.\/assets\/(index-[A-Za-z0-9_-]+\.css)/);
  assert.ok(cssMatch, '游戏页应引用 ./assets/index-*.css');
  const css = await getText(srv.base, '/game/assets/' + cssMatch[1]);
  assert.equal(css.status, 200);
  assert.ok(css.text.length > 100, '游戏样式应有实质内容');

  // 旧简化版客户端已删除：/app.js、/data.js、/style.css 均为 404
  for (const p of ['/app.js', '/data.js', '/style.css']) {
    const r = await getText(srv.base, p);
    assert.equal(r.status, 404, p + ' 已下线，应为 404');
  }

  // 无外部请求：落地页与游戏页 0 处；bundle 与样式里只允许已知的惰性字符串
  //（w3.org 命名空间、hatch.invalid 占位、react.dev 错误链接、tailwindcss 注释）
  const extRef = /https?:\/\/[^\s"'<>)]+/g;
  for (const [name, text] of [['index.html', home.text], ['game/index.html', gameHtml]]) {
    const hits = text.match(extRef) || [];
    assert.equal(hits.length, 0, name + ' 里不应有外部 http(s):// 引用，实际 ' + hits.length + ' 处');
  }
  const inert = /^https?:\/\/(www\.w3\.org\/(1998\/Math\/MathML|1999\/xlink|2000\/svg|XML\/1998\/namespace)|hatch\.invalid\/|react\.dev\/errors\/|tailwindcss\.com)/;
  for (const [name, text] of [['game bundle', bundle.text], ['game css', css.text]]) {
    const hits = (text.match(extRef) || []).filter((u) => !inert.test(u));
    assert.equal(hits.length, 0, name + ' 里不应有业务外部引用，实际：' + JSON.stringify(hits));
  }
  console.log('静态文件 OK：/ 200、/game/ 有 cookie 200、无 cookie 302、旧三文件 404、bundle ' + bundleMatch[1] + ' 200');
});
