# 国服服务器版 · 独立联机版 — 服务端协议与实现说明

服务端文件：`package.json`、`server.js`、`lib/db.js`、`lib/auth.js`（已删除，见下）、
`lib/game.js`、`lib/backup.js`、`scripts/migrate.mjs`、`scripts/verify-migration.mjs`、
`render.yaml`、`docs/protocol.md`、`docs/deploy-render.md`。
客户端 `public/` 与数据表 `shared/data.js` 由其他负责人维护，本服务端只读 `data.js`，
不改它。

> **身份模型（2026-11-23 更正后）**：没有账号注册、没有登录、没有密码。
> 玩家身份就是浏览器 localStorage 里的持久设备 ID（uuid，客户端生成与保存，
> 换设备就换号）。服务端信任客户端传来的 `deviceId`（休闲游戏，不做强校验）。
> 因此 `lib/auth.js`（原账号/bcrypt/JWT 模块）已删除，不存在；`package.json`
> 里只有 `ws` 一个依赖，数据库用内置 `node:sqlite`。
> `scripts/set-password.mjs` 不需要，已删除（从未创建）。

## 启动

```bash
npm install
node server.js          # 监听 0.0.0.0:$PORT，默认 3000
node scripts/migrate.mjs   # 迁移 seed 三角色为预置未认领（只需跑一次）
node scripts/verify-migration.mjs  # 校验迁移结果
```

环境变量：`PORT`（默认 3000，Render 会注入）、`DATA_DIR`（默认 `./data`，
里面 `game.db` 是角色与拍卖行数据，`backup/` 是自动备份）、
`CLAIM_CODE`（可选，优先于 `seed/claim-code.json`）、`DEBUG=1`（开
`/api/debug/stats`）。

启动时如果 `game.db` 完全为空（无角色且无拍卖行数据），自动从
`DATA_DIR/backup/` 里最新的备份恢复（见「自动备份与恢复」）。

## 身份与认领

- 设备 ID：`deviceId`，8–64 字，`[A-Za-z0-9_-]`，首字须为字母或数字。
  HTTP 从请求体 `deviceId` 字段或 `X-Device-Id` 头取；WS 从首条
  `{t:'auth', deviceId, slot}` 取。
- 每设备 5 个存档位（slot 1–5），同一设备同一 slot 唯一、同一设备下
  名字唯一。第 6 个角色服务端拒绝：`{ok:false, error:'存档位已满，最多 5 个'}`。
- 迁移的三个角色以 `device_id = NULL`、`claimed_at = NULL` 预置在库里，
  称为「预置未认领」。没认领的设备打开是空位，可以新建自己的角色。
- 认领：`POST /api/claim {code, deviceId}`。服务端启动时读认领码
  （环境变量 `CLAIM_CODE` 优先，否则读 `seed/claim-code.json`；
  码本身只存在那个文件里，不写进代码、注释与日志）。
  校验通过后把三个预置角色的 `device_id` 设为该 `deviceId`、
  `claimed_at` 置当前时间，并在库里标记认领码已使用；再次使用返回
  `{ok:false, error:'认领码已失效'}`。认领要求目标设备的 1–3 号位
  都是空的，否则拒绝（避免覆盖该设备已有的角色）。认领成功返回三个
  角色摘要。认领后立即写一份强制备份。
- WS 鉴权 `{t:'auth', deviceId, slot}`：服务端校验该位角色属于该
  `deviceId`，未认领的预置角色不许选；`slot` 不填时用服务端记住的
  该设备最后选的位（`meta.last_slot:<deviceId>`），再没有则默认 1 号位。
  同一设备在别处已在线时，新连接顶掉旧连接。
- 存档写回按 `deviceId + slot` 保存整份角色 JSON。

## HTTP API（JSON，`/api` 前缀）

