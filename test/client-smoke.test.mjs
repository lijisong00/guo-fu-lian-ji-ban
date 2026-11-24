'use strict';
// 客户端联调（HTTP）：世界制后 WS 协议已删除，进图走 /actions 的
// joinWorld / worldSync；静态文件：落地页 200、v89 游戏页 /game/ 需 cookie
// 才能进、无 cookie 302 回 /，旧简化版客户端文件已下线。
// 口径依据 docs/WORLD-DESIGN.md：比奇城为安全区不刷怪，传送后到比奇野外才有怪。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  makeTmpDir, seedIsolated, startServer, stopServer,
  getText, createChar,
} from './support/helpers.mjs';

const PORT = 18733;
const CLAIM = 'TEST123';
const DEV = 'clientSmokeDev1';

let dir;
let srv;

async function actions(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `client-${Math.random()}` }),
  });
  assert.equal(r.status, 200, `POST /actions ${action} 应返回 200`);
  const j = await r.json();
  if (j.error) throw new Error(`动作 ${action} 报错：${j.error}`);
  return j.data;
}

test.before(async () => {
  dir = makeTmpDir('client');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM);
  await createChar(srv.base, DEV, 1, 'ClientWar01', 'war');
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('世界 HTTP 走通：joinWorld → worldSync 有玩家与怪物；盟重土城安全区无怪', async () => {
  const me = { playerId: DEV, name: 'ClientWar01', classId: 'warrior', level: 1, maxHp: 100 };
  // 盟重土城（stage 21，2026-11-24 由盟重野外合并）安全区不刷怪
  const city = await actions(srv.base, DEV, 'joinWorld', { ...me, worldKey: '21:0', x: 0, y: 0 });
  assert.equal(city.ok, true);
  assert.equal(city.monsters.length, 0, '盟重土城安全区不刷怪');
  assert.equal(city.boss.state, 0, '盟重土城安全区无 Boss');
  await actions(srv.base, DEV, 'leaveWorld', { playerId: DEV, worldKey: '21:0' });

  // 比奇野外（stage 1）应有怪物
  const joined = await actions(srv.base, DEV, 'joinWorld', { ...me, worldKey: '1:0', x: 0, y: 0 });
  assert.equal(joined.ok, true);
  assert.equal(joined.worldKey, '1:0');
  assert.ok(joined.monsters.length > 0, '比奇野外应有怪物');
  assert.ok(joined.boss && joined.boss.state === 1, '比奇野外应有 Boss');
  assert.equal(joined.boss.name, '钉耙猫王');
  assert.equal(joined.memberCount, 1);

  // worldSync 轮询：仍在同一世界，玩家与怪物都在
  const sync = await actions(srv.base, DEV, 'worldSync', {
    playerId: DEV, worldKey: '1:0', x: 10, y: 0, knownRev: joined.rev,
  });
  assert.equal(sync.ok, true);
  assert.ok(sync.monsters.length > 0, 'worldSync 应带回视野内怪物');
  assert.equal(sync.memberCount, 1);
  console.log(`比奇野外进世界：视野内怪 ${sync.monsters.length} 只，Boss=${sync.boss.name}`);
  await actions(srv.base, DEV, 'leaveWorld', { playerId: DEV, worldKey: '1:0' });
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
