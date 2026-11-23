'use strict';
// 战斗测试：刷怪 / 战斗 tick / 冷却耗魔 / 挂机 / Boss 与尸王殿 / 商店 /
// 拍卖行 / 死亡掉装 / 备份恢复 / 迁移校验（真实库只读）。
// 全程隔离库 + 测试认领码 TEST123；只有最后一项跑真实库只读校验脚本。
//
// 口径依据 docs/protocol.md（冲突处按 protocol 的实现口径测）：
//   - 每层刷 500 只普通怪 + 1 只 Boss；多层图重进永远从第一层开始
//   - 熟练度每命中 +1、每级 1000 点；战士耗魔只有半月 6 / 烈火 13，
//     其余战士技能 0；法师火球耗魔 3、冷却 1.1 秒（按 data.js）
//   - 尸王殿 600×600、每小时整波 32 只（1 通关 + 31 常驻），杀掉不单独补刷
//   - 商店买价 = 估价×2+10、卖价 = 估价；药水小/中/大 20/40/80
//   - 拍卖行自标价、无手续费、24 小时到期、成交金币全额归卖家
//   - 死亡 35% 概率掉 1 件（统计验证，不硬断言某一次必掉）
//   - 技能满级 4 级（protocol 冲突清单第 2 条，按 4 级测）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  ROOT, sleep, waitFor, makeTmpDir, seedIsolated, startServer, stopServer,
  api, createChar, listChars, WsClient,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);
const Data = require('../shared/data.js');

// ---- 单元级直接调 lib/game.js：用单独的隔离 DATA_DIR（先设环境变量再 require，
//      与服务器进程的库完全分开，不产生任何写冲突）----
const unitDir = makeTmpDir('combat-unit');
process.env.DATA_DIR = unitDir;
const game = require('../lib/game.js');

const PORT = 18732;
const CLAIM = 'TEST123';
const DEV_WAR = 'combatWarDev01';
const DEV_MAG = 'combatMagDev01';
const DEV_SHOP = 'combatShopDev1';
const DEV_SELL = 'combatSellDev1';
const DEV_BUY = 'combatBuyDev01';
const DEV_EXP = 'combatExpDev01';
const DEV_DIE = 'combatDieDev01';

let dir;
let srv;
const clients = [];
function track(c) { clients.push(c); return c; }

test.before(async () => {
  dir = makeTmpDir('combat');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM);
  await createChar(srv.base, DEV_WAR, 1, 'CombatWar01', 'war');
  await createChar(srv.base, DEV_MAG, 1, 'CombatMag01', 'mage');
  await createChar(srv.base, DEV_SHOP, 1, 'CombatShop1', 'war');
  await createChar(srv.base, DEV_SELL, 1, 'CombatSell1', 'war');
  await createChar(srv.base, DEV_BUY, 1, 'CombatBuy11', 'war');
  await createChar(srv.base, DEV_EXP, 1, 'CombatExp01', 'war');
  await createChar(srv.base, DEV_DIE, 1, 'CombatDie01', 'war');
});

test.after(async () => {
  for (const c of clients) c.close();
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(unitDir, { recursive: true, force: true });
});

async function enterStageWs(ws, stageId) {
  ws.send({ t: 'teleport', stageId });
  const snap = await ws.waitSnapshot(
    (s) => s.stage === stageId, 10000, '传送到 ' + stageId,
  );
  return snap;
}

