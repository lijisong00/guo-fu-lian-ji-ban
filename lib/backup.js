'use strict';
/**
 * 国服服务器版 · 独立联机版 — 自动备份与启动恢复（lib/backup.js）
 *
 * 背景：Render 免费版硬盘是临时的，重启/重新部署会丢数据；免费
 * PostgreSQL 30 天过期也不能用。所以服务端把全部角色存档与拍卖行
 * 数据定期写一份 JSON 备份到 DATA_DIR/backup/。
 *
 * 机制：
 *   - 写备份：每次角色存档写入与拍卖行数据变化后调用 writeBackup()。
 *     内容 = 全部 characters 行（data 原样）+ 全部拍卖行在售与待领取
 *     + 认领标记。文件名 backup-YYYY-MM-DDTHH-mm-ss.json，先写临时
 *     文件再重命名，写前 JSON.parse 校验，写失败只记日志、不影响
 *     正常存档写入。
 *   - 节流：角色存档高频写入时最多每 30 秒写一份；拍卖行变化与
 *     认领绑定强制立即写（force=true）。
 *   - 滚动保留：保留最近 20 个备份文件，并删掉 7 天前的文件。
 *   - 启动恢复：restoreIfEmpty()——只有当 game.db 里没有任何角色
 *     且没有任何拍卖行数据时，才从 backup/ 里最新的备份恢复；
 *     恢复后打启动日志写明恢复了几个角色、几条拍卖数据、用的哪个
 *     备份文件。
 *
 * 边界（见 docs/deploy-render.md）：它防的是数据库文件损坏/误删
 * 与同一次部署内的意外丢失；Render 免费版重新部署会清空整个硬盘
 * （包括备份文件），想彻底稳妥就升级到 Render 7 美元/月的付费
 * 实例加持久硬盘，代码不用改。
 */
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_KEEP_COUNT = 20;
const BACKUP_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const BACKUP_THROTTLE_MS = 30 * 1000;

let lastWriteAt = 0;

function backupDir(dataDir) {
  const dir = path.join(dataDir, 'backup');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
}

/** 列出备份文件（按文件名排序 = 按时间排序）。 */
function listBackups(dataDir) {
  const dir = path.join(dataDir, 'backup');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

function pruneBackups(dataDir) {
  try {
    const files = listBackups(dataDir);
    const now = Date.now();
    const keep = [];
    for (const f of files) {
      const st = fs.statSync(f);
      if (now - st.mtimeMs > BACKUP_KEEP_MS) {
        fs.unlinkSync(f);
        console.log('[backup] 删除 7 天前旧备份：' + path.basename(f));
      } else keep.push(f);
    }
    // 只保留最近 20 个
    while (keep.length > BACKUP_KEEP_COUNT) {
      const old = keep.shift();
      fs.unlinkSync(old);
      console.log('[backup] 删除超量旧备份：' + path.basename(old));
    }
  } catch (e) {
    console.error('[backup] 清理旧备份失败：' + e.message);
  }
}

/**
 * 写一份完整备份。失败只记日志，绝不抛错影响正常存档写入。
 * @param {object} store lib/db.js 导出的 store（dumpAll/counts）
 * @param {object} opts { force?: boolean } 拍卖行变化与认领绑定用 force
 * @returns {string|null} 写出的备份文件路径，失败/被节流返回 null
 */
function writeBackup(store, opts = {}) {
  const now = Date.now();
  if (!opts.force && now - lastWriteAt < BACKUP_THROTTLE_MS) return null;
  try {
    const dataDir = store.DATA_DIR;
    const dir = backupDir(dataDir);
    const payload = {
      version: 1,
      createdAt: new Date(now).toISOString(),
      counts: store.counts(),
      ...store.dumpAll(),
    };
    const text = JSON.stringify(payload);
    JSON.parse(text); // 写前校验：能解析才写
    const name = 'backup-' + stamp(new Date(now)) + '.json';
    const tmp = path.join(dir, name + '.tmp');
    const final = path.join(dir, name);
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, final);
    lastWriteAt = now;
    pruneBackups(dataDir);
    return final;
  } catch (e) {
    console.error('[backup] 写备份失败（不影响存档）：' + e.message);
    return null;
  }
}

/**
 * 启动恢复：库完全为空（无角色且无拍卖行数据）时，从最新备份恢复。
 * @returns {object|null} { file, characters, listings, claims } 或 null（无需恢复）
 */
function restoreIfEmpty(store) {
  const c = store.counts();
  if (c.characters > 0 || c.listings > 0 || c.claims > 0) return null;
  const files = listBackups(store.DATA_DIR);
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(latest, 'utf8'));
  } catch (e) {
    console.error('[backup] 最新备份损坏，无法恢复：' + latest + '：' + e.message);
    return null;
  }
  const after = store.restoreAll(backup);
  const result = {
    file: path.basename(latest),
    characters: after.characters,
    listings: after.listings,
    claims: after.claims,
  };
  console.log(
    '[backup] 数据库为空，已从备份恢复：' + result.file +
    '（角色 ' + result.characters + ' 个、拍卖行在售/记录 ' + result.listings +
    ' 条、待领取 ' + result.claims + ' 条）'
  );
  return result;
}

module.exports = { writeBackup, restoreIfEmpty, listBackups, pruneBackups, BACKUP_KEEP_COUNT, BACKUP_KEEP_MS };
