#!/usr/bin/env node
/**
 * 迁移校验：读 game.db 与 seed 文件逐项比对三个预置未认领角色。
 * 全部一致才退出 0，不一致逐项报错退出 1。
 *
 * 用法：node scripts/verify-migration.mjs
 * 比对项：名字 / 职业 / 等级 / 经验 / 金币 / 背包件数 / 穿戴件数 /
 *   技能书本数 / 已学技能与熟练度 / 已通关 / 传送点点亮 / run / deepest，
 *   以及整份 data JSON 与 seed 存档的深度一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const store = require('../lib/db.js');

const SEED_FILE = path.join(ROOT, 'seed', 'saves-export-20261123.json');

const CLS_MAP = { warrior: 'war', mage: 'mage', taoist: 'tao', war: 'war', tao: 'tao' };
const OLD_SKILL_MAP = {
  jiben: 'war_basic', gongsha: 'war_gongsha', cisha: 'war_cisha',
  banyue: 'war_banyue', yeman: 'war_yeman', liehuo: 'war_liehuo',
  huoqiu: 'mage_fireball', kangju: 'mage_kangju', diyu: 'mage_diyuhuo',
  diyuhuo: 'mage_diyuhuo', leidian: 'mage_leidian', huoqiang: 'mage_firewall',
  baolie: 'mage_baolie', jiguang: 'mage_jiguang', mohudun: 'mage_shield',
  shengyan: 'mage_shengyan', bingpao: 'mage_bingpao',
  zhiyu: 'tao_zhiyu', shidu: 'tao_shidu', huofu: 'tao_huofu',
  kulou: 'tao_kulou', shenshou: 'tao_shenshou', jingshen: 'tao_jingshen',
  yinshen: 'tao_yinshen', youling: 'tao_youling', shensheng: 'tao_shensheng',
  kunmo: 'tao_kunmo', qunliao: 'tao_qunti',
};
function normSkill(id) {
  return OLD_SKILL_MAP[id] || id;
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const unclaimed = store.getUnclaimedCharacters();
  const errors = [];
  const ok = (label, cond, detail) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond ? '' : ' —— ' + detail));
    if (!cond) errors.push(label + '：' + detail);
  };

  const slots = (seed.slots || []).filter((s) => s.save && s.save.name);
  ok('预置角色数量', unclaimed.length === slots.length,
    `库里 ${unclaimed.length} 个，seed 里 ${slots.length} 个`);

  for (const entry of slots) {
    const save = entry.save;
    const ch = unclaimed.find((c) => c.slot === entry.slot);
    console.log(`\nslot ${entry.slot}「${save.name}」：`);
    if (!ch) {
      ok('角色存在', false, '库里没有该位预置角色');
      continue;
    }
    ok('device_id 为 NULL（未认领）', ch.deviceId === null, 'device_id=' + ch.deviceId);
    ok('claimed_at 为 NULL', ch.claimedAt === null, 'claimed_at=' + ch.claimedAt);
    ok('名字', ch.name === save.name, `库 ${ch.name} / seed ${save.name}`);
    ok('职业', ch.cls === (CLS_MAP[save.classId] || save.classId),
      `库 ${ch.cls} / seed ${save.classId}`);
    ok('等级', ch.level === save.level, `库 ${ch.level} / seed ${save.level}`);
    ok('经验', ch.xp === save.xp, `库 ${ch.xp} / seed ${save.xp}`);
    ok('金币', ch.gold === save.gold, `库 ${ch.gold} / seed ${save.gold}`);
    const data = ch.data || {};
    ok('背包件数', (data.bag || []).length === (save.bag || []).length,
      `库 ${(data.bag || []).length} / seed ${(save.bag || []).length}`);
    ok('穿戴件数', Object.keys(data.worn || {}).length === Object.keys(save.worn || {}).length,
      `库 ${Object.keys(data.worn || {}).length} / seed ${Object.keys(save.worn || {}).length}`);
    ok('技能书本数', (data.books || []).length === (save.books || []).length,
      `库 ${(data.books || []).length} / seed ${(save.books || []).length}`);
    const learnedDb = Object.entries(data.learned || {})
      .map(([k, v]) => normSkill(k) + ':lv' + v.lv + ':' + (v.casts ?? v.prof ?? 0)).sort().join(',');
    const learnedSeed = Object.entries(save.learned || {})
      .map(([k, v]) => normSkill(k) + ':lv' + v.lv + ':' + (v.casts ?? v.prof ?? 0)).sort().join(',');
    ok('已学技能与熟练度', learnedDb === learnedSeed, `库 ${learnedDb} / seed ${learnedSeed}`);
    ok('已通关 cleared', deepEqual(data.cleared || [], save.cleared || []),
      `库 ${JSON.stringify(data.cleared)} / seed ${JSON.stringify(save.cleared)}`);
    ok('传送点点亮 bonusLit', deepEqual(data.bonusLit || [], save.bonusLit || []),
      `库 ${JSON.stringify(data.bonusLit)} / seed ${JSON.stringify(save.bonusLit)}`);
    ok('run', deepEqual(data.run || {}, save.run || {}),
      `库 ${JSON.stringify(data.run)} / seed ${JSON.stringify(save.run)}`);
    ok('deepest', deepEqual(data.deepest || {}, save.deepest || {}),
      `库 ${JSON.stringify(data.deepest)} / seed ${JSON.stringify(save.deepest)}`);
    ok('整份 data JSON 与 seed 存档深度一致', deepEqual(data, save), 'data 字段与 seed 存档不一致');
  }

  console.log('\n' + (errors.length === 0
    ? '全部一致，校验通过。'
    : `校验失败：${errors.length} 项不一致。`));
  if (errors.length) {
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
  process.exit(0);
}

main();
