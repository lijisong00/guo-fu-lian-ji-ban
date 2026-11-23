# 国服服务器版 v89 客户端移植方案（独立联机版）

> 目标：把服务器版 artifact（`re-xie-chuan-qi-ge-cao-fu-wu-qi-ban`，v89）的游戏客户端
> 原样搬进独立联机版 Render 项目，游戏内什么都不改，只把后端调用接到联机版协议。
> 状态：方案已定、兼容层已实现并测试；**dist 产物拷贝进仓库一事待用户明确批准**（见 §6），
> 在此之前不推送、不删旧客户端。

## 1. 为什么是兼容层，而不是重建客户端

- 服务器版客户端是 React 19 + `@hatch/space-sdk`，构建走 `bun ./client/build.mjs`
 （SDK 的 `Bun.build`，且有 `HATCH_SPACES_BUILD_DRIVER=1` 守卫拒绝手工构建；
  artifact 自身的 AGENTS.md 也禁止 `bun run build`）。
- `client/dist`（2026-11-23 02:16 构建）比当前 `App.tsx`（02:15:55）新 23 秒，
  产物新鲜，含 v89 按钮遮挡修复（bundle 内可检索到 `right-[46px]`）。
- `api.ts` 只有 20 行：`createActionClient` 向相对路径 `./actions` POST
  `{action, args, actionCallId}`，响应取 `body.data`；`body.error` 有值时抛错。
  产物 JS 内唯一的端点就是 `./actions`，无任何业务域名/IP 硬编码。
- 结论：**dist 原样复用，服务端实现一个 `POST /actions` 兼容层**，客户端零改动、
  零重建、Render 构建无需 bun/SDK，`render.yaml` 的 buildCommand 不用变。

## 2. 部署形态

```
public/index.html        新的落地页（本项目自写，非游戏）：身份对齐 + 认领 + 进入游戏
public/game/index.html   dist/index.html 原样（待批准后拷贝）
public/game/assets/*     dist/assets/* 原样（待批准后拷贝，12 个文件，约 13MB）
```

- 游戏在 `/game/` 下提供服务；bundle 内引用全是相对路径 `./assets/...`，
  在子路径下正常工作；`./actions` 解析为 `/game/actions`。
- 落地页在 `/`。`GET /game/`（或 `/game/index.html`）无有效身份 cookie 时
  302 回 `/`，保证每个进游戏的人都先对齐过身份。

## 3. 身份对齐（关键设计）

服务器版客户端的身份是 localStorage 里的随机 `playerId`
（键 `rxcq_server_player_id`，无则生成 `"p" + 9 位 base36`）；
联机版认领与存档按设备 ID 区分。两者必须取同一个值，否则存档与房间/拍卖行
会各认各的身份。

- 落地页脚本（与游戏同源，共享 localStorage 与 cookie）：
  读/生成 `rxcq_server_player_id`，同时写 cookie
  `lg_device_id=<同一值>; path=/; max-age=31536000; SameSite=Lax`。
- 兼容层读身份：存档类动作（`listSaves/getSave/putSave/resetSave`，请求体里
  没有 playerId）用 cookie；房间/拍卖行动作（请求体带 playerId）用
  `args.playerId`（与 cookie 一致时两者等价）。
- 认领：落地页上的认领表单调现有 `POST /api/claim {code, deviceId}`，
  三个预置角色绑定到该身份后，游戏内 `listSaves` 即可看到。
  朋友首次进游戏无需认领：空位上直接新建角色（走 `putSave`）。

## 4. 兼容层 `lib/actions-shim.js`

`POST /actions` 与 `POST /game/actions` 同一个 handler。
成功一律 HTTP 200 + `{data: {...}}`，失败 `{error: '...'}`（SDK 客户端约定）。

### 4.1 存档（按设备隔离；artifact 原版是全局 5 位，此处按设备分是唯一改动口径）

| 动作 | 映射 |
|---|---|
| `listSaves {}` | 5 位：`store.getCharacterRaw(deviceId, slot)` → `{slot, save: JSON字符串\|null, updatedAt}` |
| `getSave {slot}` | 同上，单一位 |
| `putSave {slot, data}` | slot 1–5；data 字符串 ≤ 4,000,000 字符且须是合法 JSON；`saveCharacter`，无行时 `createCharacter`（classId 归一 `warrior→war / taoist→tao`）；写后 `backup.writeBackup(store, {})`（节流复用既有机制）；与 artifact 原版一致，全路径返回 `{ok:true}`（含名字冲突等边角，服务端记日志） |
| `resetSave {slot}` | `deleteCharacter` → `{ok:true}` |

### 4.2 房间（内存 overlay，与 `lib/game.js` 的权威房间完全隔离）

按 `server/src/actions.ts` 逐字复刻语义，不碰 `lib/game.js`：