| 方法与路径 | 说明 |
|---|---|
| `GET /api/health` | 健康检查：`{ok, service, version, time, rooms, playersOnline, claimUsed}`（Render 的 `healthCheckPath`） |
| `GET /api/characters?deviceId=xxx` | 该设备的 5 个位：每位 `{slot,name,cls,level,xp,gold}` 或 `null` |
| `POST /api/character {deviceId, slot, name, cls}` | 建角色。`cls` 接受 `war`/`mage`/`tao`（兼容 `warrior`/`taoist` 写法，入库归一为 `war`/`mage`/`tao`）。新角色：金币 200，中瓶血瓶×100、中瓶魔法瓶×100，开局学会本职业 1 级技能（战士基本剑术/法师火球术/道士治愈术），开局一把本职业 tier 0 武器（见「数据缺口」：法师/道士在 `EQUIPS` 里没有 tier 0 武器，故开局无武器） |
| `DELETE /api/character/:slot {deviceId}` | 删自己设备的指定位角色（`deviceId` 也可放 `X-Device-Id` 头或 `?deviceId=`） |
| `POST /api/claim {code, deviceId}` | 一次性认领（见上） |
| `GET /api/stages` | 公开：15 张地图 `[{id, name, floors, safe, hidden, desc, teleport}]`。`teleport` 表示是否在比奇城传送员列表里；未知暗殿 `hidden:true, teleport:false`。尸王殿 `teleport:false`（只能走僵尸洞三层地面洞口） |
| `GET /api/auction` | 在售列表，全服共享，按上架时间倒序，最多 200 条（过期未领取的不在这里出现；读前先把到期在售标为过期并退回卖家待领取） |
| `POST /api/auction {deviceId, slot, uid\|bookId, price}` | 上架背包装备（`uid`）或技能书（`bookId`），自标价、无手续费，24 小时后到期。物品先从角色背包移除再记 listing |
| `POST /api/auction/:id/buy {deviceId, slot}` | 买别人的在售物品，不能买自己的；成交后金币记入卖家待领取、物品记入买家待领取（`slot` 指买家用哪个角色位收物品；金币扣减与成交在同一流程里，成交失败会退钱） |
| `POST /api/auction/:id/delist {deviceId}` | 卖家下架，物品进卖家待领取 |
| `GET /api/auction/claims?deviceId=xxx` | 我的待领取：金币与物品 |
| `POST /api/auction/claims/:id/claim {deviceId, slot}` | 领取：金币进该位角色金币、物品进该位角色背包（装备进装备背包、技能书进技能书背包；背包满了领不走，待领取保留） |
| `GET /api/debug/stats`（`DEBUG=1` 才开） | 房间总览 |

错误统一为 `{ok:false, error:'…'}`。角色名 1–12 字（字母/数字/下划线/中文）。

## WebSocket（`/ws`，JSON 文本）

连上后第一条必须是 `{t:'auth', deviceId, slot}`，否则 10 秒后断开。
成功回 `{t:'authed', slot, character}`；失败回 `{t:'error', msg}` 并断开。

### 客户端 → 服务端