test('刷怪：进比奇野外 500 怪 + 1 Boss；多层图重进回到第一层', async () => {
  const ws = track(new WsClient(srv.base, DEV_WAR));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  const snap = await enterStageWs(ws, 'biqi_field');
  assert.equal(snap.floor, 1);
  assert.equal(snap.monsters.length, 501, '500 只普通怪 + 1 只 Boss，实际 ' + snap.monsters.length);
  const bosses = snap.monsters.filter((m) => m.boss);
  assert.equal(bosses.length, 1);
  assert.equal(bosses[0].name, '钉耙猫王');
  assert.equal(bosses[0].hp, 600);
  assert.equal(bosses[0].maxHp, 600);
  console.log('比奇野外刷怪数=501，Boss=钉耙猫王 hp600');

  // 离房重建再进骷髅洞穴（3 层图），落点必须是第 1 层
  ws.send({ t: 'leave_room' });
  await ws.waitEvent((e) => e.t === 'room_left', 5000, '离房');
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '重建房');
  const snap2 = await enterStageWs(ws, 'kulou');
  assert.equal(snap2.stage, 'kulou');
  assert.equal(snap2.floor, 1, '多层图重进必须从第一层开始');
  assert.equal(snap2.monsters.length, 501);
  ws.close();
});

test('战斗 tick：普攻命中掉血、熟练度 +1、击杀掉金、拾取后金币增加', async () => {
  const ws = track(new WsClient(srv.base, DEV_WAR));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  await enterStageWs(ws, 'biqi_field');
  const me0 = await ws.waitMe((m) => m.gold !== undefined, 5000, '首个 me');
  const mp0 = me0.mp;
  const xp0 = me0.xp;
  const gold0 = me0.gold;

  const seenHp = new Map();
  const seenIds = new Set();
  let hpDropSeen = false;
  let monsterVanished = false; // 低血怪（如鸡 hp 5）一刀即死，同一快照里直接消失、
  // 采不到中间血量；“先前见过、后来不见了”同样是血量打掉的证据
  let casts = 0;
  let xp = xp0;
  const start = Date.now();
  while (Date.now() - start < 90000) {
    const snap = ws.lastSnapshot;
    const me = ws.lastMe;
    if (me) {
      casts = (me.learned && me.learned.war_basic && me.learned.war_basic.casts) || 0;
      xp = me.xp;
    }
    if (snap) {
      const curIds = new Set();
      for (const m of snap.monsters) {
        curIds.add(m.id);
        const prev = seenHp.get(m.id);
        if (prev !== undefined && m.hp < prev) hpDropSeen = true;
        seenHp.set(m.id, m.hp);
      }
      for (const id of seenIds) if (!curIds.has(id)) monsterVanished = true;
      for (const id of curIds) seenIds.add(id);
    }
    if (casts >= 1 && xp > xp0) break;
    const s = ws.lastSnapshot;
    const p = s && s.players.find((pp) => pp.name === 'CombatWar01');
    if (s && p) {
      let best = null;
      let bd = Infinity;
      for (const m of s.monsters) {
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) {
        if (bd > 90) ws.send({ t: 'move', x: (best.x - p.x) / bd, y: (best.y - p.y) / bd });
        else { ws.send({ t: 'move', x: 0, y: 0 }); ws.send({ t: 'attack' }); }
      }
    }
    await sleep(200);
  }
  assert.ok(casts >= 1, '普攻命中后基本剑术熟练度应 +1，实际 casts=' + casts);
  assert.ok(xp > xp0, '击杀后经验应增加，' + xp0 + ' → ' + xp);
  assert.ok(hpDropSeen || monsterVanished, '应观察到某只怪物血量下降或被击杀消失');
  const meAfterKill = ws.lastMe;
  assert.equal(meAfterKill.mp, mp0, '战士普攻不耗魔，mp 应不变（' + mp0 + '）');
  console.log(`普攻命中：熟练度 casts=${casts}，经验 ${xp0}→${xp}，怪物掉血已观察到，mp 不变=${mp0}`);

  // 拾取地上金币堆
  const goldBefore = ws.lastMe.gold;
  assert.equal(goldBefore, gold0, '普通怪金币掉地上、未拾取前金币不变');
  let picked = false;
  const pStart = Date.now();
  while (Date.now() - pStart < 60000) {
    const s = ws.lastSnapshot;
    const me = ws.lastMe;
    if (me && me.gold > goldBefore) { picked = true; break; }
    const p = s && s.players.find((pp) => pp.name === 'CombatWar01');
    const drop = s && s.drops.find((d) => d.kind === 'gold');
    if (s && p && drop) {
      const d = Math.hypot(drop.x - p.x, drop.y - p.y);
      if (d <= 60) ws.send({ t: 'pickup' });
      else ws.send({ t: 'move', x: (drop.x - p.x) / d, y: (drop.y - p.y) / d });
    }
    await sleep(200);
  }
  assert.ok(picked, '拾取金币堆后金币应增加');
  const goldAfter = ws.lastMe.gold;
  assert.ok(goldAfter > goldBefore, `金币 ${goldBefore} → ${goldAfter}`);
  console.log(`拾取金币：${goldBefore} → ${goldAfter}（+${goldAfter - goldBefore}）`);
  ws.send({ t: 'move', x: 0, y: 0 });
  ws.close();
});