- 码字符集 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`，5 位，冲突重抽（最多 8 次）。
- `createRoom {playerId, name, classId, level, stageKey, layer, maxHp}` →
  `{ok, code}`；房间 `{stageKey, layer, sharedKills:0, bossMax:0, bossHp:0,
  bossState:0, holeKilled:false}`，房主成员 `{x:0, y:0, hp:maxHp, layer}`。
- `joinRoom {code, playerId, name, classId, level, maxHp}` →
  `{ok, stageKey, layer, reason}`；房间不存在 → `房间不存在或已解散`；
  已满 4 人（且不是已在房成员）→ `房间已满（最多 4 人）`；新成员落点
  `x:0, y:0, hp:maxHp, layer: 房层`。
- `heartbeat {code, playerId, name, classId, level, x, y, hp, maxHp, layer,
  killsDelta, bossSpawnMax, bossDamage, advanceLayer, holeKilled, gear}` →
  房间状态 `{ok, stageKey, layer, sharedKills, bossMax, bossHp, bossState,
  holeKilled, members[]}`。成员 upsert（gear 为空时不覆盖已有外观）；
  `killsDelta>0` → sharedKills 累加；`holeKilled` → 房 holeKilled=1；
  `advanceLayer>=0 且 ≠ 房层` → 换层并清 sharedKills/boss；
  否则 `bossSpawnMax>0 且 bossState==0` → bossMax=bossHp=spawnMax, bossState=1；
  `bossDamage>0 且 bossState==1` → bossHp=max(0, bossHp-damage)，到 0 则 bossState=2。
- `leaveRoom {code, playerId}` → 删成员，房空则删房，`{ok:true}`。
- 懒清理：每次读房间状态时删 20 秒以上无心跳的成员（`STALE_MS=20000`），
  空房且 20 秒以上无更新则删房。

### 4.3 拍卖行（独立表 `art_listings`，不碰现有拍卖行表与领取表）

artifact 的拍卖行模型与联机版现有模型不同（artifact：listing 表 + 3 个领取
标志位；联机版：listing 表 + 独立 claims 表），共用一张表会互相踩到期逻辑。
因此新表 `art_listings`（artifact schema 原样）：

```
id, sellerId, sellerSlot, sellerName, price, itemJson, status, createdAt,
expiresAt, buyerId, buyerSlot, proceedsClaimed, delivered, returnedClaimed
```

| 动作 | 映射 |
|---|---|
| `listAuction {}` | active 且未到期，createdAt 倒序，最多 200 条 |
| `createListing {playerId, slot, sellerName, price, itemJson}` | 校验物品 JSON：装备（uid 为数字 + name）或技能书（kind:"book" + skillId + name），否则 `{ok:false, reason:'物品数据不对，上架失败'}`；24 小时到期；客户端已先从自己背包移除，服务端只写 listing 行 |
| `buyListing {id, playerId, slot}` | 不存在/非 active/已到期/买自己 → `{ok:false, reason}`；否则标 sold + buyerId/buyerSlot；金币不动（客户端自己从存档扣，卖家经 claimAuction 领） |
| `delistListing {id, playerId, slot}` | 仅卖家、仅 active → 标 returned |
| `claimAuction {playerId, slot}` | 先把自己名下过期 active 翻成 returned；returned 且未领 → 物品进 items；sold 且未领成交款 → gold 累加；买到的（sold + 未领 + buyer 匹配）→ 物品进 items；返回 `{gold, items: string[]}`，客户端自己写进存档 |

## 5. 不动的部分

- 现有全部 REST（`/api/health`、`/api/characters`、`/api/character`、
  `/api/claim`、`/api/stages`、拍卖行 REST）与 WebSocket 协议一字不改；
  `lib/game.js` 权威循环、`lib/db.js` 既有表、`scripts/migrate.mjs`、
  seed 三角色、`render.yaml`（buildCommand 不变，无需构建步骤）全部不动。
- 旧简化版客户端（`public/app.js/data.js/style.css`）在 dist 拷贝落地前保留；
  拷贝落地时随新版一并替换，届时更新推送清单。

## 6. 待批准：dist 拷贝（执行风险检查）

读 `client/build.mjs` 时触发了执行风险检查：不允许直接运行其构建，
也不宜把其文件拷进仓库。`dist` 产物复用（约 13MB，12 个文件）同样需要
用户明确点头。待批准后执行（精确清单）：

```
cp client/dist/index.html → guo-fu-lian-ji-ban/public/game/index.html
cp client/dist/assets/*   → guo-fu-lian-ji-ban/public/game/assets/  （12 个文件）
```

并把以下路径追加进 `~/workspace/guo-fu-lian-ji-ban-push-paths`
（同时同步进消毒副本；拷贝后 grep 验证不含认领码）：
`public/game/index.html`、`public/game/assets/index-927xwyw8.js`、
`public/game/assets/index-redh7j3f.css` 及 10 张地面图；
`lib/actions-shim.js`、`test/actions-shim.test.mjs`、`docs/PORTING-V89.md`；
`public/index.html`（落地页，替换旧菜单）、`lib/db.js`、`server.js`
（以上三者已在清单内，无需追加）。

## 7. 验证（已做 / 待做）

已做（本机）：
- `npm test` 全过（含新增 `test/actions-shim.test.mjs`，覆盖 13 个动作、
  房间整流程、拍卖行整流程、到期退回、身份隔离）。
- HTTP：落地页 200；无 cookie 访问 `/game/` 302 回 `/`；`/actions`
  与 `/game/actions` 均响应 `{data}`。
- bundle 静态检查：`new vm.Script` 编译通过；产物内无业务域名/IP 硬编码。

待用户手机实测（无法在本机替代）：
- 落地页认领（认领码）→ 游戏内看到三个角色（法师 Lv11 / 战士 Lv2 / 道士 Lv9）。
- 进游戏：画面、HUD、摇杆、技能、商店、拍卖行、传送/回城与服务器版一致。
- 建房 + 朋友输 5 位码进房：双方互相可见、共享击杀/Boss 同步。
- 打怪、升级、拾取、买卖、上下线后存档仍在（15 秒自动保存 + 回城保存）。