| 消息 | 说明 |
|---|---|
| `{t:'auth', deviceId, slot}` | 鉴权并选定当前角色位 |
| `{t:'select_character', slot}` | 进房前切换当前角色位（先离房、存档，再换角；未认领的预置角色不许选） |
| `{t:'create_room'}` | 创建房间，得 5 位大写字母+数字房间码；建房者即房主 |
| `{t:'join_room', code}` | 输入朋友的码加入；满 4 人或码不对回 `{t:'error'}` |
| `{t:'leave_room'}` | 离开房间（回大厅状态，不断 WS）；房主离开或房空则房间解散 |
| `{t:'move', x, y}` | 摇杆向量，x/y 各 -1~1；停下发 `{t:'move', x:0, y:0}` |
| `{t:'attack'}` | 手动普攻一次 |
| `{t:'skill', id}` | 放技能（服务端校验职业/已学/冷却/耗魔；无目标不空放、不耗魔） |
| `{t:'pickup'}` | 捡身边最近的掉落（归属保护：别人杀的怪掉的物品 1 分钟内只有击杀者能捡） |
| `{t:'auto', on}` | 开关自动战斗（挂机）：自动索敌、走位、放技能、捡装备、血量低于 35% 自动喝血瓶；法师、道士风筝，战士贴身 |
| `{t:'use_potion', kind}` | `kind` 为 `hp`/`mp`，服务端自动选刚好够补满的最小瓶 |
| `{t:'equip', uid}` | 穿上背包里的装备 |
| `{t:'unequip', slot}` | 脱下某部位（`slot` 为 9 穿戴位之一） |
| `{t:'buy', equipId}` | 从商店买基础装备（金币不够回 error） |
| `{t:'sell', uid}` | 出售背包/交易栏装备得金币 |
| `{t:'enter_portal'}` | 走进传送门（门开着且玩家在门附近时才有效），全队一起下潜 |
| `{t:'set_active_skills', ids}` | 设置上场技能（最多 2 门，必须是已学技能；魔法盾是被动自动释放，不占位，传了会被滤掉） |
| `{t:'shop'}` | 请求商店列表，回 `{t:'shop', items, potions}`；`items` 为本职业 tier 0–1 装备 `{idx, id, name, icon, slot, tier, reqLv, price, stats}` |
| `{t:'buy_potion', kind, tier}` | 买药水（`kind` 为 `hp`/`mp`，`tier` 为 `s`/`m`/`l`，价格 20/40/80） |
| `{t:'use_item', uid}` / `{t:'use_book', uid}` | 使用背包物品（技能书：等级够了就学会；`uid` 为技能书 id，如 `war_liehuo`） |
| `{t:'repair', uid}` | 修理一件已穿装备（服务端新增消息，见「商店与修理」） |
| `{t:'repair_all'}` | 一键修理全部已穿装备（服务端新增消息） |
| `{t:'teleport', stageId}` | 比奇城传送员传送（只能从比奇城出发；目标图必须是传送列表里的图，不含尸王殿与未知暗殿；传送落点为目标图第一层；蜈蚣洞与沃玛寺庙的传送点需先点亮；全队一起传送） |
| `{t:'enter_hole'}` | 在僵尸洞穴三层、站在洞口附近时钻洞下尸王殿（落点固定在殿中心，全队一起） |
| `{t:'enter_passage'}` | 走蜈蚣洞地牢一层东的连接通道进未知暗殿，或从未知暗殿原路回蜈蚣洞（服务端新增消息，见「地图与通关」） |
| `{t:'auction_list'}` | 回 `{t:'auction_list', listings}`（与 HTTP 同一套逻辑） |
| `{t:'auction_create', slot, uid, price}` / `{t:'auction_create', slot, bookId, price}` | 上架（`slot` 不填用当前角色位） |
| `{t:'auction_buy', id, slot}` | 购买 |
| `{t:'auction_delist', id}` | 下架 |
| `{t:'auction_claim', claimId, slot}` | 领取待领取 |
| `{t:'auction_claims'}` | 回 `{t:'auction_claims', claims}` |
| `{t:'ping'}` | 回 `{t:'pong'}` |

### 服务端 → 客户端

| 消息 | 说明 |
|---|---|
| `{t:'snapshot', tick, stage, floor, stageName, floorName, players, monsters, drops, portal, hole, walls, projectiles, floats, bonusLit, pets}` | 每 100ms 广播一次房间状态。`players: {id,name,cls,level,x,y,hp,maxHp,mp,maxMp,dead}`；`monsters: {id,key,name,x,y,hp,maxHp,boss}`；`drops: {id,kind,name,x,y,locked}`（`kind`: `equip`/`potion`/`gold`/`skillbook`）；`portal: {open,x,y}` 或 `null`；`hole: {x,y,zombieState:'in'\|'crawling'\|'out'\|'dead'}` 或 `null`（只在僵尸洞穴三层）；`walls: {x,y,r}`（火墙圈）；`projectiles: {x,y,kind}`（`kind`: `fireball`/`bigfire`/`huofu`/`basic`/`tornado`，`tornado` 为冰咆哮的旋转冰圈龙卷风，纯视觉 1.6 秒）；`floats: {x,y,text,color}`（本 tick 的飘字，含伤害数字与「闪避」）；`bonusLit`: 本房所有人已点亮传送点的并集；`pets`: `{id,owner,name,x,y,hp,maxHp}`（召唤物与诱惑怪，服务端新增字段） |
| `{t:'me', ...}` | 个人状态：等级、经验（`xp`/`xpNext`）、金币、血蓝与上限、面板攻击上下限、防御/魔御/准确、穿戴、背包、技能书、已学技能与熟练度（`learned: {id:{lv,casts}}`）、上场技能、技能剩余冷却 `cds`、魔法盾抵挡百分比 `shield`、药水数量（`hpPots`/`mpPots`，格式与存档一致：数组 `[小,中,大]` 或数字旧单档）、自动战斗开关、当前角色位、已点亮传送点 `bonusLit`、已通关、当前地图/层、矿石、交易栏。变化时推送 + 每秒补推一次 |
| `{t:'toast', msg}` | 飘字/提示（拾取、升级、买到装备、进房、点亮传送点等） |
| `{t:'levelup', level}` | 升级 |
| `{t:'died', dropped}` | 死亡（`dropped` 表示是否掉了 1 件装备），5 秒后原地复活 |
| `{t:'room_joined', code, players}` | 进房成功；`players` 为房内玩家名列表 |
| `{t:'room_update', players}` | 有人进/出房 |
| `{t:'room_left'}` | 已离房 |
| `{t:'floor', stage, floor}` | 下潜到新层/新图（全队一起） |
| `{t:'shop', items, potions}` | 商店列表 |
| `{t:'auction_list'}` / `{t:'auction_created'}` / `{t:'auction_bought'}` / `{t:'auction_delisted'}` / `{t:'auction_claimed'}` / `{t:'auction_claims'}` | 拍卖行回包 |
| `{t:'error', msg}` | 操作失败原因 |

