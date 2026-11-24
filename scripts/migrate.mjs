#!/usr/bin/env node
/**
 * 迁移脚本：把 seed/saves-export-20261123.json 里的三个角色写进 game.db，
 * 作为“预置未认领”角色（device_id 为 NULL，claimed_at 为 NULL）。
 *
 * 快照优先（2026-11-24）：先按 seed/characters-snapshot.json 恢复全服
 * 角色（快照是权威来源：保留原 device_id、槽位、名字、等级、经验、
 * 金币、装备、claimed_at），再补种快照里没有的种子角色。Render 每次
 * 部署的 buildCommand 都会跑本脚本，所以部署后角色自动回库，不用再
 * 进 Render Shell 手动迁移。快照文件本身由 GET /api/snapshot 的返回
 * 保存得到（部署前先调它取最新快照，见 docs/deploy-render.md）。
 *
 * 用法：node scripts/migrate.mjs [--force]
 *   默认：库里已有角色时跳过（不覆盖）。--force：先清掉已有的未认领
 *   预置角色与认领标记，再重新迁移。
 *
 * 安全：不写死任何密码、不设密码；认领码不在本脚本里，只由服务端
 * 在启动时读 seed/claim-code.json 或环境变量 CLAIM_CODE。
 * data 字段存的是 seed 里整份存档 JSON 解析后重新序列化的结果，
 * 全部字段值与 seed 一致（仅格式化空白不同，不改任何数值与结构）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const store = require('../lib/db.js');
const backup = require('../lib/backup.js');
const snapshot = require('../lib/snapshot.js');

const SEED_FILE = path.join(ROOT, 'seed', 'saves-export-20261123.json');
const FORCE = process.argv.includes('--force');

const CLS_MAP = { warrior: 'war', mage: 'mage', taoist: 'tao', war: 'war', tao: 'tao' };

function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const slots = (seed.slots || []).filter((s) => s.save && s.save.name);

  const existing = store.counts().characters;
  if (existing > 0 && !FORCE) {
    console.log(`库里已有 ${existing} 个角色，跳过迁移（加 --force 重新迁移）。`);
    process.exit(0);
  }
  if (FORCE) {
    store.db.exec("DELETE FROM characters WHERE device_id IS NULL");
    store.db.exec("DELETE FROM meta WHERE key LIKE 'claim%'");
    console.log('已清空旧的未认领预置角色与认领标记。');
  }

  // 1）快照优先恢复（权威来源）：快照里的角色原样回库。
  const snapResult = snapshot.restoreSnapshotCharacters(store);
  console.log(
    `快照恢复：新写 ${snapResult.inserted} 个、已在库里跳过 ${snapResult.skipped} 个` +
    (snapResult.failed > 0 ? `、失败 ${snapResult.failed} 个` : '') +
    (snapResult.snapshot ? `（快照 ${snapResult.snapshot.characters.length} 个角色）` : '（无快照文件）')
  );

  // 2）补种快照里没有的种子角色（只种缺的，已在快照里的跳过不覆盖）。
  let inserted = 0;
  for (const entry of slots) {
    const save = entry.save;
    if (store.findByName(save.name)) {
      console.log(`slot ${entry.slot}「${save.name}」已在快照里，跳过`);
      continue;
    }
    const cls = CLS_MAP[save.classId] || save.classId;
    const ch = store.createCharacter(null, entry.slot, save.name, cls, save);
    if (!ch) {
      console.error(`slot ${entry.slot}「${save.name}」写入失败（可能 slot/名字冲突）。`);
      process.exit(1);
    }
    console.log(
      `slot ${entry.slot}：${save.name}（${cls} Lv${save.level}，经验 ${save.xp}，金币 ${save.gold}，` +
      `背包 ${Array.isArray(save.bag) ? save.bag.length : 0} 件，穿戴 ${Object.keys(save.worn || {}).length} 件，` +
      `技能书 ${Array.isArray(save.books) ? save.books.length : 0} 本）→ 未认领预置`
    );
    inserted += 1;
  }
  console.log(`拍卖行 seed：在售 ${((seed.auction && seed.auction.listings) || []).length} 条，无需迁移。`);
  console.log(`迁移完成：快照恢复 ${snapResult.inserted} 个 + 种子补种 ${inserted} 个预置角色（快照里的已认领角色保留原认领状态）。`);
  console.log('用户用一次性认领码认领后，三个角色绑定到他的设备 ID 的 1–3 号位。');
  const file = backup.writeBackup(store, { force: true });
  if (file) console.log('已写迁移后备份：' + file);
}

main();
