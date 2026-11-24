'use strict';
// 战斗相关服务端测试：数据口径 / 拍卖行（HTTP）/ 备份恢复 / 迁移校验。
// 全程隔离库 + 测试认领码 TEST123；只有最后一项跑真实库只读校验脚本。
//
// 世界制后（Phase 6）旧 WS 房间战斗引擎（lib/game.js）已删除：刷怪、战斗 tick、
// 技能冷却、挂机、商店、死亡掉装等实时战斗行为改由服务端世界引擎（lib/world.js）
// + artifact 客户端本地结算，不再经过本服务端 WS——相关旧用例已移入
// test/world.test.mjs（世界引擎）与客户端；本文件只保留仍走服务端的口径。
//
// 口径依据 docs/protocol.md：
//   - 熟练度每命中 +1、每级 1000 点；战士耗魔只有半月 6 / 烈火 13，
//     其余战士技能 0；法师火球耗魔 3、冷却 1.1 秒（按 data.js）
//   - 尸王殿 600×600、每小时整波 32 只（1 通关 + 31 常驻），见 world.test.mjs
//   - 拍卖行自标价、无手续费、24 小时到期、成交金币全额归卖家
//   - 死亡 35% 概率掉 1 件（数据口径断言；掉落结算在客户端）
//   - 技能满级 4 级
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  ROOT, sleep, waitFor, makeTmpDir, seedIsolated, startServer, stopServer,
  api, createChar, listChars,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);
const Data = require('../shared/data.js');

const PORT = 18732;
const CLAIM = 'TEST123';
const DEV_SELL = 'combatSellDev1';
const DEV_BUY = 'combatBuyDev01';
const DEV_EXP = 'combatExpDev01';
const DEV_DIE = 'combatDieDev01';

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
    body: JSON.stringify({ action, args, actionCallId: `combat-${Math.random()}` }),
  });
  assert.equal(r.status, 200, `POST /actions ${action} 应返回 200`);
  const j = await r.json();
  if (j.error) throw new Error(`动作 ${action} 报错：${j.error}`);
  return j.data;
}

async function getBag(base, deviceId, slot = 1) {
  const r = await actions(base, deviceId, 'getSave', { slot });
  return JSON.parse(r.save).bag || [];
}

test.before(async () => {
  dir = makeTmpDir('combat');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, CLAIM);
  await createChar(srv.base, DEV_SELL, 1, 'CombatSell1', 'war');
  await createChar(srv.base, DEV_BUY, 1, 'CombatBuy11', 'war');
  await createChar(srv.base, DEV_EXP, 1, 'CombatExp01', 'war');
  await createChar(srv.base, DEV_DIE, 1, 'CombatDie01', 'war');
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('数据口径：技能冷却与耗魔表、死亡掉装概率（data.js）', async () => {
  // 数据口径：火球 cd 1.1、mp 3；战士只有半月 6 / 烈火 13，其余 0；技能满级 4 级
  assert.equal(Data.SKILLS.mage_fireball.cd, 1.1);
  assert.equal(Data.SKILLS.mage_fireball.mp, 3);
  assert.equal(Data.SKILL_MAX_LV, 4);
  for (const [id, sk] of Object.entries(Data.SKILLS)) {
    if (sk.cls !== 'war') continue;
    const expect = id === 'war_banyue' ? 6 : id === 'war_liehuo' ? 13 : 0;
    assert.equal(sk.mp, expect, id + ' 耗魔应为 ' + expect);
  }
  assert.equal(Data.DEATH_DROP_CHANCE, 0.35);
  assert.equal(Data.DEATH_DROP_COUNT, 1);
  console.log('数据口径通过：火球 cd1.1/mp3、战士耗魔半月6/烈火13/其余0、满级4、死亡掉装 35%×1');
});

test('拍卖行：上架→另一设备购买→卖家领取金币全额；下架取回', async () => {
  // 卖家背包预置一件武器（经 putSave 写库，模拟商店买完已存盘）
  const weapon = { uid: 1001, name: '测试剑', slot: 'weapon', tier: 1, price: 0 };
  await actions(srv.base, DEV_SELL, 'putSave', {
    slot: 1, data: JSON.stringify(saveObj('CombatSell1', 'warrior', 1, 200, [weapon])),
  });
  assert.deepEqual((await getBag(srv.base, DEV_SELL)).map((i) => i.uid), [1001]);

  // 上架：自标价 50
  const listed = await api(srv.base, 'POST', '/api/auction', {
    deviceId: DEV_SELL, slot: 1, uid: weapon.uid, price: 50,
  });
  assert.equal(listed.ok, true, '上架应成功：' + JSON.stringify(listed));
  assert.equal(listed.listing.price, 50);
  assert.equal(listed.listing.expiresAt - listed.listing.createdAt, 24 * 3600 * 1000, '到期 24 小时');
  const listingId = listed.listing.id;
  const list1 = await api(srv.base, 'GET', '/api/auction');
  assert.ok(list1.listings.some((l) => l.id === listingId), '在售列表应有该物品');
  assert.deepEqual(await getBag(srv.base, DEV_SELL), [], '上架后背包应空了');

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
  assert.equal(sellerGold1, 250, `卖家金币 200 → 领成交金后 250，实际 ${sellerGold1}`);

  // 买家领取物品
  const bClaims = await api(srv.base, 'GET', `/api/auction/claims?deviceId=${DEV_BUY}`);
  const itemClaim = bClaims.claims.find((c) => c.kind === 'item');
  assert.ok(itemClaim, '买家应有待领物品');
  const claimItem = await api(srv.base, 'POST', `/api/auction/claims/${itemClaim.id}/claim`, {
    deviceId: DEV_BUY, slot: 1,
  });
  assert.equal(claimItem.ok, true);
  assert.ok((await getBag(srv.base, DEV_BUY)).some((it) => String(it.uid) === String(weapon.uid)),
    '买家背包应收到拍得装备');
  console.log('拍卖成交：标价 50 金，买家 200→150，卖家领取 +50（全额）');

  // 下架取回：买家把刚领到的装备再上架 60 金，然后下架、领取回背包
  const relist = await api(srv.base, 'POST', '/api/auction', {
    deviceId: DEV_BUY, slot: 1, uid: weapon.uid, price: 60,
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
  assert.ok((await getBag(srv.base, DEV_BUY)).some((it) => String(it.uid) === String(weapon.uid)),
    '下架物品应领回背包');
  console.log('拍卖下架取回：上架 60 金 → 下架 → 领取回背包');
});

test('拍卖行 24 小时到期：改 expires_at 为过去后重启，到期退回卖家待领取', async () => {
  const weapon = { uid: 1002, name: '测试刀', slot: 'weapon', tier: 1, price: 0 };
  await actions(srv.base, DEV_EXP, 'putSave', {
    slot: 1, data: JSON.stringify(saveObj('CombatExp01', 'warrior', 1, 200, [weapon])),
  });
  const listed = await api(srv.base, 'POST', '/api/auction', {
    deviceId: DEV_EXP, slot: 1, uid: weapon.uid, price: 70,
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
  const bag = await getBag(srv.base, DEV_EXP);
  assert.ok(bag.some((it) => String(it.uid) === String(weapon.uid)), '到期退回物品应领回背包');
  console.log('拍卖到期：expires_at 改为过去 → 重启后在售列表消失，物品退回待领取并领回背包');
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