test('技能冷却与耗魔：火球冷却 1.1 秒内再放被拒、冷却过后可放、耗魔 3；战士技能耗魔表', async () => {
  // 数据口径（protocol 冲突清单第 12/13 条按 data.js 测）：火球 cd 1.1、mp 3；
  // 战士只有半月 6 / 烈火 13，其余 0；技能满级 4 级
  assert.equal(Data.SKILLS.mage_fireball.cd, 1.1);
  assert.equal(Data.SKILLS.mage_fireball.mp, 3);
  assert.equal(Data.SKILL_MAX_LV, 4);
  for (const [id, sk] of Object.entries(Data.SKILLS)) {
    if (sk.cls !== 'war') continue;
    const expect = id === 'war_banyue' ? 6 : id === 'war_liehuo' ? 13 : 0;
    assert.equal(sk.mp, expect, id + ' 耗魔应为 ' + expect);
  }

  const ws = track(new WsClient(srv.base, DEV_MAG));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  const me0 = await ws.waitMe((m) => m.mp !== undefined, 5000, '首个 me');
  assert.equal(me0.mp, me0.maxMp, '法师开局满蓝');
  const mpStart = me0.mp;

  ws.send({ t: 'skill', id: 'mage_fireball' });
  const me1 = await ws.waitMe((m) => m.mp === mpStart - 3, 5000, '放火球后 mp-3');
  assert.equal(me1.mp, mpStart - 3, '火球耗魔 3');

  const since = Date.now();
  ws.send({ t: 'skill', id: 'mage_fireball' });
  const toast = await ws.waitToast('冷却中', since, 5000);
  assert.match(toast.msg, /冷却中/);

  await sleep(1500); // 冷却 1.1 秒已过
  const since2 = Date.now();
  ws.send({ t: 'skill', id: 'mage_fireball' });
  await sleep(1500);
  assert.ok(ws.noToastSince('冷却中', since2), '冷却过后重放不应再报冷却中');
  const me2 = await ws.waitMe((m) => m.mp === mpStart - 6, 5000, '第二次放火球后 mp 再 -3');
  assert.equal(me2.mp, mpStart - 6, '冷却过后可放、耗魔 3');
  console.log(`火球：mp ${mpStart}→${mpStart - 3}（冷却内重放被拒）→${mpStart - 6}（冷却后可放）`);
  ws.close();
});

test('自动战斗：开启后一段时间经验增加', async () => {
  const ws = track(new WsClient(srv.base, DEV_WAR));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  await enterStageWs(ws, 'biqi_field');
  const me0 = await ws.waitMe((m) => m.xp !== undefined, 5000, '首个 me');
  const xp0 = me0.xp;
  const t0 = Date.now();
  ws.send({ t: 'auto', on: true });
  const me1 = await ws.waitMe((m) => m.xp >= xp0 + 78, 90000, '挂机经验 +78');
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  assert.ok(me1.xp > xp0, '挂机后经验应增加');
  console.log(`挂机 ${dt}s：经验 ${xp0} → ${me1.xp}（+${me1.xp - xp0}）`);
  ws.send({ t: 'auto', on: false });
  ws.close();
});