### 房间

- 5 位大写字母+数字房间码，每房最多 4 人；同房同图同层，共享击杀与
  Boss；Boss 死了开传送门，全队一起下潜；房主离开或房空则房间解散。
- 心跳里同步 `holeKilled`：打掉洞口黄衣僵尸后，同房所有人 `bonusLit`
  同时点亮蜈蚣洞与沃玛寺庙（只提示新点亮的部分），立即写库。
- 房间只在内存里跑，不落库；玩家掉线即离房（存档写回），房主掉线
  房间解散。

## 战斗与规则实现口径（`lib/game.js`，服务端权威）

- 升级经验查 `XP_TABLE`（`expNeed(lv)`，60 级以上走 `data.js` 的兜底
  公式）；怪物经验 ×7.8；击杀者全额、同房队友一半；升级回 30% 血。
- 职业血量按锚点表 `hpAt()`；魔法上限 = `mp + mpLv×(等级-1)`。
- 准确与闪避：战士基础准确 5，基本剑术每级 +3、攻杀每级 +1；
  怪物闪避普通 12%/Boss 28%，每点准确抵消 2%（最低留 2%），装备
  「准确」属性同样生效；闪开飘「闪避」、不掉血、不计命中与熟练度。
- 伤害：面板上下限随机发挥 → 乘技能倍率或加技能附加 → 减目标防御/
  魔御固定值（最少 1 点）；没有「每点主属性 +2% 伤害」乘区。
  具体算式（`skillRawDamage`，`data.js` 未定死组合方式，此处为服务端
  实现口径）：`伤害 = (技能 base×growth^(技能等级-1) + 面板随机值) × 技能倍率 + 技能附加 - 目标防御`；
  `base` 为 `null` 的新技能（地狱火/大火球等）只用 `面板随机值 × 倍率`；
  灵魂火符直接用 `SOUL_FIRE_TABLE` 查表值（道术总值取面板上限）再减防。
  怪物防御 = `MONSTERS.def`（无则 `floor(等级×0.55)`）；法师技能减目标
  魔御（怪物无 `mdef` 字段时取 `def` 同值），战士/道士技能减防御。
  暴击：基础 8% ×1.6，装备 `crit` 叠加；攻杀 35% ×1.5、刺杀/疾光
  18% ×1.8、雷电/爆裂 15% ×1.8、圣言 20% ×1.8（旧版联机规则，
  `data.js` 的 `SKILLS` 表里没有暴击字段）。
  怪物打玩家：`攻击 × rand(0.85,1.15) × 0.5`，先算魔法盾抵挡百分比
  （15/30/45/60% 按盾等级），再减玩家防御，最少 1 点。
- 技能：33 门全实现（战士 6/法师 14/道士 13），学习等级与效果按
  `data.js`；战士耗魔只有半月弯刀 6 与烈火剑法 13；火球术直线飞行，
  不追踪、不穿透，命中首个敌人或撞上边界、飞满射程即熄灭（`STAGES`
  里没有障碍物数据，故「撞障碍」暂只按地图边界处理）；
  火墙放最近怪物脚下（560 内没怪不空放、不耗魔、不进冷却），持续
  8 秒，半径 59.4，每 0.5 秒一跳，每跳伤害为技能伤害 ×0.5；
  冰咆哮范围与火墙相同，附带减速 1.2 秒（移速 ×0.45），释放时在原地
  升起持续 1.6 秒的旋转冰圈龙卷风（纯视觉，`projectiles` 里 `tornado`）；
  治愈术只回血（`30 + 6×人物等级 + 15×技能等级`，`healFormula`），
  自己 + 105 内队友；群体治愈术回 45% 最大生命（自己 + 200 内队友）；
  魔法盾习得后自动释放、不占操作栏；上场技能最多 2 门；
  熟练度每命中 1 次 +1、每级 1000 点、满级 4 级（`SKILL_MAX_LV=4`，
  效果均为四档，见下「规则冲突与缺失」第 5 条）。
  召唤物（骷髅/神兽）跟随自动打怪（索敌 300，撕咬间隔 1.1 秒，
  伤害按 `summonAtk`，`hp/atk = base + perLv×技能等级`）；诱惑之光
  可召 2/3/4/5 只（Boss 不能诱惑）；召唤物不会被怪打死。
  普攻：战士/道士为基本剑术/精神力战法单体劈砍（0.9 秒一刀，不耗魔，
  计熟练度）；法师为弱化火球弹道（不耗魔、不练熟练度）。
  技能自动释放：上场技能与持续型技能（半月弯刀/施毒术）冷却一到、
  蓝够、有目标就自动放；抗拒火环/瞬息移动/隐身术/集体隐身术/
  心灵启示只手动放。
