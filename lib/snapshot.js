'use strict';
/**
 * 全服角色快照（lib/snapshot.js）
 *
 * 背景：Render 免费版硬盘是临时的，重新部署会清空整个硬盘（含
 * data/game.db 与 data/backup/ 里的滚动备份），跨部署恢复指望不上。
 * 所以全服角色快照以文件形式进仓库：seed/characters-snapshot.json，
 * 格式与 lib/db.js dumpAll() 的行一致（device_id / slot / name / cls /
 * level / xp / gold / data / claimed_at / created_at / updated_at），
 * 可直接由 GET /api/snapshot 的返回保存得到。
 *
 * 快照里只有游戏角色数据（名字/职业/等级/经验/金币/装备/技能书等），
 * 没有密码、没有真实个人信息；认领码绝不进快照（也不进仓库）。
 *
 * 恢复口径（快照是权威来源）：
 *   - 部署构建时 render.yaml 的 buildCommand 跑 `npm run migrate`，
 *     migrate.mjs 先按快照恢复、再补种快照里没有的种子角色。
 *   - 快照里的角色按快照状态原样恢复（保留原 device_id、槽位、名字、
 *     职业、等级、经验、金币、装备、claimed_at），玩家打开游戏直接接着玩。
 *   - 去重：名字已在库里的快照角色跳过（不重复种、不覆盖）；写单行
 *     失败只记日志跳过，不让一次失败拖垮整次迁移。
 *   - 认领标记：只有快照里有已认领角色时，才按快照的 meta 恢复
 *     claim_* 标记；快照全是未认领角色时不动（claimUsed 保持 false）。
 */
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'seed', 'characters-snapshot.json');

/** 读快照文件；缺失或损坏返回 null（调用方只种种子角色，不崩）。 */
function loadSnapshot(file = SNAPSHOT_FILE) {
  try {
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!snap || !Array.isArray(snap.characters)) return null;
    return snap;
  } catch (e) {
    console.warn('[snapshot] 快照文件读不到或损坏（' + file + '）：' + e.message + '，跳过快照恢复，只种种子角色');
    return null;
  }
}

/**
 * 快照优先恢复：把快照里名字尚不在库里的角色逐个写进库。
 * @returns {{inserted:number, skipped:number, failed:number, snapshot:object|null}}
 */
function restoreSnapshotCharacters(store, file = SNAPSHOT_FILE) {
  const snap = loadSnapshot(file);
  if (!snap) return { inserted: 0, skipped: 0, failed: 0, snapshot: null };
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const ch of snap.characters) {
    if (!ch || !ch.name || !Number.isInteger(ch.slot)) { failed += 1; continue; }
    if (store.findByName(ch.name)) { skipped += 1; continue; }
    try {
      store.restoreAll({ characters: [ch], listings: [], claims: [], artListings: [], meta: [] });
      inserted += 1;
    } catch (e) {
      failed += 1;
      console.warn('[snapshot] 快照角色「' + ch.name + '」恢复失败（跳过，不影响其他角色）：' + e.message);
    }
  }
  // 认领标记：快照里有已认领角色才按快照的 meta 恢复；全是未认领就不动。
  const anyClaimed = (snap.characters || []).some((c) => c && c.claimed_at != null);
  if (anyClaimed && Array.isArray(snap.meta)) {
    for (const m of snap.meta) {
      if (m && typeof m.key === 'string' && m.key.startsWith('claim')) {
        store.metaSet(m.key, m.value);
      }
    }
  }
  return { inserted, skipped, failed, snapshot: snap };
}

module.exports = { SNAPSHOT_FILE, loadSnapshot, restoreSnapshotCharacters };
