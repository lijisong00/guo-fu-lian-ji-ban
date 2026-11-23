#!/usr/bin/env node
/**
 * 迁移脚本：把 seed/saves-export-20261123.json 里的三个角色写进 game.db，
 * 作为“预置未认领”角色（device_id 为 NULL，claimed_at 为 NULL）。
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

  let inserted = 0;
  for (const entry of slots) {
    const save = entry.save;
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
  console.log(`迁移完成：共 ${inserted} 个预置未认领角色（device_id 为 NULL，claimed_at 为 NULL）。`);
  console.log('用户用一次性认领码认领后，三个角色绑定到他的设备 ID 的 1–3 号位。');
  const file = backup.writeBackup(store, { force: true });
  if (file) console.log('已写迁移后备份：' + file);
}

main();