- 技能书掉落：全职业书池，本职业已学或已有的不重复掉；掉率 Boss 30%/
  普通 1.4%；尸王殿另按通关/常驻尸王：25 级以下（`req≤25`）38%，
  25 级以上（`req>25`）高级书单独 0.3%；背包中使用习得，等级够了
  才能学；已学/已有的书再拾取到换金币 +30。
- 刷怪：每层 500 只普通怪，进图第一帧全部刷出、散布全图（不刷到玩家
  脸上 300 内），杀掉不补刷；没有精英（任何精英逻辑都不写）；
  Boss 进图时刷在离玩家 850+ 的远处，只在刷新点附近游荡，玩家贴身
  120 内或先挨打才追击，追出巢穴 600 就回头；怪物被动游荡。
  层属性加成（`layerInfo.hpMul/dmgMul`）只用于骷髅洞穴/僵尸洞穴/
  石墓的分层；单层图倍率为 1。
- 尸王殿：独立一图 600×600；每小时整波补满 32 只（6×6 格、正中 2×2
  留空给玩家落脚，1 只通关尸王 + 31 只常驻，杀掉的不单独补，满一小时
  整波补满——实现为按格补足缺失数，通关尸王活着不重复刷）；
  尸王主要爆技能书，装备只剩小概率陪衬（沿用常规掉率：通关尸王按
  Boss 档、常驻按普通档，未另设数值，见下第 7 条）；
  钻洞落点固定殿中心；黄衣僵尸：玩家走近洞口 240 内，用约 2.2 秒
  完全爬出，爬出后变成一只黄衣僵尸扑向玩家攻击（走普通僵尸数值与
  掉落）；打掉它后本房所有人 `bonusLit` 同时点亮蜈蚣洞与沃玛寺庙
  （只提示新点亮的部分）。
- 掉落：装备 Boss 必掉 1 件 + 50% 再掉 1 件、普通 8%；极品 Boss 50%/
  普通 0%，+1/+2/+3 为 60/30/10%（加到主属性上限，无主属性则加防御）；
  大爆 Boss 3%/普通 0.3%（6–9 件装备 + 8–12 瓶药水 + 金币
  `80~200 + 怪物等级×10` 直接进击杀者钱包）；药水血瓶 5.5%/魔法瓶
  5%（小 15%/中 70%/大 15%）；金币：Boss 直接进击杀者钱包
  （`BOSSES.gold + rand(0,8)`），普通怪掉金币堆在地上
  （`round((rand(2,6) + 怪物等级×rand(0.4,1.1)))`），走过去拾取；
  掉落归属 1 分钟内只有击杀者能捡；地上掉落 45 秒消失
  （归属 60 秒 > 消失 45 秒，故实际效果为全程只有击杀者能捡，见下第 8 条）。
- 装备：9 穿戴位（武器/衣服/头盔/项链/手镯左/手镯右/戒指左/戒指右/
  鞋靴）；穿戴门槛按 `WEAR_REQ`（属性）与 `reqLv`（等级）分开校验，
  已穿装备不强制脱下；异职业装备能穿但不计属性；拾取自动穿（本职业
  装备有空位直接穿上，两位都满才替换较弱一件、被换下的回背包；
  等级/属性不够穿不上时进背包）；耐久上限 100（新装备满耐久；
  迁移来的 2 号位角色穿戴耐久是旧值，原样保留，只有新掉落/新买的
  装备才满耐久 100）；没有幸运/诅咒系统。
  装备评分（拾取比较用）：`主属性点数×3 + 防御×8 + 生命×0.4 +
  移速×0.6 + 暴击×160 + 极品×12`，异职业按 0 分计。
  耐久磨损（单机版源码规则，服务器版维修存在即默认磨损存在）：
  武器每释放 10 次磨 1 点；被怪打中衣服优先磨 1 点、无衣服磨头盔；
  每击杀 20 只怪，项链/手镯/戒指/鞋靴随机一件磨 1 点；磨光装备消失。