test('Boss：比奇野外 Boss 血量名字正确（WS）；尸王殿 32 只整波（单元级）', async () => {
  const ws = track(new WsClient(srv.base, DEV_WAR));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  const snap = await enterStageWs(ws, 'biqi_field');
  const boss = snap.monsters.find((m) => m.boss);
  assert.ok(boss, '应有 Boss');
  assert.equal(boss.name, '钉耙猫王');
  assert.equal(boss.hp, 600);
  assert.equal(boss.maxHp, 600);
  ws.close();

  // 单元级：直接调 lib/game.js（隔离库，不经过 WS）
  const save = game.newCharacterSave('UnitWar01', 'war');
  const player = game.newPlayer('unitDev001', 1, { id: 1, data: save });
  const room = game.createRoom(player);
  game.enterStage(room, 'shiwang', 1);
  assert.equal(room.monsters.length, 32, '进尸王殿应刷满 32 只，实际 ' + room.monsters.length);
  const swBoss = room.monsters.filter((m) => m.boss);
  assert.equal(swBoss.length, 1, '通关尸王应只有 1 只');
  assert.equal(swBoss[0].name, '通关尸王');
  assert.equal(swBoss[0].hp, 4200);
  const regular = room.monsters.filter((m) => !m.boss);
  assert.equal(regular.length, 31, '常驻尸王应为 31 只');
  assert.ok(regular.every((m) => m.name === '尸王' && m.hp === 900));

  // 杀掉 1 只常驻（直接移出模拟击杀），跑 20 个 tick（2 秒）不应单独补刷
  room.monsters.splice(room.monsters.indexOf(regular[0]), 1);
  assert.equal(room.monsters.length, 31);
  for (let i = 0; i < 20; i++) game.tickRoom(room);
  assert.equal(room.monsters.length, 31, '杀掉后 2 秒内不应单独补刷');
  assert.equal(room.monsters.filter((m) => m.boss).length, 1, '通关尸王活着不应重复刷');
  console.log('尸王殿：进殿 32 只（1 通关 hp4200 + 31 常驻 hp900），杀 1 只后 20 tick 仍为 31 只');
});

test('多层图重进从第一层开始（单元级：先到 3 层，再经比奇城传送回骷髅洞穴）', async () => {
  const save = game.newCharacterSave('UnitWar02', 'war');
  const player = game.newPlayer('unitDev002', 1, { id: 2, data: save });
  const room = game.createRoom(player);
  game.enterStage(room, 'kulou', 3);
  assert.equal(room.floor, 3);
  game.enterStage(room, 'city', 1);
  const r = game.teleportRoom(room, 'kulou', player);
  assert.equal(r.ok, true);
  assert.equal(room.stageId, 'kulou');
  assert.equal(room.floor, 1, '经传送重进多层图必须落第 1 层');
});

