// 从服务器版 artifact 的 client/src/game-data.ts 生成联机版可用的纯 JS 世界数据。
// 用法：node scripts/gen-world-data.mjs
// 只导出世界引擎需要的数据：STAGES / MONSTER_MAP / WORLD_HALF / MONSTER_XP_MUL。
// 生成物 shared/world-data.js 提交进仓库（本地），artifact 改动地图/怪物数值后重跑一次即可。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ts = require(path.resolve(__dirname, '..', '..', 'ts-spaces', 're-xie-chuan-qi-ge-cao-fu-wu-qi-ban', 'node_modules', 'typescript'));

const SRC = path.resolve(__dirname, '..', '..', 'ts-spaces', 're-xie-chuan-qi-ge-cao-fu-wu-qi-ban', 'client', 'src', 'game-data.ts');
const OUT = path.resolve(__dirname, '..', 'shared', 'world-data.js');

const src = fs.readFileSync(SRC, 'utf8');
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const wrapped = `'use strict';\n// 由 scripts/gen-world-data.mjs 从服务器版 artifact game-data.ts 生成，勿手改。\n// 世界引擎只用 STAGES / MONSTER_MAP / WORLD_HALF / MONSTER_XP_MUL。\n${outputText}\nmodule.exports = { STAGES: exports.STAGES, MONSTER_MAP: exports.MONSTER_MAP, WORLD_HALF: exports.WORLD_HALF, MONSTER_XP_MUL: exports.MONSTER_XP_MUL };\n`;
fs.writeFileSync(OUT, wrapped);
const m = require(OUT);
console.log('[gen-world-data] stages:', m.STAGES.length, 'monsters:', Object.keys(m.MONSTER_MAP).length, 'WORLD_HALF:', m.WORLD_HALF);