- 药水：小/中/大三档，血 30/55/90%、蓝 30/60/95%，价格 20/40/80；
  喝药自动选刚好够补满的最小瓶；蓝不够放技能时自动喝一瓶魔法瓶
  （优先中瓶，回 60%）；挂机时血量低于 35% 自动喝血瓶。
  迁移来的角色药水有两种格式——1、3 号位是数组 `[小,中,大]`，
  2 号位是数字（旧单档格式，按中瓶计）；读档时数字格式原样保留，
  写回时不改格式（只有数字格式的角色买/捡了小瓶或大瓶时，才转成
  数组格式再记）。
- 商店与修理：只卖本职业 tier 0–1 基础装备，无极品；买价 = 估价×2+10，
  卖价 = 估价（估价用 `data.js` 的 `tradePrice`）；买下直接穿上
  （同部位旧装备摘下进背包，背包满了则退款不成交）。
  维修：缺失耐久 × 2 × (1 + tier) 金币/件（旧版公式；公开版为每件
  30 金币，见下第 6 条），单件 `{t:'repair', uid}` 或一键
  `{t:'repair_all'}`。
- 死亡：35% 概率掉 1 件已穿装备（掉在地上），保留技能与等级；
  5 秒后原地复活（满血满蓝）。
- 地图与通关：15 张图按 `STAGES` 的连接走；主线通关计数分母 14
  （未知暗殿不计）；所有地图默认可进，`STAGES` 里的 `req`/`unlocks`
  链只表示通关计数 lineage，不作为进图门槛；
  击败层主/Boss 后在 Boss 倒下处开传送门，本层剩怪保留；谁先走进
  传送门全队一起下潜；分层关下潜到下一层，本关最后一层通关后门通往
  下一关第一层；赤月峡谷最后一层打完赤月恶魔不弹结算、不开回城门，
  留在图里继续打；比奇城是安全区不刷怪；白日门城里是安全区不刷怪、
  怪物进不了城（安全区半径 350，以城中央计）；多层图重进永远从
  第一层开始（不读最深层记录）；1.75 内容上限。
  未知暗殿：单独的隐藏地图，不在传送列表与 `/api/stages` 的传送
  标记里；唯一通路是蜈蚣洞地牢一层东里的连接通道
  （`{t:'enter_passage'}`，玩家需站在东边 `x > w/2-300` 处），
  随时能走、不用先通关蜈蚣洞，殿里出口原路回地牢一层东
  （`{t:'enter_passage'}`，落点东边）；殿里 Boss 被击败后也会在
  倒下处开传送门，通往蜈蚣洞。
  尸王殿不在传送列表，只能走僵尸洞三层地面洞口（`{t:'enter_hole'}`，
  需站在洞口 120 内）。
- 挂机：自动打怪、捡装备、血量低于 35% 自动喝血瓶；法师、道士风筝，
  战士贴身。技能自动释放与挂机开关是分开的：上场技能平时就按冷却
  自动放，`auto` 开关只控制走位/索敌/拾取/喝血。

## 拍卖行（与 HTTP 同一套逻辑）

- 全服共享，背包装备自标金币价上架、无手续费、24 小时到期自动退回
  （到期时物品进卖家待领取；读列表与每 tick 都会扫一次到期）、可下架
  取回，成交金币全额归卖家。
- 上架技能书：`bookId` 为新技能 id（如 `war_liehuo`）；买到、下架或
  到期退回的书都经领取进技能书背包。
- 待领取按设备归属，领取时指定角色位（金币进该位角色金币、物品进
  该位角色背包）。

## 自动备份与恢复（`lib/backup.js`）

