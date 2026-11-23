# Render 部署要点（国服服务器版独立联机版）

部署平台：**Render 免费版**（不用信用卡，邮箱注册即可）。
不要用甲骨文云（用户注册不了）。README 的部署章节由总负责人最后
统一写，本文件只记服务端需要的要点。

## 一键部署（从 GitHub 仓库）

1. 把项目推到 GitHub 仓库（根目录须有 `render.yaml`、
   `package.json`、`server.js`）。
2. 打开 render.com → New → Web Service → 选仓库。
3. 套餐选 **Free** → Deploy。
4. Render 按 `render.yaml` 自动执行：
   - `buildCommand: npm install`
   - `startCommand: node server.js`
   - `healthCheckPath: /api/health`

`render.yaml` 内容（项目根目录）：

```yaml
services:
  - type: web
    name: guo-fu-lian-ji-ban
    env: node
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
```

## 服务端要点

- 监听 `process.env.PORT`（Render 会注入端口，本地默认 3000），
  绑定 `0.0.0.0`（Render 要求，`server.js` 已如此写）。
- 不需要 `systemd` 相关内容；Render 自己负责进程常驻与重启。
- 环境变量（Render 面板 → Environment 里加，按需）：
  - `CLAIM_CODE`：可选。不设则服务端读仓库里 `seed/claim-code.json`
    的认领码。注意：认领码只能用一次，部署后请用户尽快认领。
  - `DATA_DIR`：默认 `./data`，不用改。
  - `DEBUG=1`：可选，开 `/api/debug/stats`。
- 首次部署后先跑一次迁移（把 seed 三角色写进库）：
  Render Shell 里执行 `node scripts/migrate.mjs`，再用
  `node scripts/verify-migration.mjs` 校验。也可以先在本地跑好
  迁移再部署——但注意免费版硬盘是临时的，见下节。

## Free 套餐限制（用户已知）

| 限制 | 影响 | 对策 |
|---|---|---|
| 15 分钟没人玩会休眠 | 下次打开要等 30–60 秒唤醒 | 服务端不用处理；**客户端首个请求要做超时重试（建议 65 秒超时、最多重试 2 次），并显示「服务器唤醒中，请稍等」状态** |
| 硬盘是临时的 | 重启或重新部署会丢 `game.db`（包括自动备份文件） | 自动备份机制（下节）防同一次部署内的丢失；想彻底稳妥就升级付费实例加持久硬盘 |
| 免费 PostgreSQL 30 天过期 | 不能用 | 本项目不用 PostgreSQL，只用 `node:sqlite` 本地文件 + JSON 备份 |
| 免费实例每月 750 小时 | 单个服务够用 | 不用多实例 |

## 自动备份与恢复（`lib/backup.js`）

- 每次角色存档写入与拍卖行数据变化后（存档写回、拍卖上架/成交/
  下架/领取、认领绑定后），把全部角色存档（整份 JSON 原样）与拍卖行
  在售 + 待领取数据写一份 JSON 备份到 `DATA_DIR/backup/`，文件名
  按日期时间，如 `backup-2026-11-23T11-00-00.json`。
- 写前 `JSON.parse` 校验，写临时文件再重命名；写失败只记日志，
  不影响正常存档写入。角色存档高频写入时最多每 30 秒写一份；
  拍卖行变化与认领绑定强制立即写。
- 滚动保留：保留最近 20 个备份文件，并删掉 7 天前的文件。
- 服务器启动时：如果 `game.db` 里没有任何角色且没有任何拍卖行数据，
  自动从 `data/backup/` 里最新的备份文件恢复，恢复后打启动日志
  写明恢复了几个角色、几条拍卖数据、用的哪个备份文件。
- **边界**：它防的是数据库文件损坏/误删，以及同一次部署内的意外
  丢失；Render 免费版**重新部署会清空整个硬盘（包括备份文件）**。
  想彻底稳妥就升级到 Render 7 美元/月的付费实例加持久硬盘，
  代码不用改。

## VPS 部署备选（普通 Linux 服务器 + systemd，留作以后）

以后如果不用 Render，同一份代码可直接跑在任意 Linux 服务器上：

```bash
# 服务器上
git clone <仓库> guo-fu-lian-ji-ban
cd guo-fu-lian-ji-ban
npm install
node scripts/migrate.mjs
node scripts/verify-migration.mjs
```

`systemd` 常驻示例（`/etc/systemd/system/guo-fu-lian-ji-ban.service`）：

```ini
[Unit]
Description=国服服务器版独立联机版
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/guo-fu-lian-ji-ban
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now guo-fu-lian-ji-ban
sudo systemctl status guo-fu-lian-ji-ban
```

VPS 上硬盘是持久的，自动备份机制同样工作（`DATA_DIR/backup/`），
另建议定期把备份目录同步到别处。