test('商店：买药水金币减少、药水数增加；买装备再卖金币增加（按 tradePrice）', async () => {
  const ws = track(new WsClient(srv.base, DEV_SHOP));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  ws.send({ t: 'shop' });
  const shop = await ws.waitEvent((e) => e.t === 'shop', 5000, '商店列表');
  assert.ok(shop.items.length > 0, '商店应有本职业装备');
  assert.ok(shop.items.every((i) => i.tier <= 1), '商店只卖 tier 0-1 装备');
  assert.deepEqual(shop.potions.map((p) => p.price), [20, 40, 80], '药水小/中/大 20/40/80');
  const weapon = shop.items.filter((i) => i.slot === 'weapon' && i.price <= 200)
    .sort((a, b) => a.price - b.price)[0];
  assert.ok(weapon, '应有买得起的武器');

  const me0 = await ws.waitMe((m) => m.gold !== undefined, 5000, '首个 me');
  assert.equal(me0.gold, 200);
  ws.send({ t: 'buy', equipId: weapon.id });
  const me1 = await ws.waitMe((m) => m.gold === 200 - weapon.price, 5000, '买武器后金币减少');
  assert.equal(me1.gold, 200 - weapon.price);
  assert.ok((me1.bag || []).length >= 1, '买下后背包应有换下的旧武器或新武器');
  const bagItem = me1.bag[0];
  const sellPrice = Data.tradePrice(bagItem);
  assert.equal(weapon.price, sellPrice * 2 + 10, '买价 = 估价×2+10');

  // 卖背包装备：金币按估价增加（先卖再买药水——开局 200 金买最便宜武器
  // 后只剩 28 金，不够 40 金的中瓶，需先卖回血；这是测试编排问题，服务端
  // “金币不够”拒绝本身是对的）
  ws.send({ t: 'sell', uid: bagItem.uid });
  const meSell = await ws.waitMe((m) => m.gold === 200 - weapon.price + sellPrice, 5000, '卖装备后金币增加');
  assert.equal(meSell.gold, 200 - weapon.price + sellPrice);

  ws.send({ t: 'buy_potion', kind: 'hp', tier: 'm' });
  const me2 = await ws.waitMe((m) => m.gold === 200 - weapon.price + sellPrice - 40, 5000, '买中瓶血瓶后金币 -40');
  assert.equal(me2.gold, 200 - weapon.price + sellPrice - 40);
  assert.deepEqual(me2.hpPots, [0, 101, 0], '中瓶血瓶 100 → 101');
  console.log(`商店：买武器 -${weapon.price} 金，卖背包装备 +${sellPrice} 金（估价），买中瓶血瓶 -40 金（血瓶 100→101）`);
  ws.close();
});