- 每次角色存档写入与拍卖行数据变化后（`putsave`、拍卖上架/成交/
  下架/领取、认领绑定后），把全部角色存档（整份 JSON 原样）与拍卖行
  在售 + 待领取数据写一份 JSON 备份到 `DATA_DIR/backup/`，文件名
  按日期时间，如 `backup-2026-11-23T11-00-00.json`。
  写前 `JSON.parse` 校验，写临时文件再重命名，防止写一半损坏；
  写失败只记日志，不影响正常存档写入。
- 节流：角色存档高频写入时最多每 30 秒写一份；拍卖行变化与认领
  绑定强制立即写。
- 滚动保留：保留最近 20 个备份文件，并删掉 7 天前的文件（启动与
  每次写备份时清理）。
- 服务器启动时：如果 `game.db` 里没有任何角色且没有任何拍卖行数据，
  自动从 `data/backup/` 里最新的备份文件恢复（角色原样写回
  `characters` 表，拍卖行在售与待领取写回对应表；恢复后打一条启动
  日志写明恢复了几个角色、几条拍卖数据、用的哪个备份文件）。
- 边界：它防的是数据库文件损坏/误删，以及同一次部署内的意外丢失；
  Render 免费版重部署会清空整个硬盘（包括备份文件），想彻底稳妥
  就升级到 Render 7 美元/月的付费实例加持久硬盘，代码不用改。
  详见 `docs/deploy-render.md`。

## Render 部署要点（详见 `docs/deploy-render.md`）

- `render.yaml` 已放在项目根目录：web service、Node 环境、
  `buildCommand: npm install`、`startCommand: node server.js`、
  Free 套餐、`healthCheckPath: /api/health`。
- 服务端监听 `process.env.PORT`（Render 注入，本地默认 3000），
  绑定 `0.0.0.0`。
- 休眠唤醒：Render 免费版 15 分钟没人玩会休眠，下次打开要等
  30–60 秒唤醒。服务端不用特别处理（正常监听即可），但**客户端
  首个请求要做超时重试（建议 65 秒超时、最多重试 2 次），并显示
  「服务器唤醒中，请稍等」状态**。客户端由另一位负责人实现。

## 规则冲突与缺失（实现时发现的，如实记录）

1. **60 级以上升级经验**：任务口径称用旧公式 `300×等级^1.55` 兜底；
   `data.js` 导出的 `expNeed()` 用的是公开版兜底公式
   `floor(1e9 × 1.15^(lv-59))`。旧公式在 60 级时只要约 18 万经验，
   与 59→60 级的 10 亿严重脱节，服务端采用 `data.js` 的 `expNeed()`。
2. **技能满级**：任务初版称满级 5 级；`data.js` 与公开版均为 4 级
   （效果数组长度均为 4，如烈火 1.4/1.8/2.2/2.6），2026-11-23 已
   确认满级 4 级是对的，服务端按 4 级实现。
3. **开局药水**：`POTIONS.startCount` 初版写中瓶各 20 瓶（公开版），
   后已改为中瓶红/蓝各 100 瓶（任务口径与 MEMORY.md），服务端按
   100 瓶实现。
4. **经验表 45→49 级**：初版任务口径为 100/150/180/220/250M，
   后已按公开版 `EXP_TABLE` 实查值改为 100/120/150/200/250M，
   `data.js` 的 `XP_TABLE` 已更新，服务端直接查表。
5. **伤害算式组合方式**：`data.js` 只给了「面板随机发挥 → 技能倍率/
   附加 → 减防御」的框架，未定死 `base` 与面板如何相加。服务端实现
   为 `(base×growth^(lv-1) + 面板随机值) × 倍率 + 附加 - 防御`
   （见上「战斗与规则实现口径」）。如需改口径，只改 `skillRawDamage`。
6. **维修计价**：公开版为每件 30 金币，旧版为缺失耐久×2×(1+tier)。
   `data.js` 的 `SHOP.repairNote` 标注「联机版维修计价待定」。
   服务端暂按旧版公式实现。
7. **尸王殿装备「只剩小概率陪衬」**：没有任何来源给出具体数值，
   服务端沿用常规掉率（通关尸王按 Boss 档、常驻按普通档）。
8. **掉落归属 1 分钟 vs 地上 45 秒消失**：两条都按字面实现，实际
   效果为掉落全程只有击杀者能捡（45 秒后消失，归属期还没过）。
9. **法师/道士没有 tier 0 武器**：`EQUIPS` 里法师最低为 tier 1
   海魂（需 13 级）、道士最低为 tier 2 偃月（需 20 级），故新法师/
   道士开局无武器（与旧版 `newCharacterInit` 行为一致）。如需补，
   请数据负责人补 tier 0 法杖/道剑。
