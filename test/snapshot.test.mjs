'use strict';
// 快照测试：快照文件本身 + migrate 快照优先恢复 + GET /api/snapshot 导出。
// 全程隔离库，不碰真实 data/ 与真实认领码。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  ROOT, makeTmpDir, seedIsolated, startServer, stopServer, api,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);

const SNAPSHOT_FILE = path.join(ROOT, 'seed', 'characters-snapshot.json');
const SEED_FILE = path.join(ROOT, 'seed', 'saves-export-20261123.json');

const PORT = 18741;
const CLAIM = 'TEST123';

// 单元恢复用的隔离库（本文件进程内 require lib/db.js，DATA_DIR 须在
// require 之前定死；子进程服务器用自己的 DATA_DIR，不受影响）。
const unitDir = makeTmpDir('snapshot-unit');
process.env.DATA_DIR = unitDir;
const store = require('../lib/db.js');
const snapshotLib = require('../lib/snapshot.js');

const EXPECTED = [
  { slot: 1, name: '慕尼黑好炸药', cls: 'mage', level: 11, xp: 7242, gold: 8755 },
  { slot: 2, name: '无名侠客', cls: 'war', level: 2, xp: 79, gold: 3503 },
  { slot: 3, name: '慕尼黑火焰', cls: 'tao', level: 9, xp: 1384, gold: 5709 },
];

// 认领码只从本地不进仓库的 seed/claim-code.json 读（测试文件本身进仓库，
// 所以码绝不能写死在这里）；读不到就只查格式上没有认领码字段。
let claimCode = null;
try {
  claimCode = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'claim-code.json'), 'utf8')).claimCode || null;
} catch { claimCode = null; }
function assertNoClaimCode(text, label) {
  assert.ok(!/claimcode/i.test(text), label + '里不能有认领码字段');
  if (claimCode) assert.ok(!text.includes(claimCode), label + '里绝不能出现认领码');
}

test('快照文件：3 个未认领种子角色，字段齐全，与种子存档一致，无认领码', () => {
  const text = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
  assertNoClaimCode(text, '快照文件');
  const snap = JSON.parse(text);
  assert.equal(snap.version, 1);
  assert.equal(snap.characters.length, 3);
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const seedSaves = (seed.slots || []).filter((s) => s.save && s.save.name);
  assert.equal(seedSaves.length, 3);
  for (let i = 0; i < 3; i++) {
    const row = snap.characters[i];
    const exp = EXPECTED[i];
    const save = seedSaves[i].save;
    for (const k of ['device_id', 'slot', 'name', 'cls', 'level', 'xp', 'gold', 'data', 'claimed_at', 'created_at', 'updated_at']) {
      assert.ok(k in row, `快照角色缺字段 ${k}`);
    }
    assert.equal(row.slot, exp.slot);
    assert.equal(row.name, exp.name);
    assert.equal(row.cls, exp.cls);
    assert.equal(row.level, exp.level);
    assert.equal(row.xp, exp.xp);
    assert.equal(row.gold, exp.gold);
    assert.equal(row.device_id, null, '快照里的种子角色应未认领');
    assert.equal(row.claimed_at, null, '快照里的种子角色 claimed_at 应为 NULL');
    const data = JSON.parse(row.data);
    assert.equal(data.name, save.name);
    assert.deepEqual(data, save, '快照 data 应与种子存档整份一致');
  }
  assert.deepEqual(snap.listings, []);
  assert.deepEqual(snap.claims, []);
  assert.deepEqual(snap.meta, [], '全未认领快照的 meta 应为空（claimUsed=false）');
});

test('已认领快照恢复：保留原 device_id 与 claimed_at，claimUsed 按快照为 true', () => {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  const claimed = { ...snap.characters[0], device_id: 'snapClaimDev1', claimed_at: 1795400000000 };
  const tmp = path.join(unitDir, 'claimed-snapshot.json');
  fs.writeFileSync(tmp, JSON.stringify({
    ...snap,
    characters: [claimed, snap.characters[1]],
    meta: [
      { key: 'claim_used', value: '1' },
      { key: 'claim_used_at', value: '1795400000000' },
      { key: 'claim_used_by_device', value: 'snapClaimDev1' },
    ],
  }), 'utf8');
  const r = snapshotLib.restoreSnapshotCharacters(store, tmp);
  assert.equal(r.inserted, 2);
  assert.equal(r.skipped, 0);
  assert.equal(r.failed, 0);
  assert.equal(store.isClaimUsed(), true, '快照里有已认领角色，claimUsed 应为 true');
  const rows = store.db.prepare('SELECT name, device_id, claimed_at FROM characters ORDER BY slot').all();
  assert.equal(rows[0].name, '慕尼黑好炸药');
  assert.equal(rows[0].device_id, 'snapClaimDev1');
  assert.equal(rows[0].claimed_at, 1795400000000);
  assert.equal(rows[1].device_id, null);
  // 幂等：再恢复一次，名字已在库里应全部跳过、不重复
  const r2 = snapshotLib.restoreSnapshotCharacters(store, tmp);
  assert.equal(r2.inserted, 0);
  assert.equal(r2.skipped, 2);
  assert.equal(store.counts().characters, 2);
});

let dir;
let srv;

test.before(async () => {
  dir = makeTmpDir('snapshot');
  await seedIsolated(dir); // 跑 migrate：快照恢复 3 个 + 种子补种 0 个
  srv = await startServer(dir, PORT, CLAIM);
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(unitDir, { recursive: true, force: true });
});

test('migrate 快照优先：隔离库里 3 个角色与快照一致，claimUsed=false', async () => {
  const h = await api(srv.base, 'GET', '/api/health');
  assert.equal(h.ok, true);
  assert.equal(h.claimUsed, false, '快照全是未认领角色，claimUsed 应为 false');
  const snap = await api(srv.base, 'GET', '/api/snapshot');
  assert.equal(snap.ok, true);
  assert.equal(snap.counts.characters, 3);
  assert.equal(snap.characters.length, 3);
  for (let i = 0; i < 3; i++) {
    const c = snap.characters[i];
    const exp = EXPECTED[i];
    assert.equal(c.slot, exp.slot);
    assert.equal(c.name, exp.name);
    assert.equal(c.cls, exp.cls);
    assert.equal(c.level, exp.level);
    assert.equal(c.xp, exp.xp);
    assert.equal(c.gold, exp.gold);
    assert.equal(c.device_id, null);
    assert.equal(c.claimed_at, null);
    assert.equal(JSON.parse(c.data).name, exp.name);
  }
  assert.deepEqual(snap.meta, []);
  assertNoClaimCode(JSON.stringify(snap), '导出接口');
});