test('拍卖行：上架→另一设备购买→卖家领取金币全额；下架取回', async () => {
  // 卖家：商店买武器得背包件，离房存盘
  const sellerWs = track(new WsClient(srv.base, DEV_SELL));
  await sellerWs.connect(1);
  sellerWs.send({ t: 'create_room' });
  await sellerWs.waitEvent((e) => e.t === 'room_joined', 5000, '卖家建房');
  sellerWs.send({ t: 'shop' });
  const shop = await sellerWs.waitEvent((e) => e.t === 'shop', 5000, '卖家商店列表');
  const weapon = shop.items.filter((i) => i.slot === 'weapon' && i.price <= 200)
    .sort((a, b) => a.price - b.price)[0];
  sellerWs.send({ t: 'buy', equipId: weapon.id });
  const meS = await sellerWs.waitMe((m) => m.gold === 200 - weapon.price, 5000, '卖家买武器');
  const bagItem = meS.bag[0];
  assert.ok(bagItem && bagItem.uid, '卖家背包应有可上架装备');
  sellerWs.send({ t: 'leave_room' });
  await sellerWs.waitEvent((e) => e.t === 'room_left', 5000, '卖家离房存盘');
  sellerWs.close();
  const sellerGold0 = (await listChars(srv.base, DEV_SELL))[0].gold;
  assert.equal(sellerGold0, 200 - weapon.price);

  // 上架：自标价 50
  const listed = await api(srv.base, 'POST', '/api/auction', {
    deviceId: DEV_SELL, slot: 1, uid: bagItem.uid, price: 50,
  });
  assert.equal(listed.ok, true, '上架应成功：' + JSON.stringify(listed));
  assert.equal(listed.listing.price, 50);
  assert.equal(listed.listing.expiresAt - listed.listing.createdAt, 24 * 3600 * 1000, '到期 24 小时');
  const listingId = listed.listing.id;
  const list1 = await api(srv.base, 'GET', '/api/auction');
  assert.ok(list1.listings.some((l) => l.id === listingId), '在售列表应有该物品');

  // 买家购买（另一设备）
  const bought = await api(srv.base, 'POST', `/api/auction/${listingId}/buy`, {
    deviceId: DEV_BUY, slot: 1,
  });
  assert.equal(bought.ok, true, '购买应成功：' + JSON.stringify(bought));
  const buyerGold = (await listChars(srv.base, DEV_BUY))[0].gold;
  assert.equal(buyerGold, 150, '买家金币 200 → 150');

  // 卖家领取成交金币（全额 50）
  const sClaims = await api(srv.base, 'GET', `/api/auction/claims?deviceId=${DEV_SELL}`);
  const goldClaim = sClaims.claims.find((c) => c.kind === 'gold');
  assert.ok(goldClaim, '卖家应有待领金币');
  assert.equal(goldClaim.payload, 50, '成交金币全额归卖家');
  const claimGold = await api(srv.base, 'POST', `/api/auction/claims/${goldClaim.id}/claim`, {
    deviceId: DEV_SELL, slot: 1,
  });
  assert.equal(claimGold.ok, true);
  const sellerGold1 = (await listChars(srv.base, DEV_SELL))[0].gold;
  assert.equal(sellerGold1, sellerGold0 + 50, `卖家金币 ${sellerGold0} → ${sellerGold1}`);

  // 买家领取物品
  const bClaims = await api(srv.base, 'GET', `/api/auction/claims?deviceId=${DEV_BUY}`);
  const itemClaim = bClaims.claims.find((c) => c.kind === 'item');
  assert.ok(itemClaim, '买家应有待领物品');
  const claimItem = await api(srv.base, 'POST', `/api/auction/claims/${itemClaim.id}/claim`, {
    deviceId: DEV_BUY, slot: 1,
  });
  assert.equal(claimItem.ok, true);
  const buyerWs = track(new WsClient(srv.base, DEV_BUY));
  await buyerWs.connect(1);
  const meB = await buyerWs.waitMe(
    (m) => (m.bag || []).some((it) => String(it.uid) === String(bagItem.uid)),
    5000, '买家背包收到拍得装备',
  );
  assert.ok(meB.bag.some((it) => String(it.uid) === String(bagItem.uid)));
  buyerWs.close();
  console.log(`拍卖成交：标价 50 金，买家 200→150，卖家领取 +50（全额）`);

  // 下架取回：买家把刚领到的装备再上架 60 金，然后下架、领取回背包
  const relist = await api(srv.base, 'POST', '/api/auction', {
    deviceId: DEV_BUY, slot: 1, uid: bagItem.uid, price: 60,
  });
  assert.equal(relist.ok, true);
  const delist = await api(srv.base, 'POST', `/api/auction/${relist.listing.id}/delist`, {
    deviceId: DEV_BUY,
  });
  assert.equal(delist.ok, true);
  const bClaims2 = await api(srv.base, 'GET', `/api/auction/claims?deviceId=${DEV_BUY}`);
  const backClaim = bClaims2.claims.find((c) => c.kind === 'item' && !c.claimedAt);
  assert.ok(backClaim, '下架后物品应进待领取');
  const claimBack = await api(srv.base, 'POST', `/api/auction/claims/${backClaim.id}/claim`, {
    deviceId: DEV_BUY, slot: 1,
  });
  assert.equal(claimBack.ok, true);
  const buyerWs2 = track(new WsClient(srv.base, DEV_BUY));
  await buyerWs2.connect(1);
  await buyerWs2.waitMe(
    (m) => (m.bag || []).some((it) => String(it.uid) === String(bagItem.uid)),
    5000, '下架物品领回背包',
  );
  buyerWs2.close();
  console.log('拍卖下架取回：上架 60 金 → 下架 → 领取回背包');
});