10. **穿戴门槛 85 件全表缺失**：`WEAR_REQ` 只收录有据可查的 14 件，
    其余 71 件无来源（`MISSING_WEAR_REQ`）；`wear:null` 不等于
    「无门槛」，只是未收录。服务端只校验已收录的 14 件 + `reqLv`。
11. **怪物移速缺失**：`MONSTERS` 里大量怪物 `spd` 为 `null`（无来源），
    服务端用默认移速 60；有值的沿用原值。
12. **火球术冷却**：旧版联机规则称固定 0.5 秒；`data.js` 的
    `SKILLS.mage_fireball.cd` 为 1.1。服务端按 `data.js` 的 1.1 秒实现。
13. **灵魂火符耗魔**：MEMORY.md 称「耗魔 5（每级 +2）」；`data.js`
    的 `SKILLS.tao_huofu.mp` 为 5（固定）。服务端按 5 实现。
14. **治愈术回血公式**：旧版为 `6+4×等级+主属性×0.4`；`data.js`
    给的是 `healFormula {base:30, perCharLv:6, perSkillLv:15}`。
    服务端按 `data.js` 的 `30 + 6×人物等级 + 15×技能等级` 实现。
15. **困魔咒定身时长**：旧版 1.2 秒，公开版/`data.js` 为 3 秒。
    服务端按 3 秒实现。
16. **冰咆哮减速时长**：MEMORY.md 为 1.2 秒，公开版为 2.5 秒。
    服务端按 MEMORY.md 的 1.2 秒实现。
17. **传送点点亮是否拦传送**：MEMORY.md 称蜈蚣洞与沃玛寺庙传送点
    需「点亮」；2026-11-23 又确认「所有地图默认可进，req 链不拦进图」。
    服务端折中实现：走路/传送门进图不拦；**传送员传送**到蜈蚣洞/
    沃玛寺庙时需该点已点亮（打掉洞口黄衣僵尸、或打通对应地图），
    其余传送目的地默认可进。如用户要全部传送默认开放，改
    `teleportRoom` 里的一处判断即可。
18. **分层 killTarget**：`STAGES.layerInfo` 里有 `killTarget`（60/70/
    80…），但任务口径为「Boss 进图时即刷在远处」，服务端按后者实现，
    `killTarget` 未使用（Boss 死即开门，不要求先杀满数）。
19. **部分技能伤害 base 为 null**：诱惑之光/地狱火/瞬息移动/大火球/
    集体隐身术/心灵启示/群体治愈术在旧版无 `base`，`data.js` 记
    `base:null`。服务端按各技能语义实现（地狱火/大火球用面板×倍率，
    其余为控制/位移/治疗/召唤，无直接伤害）。
20. **道士开局技能**：`SKILLS.tao_jingshen`（精神力战法）也标
    `initial:true` 且 `req:1`，但 `CLASSES` 的 `initialSkill` 与
    任务口径均为「道士治愈术」单开局技能，旧版开局也只给治愈术。
    服务端新角色只给治愈术；精神力战法需打书习得（1 级即可学）。

## 服务器版 v89 客户端（/actions 兼容层，2026-11-24）

详见 `docs/PORTING-V89.md`。要点：

- 游戏本体是服务器版 artifact 的 `client/dist` 原样产物，放 `public/game/`，
  入口 `/game/`；落地页（`public/index.html`）只做身份对齐 + 认领 + 进入游戏。
- 客户端只调 `POST ./actions`（`/actions` 与 `/game/actions` 同一个 handler，
  见 `lib/actions-shim.js`）：`{action, args, actionCallId}` → `{data}` 或 `{error}`。
- 13 个动作：`listSaves/getSave/putSave/resetSave`（存档，按 cookie 设备隔离）、
  `createRoom/joinRoom/heartbeat/leaveRoom`（内存房间 overlay，与 `lib/game.js`
  的权威房间隔离）、`listAuction/createListing/buyListing/delistListing/claimAuction`
  （独立表 `art_listings`，与联机版拍卖行表隔离）。
- 身份：`localStorage rxcq_server_player_id` 与 cookie `lg_device_id` 取同一值；
  无有效 cookie 访问 `/game/` 会 302 回 `/`。
- 旧 REST/WS 协议与 `lib/game.js` 一字未动；新客户端不走 WebSocket。