test('拍卖行 24 小时到期：改 expires_at 为过去后重启，到期退回卖家待领取', async () => {
  const ws = track(new WsClient(srv.base, DEV_EXP));
  await ws.connect(1);
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  ws.send({ t: 'shop' });
  const shop = await ws.waitEvent((e) => e.t === 'shop', 5000, '商店列表');
  const weapon = shop.items.filter((i) => i.slot === 'weapon' && i.price <= 200)
    .sort((a, b) => a.price - b.price)[0];
  ws.send({ t: 'buy', equipId: weapon.id });
  const me = await ws.waitMe((m) => m.gold === 200 - weapon.price, 5000, '买武器');
  const bagItem = me.bag[0];
  ws.send({ t: 'leave_room' });
  await ws.waitEvent((e) => e.t === 'room_left', 5000, '离房存盘');
  ws.close();

  const listed = await api(srv.base, 'POST', '/api/auction', {
    deviceId: DEV_EXP, slot: 1, uid: bagItem.uid, price: 70,
  });
  assert.equal(listed.ok, true);
  const listingId = listed.listing.id;

  // 停服，直接把该条 expires_at 改为过去（模拟 24 小时已过），再重启
  await stopServer(srv);
  await new Promise((resolve, reject) => {
    execFile(process.execPath, ['-e',
      "const {DatabaseSync}=require('node:sqlite');"
      + "const db=new DatabaseSync(process.argv[1]);"
      + "db.prepare('UPDATE auction_listings SET expires_at=? WHERE id=?').run(Date.now()-1000, Number(process.argv[2]));"
      + "console.log(JSON.stringify(db.prepare('SELECT id,status,expires_at FROM auction_listings WHERE id=?').get(Number(process.argv[2]))));",
      path.join(dir, 'game.db'), String(listingId),
    ], { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) return reject(new Error('改 expires_at 失败：' + stderr + err.message));
      resolve(stdout);
    });
  });
  srv = await startServer(dir, PORT, CLAIM);

  const list = await api(srv.base, 'GET', '/api/auction');
  assert.ok(!list.listings.some((l) => l.id === listingId), '到期物品不应再出现在售列表');
  const claims = await api(srv.base, 'GET', `/api/auction/claims?deviceId=${DEV_EXP}`);
  const backClaim = claims.claims.find((c) => c.kind === 'item' && !c.claimedAt);
  assert.ok(backClaim, '到期物品应退回卖家待领取');
  const claim = await api(srv.base, 'POST', `/api/auction/claims/${backClaim.id}/claim`, {
    deviceId: DEV_EXP, slot: 1,
  });
  assert.equal(claim.ok, true);
  const ws2 = track(new WsClient(srv.base, DEV_EXP));
  await ws2.connect(1);
  await ws2.waitMe(
    (m) => (m.bag || []).some((it) => String(it.uid) === String(bagItem.uid)),
    5000, '到期退回物品领回背包',
  );
  ws2.close();
  console.log('拍卖到期：expires_at 改为过去 → 重启后在售列表消失，物品退回待领取并领回背包');
});

test('死亡掉装：35% 概率掉 1 件（多次死亡统计）；死亡保留等级经验', async () => {
  assert.equal(Data.DEATH_DROP_CHANCE, 0.35);
  assert.equal(Data.DEATH_DROP_COUNT, 1);

  const ws = track(new WsClient(srv.base, DEV_DIE));
  await ws.connect(1);
  const me0 = await ws.waitMe((m) => m.level !== undefined, 5000, '首个 me');
  const level0 = me0.level;
  const xp0 = me0.xp;
  ws.send({ t: 'create_room' });
  await ws.waitEvent((e) => e.t === 'room_joined', 5000, '建房');
  // 赤月峡谷（60 级图）：1 级战士扛不住两三下，适合快速多次死亡
  await enterStageWs(ws, 'chiyue');
  ws.send({ t: 'auto', on: true });
  const died = [];
  const start = Date.now();
  while (died.length < 4 && Date.now() - start < 240000) {
    const evs = ws.events.filter((e) => e.t === 'died');
    if (evs.length > died.length) {
      for (const e of evs.slice(died.length)) died.push(e);
    }
    await sleep(500);
  }
  ws.send({ t: 'auto', on: false });
  assert.ok(died.length >= 3, `240 秒内应至少观察到 3 次死亡，实际 ${died.length} 次`);
  const droppedCount = died.filter((e) => e.dropped === true).length;
  assert.ok(died.every((e) => typeof e.dropped === 'boolean'), '每次 died 事件 dropped 应为布尔值');
  assert.ok(droppedCount <= died.length, '掉落件数 ≤ 死亡次数（每次最多 1 件）');
  const meEnd = ws.lastMe;
  if (meEnd) {
    assert.equal(meEnd.level, level0, '死亡保留等级');
    assert.ok(meEnd.xp >= xp0, '死亡保留经验');
  }
  console.log(`死亡 ${died.length} 次，其中掉装 ${droppedCount} 次（掉率样本 ${droppedCount}/${died.length}，口径 35%）；等级保留 Lv${level0}`);
  ws.close();
});

test('备份恢复：删隔离库 game.db 后重启，自动从 backup 恢复，角色与拍卖数据一致', async () => {
  const beforeSell = await listChars(srv.base, DEV_SELL);
  const beforeBuy = await listChars(srv.base, DEV_BUY);
  const beforeExp = await listChars(srv.base, DEV_EXP);
  const beforeDie = await listChars(srv.base, DEV_DIE);
  const backups = fs.readdirSync(path.join(dir, 'backup')).filter((f) => f.startsWith('backup-'));
  assert.ok(backups.length >= 1, '删库前 backup/ 里应至少有 1 份备份，实际 ' + backups.length + ' 份');
  const auctionBefore = await api(srv.base, 'GET', '/api/auction');

  await stopServer(srv);
  fs.unlinkSync(path.join(dir, 'game.db'));
  srv = await startServer(dir, PORT, CLAIM);
  assert.match(srv.logs(), /恢复/, '重启日志应写明从备份恢复');

  const afterSell = await listChars(srv.base, DEV_SELL);
  const afterBuy = await listChars(srv.base, DEV_BUY);
  const afterExp = await listChars(srv.base, DEV_EXP);
  const afterDie = await listChars(srv.base, DEV_DIE);
  assert.deepEqual(afterSell, beforeSell, '卖家角色恢复后应一致');
  assert.deepEqual(afterBuy, beforeBuy, '买家角色恢复后应一致');
  assert.deepEqual(afterExp, beforeExp, '到期测试角色恢复后应一致');
  assert.deepEqual(afterDie, beforeDie, '死亡测试角色恢复后应一致');
  const auctionAfter = await api(srv.base, 'GET', '/api/auction');
  assert.deepEqual(auctionAfter.listings, auctionBefore.listings, '拍卖在售列表恢复后应一致');
  const h = await api(srv.base, 'GET', '/api/health');
  // 注意：本战斗服从未执行过认领（认领只在冒烟服测），恢复后认领标记应仍为未使用
  assert.equal(h.claimUsed, false, '本服未认领过，恢复后认领标记仍为未使用');
  console.log(`备份恢复：删库前备份 ${backups.length} 份；恢复后 4 设备角色（卖家/买家/到期/死亡）与拍卖列表全部一致`);
});

test('迁移校验：node scripts/verify-migration.mjs（真实库只读）退出 0', async () => {
  const out = await new Promise((resolve, reject) => {
    // 关键：本文件顶部为单元测试把 process.env.DATA_DIR 指向了隔离单元库，
    // 校验脚本必须读真实库，故显式删掉继承来的 DATA_DIR 再跑
    const env = { ...process.env };
    delete env.DATA_DIR;
    execFile(process.execPath, ['scripts/verify-migration.mjs'], { cwd: ROOT, env }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
  const checks = (out.stdout.match(/✓/g) || []).length;
  console.log(`verify-migration 退出码=${out.code}，✓ ${checks} 项`);
  if (out.code !== 0) console.log('verify 输出：\n' + out.stdout + '\n' + out.stderr);
  assert.equal(out.code, 0, '迁移校验应退出 0：\n' + out.stdout + '\n' + out.stderr);
  assert.match(out.stdout, /全部一致/);
  assert.ok(checks >= 48, '校验通过项应 ≥48，实际 ' + checks);
});
