// ============================================================
// 国服服务器版 · 独立联机版 / shared/data.js
// 版本：按国服服务器版 v89，2026-11-23
// 用法：Node 里 require('./data.js')；浏览器里直接 <script src> 后读
//   window.LegendData。客户端 public/data.js 引用同一份文件。
//   本文件只用 var/const 与 module.exports 兜底，不用 import/export。
//
// 数据来源（按优先级）：
//   1. ~/MEMORY.md —— 规则的最终裁决者（血量锚点、技能效果、闪避、
//      尸王殿、技能书全职业书池、1.75 内容上限、穿戴门槛举例、
//      药水三档、死亡掉装、耐久 100、怪物经验倍率 7.8 等）。
//   2. ~/workspace/your_files/guo-fu-fu-wu-qi-ban-gong-kai-ban/
//      guo-fu-fu-wu-qi-ban-gong-kai-ban.html（2026-11-21 从服务器版
//      导出的公开版单文件）——怪物 / 地图 / 技能 / 经验表 / 装备
//      名字池的首要来源，逐项抄录。
//   3. ~/workspace/legend-multiplayer/shared/data.js 与
//      docs/sp-internals.md、docs/rules.md —— 旧版单机版数据，只作
//      参考；凡与 MEMORY.md 或公开版 HTML 冲突，以前两者为准。
//
// 与旧版数据的主要差异（详见文件末尾 DIFF_NOTES）：
//   a. 升级经验改查表法（XP_TABLE，59 项，1→60 级），旧公式
//      300×等级^1.55 已废弃不用；60 级以上服务端用旧公式兜底。
//   b. 职业血量改锚点表（MEMORY.md 2026-11-20 表一），旧版
//      战士 170+14/级、道士 130+9/级已废弃。
//   c. 技能 33 门（战 6 / 法 14 / 道 13），旧版只有 26 门，缺法师
//      诱惑之光 / 地狱火 / 瞬息移动 / 大火球、道士集体隐身术 /
//      心灵启示 / 群体治愈术；技能满级改为 4 级（公开版数组长度
//      与 MEMORY.md 的四档效果一致），旧版 max 5 已废弃。
//   d. 精英整套删除：MONSTERS / STAGES / DROP_RULES 里没有任何
//      精英字段（旧版 eliteQuota、精英倍率、精英技能书档全部取消）。
//   e. 地图 15 张（14 主线 + 未知暗殿隐藏图），世界地图制、整图
//      入口制、比奇城传送员；旧版只有 6 关。
//   f. 药水三档（小/中/大），旧版只有一档。
//   g. 穿戴位 9 个（手镯、戒指各分左右），旧版 7 个。
//   h. 战士耗魔只有半月弯刀 6 与烈火剑法 13，其余战士技能 0；
//      旧版 MP_COST（基本剑术 6 / 攻杀 14 / 刺杀 13 / 野蛮 20）
//      已废弃。治愈术只回血、不伤敌。
//   i. 怪物打玩家伤害 ×0.5；怪物闪避普通 12% / Boss 28%（旧版
//      无闪避，精英 20% 档随精英删除而取消）；耐久上限统一 100
//      （旧版 18+tier×6 已废弃）；灵魂火符按实测表，不走旧公式。
//   j. 伤害取消「每点主属性 +2%」乘区（旧版 DAMAGE_FORMULA 已废弃），
//      改原版实测框架：面板上下限随机发挥 → 乘技能倍率或加技能
//      附加 → 减目标防御/魔御固定值；怪物防御 = floor(等级×0.55)
//      （公开版 hitMonster 实测）。
//
// 已知与来源不一致、按下述口径处理并标注的点：
//   1. 经验表 45→49 级：任务口径（2026-11-23）为
//      100/150/180/220/250M；公开版 HTML 导出为
//      100/120/150/200/250M。本文件按任务口径写，46/47/48 三档
//      与公开版不同，见 XP_TABLE 注释，需主程/用户二选一确认。
//   2. 经验表“51→60”任务口径的 10 个数（350…1000M）对应的是
//      XP_TABLE 第 50~59 项（即 50→51 … 59→60 级），与公开版
//      HTML 完全一致；此处按公开版位置落表。
//   3. 公开版 CLASSES 的 hp/hpLv（战士 60+23/级等）与 MEMORY.md
//      血量锚点表冲突，以 MEMORY.md 锚点为准；魔法基础与成长
//      MEMORY.md 未给，按公开版 CLASSES（mp/mpLv）抄录。
//   4. 防御/魔御基础：公开版为战士 3/1、法师 1/3、道士 2/2；
//      旧版 rules.md 称服务器版战士 8/4、道士 5/2，与公开版冲突，
//      以公开版为准（MEMORY.md 未给防御锚点）。
//   5. 掉率：任务/DROP_RULES 口径（Boss 必掉 1 件 + 50% 再掉 1 件、
//      普通 8%、药水血 5.5%/蓝 5%）与公开版实测代码（Boss 85% /
//      普通 10%、药水合计 8%）不一致，以任务口径为准。
//   6. 尸王殿：MEMORY.md 为 600×600、每小时整波 32 只（1 通关 +
//      31 常驻）、技能书 <25 级 38% / ≥25 级 0.3%；公开版为
//      1500×1500、20 只、Boss 45% / 普通 6% 掉书、Boss 60 秒刷新，
//      以 MEMORY.md 为准。
//   7. 尸王殿之外的 Boss 掉书率：任务口径 Boss 30% / 普通 1.4%，
//      与公开版一致；公开版尸王殿内另有加成，已按第 6 条覆盖。
//   8. 商店药水价：任务口径小/中/大 20/40/80 金币；公开版商店
//      只卖中瓶 30 金币（红回 50% / 蓝回 60%），以任务口径为准。
//   9. 技能满级：公开版为 4 级（效果数组长度 4，sk.lv<3 封顶），
//      旧版为 5 级，以公开版为准。
//  10. 地图解锁：公开版为线性解锁（打通一张图的 Boss 解锁下一张，
//      MAPS.req 链）；MEMORY.md/对齐综述另有“所有地图默认能进”
//      的说法，两者冲突。本文件保留 req 链（from/to），并在
//      STAGES 注释里标注，联机版上线前需用户确认用哪种。
//  11. 多钩猫（比奇野外 Lv4 / 毒蛇山谷 Lv6）、楔蛾（石墓 Lv35 /
//      祖玛寺庙 Lv36）在公开版里同一名字两套数值，MONSTERS 取
//      首次出现值，STAGES 各图怪表保留该图实值，见 MONSTER_NOTES。
//  12. 任务要求“85 件门槛装备逐件核对”：MEMORY.md、公开版 HTML、
//      旧版 data.js 三处来源里只找得到 14 件有据可查的穿戴门槛
//      （见 WEAR_REQ），85 件全表不在任何来源里，未编造；缺的
//      部分见 WEAR_REQ 末尾的 MISSING_WEAR_REQ 说明，需用户或
//      主程补表。
//
// 标记约定：每条数据有 source 字段时，'memory' = MEMORY.md 已定，
//   'public-html' = 公开版 HTML 实查，'old' = 沿用旧版、未核实，
//   'task' = 本次任务口径（2026-11-23）。没有 source 字段的数值
//   默认与所在表的来源说明一致。
// ============================================================

// ---- 全局常量（MEMORY.md / 任务口径） ----
const MONSTER_XP_MUL = 7.8;        // 怪物经验倍率
const MONSTER_DMG_TO_PLAYER_MUL = 0.5; // 怪物打玩家伤害减半
const DODGE = { normal: 0.12, boss: 0.28 }; // 怪物闪避：普通 12% / Boss 28%
const DODGE_PER_ACC = 0.02;        // 每点准确抵消 2% 闪避
const DODGE_MIN = 0.02;            // 闪避最低留 2%
const DEATH_DROP_CHANCE = 0.35;    // 死亡 35% 概率掉 1 件已穿装备
const DEATH_DROP_COUNT = 1;
const DUR_MAX = 100;               // 装备耐久上限统一 100
const MAX_SLOTS = 5;               // 存档位最多 5 个
const ROOM_MAX = 4;                // 房间最多 4 人
// 联机方式（MEMORY.md 2026-11-23 更新）：不要账号注册，就用现在服务
//   器版那种——进游戏创建房间、朋友输 5 位房间码就能进；设备 ID
//   区分玩家 + 一次性认领码绑定用户的三个角色。
const MAX_ACTIVE_SKILLS = 2;       // 操作栏最多 2 门上场技能
const SKILL_MAX_LV = 4;            // 技能满级 4 级（公开版 sk.lv 0..3）
const SKILL_PROF_PER_LV = 1000;    // 技能熟练度每级 1000 点，每命中 1 次 +1
const AUTO_MP_POTION_PCT = 0.60;   // 蓝不够放技能时自动喝魔法瓶，回 60% 魔法
const BAG_CAP = 40;                // 背包上限 40 件（公开版 addToBag）
const START_GOLD = 200;            // 开局金币 200
const VERSION = 'guo-fu-v89-2026-11-23';

// ---- 三职业（血量锚点 MEMORY.md 表一；魔法/防御/准确公开版 CLASSES） ----
// hpAnchors: [等级, 该等级血量上限]，锚点间线性递增；60 级后沿末段增量
//   战士 1/10/20/30/40/50/60 级：100/180/280/380/500/700/900
//   法师 1/10/20/30/40/50/60 级：80/130/180/230/280/350/420
//   道士 1/10/20/30/40/50/60 级：90/150/220/300/380/500/620
// mp: 公开版 CLASSES 的 mp + mpLv×等级（MEMORY.md 未给魔法锚点）。
// def/mdef/acc: 公开版 CLASSES（def/mdef 另见文件头第 4 条冲突说明）。
// 基础准确：战士 5（MEMORY.md），法师/道士公开版同为 5。
// 主属性成长（公开版 calcStats）：战士攻击 [5,9]+0.7/1.1每级；
//   法师魔力 [2,4]+0.8/1.3每级；道士道术 [2,4]+0.7/1.1每级。
const CLASSES = [
  { id:'war', name:'战士', face:'🗡️', mainStat:'atk', mainStatName:'攻击',
    desc:'血厚攻高，近身劈砍。',
    hpAnchors:[[1,100],[10,180],[20,280],[30,380],[40,500],[50,700],[60,900]],
    hpAt60plusPerLv:20,
    mp:15, mpLv:3, atk:[5,9], atkPerLv:[0.7,1.1], def:3, mdef:1, acc:5,
    initialSkill:'war_basic', source:'memory-hp/public-html-rest' },
  { id:'mage', name:'法师', face:'🔮', mainStat:'mag', mainStatName:'魔法',
    desc:'魔法爆发，血少，魔法盾习得后自动开盾。',
    hpAnchors:[[1,80],[10,130],[20,180],[30,230],[40,280],[50,350],[60,420]],
    hpAt60plusPerLv:7,
    mp:50, mpLv:23, atk:[2,4], atkPerLv:[0.7,1.1], mag:[2,4], magPerLv:[0.8,1.3],
    def:1, mdef:3, acc:5,
    initialSkill:'mage_fireball', source:'memory-hp/public-html-rest' },
  { id:'tao', name:'道士', face:'📿', mainStat:'tao', mainStatName:'道术',
    desc:'治愈、火符、召唤，续航最强。',
    hpAnchors:[[1,90],[10,150],[20,220],[30,300],[40,380],[50,500],[60,620]],
    hpAt60plusPerLv:12,
    mp:40, mpLv:16, atk:[3,6], atkPerLv:[0.7,1.1], tao:[2,4], taoPerLv:[0.7,1.1],
    def:2, mdef:2, acc:5,
    initialSkill:'tao_zhiyu', source:'memory-hp/public-html-rest' },
];
function hpAt(clsId, level){
  var c = null;
  for (var i=0;i<CLASSES.length;i++) if (CLASSES[i].id===clsId) c = CLASSES[i];
  if (!c) return 0;
  var a = c.hpAnchors;
  if (level <= a[0][0]) return a[0][1];
  for (var j=0;j<a.length-1;j++){
    if (level <= a[j+1][0]){
      var lv0=a[j][0], hp0=a[j][1], lv1=a[j+1][0], hp1=a[j+1][1];
      return Math.round(hp0 + (hp1-hp0)*(level-lv0)/(lv1-lv0));
    }
  }
  return a[a.length-1][1] + (level-a[a.length-1][0])*c.hpAt60plusPerLv;
}

// ---- 升级经验查表（XP_TABLE[i] = i+1 级升 i+2 级所需经验，共 59 项，覆盖 1→60 级） ----
// 来源：公开版 HTML 的 EXP_TABLE 实查（59 项），33→34 级 3200000 与
//   40→45 级 1200/1600/3000/5000/8000 万、51→60 段 350…1000 万
//   均与任务口径一致，逐项照抄。45→49 级：本表按公开版 EXP_TABLE
//   实查值 100/120/150/200/250M 写；任务口径只给了“1 亿–2.5 亿”
//   区间，中间三档 150/180/220M 是首次下发任务时凭空补的数，
//   无任何出处，已废弃，勿再用。
// 1→40 级其余数值：全部实查自公开版 EXP_TABLE，非按主流表补——
//   公开版即是服务器版导出，主流表仅作交叉核对，未发现出入，
//   故无“按主流表补”的项；20→21 级 140000 与 MEMORY.md 锚点一致。
// 60 级以上：表中无项，服务端用旧公式兜底：
//   expNeed(lv) = floor(1000000000 × 1.15^(lv-59))（公开版 expNeed）。
const XP_TABLE = [
  100, 200, 300, 400, 600, 900, 1200, 1700, 2500, 6000,
  8000, 10000, 15000, 30000, 40000, 50000, 70000, 100000, 120000, 140000,
  250000, 300000, 400000, 500000, 700000, 800000, 1000000, 1100000, 1400000, 1800000,
  2000000, 2500000, 3200000, 3800000, 4500000, 5500000, 6500000, 8000000, 10000000,
  12000000, 16000000, 30000000, 50000000, 80000000,
  100000000, 120000000, 150000000, 200000000, 250000000, // 45→49 级：公开版 EXP_TABLE 实查值
  350000000, 400000000, 450000000, 500000000, 550000000, 600000000, 700000000, 800000000, 900000000, 1000000000
];
function expNeed(lv){
  if (lv <= XP_TABLE.length) return XP_TABLE[lv-1];
  return Math.floor(1000000000 * Math.pow(1.15, lv - XP_TABLE.length));
}

// ---- 技能 33 门（战士 6 / 法师 14 / 道士 13）----
// 来源：公开版 SKILLS 全表实查（req/cd/mp/倍率/附加/破防/侧面/
//   护盾/诱惑数等）。base/growth（Lv.1 基础伤害与每级乘数）只有
//   旧版 SKILL_FORMULAS 有，26 门沿用旧版并标 source:'old'；
//   7 门新增技能（诱惑之光/地狱火/瞬息移动/大火球/集体隐身术/
//   心灵启示/群体治愈术）旧版无 base，记 base:null，勿当 0 用。
// 技能等级：公开版 lv 为 0..3（即 Lv.1~Lv.4），效果数组长度均为 4，
//   与 MEMORY.md 四档效果（烈火 1.4/1.8/2.2/2.6 等）一致；
//   SKILL_MAX_LV = 4，旧版 max 5 已废弃。熟练度每命中 +1，
//   每级 1000 点（SKILL_PROF_PER_LV）。
// 耗魔：战士只有半月弯刀 6、烈火剑法 13，其余 0（MEMORY.md）；
//   法师火球术耗魔 3、灵魂火符耗魔 5（MEMORY.md）。
// 魔法盾：passive + auto，习得后自动释放，不占操作栏（MEMORY.md）。
// 火墙：放最近怪物脚下、持续 8 秒、冷却 1.5 秒、附近没怪不空放，
//   灼烧半径约 59.4（MEMORY.md）；公开版代码写 zones r:118，
//   与本表 radius 59.4 系直径/半径口径之差，见字段 publicZoneR。
// 冰咆哮：作用半径与火墙相同，减速 1.2 秒（MEMORY.md）；公开版
//   slow 2.5 秒，见字段 publicSlowSec，待确认。
// 灵魂火符：伤害以 SOUL_FIRE_TABLE（道术实测表）为准，base 仅供参考。
const SKILLS = {
  // 战士 6 门
  war_basic: { name:'基本剑术', cls:'war', req:1, passive:true, auto:false, cd:null, mp:0,
    base:14, growth:1.4, accPerLv:3, initial:true,
    desc:'被动：每级 +3 准确，并带单体劈砍。建号即会。', source:'public-html/base-old' },
  war_gongsha: { name:'攻杀剑术', cls:'war', req:19, passive:false, auto:false, cd:1.6, mp:0,
    base:38, growth:1.45, add:[5,6,7,8], accPerLv:1, range:95,
    desc:'附加伤害 +5/+6/+7/+8（随技能等级），每级 +1 准确。', source:'public-html/base-old' },
  war_cisha: { name:'刺杀剑法', cls:'war', req:25, passive:false, auto:false, cd:2.2, mp:0,
    base:30, growth:1.42, pierce:[0.4,0.6,0.8,1], range:110,
    desc:'破防：无视目标 40/60/80/100% 防御。', source:'public-html/base-old' },
  war_banyue: { name:'半月弯刀', cls:'war', req:28, passive:false, auto:false, cd:2.6, mp:6,
    base:11, growth:1.4, side:[0.15,0.23,0.30,0.38], range:105, radius:105, sustained:true,
    desc:'横扫周围敌人，侧面目标承受部分伤害。耗魔 6。', source:'public-html/base-old' },
  war_yeman: { name:'野蛮冲撞', cls:'war', req:30, passive:false, auto:false, cd:5, mp:0,
    base:45, growth:1.4, mult:0.8, range:150, knockback:true, maxTargetsByLv:[1,1,2,2],
    desc:'冲向最近的怪并撞退它，3 级可连撞 2 只。', source:'public-html/base-old' },
  war_liehuo: { name:'烈火剑法', cls:'war', req:35, passive:false, auto:false, cd:4.5, mp:13,
    base:26, growth:1.45, mult:[1.4,1.8,2.2,2.6], range:95,
    desc:'倍率 1.4/1.8/2.2/2.6（随技能等级）。耗魔 13。', source:'public-html/base-old' },
  // 法师 14 门
  mage_fireball: { name:'火球术', cls:'mage', req:1, passive:false, auto:false, cd:1.1, mp:3,
    base:15, growth:1.4, mult:1.1, range:330, proj:true, initial:true,
    desc:'直线飞行的小火球，命中第一个敌人，不追踪、不穿透。建号即会。耗魔 3。', source:'public-html/base-old' },
  mage_kangju: { name:'抗拒火环', cls:'mage', req:12, passive:false, auto:false, cd:6, mp:8,
    base:10, growth:1.35, mult:0.4, radius:120, knock:true,
    desc:'推开围住自己的怪并造成少量伤害。', source:'public-html/base-old' },
  mage_youhuo: { name:'诱惑之光', cls:'mage', req:13, passive:false, auto:false, cd:8, mp:12,
    base:null, growth:null, range:320, charm:true, maxCharm:[2,3,4,5],
    desc:'诱惑一只怪为你作战（可召 2/3/4/5 只，随等级）。', source:'public-html' },
  mage_diyuhuo: { name:'地狱火', cls:'mage', req:16, passive:false, auto:false, cd:2.6, mp:10,
    base:null, growth:null, mult:1.2, range:260, radius:70,
    desc:'前方喷出一条火墙般的烈焰。', source:'public-html' },
  mage_leidian: { name:'雷电术', cls:'mage', req:17, passive:false, auto:false, cd:1.5, mp:9,
    base:20, growth:1.4, mult:1.7, range:340,
    desc:'单体高伤雷电，法师主力。', source:'public-html/base-old' },
  mage_shunxi: { name:'瞬息移动', cls:'mage', req:19, passive:false, auto:false, cd:7, mp:10,
    base:null, growth:null, blink:true,
    desc:'瞬间移动到最近的怪附近，脱离包围。', source:'public-html' },
  mage_bigfire: { name:'大火球', cls:'mage', req:19, passive:false, auto:false, cd:1.8, mp:6,
    base:null, growth:null, mult:1.5, range:330, proj:true,
    desc:'更大的火球，伤害更高。', source:'public-html' },
  mage_baolie: { name:'爆裂火焰', cls:'mage', req:22, passive:false, auto:false, cd:2.8, mp:12,
    base:36, growth:1.4, mult:1.3, range:320, radius:95,
    desc:'在目标处爆开的范围火焰。', source:'public-html/base-old' },
  mage_firewall: { name:'火墙', cls:'mage', req:24, passive:false, auto:false, cd:1.5, mp:16,
    base:9, growth:1.35, range:340, radius:59.4, publicZoneR:118, durationSec:8, tickSec:0.5, tickMul:0.5,
    desc:'在最近的怪脚下放火墙，持续 8 秒，附近没怪不空放。', source:'public-html/base-old' },
  mage_jiguang: { name:'疾光电影', cls:'mage', req:26, passive:false, auto:false, cd:2.4, mp:14,
    base:38, growth:1.4, mult:1.8, range:300, radius:60,
    desc:'一条直线上的强力电流。', source:'public-html/base-old' },
  mage_leiguang: { name:'地狱雷光', cls:'mage', req:30, passive:false, auto:false, cd:4, mp:22,
    base:28, growth:1.4, mult:1.6, radius:150,
    desc:'以自己为中心的雷电爆发。', source:'public-html/base-old' },
  mage_shield: { name:'魔法盾', cls:'mage', req:31, passive:true, auto:true, cd:null, mp:0,
    base:0, growth:0, shield:[0.15,0.30,0.45,0.60],
    desc:'被动：习得后自动开盾，抵挡 15/30/45/60% 伤害，不占上场位。', source:'public-html' },
  mage_shengyan: { name:'圣言术', cls:'mage', req:32, passive:false, auto:false, cd:3, mp:18,
    base:46, growth:1.4, mult:2.2, range:320, undeadMul:1.6,
    desc:'对不死系怪物伤害大增的神圣咒语（僵尸/骷髅/尸王 ×1.6）。', source:'public-html/base-old' },
  mage_bingpao: { name:'冰咆哮', cls:'mage', req:35, passive:false, auto:false, cd:3.2, mp:20,
    base:42, growth:1.4, mult:1.9, range:330, radius:59.4, publicRad:118, slow:true, slowSec:1.2, publicSlowSec:2.5,
    desc:'大范围冰咆哮，附带减速，释放时升起旋转冰圈龙卷风（纯视觉，1.6 秒）。', source:'public-html/base-old' },
  // 道士 13 门
  tao_jingshen: { name:'精神力战法', cls:'tao', req:1, passive:true, auto:false, cd:null, mp:0,
    base:22, growth:1.4, accPerLv:3, initial:true,
    desc:'被动：每级 +3 准确，并带单体劈砍。建号即会。', source:'public-html/base-old' },
  tao_zhiyu: { name:'治愈术', cls:'tao', req:1, passive:false, auto:false, cd:3, mp:6,
    base:12, growth:1.35, heal:true, healOnly:true,
    healFormula:{ base:30, perCharLv:6, perSkillLv:15 },
    desc:'只回血、不打怪。建号即会。', source:'public-html/base-old' },
  tao_shidu: { name:'施毒术', cls:'tao', req:14, passive:false, auto:false, cd:2.5, mp:8,
    base:7, growth:1.35, range:300, poison:true, poisonSec:6, defDownMul:0.7, sustained:true,
    desc:'让目标持续掉血并降低防御。', source:'public-html/base-old' },
  tao_huofu: { name:'灵魂火符', cls:'tao', req:18, passive:false, auto:false, cd:1.4, mp:5,
    base:16, growth:1.4, mult:1.5, range:330, proj:true,
    desc:'主力远程火符，耗魔 5。伤害以 SOUL_FIRE_TABLE（道术实测表）为准。', source:'public-html/base-old' },
  tao_kulou: { name:'召唤骷髅', cls:'tao', req:19, passive:false, auto:false, cd:10, mp:15,
    base:13, growth:1.4, summon:'骷髅', summonCountByLv:[1,1,1,2],
    summonHp:{ base:300, perLv:18 }, summonAtk:{ base:16, perLv:1.1 },
    desc:'召唤一只骷髅帮你打怪。', source:'public-html/base-old' },
  tao_yinshen: { name:'隐身术', cls:'tao', req:20, passive:false, auto:false, cd:12, mp:10,
    base:16, growth:1.35, invis:true, invisSec:8,
    desc:'短暂隐身，怪物暂时看不见你。', source:'public-html/base-old' },
  tao_jiti: { name:'集体隐身术', cls:'tao', req:21, passive:false, auto:false, cd:16, mp:14,
    base:null, growth:null, invis:true, invisSec:12,
    desc:'更久的隐身（单机版效果同隐身术，持续更长）。', source:'public-html' },
  tao_youling: { name:'幽灵盾', cls:'tao', req:22, passive:true, auto:false, cd:null, mp:0,
    base:18, growth:1.35, mdefBonus:{ base:2, perLv:1 },
    desc:'被动：提升魔御。', source:'public-html/base-old' },
  tao_shensheng: { name:'神圣战甲术', cls:'tao', req:25, passive:true, auto:false, cd:null, mp:0,
    base:20, growth:1.35, defBonus:{ base:2, perLv:1 },
    desc:'被动：提升防御。', source:'public-html/base-old' },
  tao_xinling: { name:'心灵启示', cls:'tao', req:26, passive:false, auto:false, cd:6, mp:8,
    base:null, growth:null, range:340, reveal:true, markSec:6, markDmgMul:1.25,
    desc:'探查目标，接下来对它伤害提升。', source:'public-html' },
  tao_kunmo: { name:'困魔咒', cls:'tao', req:28, passive:false, auto:false, cd:8, mp:16,
    base:34, growth:1.4, radius:110, range:300, stun:true, stunSec:3,
    desc:'困住一片怪物数秒（公开版定身 3 秒；旧版 1.2 秒，待确认）。', source:'public-html/base-old' },
  tao_qunti: { name:'群体治愈术', cls:'tao', req:33, passive:false, auto:false, cd:6, mp:14,
    base:null, growth:null, heal:true, healOnly:true, bigHeal:true, bigHealPct:0.45,
    desc:'大回复治愈（回 45% 最大生命）。', source:'public-html' },
  tao_shenshou: { name:'召唤神兽', cls:'tao', req:35, passive:false, auto:false, cd:14, mp:25,
    base:24, growth:1.45, summon:'神兽', summonCountByLv:[1,1,2,3],
    summonHp:{ base:900, perLv:40 }, summonAtk:{ base:40, perLv:2.2 },
    desc:'召唤神兽助战，攻防远超骷髅。', source:'public-html/base-old' },
};

// ---- 学习等级表（与 SKILLS.req 同源，公开版 SKILLS 实查） ----
// 注意：精神力战法公开版 req=1（建号即会），旧版 SKILL_REQ 为 9，
//   以公开版为准。
const SKILL_REQ = {
  war_basic:1, war_gongsha:19, war_cisha:25, war_banyue:28, war_yeman:30, war_liehuo:35,
  mage_fireball:1, mage_kangju:12, mage_youhuo:13, mage_diyuhuo:16, mage_leidian:17,
  mage_shunxi:19, mage_bigfire:19, mage_baolie:22, mage_firewall:24, mage_jiguang:26,
  mage_leiguang:30, mage_shield:31, mage_shengyan:32, mage_bingpao:35,
  tao_jingshen:1, tao_zhiyu:1, tao_shidu:14, tao_huofu:18, tao_kulou:19, tao_yinshen:20,
  tao_jiti:21, tao_youling:22, tao_shensheng:25, tao_xinling:26, tao_kunmo:28,
  tao_qunti:33, tao_shenshou:35,
};
const CLASS_SKILLS = {
  war: ['war_basic','war_gongsha','war_cisha','war_banyue','war_yeman','war_liehuo'],
  mage: ['mage_fireball','mage_kangju','mage_youhuo','mage_diyuhuo','mage_leidian','mage_shunxi','mage_bigfire','mage_baolie','mage_firewall','mage_jiguang','mage_leiguang','mage_shield','mage_shengyan','mage_bingpao'],
  tao: ['tao_jingshen','tao_zhiyu','tao_shidu','tao_huofu','tao_kulou','tao_yinshen','tao_jiti','tao_youling','tao_shensheng','tao_xinling','tao_kunmo','tao_qunti','tao_shenshou'],
};
// 持续型技能（习得即自动开启、持续运转）：半月弯刀 / 施毒术（旧版 TOGGLE_SKILLS
//   另含火墙/召唤骷髅/召唤神兽；公开版火墙、召唤为冷却型主动技能，见上表）。
const TOGGLE_SKILLS = { war_banyue:1, tao_shidu:1 };

// ---- 全部普通怪物 54 条（公开版 MAPS.mon 全表实查、去重） ----
// 字段：id / name / lv / hp / xp（基础经验，实战 ×MONSTER_XP_MUL 7.8）/
//   atk（攻击）/ def（防御 = floor(lv×0.55)，公开版 hitMonster 实测）/
//   spd（移速：旧版同名怪有值则沿用并标 old，未核实；无同名怪记 null）/
//   color（公开版颜色）/ maps（出没地图）。
// 注意：多钩猫、楔蛾在公开版里同一名字两套数值——MONSTERS 取首次
//   出现值（比奇野外 Lv4 多钩猫、石墓 Lv35 楔蛾），STAGES 各图怪表
//   保留该图实值（毒蛇山谷 Lv6 多钩猫、祖玛寺庙 Lv36 楔蛾）。
// 尸王、铁链尸王只在尸王殿刷，同时收录于 BOSSES（常驻尸王）。
// 精英已删除：本表无任何精英字段。
const MONSTERS = [
  { id:'ji', name:'鸡', lv:1, hp:5, xp:5, atk:2, def:0, spd:52, color:'#d8cf9a', maps:['biqi_field'], source:'public-html/spd-old' },
  { id:'lu', name:'鹿', lv:2, hp:25, xp:12, atk:3, def:1, spd:66, color:'#b08954', maps:['biqi_field'], source:'public-html/spd-old' },
  { id:'daocaoren', name:'稻草人', lv:3, hp:45, xp:20, atk:5, def:1, spd:44, color:'#c9a44a', maps:['biqi_field'], source:'public-html/spd-old' },
  { id:'duogoumao', name:'多钩猫', lv:4, hp:60, xp:28, atk:7, def:2, spd:74, color:'#8a7f6a', maps:['biqi_field','dushe'], source:'public-html/spd-old', note:'毒蛇山谷另有 Lv6 变体（hp90/xp45/atk10），见 STAGES' },
  { id:'dingpamao', name:'钉耙猫', lv:5, hp:80, xp:38, atk:9, def:2, spd:70, color:'#7d7466', maps:['biqi_field'], source:'public-html/spd-old' },
  { id:'hongshe', name:'红蛇', lv:7, hp:110, xp:60, atk:11, def:3, spd:90, color:'#b0483a', maps:['dushe'], source:'public-html/spd-old' },
  { id:'hushe', name:'虎蛇', lv:9, hp:150, xp:85, atk:14, def:4, spd:86, color:'#c98a3a', maps:['dushe'], source:'public-html/spd-old' },
  { id:'banshouren', name:'半兽人', lv:10, hp:180, xp:110, atk:15, def:5, spd:62, color:'#7a8a4a', maps:['woma_forest'], source:'public-html/spd-old' },
  { id:'senlinxueren', name:'森林雪人', lv:11, hp:210, xp:130, atk:16, def:6, spd:56, color:'#cfd4d8', maps:['woma_forest'], source:'public-html/spd-old', note:'spd 沿用旧版“雪人”' },
  { id:'banshouzhanshi', name:'半兽战士', lv:12, hp:240, xp:150, atk:19, def:6, spd:null, color:'#5f7038', maps:['woma_forest'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'dongqu', name:'洞蛆', lv:12, hp:200, xp:140, atk:17, def:6, spd:60, color:'#9aa05a', maps:['kulou'], source:'public-html/spd-old' },
  { id:'kulou', name:'骷髅', lv:13, hp:260, xp:170, atk:20, def:7, spd:null, color:'#d8d4c4', maps:['kulou'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'bianfu', name:'蝙蝠', lv:13, hp:190, xp:150, atk:21, def:7, spd:null, color:'#5a5a72', maps:['kulou'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'kulouzhanshi', name:'骷髅战士', lv:15, hp:340, xp:230, atk:25, def:8, spd:72, color:'#cac4ae', maps:['kulou'], source:'public-html/spd-old' },
  { id:'padi', name:'爬地僵尸', lv:16, hp:300, xp:220, atk:24, def:8, spd:null, color:'#7a7a5a', maps:['jiangshi'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'kuloujiang', name:'骷髅战将', lv:17, hp:460, xp:320, atk:30, def:9, spd:70, color:'#b8b090', maps:['kulou'], source:'public-html/spd-old' },
  { id:'jiangshi', name:'僵尸', lv:18, hp:310, xp:160, atk:27, def:9, spd:50, color:'#6a7a52', maps:['jiangshi'], source:'public-html/spd-old', note:'公开版僵尸 hp 为 155*2=310' },
  { id:'kuangdong', name:'矿洞僵尸', lv:19, hp:380, xp:300, atk:30, def:10, spd:54, color:'#7d7466', maps:['jiangshi'], source:'public-html/spd-old' },
  { id:'huangyi', name:'黄衣僵尸', lv:20, hp:430, xp:350, atk:33, def:11, spd:null, color:'#c9a44a', maps:['jiangshi'], source:'public-html', note:'spd 无来源，记 null；另为僵尸洞穴三层洞口守卫（见 STAGES.hole）' },
  { id:'womazhanshi', name:'沃玛战士', lv:22, hp:520, xp:480, atk:36, def:12, spd:78, color:'#8a5a3a', maps:['woma'], source:'public-html/spd-old' },
  { id:'huoyanwoma', name:'火焰沃玛', lv:24, hp:580, xp:560, atk:42, def:13, spd:76, color:'#c25a2e', maps:['woma'], source:'public-html/spd-old' },
  { id:'shiwang', name:'尸王', lv:25, hp:900, xp:900, atk:48, def:13, spd:null, color:'#9a8a4a', maps:['shiwang'], source:'public-html', note:'spd 无来源，记 null；尸王殿常驻尸王，见 BOSSES' },
  { id:'womazhanjiang', name:'沃玛战将', lv:26, hp:760, xp:720, atk:46, def:14, spd:null, color:'#7a4a30', maps:['woma'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'tielianshiwang', name:'铁链尸王', lv:27, hp:1150, xp:1050, atk:54, def:14, spd:null, color:'#7a6a3a', maps:['shiwang'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'womaweishi', name:'沃玛卫士', lv:28, hp:950, xp:900, atk:52, def:15, spd:null, color:'#9a6a3a', maps:['woma'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'wugong', name:'蜈蚣', lv:28, hp:700, xp:800, atk:48, def:15, spd:null, color:'#6a7a3a', maps:['wugong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'heiseequ', name:'黑色恶蛆', lv:29, hp:640, xp:760, atk:52, def:15, spd:null, color:'#3a3a3a', maps:['wugong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'tiaotiaofeng', name:'跳跳蜂', lv:30, hp:720, xp:880, atk:55, def:16, spd:null, color:'#b8a03a', maps:['wugong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'qianchong', name:'钳虫', lv:32, hp:980, xp:1150, atk:60, def:17, spd:null, color:'#5a6a4a', maps:['wugong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'hongyezhu', name:'红野猪', lv:32, hp:900, xp:1150, atk:58, def:17, spd:88, color:'#a04a3a', maps:['shimu'], source:'public-html/spd-old' },
  { id:'xieshe', name:'蝎蛇', lv:33, hp:880, xp:1100, atk:60, def:18, spd:82, color:'#8a6a2e', maps:['shimu'], source:'public-html/spd-old' },
  { id:'juxingru', name:'巨型蠕虫', lv:33, hp:1100, xp:1300, atk:63, def:18, spd:null, color:'#7a5a6a', maps:['wugong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'heiyezhu', name:'黑野猪', lv:34, hp:1050, xp:1350, atk:64, def:18, spd:90, color:'#4a3a3a', maps:['shimu'], source:'public-html/spd-old' },
  { id:'xiee', name:'楔蛾', lv:35, hp:960, xp:1250, atk:68, def:19, spd:104, color:'#9a8a6a', maps:['shimu','zuma'], source:'public-html/spd-old', note:'祖玛寺庙另有 Lv36 变体（hp980/xp1300/atk66），见 STAGES' },
  { id:'lang', name:'狼', lv:36, hp:1000, xp:1400, atk:66, def:19, spd:null, color:'#8a8a8a', maps:['mengzhong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'zumashi', name:'祖玛卫士', lv:38, hp:1250, xp:1700, atk:72, def:20, spd:86, color:'#6a6a8a', maps:['zuma'], source:'public-html/spd-old' },
  { id:'zumagjs', name:'祖玛弓箭手', lv:39, hp:1100, xp:1600, atk:82, def:21, spd:82, color:'#5a7a6a', maps:['zuma'], source:'public-html/spd-old' },
  { id:'kujiachong', name:'盔甲虫', lv:40, hp:1500, xp:2000, atk:76, def:22, spd:null, color:'#6a5a3a', maps:['mengzhong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'zumadx', name:'祖玛雕像', lv:40, hp:1450, xp:1950, atk:78, def:22, spd:64, color:'#7a7a94', maps:['zuma'], source:'public-html/spd-old' },
  { id:'duojiaochong', name:'多角虫', lv:42, hp:1700, xp:2300, atk:82, def:23, spd:null, color:'#7a4a3a', maps:['mengzhong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'xueren', name:'雪人', lv:43, hp:1800, xp:2400, atk:84, def:23, spd:56, color:'#dfe4e8', maps:['bairimen'], source:'public-html/spd-old', note:'spd 沿用旧版“雪人”' },
  { id:'banshouyongshi', name:'半兽勇士', lv:44, hp:2000, xp:2700, atk:88, def:24, spd:68, color:'#4c5c2c', maps:['bairimen'], source:'public-html/spd-old', note:'spd 沿用旧版“半兽勇士”；另为沃玛森林 Boss（Lv15），见 BOSSES' },
  { id:'juxingduojiao', name:'巨型多角虫', lv:44, hp:2100, xp:2800, atk:90, def:24, spd:null, color:'#8a3a2e', maps:['mengzhong'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'tianlang', name:'天狼蜘蛛', lv:46, hp:2300, xp:3100, atk:96, def:25, spd:null, color:'#5a4a6a', maps:['bairimen'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'huawen', name:'花吻蜘蛛', lv:47, hp:2500, xp:3400, atk:100, def:25, spd:null, color:'#7a3a5a', maps:['bairimen'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'yuemo', name:'月魔蜘蛛', lv:50, hp:2800, xp:4200, atk:108, def:27, spd:null, color:'#6a3a6a', maps:['chiyue'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'xuejiangshi', name:'血僵尸', lv:52, hp:3200, xp:4800, atk:114, def:28, spd:72, color:'#8a2e3a', maps:['chiyue'], source:'public-html/spd-old', note:'spd 沿用旧版“血僵尸”' },
  { id:'xuejuren', name:'血巨人', lv:54, hp:3800, xp:5500, atk:122, def:29, spd:null, color:'#7a4a3a', maps:['chiyue'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'shuangtoujingang', name:'双头金刚', lv:56, hp:6440, xp:4600, atk:132, def:30, spd:84, color:'#5a6a8a', maps:['chiyue'], source:'public-html/spd-old', note:'公开版 hp 为 4600*1.4=6440；spd 沿用旧版“双头金刚”' },
  { id:'shuangtouxuemo', name:'双头血魔', lv:57, hp:6860, xp:4900, atk:138, def:31, spd:null, color:'#8a3a4a', maps:['chiyue'], source:'public-html', note:'公开版 hp 为 4900*1.4=6860；spd 无来源，记 null' },
  { id:'lu_andian', name:'鹿（暗殿）', lv:40, hp:3000, xp:3000, atk:95, def:22, spd:null, color:'#b08954', maps:['andian'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'daocaoren_andian', name:'稻草人（暗殿）', lv:42, hp:3400, xp:3400, atk:102, def:23, spd:null, color:'#c9a44a', maps:['andian'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'dingpamao_andian', name:'钉耙猫（暗殿）', lv:44, hp:3900, xp:3900, atk:110, def:24, spd:null, color:'#7d7466', maps:['andian'], source:'public-html', note:'spd 无来源，记 null' },
  { id:'ji_andian', name:'鸡（暗殿）', lv:45, hp:4200, xp:4200, atk:116, def:24, spd:null, color:'#d8cf9a', maps:['andian'], source:'public-html', note:'spd 无来源，记 null' },
];

// ---- 全部 Boss 15 条（14 张非安全区地图的图主 + 尸王殿常驻尸王） ----
// 来源：公开版 MAPS.boss 实查（名字/等级/血量/经验/攻击/颜色）。
// gold：公开版 killMonster 的 Boss 金币 = floor(经验×0.12)+随机 0~8+200，
//   此处记固定部分 floor(xp×0.12)+200（随机 0~8 另算），标 derived。
// bookRate：技能书掉率，常规 Boss 0.30（任务口径，与公开版一致）；
//   尸王殿另按 MEMORY.md：<25 级技能书 38%、≥25 级高级书单独 0.3%。
// 闪避：Boss 统一 DODGE.boss = 0.28。
const BOSSES = [
  { id:'boss_dingpa', name:'钉耙猫王', map:'biqi_field', lv:8, hp:600, xp:300, atk:16, gold:236, color:'#a08b57', bookRate:0.30, source:'public-html' },
  { id:'boss_hushe', name:'虎蛇王', map:'dushe', lv:12, hp:900, xp:520, atk:22, gold:262, color:'#d06a2e', bookRate:0.30, source:'public-html' },
  { id:'boss_banshou', name:'半兽勇士', map:'woma_forest', lv:15, hp:1300, xp:800, atk:28, gold:296, color:'#4c5c2c', bookRate:0.30, source:'public-html', note:'与白日门普通怪“半兽勇士”（Lv44）同名不同体' },
  { id:'boss_kulou', name:'骷髅精灵', map:'kulou', lv:20, hp:2200, xp:1500, atk:38, gold:380, color:'#e8e2cc', bookRate:0.30, source:'public-html' },
  { id:'boss_kuangdong', name:'矿洞尸王', map:'jiangshi', lv:24, hp:2600, xp:2000, atk:45, gold:440, color:'#8a7a3a', bookRate:0.30, source:'public-html' },
  { id:'boss_shiwang', name:'通关尸王', map:'shiwang', lv:30, hp:4200, xp:3600, atk:62, gold:632, color:'#c9a44a', bookRate:0.30, bookRateLow:0.38, bookRateHigh:0.003, source:'public-html/memory-shiwang', note:'尸王殿通关尸王：<25 级书 38%、≥25 级高级书单独 0.3%（MEMORY.md）' },
  { id:'boss_shiwang_changzhu', name:'尸王', map:'shiwang', lv:25, hp:900, xp:900, atk:48, gold:308, color:'#9a8a4a', bookRate:0.30, bookRateLow:0.38, bookRateHigh:0.003, regular:true, source:'public-html/memory-shiwang', note:'尸王殿常驻尸王（31 只之一），数值取自尸王殿普通怪“尸王”' },
  { id:'boss_woma', name:'沃玛教主', map:'woma', lv:32, hp:4400, xp:2500, atk:66, gold:500, color:'#4aa06a', bookRate:0.30, source:'public-html', note:'公开版 hp 为 2200*2=4400' },
  { id:'boss_qianchong', name:'邪恶钳虫', map:'wugong', lv:36, hp:5200, xp:2300, atk:78, gold:476, color:'#8a2e2e', bookRate:0.30, source:'public-html' },
  { id:'boss_baiye', name:'白野猪', map:'shimu', lv:38, hp:3000, xp:1600, atk:84, gold:392, color:'#e0dcd2', bookRate:0.30, source:'public-html', note:'公开版 hp 为 1000*3=3000' },
  { id:'boss_zuma', name:'祖玛教主', map:'zuma', lv:45, hp:6000, xp:3000, atk:98, gold:560, color:'#8a6ac9', bookRate:0.30, source:'public-html', note:'公开版 hp 为 3000*2=6000' },
  { id:'boss_duojiao', name:'巨型多角虫王', map:'mengzhong', lv:48, hp:8000, xp:4200, atk:105, gold:704, color:'#a03a2a', bookRate:0.30, source:'public-html' },
  { id:'boss_gangya', name:'钢牙蜘蛛', map:'bairimen', lv:52, hp:11000, xp:6000, atk:118, gold:920, color:'#3a3a4a', bookRate:0.30, source:'public-html' },
  { id:'boss_chiyue', name:'赤月恶魔', map:'chiyue', lv:60, hp:16000, xp:5500, atk:150, gold:860, color:'#a01a2e', bookRate:0.30, source:'public-html', note:'最后一张图赤月峡谷的最终 Boss' },
  { id:'boss_zhenwoma', name:'真·沃玛教主', map:'andian', lv:55, hp:13000, xp:7000, atk:128, gold:1040, color:'#2e8a5a', bookRate:0.30, source:'public-html', note:'未知暗殿 Boss' },
];

// ---- 15 张地图（公开版 MAPS 全表实查） ----
// 世界地图制、整图入口制：每张图的 req = 解锁它的上一张图（公开版
//   线性解锁链，打通一张图的 Boss 解锁下一张）；from/to 列出整图
//   出入口；比奇城有传送员 NPC，传送列表含除未知暗殿外的全部 14 张
//   图（teleport:true）；未知暗殿 teleport:false，只从蜈蚣洞的
//   连接通道进（MEMORY.md + 公开版 darkBtn）。
// 主线通关计数分母为 14（未知暗殿不计入），赤月峡谷为最后一张图。
// 层数 layers：公开版已扁平化为单图、无分层数据；骷髅洞穴 3 层、
//   僵尸洞穴 3 层、石墓 7 层的分层与 killTarget/hpMul/dmgMul/层主
//   沿用旧版单机版数据并标 source:'old'，未核实——世界地图制下
//   是否沿用分层通关口径待确认；其余地图 layers:1。
// 每次重进多层地图都从第一层开始，不读最深层记录（MEMORY.md）。
// count：进图同时刷出的怪物数（公开版 MAPS.count）；尸王殿按
//   MEMORY.md 每小时整波 32 只记 count:32（公开版 count 为 20，
//   已覆盖，见注释）。
const STAGES = [
  { id:'city', name:'比奇城', kind:'city', safe:true, hidden:false, layers:1, count:0,
    w:2600, h:2000, ground:'#3d4a26', desc:'安全区 · 传送员 / 商店 / 维修',
    monsters:[], bossId:null, req:null, unlocks:['biqi_field'], teleport:true,
    from:['*'], to:['biqi_field','dushe','woma_forest','kulou','jiangshi','woma','wugong','shimu','zuma','mengzhong','bairimen','chiyue'], // 尸王殿不在传送列表（只能走僵尸洞三层洞口），未知暗殿也不在
    features:['teleport','shop','repair','auction'],
    note:'进游戏先到比奇城安全区，不刷怪；拍卖行全服共享（服务器版，公开版无拍卖行）。', source:'public-html' },
  { id:'biqi_field', name:'比奇野外', kind:'field', safe:false, hidden:false, layers:1, count:26,
    w:2400, h:1800, ground:'#44512a', desc:'鸡、鹿和钉耙猫出没的草地',
    monsters:[{id:'ji',name:'鸡',lv:1,hp:5,xp:5,atk:2},{id:'lu',name:'鹿',lv:2,hp:25,xp:12,atk:3},{id:'daocaoren',name:'稻草人',lv:3,hp:45,xp:20,atk:5},{id:'duogoumao',name:'多钩猫',lv:4,hp:60,xp:28,atk:7},{id:'dingpamao',name:'钉耙猫',lv:5,hp:80,xp:38,atk:9}],
    bossId:'boss_dingpa', req:null, unlocks:['dushe'], teleport:true,
    from:['city'], to:['dushe'],
    note:'', source:'public-html' },
  { id:'dushe', name:'毒蛇山谷', kind:'field', safe:false, hidden:false, layers:1, count:26,
    w:2400, h:1800, ground:'#4a4423', desc:'红蛇与虎蛇盘踞的山谷',
    monsters:[{id:'hongshe',name:'红蛇',lv:7,hp:110,xp:60,atk:11},{id:'hushe',name:'虎蛇',lv:9,hp:150,xp:85,atk:14},{id:'duogoumao',name:'多钩猫',lv:6,hp:90,xp:45,atk:10}],
    bossId:'boss_hushe', req:'biqi_field', unlocks:['woma_forest'], teleport:true,
    from:['biqi_field'], to:['woma_forest'],
    note:'多钩猫本图为 Lv6 变体。', source:'public-html' },
  { id:'woma_forest', name:'沃玛森林', kind:'field', safe:false, hidden:false, layers:1, count:26,
    w:2400, h:1800, ground:'#37482a', desc:'半兽人与雪人的森林',
    monsters:[{id:'banshouren',name:'半兽人',lv:10,hp:180,xp:110,atk:15},{id:'banshouzhanshi',name:'半兽战士',lv:12,hp:240,xp:150,atk:19},{id:'senlinxueren',name:'森林雪人',lv:11,hp:210,xp:130,atk:16}],
    bossId:'boss_banshou', req:'dushe', unlocks:['kulou'], teleport:true,
    from:['dushe'], to:['kulou'],
    note:'', source:'public-html' },
  { id:'kulou', name:'骷髅洞穴', kind:'dungeon', safe:false, hidden:false, layers:3, count:28,
    w:2300, h:1700, ground:'#33302c', desc:'骷髅与洞蛆的阴暗洞穴',
    monsters:[{id:'kulou',name:'骷髅',lv:13,hp:260,xp:170,atk:20},{id:'dongqu',name:'洞蛆',lv:12,hp:200,xp:140,atk:17},{id:'bianfu',name:'蝙蝠',lv:13,hp:190,xp:150,atk:21},{id:'kulouzhanshi',name:'骷髅战士',lv:15,hp:340,xp:230,atk:25},{id:'kuloujiang',name:'骷髅战将',lv:17,hp:460,xp:320,atk:30}],
    bossId:'boss_kulou', req:'woma_forest', unlocks:['jiangshi'], teleport:true,
    from:['woma_forest'], to:['jiangshi'],
    layerInfo:[{layer:1,killTarget:60,hpMul:3.0,dmgMul:1.7,boss:{name:'骷髅战将王',lv:40,hp:30000,atk:100,xp:400,gold:900}},
      {layer:2,killTarget:60,hpMul:3.6,dmgMul:1.85,boss:{name:'骷髅战将王',lv:44,hp:40000,atk:112,xp:500,gold:1200}},
      {layer:3,killTarget:60,hpMul:4.2,dmgMul:2.0,boss:{name:'骷髅精灵',lv:48,hp:52000,atk:125,xp:600,gold:1500}}],
    note:'分层与层主沿用旧版，未核实。', source:'public-html/layers-old' },
  { id:'jiangshi', name:'僵尸洞穴', kind:'dungeon', safe:false, hidden:false, layers:3, count:28,
    w:2300, h:1700, ground:'#2e2a33', desc:'矿洞深处，僵尸横行',
    monsters:[{id:'padi',name:'爬地僵尸',lv:16,hp:300,xp:220,atk:24},{id:'jiangshi',name:'僵尸',lv:18,hp:310,xp:160,atk:27},{id:'kuangdong',name:'矿洞僵尸',lv:19,hp:380,xp:300,atk:30},{id:'huangyi',name:'黄衣僵尸',lv:20,hp:430,xp:350,atk:33}],
    bossId:'boss_kuangdong', req:'kulou', unlocks:['shiwang'], teleport:true,
    from:['kulou'], to:['shiwang'],
    layerInfo:[{layer:1,killTarget:70,hpMul:5.0,dmgMul:2.15,boss:{name:'铁链僵尸王',lv:50,hp:55000,atk:140,xp:650,gold:1600}},
      {layer:2,killTarget:70,hpMul:5.6,dmgMul:2.3,boss:{name:'铁链僵尸王',lv:53,hp:64000,atk:152,xp:750,gold:1800}},
      {layer:3,killTarget:70,hpMul:6.2,dmgMul:2.45,boss:{name:'矿洞僵尸王',lv:55,hp:70000,atk:160,xp:820,gold:2000}}],
    // 三层通往尸王殿的随机洞口（MEMORY.md 2026-11-19）：黑洞带土沿，
    // 黄衣僵尸只露头和上半身往外爬；走近洞口 240 内约 2.2 秒完全爬出，
    // 爬出后变成一只黄衣僵尸扑向玩家（普通僵尸数值与掉落）；走进洞里
    // 下到尸王殿，落点固定在殿中心。小地图洞口画黄色圆环、🧟 标记。
    hole:{ to:'shiwang', random:true, layer:3, guardian:'黄衣僵尸', triggerDist:240, climbSec:2.2,
      unlocksOnKill:['wugong','woma'],
      note:'打掉洞口爬出的黄衣僵尸，蜈蚣洞与沃玛寺庙传送点同时点亮（bonusLit）；原有打通僵尸洞穴点亮沃玛寺庙、打通沃玛寺庙点亮蜈蚣洞不变。' },
    note:'分层与层主沿用旧版，未核实；洞口规则 MEMORY.md。', source:'public-html/layers-old' },
  { id:'shiwang', name:'尸王殿', kind:'dungeon', safe:false, hidden:false, layers:1, count:32,
    w:600, h:600, ground:'#2a2430', desc:'满殿尸王，技能书的主要产地',
    monsters:[{id:'shiwang',name:'尸王',lv:25,hp:900,xp:900,atk:48},{id:'tielianshiwang',name:'铁链尸王',lv:27,hp:1150,xp:1050,atk:54}],
    bossId:'boss_shiwang', req:'jiangshi', unlocks:['woma'], teleport:true,
    from:['jiangshi'], to:['woma'],
    // 尸王殿整波刷新（MEMORY.md 2026-11-19）：600×600 一屏大小，
    // 6×6 共 32 格，正中 2×2 留空给玩家落脚，其余每格一只：
    // 1 只通关尸王 + 31 只常驻尸王；杀掉的不单独补刷，满一小时
    // 整波补满；每小时最多 32 只；钻洞落点固定在殿中心；通关后
    // 也可留殿里刷。公开版为 1500×1500、20 只、Boss 60 秒刷新，
    // 已按 MEMORY.md 覆盖。
    wave:{ size:600, grid:'6x6', total:32, bossCount:1, regularCount:31, respawnSec:3600, spawnPoint:'center', publicSize:'1500x1500', publicCount:20 },
    note:'只刷尸王；尸王主要爆技能书，装备只剩小概率陪衬。', source:'public-html/memory-shiwang' },
  { id:'woma', name:'沃玛寺庙', kind:'dungeon', safe:false, hidden:false, layers:1, count:28,
    w:2200, h:1700, ground:'#3a2f28', desc:'沃玛教主盘踞的大殿（原沃玛大殿）',
    monsters:[{id:'womazhanshi',name:'沃玛战士',lv:22,hp:520,xp:480,atk:36},{id:'huoyanwoma',name:'火焰沃玛',lv:24,hp:580,xp:560,atk:42},{id:'womazhanjiang',name:'沃玛战将',lv:26,hp:760,xp:720,atk:46},{id:'womaweishi',name:'沃玛卫士',lv:28,hp:950,xp:900,atk:52}],
    bossId:'boss_woma', req:'shiwang', unlocks:['wugong'], teleport:true,
    from:['shiwang'], to:['wugong'],
    note:'', source:'public-html' },
  { id:'wugong', name:'蜈蚣洞', kind:'dungeon', safe:false, hidden:false, layers:1, count:30,
    w:2300, h:1700, ground:'#2f3324', desc:'地牢深处，钳虫与蜈蚣成群',
    monsters:[{id:'wugong',name:'蜈蚣',lv:28,hp:700,xp:800,atk:48},{id:'heiseequ',name:'黑色恶蛆',lv:29,hp:640,xp:760,atk:52},{id:'tiaotiaofeng',name:'跳跳蜂',lv:30,hp:720,xp:880,atk:55},{id:'qianchong',name:'钳虫',lv:32,hp:980,xp:1150,atk:60},{id:'juxingru',name:'巨型蠕虫',lv:33,hp:1100,xp:1300,atk:63}],
    bossId:'boss_qianchong', req:'woma', unlocks:['shimu'], teleport:true,
    from:['woma'], to:['shimu'],
    // 未知暗殿唯一通路：地牢一层东里的连接通道（标牌
    // 「🕯️ 连接通道 → 未知暗殿」），随时能走、不用先通关蜈蚣洞，
    // 殿里出口原路回地牢一层东（MEMORY.md 2026-11-20）。
    darkPassage:{ to:'andian', label:'🕯️ 连接通道 → 未知暗殿', where:'地牢一层东', needClear:false, backTo:'wugong' },
    note:'', source:'public-html' },
  { id:'shimu', name:'石墓', kind:'dungeon', safe:false, hidden:false, layers:7, count:30,
    w:2300, h:1700, ground:'#38322b', desc:'野猪与蝎蛇的石墓，石墓七层有尸王',
    monsters:[{id:'hongyezhu',name:'红野猪',lv:32,hp:900,xp:1150,atk:58},{id:'heiyezhu',name:'黑野猪',lv:34,hp:1050,xp:1350,atk:64},{id:'xieshe',name:'蝎蛇',lv:33,hp:880,xp:1100,atk:60},{id:'xiee',name:'楔蛾',lv:35,hp:960,xp:1250,atk:68}],
    bossId:'boss_baiye', req:'wugong', unlocks:['zuma'], teleport:true,
    from:['wugong'], to:['zuma'],
    layerInfo:[{layer:1,killTarget:80,hpMul:6.0,dmgMul:2.8,boss:{name:'红野猪王',lv:60,hp:90000,atk:190,xp:1100,gold:2600}},
      {layer:2,killTarget:85,hpMul:6.5,dmgMul:2.95,boss:{name:'黑野猪王',lv:62,hp:100000,atk:200,xp:1200,gold:2900}},
      {layer:3,killTarget:90,hpMul:7.0,dmgMul:3.1,boss:{name:'蝎蛇王',lv:64,hp:110000,atk:210,xp:1300,gold:3200}},
      {layer:4,killTarget:90,hpMul:7.6,dmgMul:3.25,boss:{name:'白野猪王',lv:66,hp:120000,atk:220,xp:1400,gold:3500}},
      {layer:5,killTarget:95,hpMul:8.2,dmgMul:3.4,boss:{name:'白野猪王',lv:68,hp:130000,atk:228,xp:1500,gold:3800}},
      {layer:6,killTarget:100,hpMul:8.8,dmgMul:3.55,boss:{name:'邪恶毒蛇',lv:70,hp:140000,atk:232,xp:1550,gold:4000}},
      {layer:7,killTarget:100,hpMul:9.5,dmgMul:3.7,boss:{name:'石墓尸王',lv:72,hp:150000,atk:238,xp:1600,gold:4200}}],
    note:'分层与层主沿用旧版，未核实。', source:'public-html/layers-old' },
  { id:'zuma', name:'祖玛寺庙', kind:'dungeon', safe:false, hidden:false, layers:1, count:30,
    w:2300, h:1700, ground:'#332e38', desc:'祖玛卫士守卫的神殿',
    monsters:[{id:'zumashi',name:'祖玛卫士',lv:38,hp:1250,xp:1700,atk:72},{id:'zumadx',name:'祖玛雕像',lv:40,hp:1450,xp:1950,atk:78},{id:'zumagjs',name:'祖玛弓箭手',lv:39,hp:1100,xp:1600,atk:82},{id:'xiee',name:'楔蛾',lv:36,hp:980,xp:1300,atk:66}],
    bossId:'boss_zuma', req:'shimu', unlocks:['mengzhong'], teleport:true,
    from:['shimu'], to:['mengzhong'],
    note:'楔蛾本图为 Lv36 变体。', source:'public-html' },
  { id:'mengzhong', name:'盟重野外', kind:'field', safe:false, hidden:false, layers:1, count:28,
    w:2400, h:1800, ground:'#57492c', desc:'土城外的荒漠与虫群',
    monsters:[{id:'lang',name:'狼',lv:36,hp:1000,xp:1400,atk:66},{id:'kujiachong',name:'盔甲虫',lv:40,hp:1500,xp:2000,atk:76},{id:'duojiaochong',name:'多角虫',lv:42,hp:1700,xp:2300,atk:82},{id:'juxingduojiao',name:'巨型多角虫',lv:44,hp:2100,xp:2800,atk:90}],
    bossId:'boss_duojiao', req:'zuma', unlocks:['bairimen'], teleport:true,
    from:['zuma'], to:['bairimen'],
    note:'白日门从盟重野外直接进（MEMORY.md）。', source:'public-html' },
  { id:'bairimen', name:'白日门', kind:'field', safe:false, hidden:false, layers:1, count:26,
    w:2500, h:1900, ground:'#3d4f2e', desc:'东临大海，城中安全，城外多蜘蛛',
    monsters:[{id:'banshouyongshi',name:'半兽勇士',lv:44,hp:2000,xp:2700,atk:88},{id:'xueren',name:'雪人',lv:43,hp:1800,xp:2400,atk:84},{id:'tianlang',name:'天狼蜘蛛',lv:46,hp:2300,xp:3100,atk:96},{id:'huawen',name:'花吻蜘蛛',lv:47,hp:2500,xp:3400,atk:100}],
    bossId:'boss_gangya', req:'mengzhong', unlocks:['chiyue'], teleport:true,
    from:['mengzhong'], to:['chiyue'],
    safeZone:{ where:'城中央', monstersEnter:false, note:'城在正中央，城里是安全区不刷怪、怪物进不了城，传送与进图都落城中央。' },
    note:'按原版俯视全图重做：东边临海、西边陆地、中间丛林、城在正中央（MEMORY.md）。', source:'public-html' },
  { id:'chiyue', name:'赤月峡谷', kind:'dungeon', safe:false, hidden:false, layers:1, count:30,
    w:2400, h:1800, ground:'#40262a', desc:'最终之地，赤月恶魔在此',
    monsters:[{id:'yuemo',name:'月魔蜘蛛',lv:50,hp:2800,xp:4200,atk:108},{id:'xuejiangshi',name:'血僵尸',lv:52,hp:3200,xp:4800,atk:114},{id:'xuejuren',name:'血巨人',lv:54,hp:3800,xp:5500,atk:122},{id:'shuangtoujingang',name:'双头金刚',lv:56,hp:6440,xp:4600,atk:132},{id:'shuangtouxuemo',name:'双头血魔',lv:57,hp:6860,xp:4900,atk:138}],
    bossId:'boss_chiyue', req:'bairimen', unlocks:[], teleport:true,
    from:['bairimen'], to:[],
    note:'最后一张图（1.75 内容上限，无赤月峡谷之后地图、无 1.76 重装密室）。', source:'public-html' },
  { id:'andian', name:'未知暗殿', kind:'hidden', safe:false, hidden:true, layers:1, count:24,
    w:2100, h:1600, ground:'#241f2e', desc:'隐藏地图：看似弱小的怪，个个不好惹',
    monsters:[{id:'lu_andian',name:'鹿（暗殿）',lv:40,hp:3000,xp:3000,atk:95},{id:'daocaoren_andian',name:'稻草人（暗殿）',lv:42,hp:3400,xp:3400,atk:102},{id:'dingpamao_andian',name:'钉耙猫（暗殿）',lv:44,hp:3900,xp:3900,atk:110},{id:'ji_andian',name:'鸡（暗殿）',lv:45,hp:4200,xp:4200,atk:116}],
    bossId:'boss_zhenwoma', req:'__hidden__', unlocks:[], teleport:false,
    from:['wugong'], to:['wugong'],
    note:'单独的隐藏地图，不在主线关卡内，不在传送列表与组队建房里；主菜单通关计数分母为 14；出口原路回蜈蚣洞地牢一层东。', source:'public-html' },
];

// ---- 全部装备 94 件（旧版 82 件全表 + 公开版名字池新增 12 件） ----
// 旧版 82 件：逐项抄录旧版 EQUIPS（武器 23 / 衣服 10 / 头盔 7 /
//   项链 7 / 手镯 11 / 戒指 15 / 鞋靴 9），tier/reqLv/属性区间原样，
//   cls 由 warrior/mage/taoist 归一为 war/mage/tao；source:'old'。
//   旧版 reqTxt 保留为 wear 字段：战神盔甲/黑铁头盔需攻击 46、
//   珊瑚戒指需魔法 24、骷髅戒指需攻击 30（与 MEMORY.md 46 一致）。
// 新增 12 件：名字见公开版 ITEM_POOL（龙牙/魔法长袍/灵魂战衣/
//   天珠项链/三眼手镯/魔力手镯/铂金戒指/灵魂项链/龙之手镯）与
//   MEMORY.md 穿戴门槛（力量戒指/骑士戒指/龙之戒指）；数值无来源，
//   记 verified:false，tier/reqLv/属性为按 1.76 常规估值，勿当已核实使用。
// 穿戴门槛 wear 与等级需求 reqLv 是两个字段，分开校验；已穿装备
//   不强制脱下（MEMORY.md）；异职业装备能穿但不计属性。
// 耐久上限统一 DUR_MAX = 100（MEMORY.md），旧版 18+tier×6 已废弃。
const TIER_NAMES = ['普通','优秀','稀有','史诗','传说'];
const EQUIPS = [
  // 武器（旧版 23 件）
  { id:'mujian', name:'木剑', cls:'war', icon:'🗡️', slot:'weapon', slotName:'武器', tier:0, reqLv:1, wear:null, atk:[2,5], source:'old' },
  { id:'bshou', name:'匕首', cls:'war', icon:'🔪', slot:'weapon', slotName:'武器', tier:0, reqLv:1, wear:null, atk:[4,5], source:'old' },
  { id:'qingtongjian', name:'青铜剑', cls:'war', icon:'⚔️', slot:'weapon', slotName:'武器', tier:0, reqLv:3, wear:null, atk:[3,7], source:'old' },
  { id:'tiejian', name:'铁剑', cls:'war', icon:'⚔️', slot:'weapon', slotName:'武器', tier:1, reqLv:9, wear:null, atk:[5,9], source:'old' },
  { id:'duanjian', name:'短剑', cls:'war', icon:'🗡️', slot:'weapon', slotName:'武器', tier:1, reqLv:10, wear:null, atk:[3,11], source:'old' },
  { id:'qingtongfu', name:'青铜斧', cls:'war', icon:'🪓', slot:'weapon', slotName:'武器', tier:1, reqLv:13, wear:null, atk:[0,15], source:'old' },
  { id:'haihun', name:'海魂', cls:'mage', icon:'🔱', slot:'weapon', slotName:'武器', tier:1, reqLv:13, wear:null, atk:[3,10], mag:[1,2], source:'old' },
  { id:'banyue_w', name:'半月', cls:'war', icon:'🌙', slot:'weapon', slotName:'武器', tier:1, reqLv:15, wear:null, atk:[5,10], mag:[0,1], dao:[1,1], source:'old', note:'公开版 ITEM_POOL 把“半月弯刀”列在道士武器池，与旧版战士归属冲突，以旧版为准' },
  { id:'lingfeng', name:'凌风', cls:'war', icon:'💨', slot:'weapon', slotName:'武器', tier:2, reqLv:19, wear:null, atk:[6,12], source:'old' },
  { id:'zhanmadao', name:'斩马刀', cls:'war', icon:'🔪', slot:'weapon', slotName:'武器', tier:2, reqLv:20, wear:null, atk:[5,15], source:'old' },
  { id:'yanyue', name:'偃月', cls:'tao', icon:'🌙', slot:'weapon', slotName:'武器', tier:2, reqLv:20, wear:null, atk:[4,12], dao:[1,3], source:'old' },
  { id:'xiuluo', name:'修罗', cls:'war', icon:'🪓', slot:'weapon', slotName:'武器', tier:2, reqLv:22, wear:null, atk:[0,20], source:'old' },
  { id:'wujigun', name:'无极棍', cls:'tao', icon:'🥢', slot:'weapon', slotName:'武器', tier:2, reqLv:25, wear:null, atk:[8,16], dao:[3,5], source:'old' },
  { id:'lianyu', name:'炼狱', cls:'war', icon:'🔥', slot:'weapon', slotName:'武器', tier:3, reqLv:26, wear:null, atk:[0,25], source:'old' },
  { id:'mozhang', name:'魔杖', cls:'mage', icon:'🪄', slot:'weapon', slotName:'武器', tier:3, reqLv:26, wear:null, mag:[2,5], source:'old' },
  { id:'yinshe', name:'银蛇', cls:'tao', icon:'🐍', slot:'weapon', slotName:'武器', tier:3, reqLv:26, wear:null, atk:[7,14], dao:[1,3], acc:1, source:'old' },
  { id:'jingzhongyue', name:'井中月', cls:'war', icon:'🌙', slot:'weapon', slotName:'武器', tier:3, reqLv:28, wear:null, atk:[7,22], source:'old' },
  { id:'xueyin', name:'血饮', cls:'mage', icon:'🩸', slot:'weapon', slotName:'武器', tier:3, reqLv:28, wear:{ mag:27 }, mag:[3,5], acc:5, source:'old', note:'穿戴门槛需魔法 27（MEMORY.md）' },
  { id:'caijue', name:'裁决之杖', cls:'war', icon:'⚖️', slot:'weapon', slotName:'武器', tier:3, reqLv:30, wear:null, atk:[0,30], source:'old' },
  { id:'tulong', name:'屠龙', cls:'war', icon:'🐲', slot:'weapon', slotName:'武器', tier:3, reqLv:34, wear:null, atk:[5,35], source:'old' },
  { id:'guyu', name:'骨玉权杖', cls:'mage', icon:'🦴', slot:'weapon', slotName:'武器', tier:4, reqLv:35, wear:null, atk:[6,12], mag:[2,6], source:'old' },
  { id:'longwenjian', name:'龙纹剑', cls:'tao', icon:'🐉', slot:'weapon', slotName:'武器', tier:4, reqLv:35, wear:null, atk:[8,20], dao:[3,6], source:'old' },
  { id:'shihun', name:'嗜魂法杖', cls:'mage', icon:'🔮', slot:'weapon', slotName:'武器', tier:4, reqLv:35, wear:null, mag:[2,8], source:'old' },
  { id:'longya', name:'龙牙', cls:'mage', icon:'🐉', slot:'weapon', slotName:'武器', tier:4, reqLv:28, wear:{ mag:28 }, mag:[3,6], acc:1, verified:false, source:'public-html-name/memory-wear', note:'仅公开版出现名字、MEMORY.md 给穿戴门槛需魔法 28；属性为估值，未核实' },
  // 衣服（旧版 10 件 + 新增 2 件）
  { id:'buyi', name:'布衣', cls:'war', icon:'👕', slot:'armor', slotName:'衣服', tier:0, reqLv:1, wear:null, def:[2,2], mdef:[2,3], source:'old' },
  { id:'qingxingkai', name:'轻型盔甲', cls:'mage', icon:'🥋', slot:'armor', slotName:'衣服', tier:1, reqLv:11, wear:null, def:[3,3], mdef:[3,4], source:'old' },
  { id:'zhongxingkai', name:'中型盔甲', cls:'tao', icon:'🛡️', slot:'armor', slotName:'衣服', tier:2, reqLv:16, wear:null, def:[3,5], mdef:[3,5], source:'old' },
  { id:'zhongkui', name:'重盔甲', cls:'war', icon:'🛡️', slot:'armor', slotName:'衣服', tier:2, reqLv:22, wear:null, def:[4,7], mdef:[4,6], source:'old' },
  { id:'emochangpao', name:'恶魔长袍', cls:'mage', icon:'🧥', slot:'armor', slotName:'衣服', tier:3, reqLv:28, wear:{ mag:28 }, def:[4,7], mdef:[3,4], mag:[1,2], source:'old', note:'穿戴门槛需魔法 28（MEMORY.md）' },
  { id:'youlingzhanyi', name:'幽灵战衣', cls:'tao', icon:'👻', slot:'armor', slotName:'衣服', tier:3, reqLv:28, wear:null, def:[4,7], mdef:[3,4], dao:[1,2], source:'old' },
  { id:'zhanshenkui', name:'战神盔甲', cls:'war', icon:'⚜️', slot:'armor', slotName:'衣服', tier:4, reqLv:40, wear:{ atk:46 }, def:[5,9], mdef:[3,5], source:'old', note:'穿戴门槛需攻击 46（MEMORY.md + 旧版 reqTxt）' },
  { id:'shengzhanbaojia', name:'圣战宝甲', cls:'war', icon:'👑', slot:'armor', slotName:'衣服', tier:4, reqLv:40, wear:null, def:[4,10], mdef:[4,8], source:'old' },
  { id:'fashenpifeng', name:'法神披风', cls:'mage', icon:'🧙', slot:'armor', slotName:'衣服', tier:4, reqLv:40, wear:null, def:[4,10], mdef:[4,8], mag:[0,2], source:'old' },
  { id:'tianzundaopao', name:'天尊道袍', cls:'tao', icon:'📿', slot:'armor', slotName:'衣服', tier:4, reqLv:40, wear:null, def:[4,10], mdef:[4,8], dao:[0,2], source:'old' },
  { id:'mofachangpao', name:'魔法长袍', cls:'mage', icon:'🧥', slot:'armor', slotName:'衣服', tier:2, reqLv:22, wear:null, def:[3,5], mdef:[3,5], mag:[0,1], verified:false, source:'public-html-name', note:'仅公开版出现名字；属性为估值，未核实' },
  { id:'linghunzanyi', name:'灵魂战衣', cls:'tao', icon:'👻', slot:'armor', slotName:'衣服', tier:2, reqLv:22, wear:null, def:[3,5], mdef:[3,5], dao:[0,1], verified:false, source:'public-html-name', note:'仅公开版出现名字；属性为估值，未核实' },
  // 头盔（旧版 7 件）
  { id:'qingtongtoukui', name:'青铜头盔', cls:'war', icon:'⛑️', slot:'helmet', slotName:'头盔', tier:1, reqLv:10, wear:null, def:[0,1], source:'old' },
  { id:'mofatoukui', name:'魔法头盔', cls:'mage', icon:'🎩', slot:'helmet', slotName:'头盔', tier:1, reqLv:14, wear:null, def:[1,2], mdef:[0,1], source:'old' },
  { id:'daoshitoukui', name:'道士头盔', cls:'tao', icon:'🙏', slot:'helmet', slotName:'头盔', tier:2, reqLv:24, wear:null, def:[1,2], mdef:[2,3], dao:[0,1], source:'old' },
  { id:'heitietoukui', name:'黑铁头盔', cls:'war', icon:'🪖', slot:'helmet', slotName:'头盔', tier:4, reqLv:38, wear:{ atk:46 }, def:[4,5], mdef:[2,3], source:'old', note:'穿戴门槛需攻击 46（MEMORY.md + 旧版 reqTxt）' },
  { id:'shengzhantoukui', name:'圣战头盔', cls:'war', icon:'👑', slot:'helmet', slotName:'头盔', tier:4, reqLv:40, wear:null, def:[4,5], mdef:[2,3], atk:[0,1], source:'old' },
  { id:'fashentoukui', name:'法神头盔', cls:'mage', icon:'🔮', slot:'helmet', slotName:'头盔', tier:4, reqLv:40, wear:null, def:[4,5], mdef:[1,2], mag:[0,1], source:'old' },
  { id:'tianzuntoukui', name:'天尊头盔', cls:'tao', icon:'📿', slot:'helmet', slotName:'头盔', tier:4, reqLv:40, wear:null, def:[4,5], mdef:[1,2], dao:[0,1], source:'old' },
  // 项链（旧版 7 件 + 新增 1 件）
  { id:'jinxianglian', name:'金项链', cls:'war', icon:'📿', slot:'necklace', slotName:'项链', tier:0, reqLv:2, wear:null, atk:[0,1], source:'old' },
  { id:'chuantong', name:'传统项链', cls:'mage', icon:'📿', slot:'necklace', slotName:'项链', tier:0, reqLv:2, wear:null, mag:[0,1], source:'old' },
  { id:'fenghuang', name:'凤凰明珠', cls:'tao', icon:'🔆', slot:'necklace', slotName:'项链', tier:2, reqLv:17, wear:null, dao:[1,2], acc:1, source:'old', note:'公开版 ITEM_POOL 把凤凰明珠列在法师项链池，与旧版道士归属冲突，以旧版为准' },
  { id:'youlingxianglian', name:'幽灵项链', cls:'war', icon:'👻', slot:'necklace', slotName:'项链', tier:2, reqLv:24, wear:null, atk:[0,5], agi:1, source:'old' },
  { id:'shengming', name:'生命项链', cls:'mage', icon:'💖', slot:'necklace', slotName:'项链', tier:2, reqLv:25, wear:null, mag:[1,5], acc:1, source:'old' },
  { id:'lvse', name:'绿色项链', cls:'war', icon:'💚', slot:'necklace', slotName:'项链', tier:3, reqLv:27, wear:{ atk:39 }, atk:[2,5], source:'old', note:'穿戴门槛需攻击 39（MEMORY.md）' },
  { id:'emolingdang', name:'恶魔铃铛', cls:'mage', icon:'🔔', slot:'necklace', slotName:'项链', tier:3, reqLv:27, wear:null, mag:[0,7], acc:2, source:'old' },
  { id:'linghunxianglian', name:'灵魂项链', cls:'tao', icon:'📿', slot:'necklace', slotName:'项链', tier:3, reqLv:25, wear:{ dao:23 }, dao:[1,5], verified:false, source:'public-html-name/memory-wear', note:'仅公开版出现名字、MEMORY.md 给穿戴门槛需道术 23；属性为估值，未核实' },
  { id:'tianzhuxianglian', name:'天珠项链', cls:'tao', icon:'📿', slot:'necklace', slotName:'项链', tier:3, reqLv:26, wear:null, dao:[1,5], verified:false, source:'public-html-name', note:'仅公开版出现名字；属性为估值，未核实' },
  // 手镯（旧版 11 件 + 新增 2 件）
  { id:'tieshouzhuo', name:'铁手镯', cls:'war', icon:'⭕', slot:'bracelet', slotName:'手镯', tier:0, reqLv:3, wear:null, acc:1, source:'old' },
  { id:'xiaoshouzhuo', name:'小手镯', cls:'mage', icon:'✨', slot:'bracelet', slotName:'手镯', tier:0, reqLv:3, wear:null, agi:1, source:'old' },
  { id:'gangshouzhuo', name:'钢手镯', cls:'war', icon:'⭕', slot:'bracelet', slotName:'手镯', tier:1, reqLv:8, wear:null, def:[0,1], mdef:[0,1], source:'old' },
  { id:'mofashouzhuo', name:'魔法手镯', cls:'mage', icon:'✨', slot:'bracelet', slotName:'手镯', tier:1, reqLv:12, wear:null, def:[0,2], mdef:[0,1], mag:[0,1], source:'old' },
  { id:'daoshishouzhuo', name:'道士手镯', cls:'tao', icon:'📿', slot:'bracelet', slotName:'手镯', tier:1, reqLv:15, wear:null, dao:[0,1], source:'old' },
  { id:'xinling', name:'心灵手镯', cls:'tao', icon:'💗', slot:'bracelet', slotName:'手镯', tier:2, reqLv:21, wear:null, dao:[1,2], source:'old' },
  { id:'yanluo', name:'阎罗手套', cls:'war', icon:'🧤', slot:'bracelet', slotName:'手镯', tier:2, reqLv:25, wear:null, def:[0,4], source:'old' },
  { id:'qishishouzhuo', name:'骑士手镯', cls:'war', icon:'⚔️', slot:'bracelet', slotName:'手镯', tier:3, reqLv:26, wear:null, atk:[2,2], source:'old' },
  { id:'shengzhanshouzhuo', name:'圣战手镯', cls:'war', icon:'👑', slot:'bracelet', slotName:'手镯', tier:4, reqLv:40, wear:null, def:[0,1], atk:[2,3], source:'old' },
  { id:'fashenshouzhuo', name:'法神手镯', cls:'mage', icon:'🔮', slot:'bracelet', slotName:'手镯', tier:4, reqLv:40, wear:null, def:[0,1], mag:[0,2], source:'old' },
  { id:'tianzunshouzhuo', name:'天尊手镯', cls:'tao', icon:'📿', slot:'bracelet', slotName:'手镯', tier:4, reqLv:40, wear:null, def:[0,1], dao:[1,4], source:'old' },
  { id:'longzhishouzhuo', name:'龙之手镯', cls:'mage', icon:'🐉', slot:'bracelet', slotName:'手镯', tier:3, reqLv:26, wear:{ mag:28 }, mag:[0,4], def:[0,1], verified:false, source:'public-html-name/memory-wear', note:'仅公开版出现名字、MEMORY.md 给穿戴门槛需魔法 28；属性为估值，未核实' },
  { id:'sanyanshouzhuo', name:'三眼手镯', cls:'tao', icon:'👁️', slot:'bracelet', slotName:'手镯', tier:3, reqLv:24, wear:{ dao:22 }, dao:[1,3], verified:false, source:'public-html-name/memory-wear', note:'仅公开版出现名字、MEMORY.md 给穿戴门槛需道术 22；属性为估值，未核实' },
  { id:'molishouzhuo', name:'魔力手镯', cls:'mage', icon:'✨', slot:'bracelet', slotName:'手镯', tier:2, reqLv:22, wear:null, mag:[0,2], verified:false, source:'public-html-name', note:'仅公开版出现名字；属性为估值，未核实' },
  // 戒指（旧版 15 件 + 新增 3 件）
  { id:'gutong', name:'古铜戒指', cls:'war', icon:'💍', slot:'ring', slotName:'戒指', tier:0, reqLv:3, wear:null, atk:[0,1], source:'old' },
  { id:'tiejiezhi', name:'铁戒指', cls:'war', icon:'💍', slot:'ring', slotName:'戒指', tier:0, reqLv:7, wear:null, atk:[0,2], source:'old' },
  { id:'zhenzhu', name:'珍珠戒指', cls:'tao', icon:'🦪', slot:'ring', slotName:'戒指', tier:2, reqLv:18, wear:null, dao:[0,2], source:'old' },
  { id:'shanhu', name:'珊瑚戒指', cls:'mage', icon:'🪸', slot:'ring', slotName:'戒指', tier:2, reqLv:24, wear:{ mag:24 }, mag:[0,4], source:'old', note:'穿戴门槛需魔法 24（旧版 reqTxt）' },
  { id:'jiangyao', name:'降妖除魔戒指', cls:'tao', icon:'👹', slot:'ring', slotName:'戒指', tier:2, reqLv:25, wear:null, atk:[1,2], mag:[1,2], dao:[1,2], mdef:[0,4], source:'old' },
  { id:'kuloujie', name:'骷髅戒指', cls:'war', icon:'💀', slot:'ring', slotName:'戒指', tier:3, reqLv:30, wear:{ atk:30 }, atk:[0,3], source:'old', note:'穿戴门槛需攻击 30（旧版 reqTxt）' },
  { id:'zibiluo', name:'紫碧螺', cls:'mage', icon:'💜', slot:'ring', slotName:'戒指', tier:3, reqLv:30, wear:null, mag:[0,5], source:'old' },
  { id:'taitan', name:'泰坦戒指', cls:'tao', icon:'🗿', slot:'ring', slotName:'戒指', tier:3, reqLv:30, wear:null, dao:[2,6], source:'old' },
  { id:'mabi', name:'麻痹戒指', cls:'war', icon:'⚡', slot:'ring', slotName:'戒指', tier:4, reqLv:35, wear:null, atk:[0,1], crit:0.08, source:'old' },
  { id:'hushen', name:'护身戒指', cls:'mage', icon:'🛡️', slot:'ring', slotName:'戒指', tier:4, reqLv:35, wear:null, def:[0,1], hp:45, source:'old' },
  { id:'fuhuo', name:'复活戒指', cls:'tao', icon:'❤️', slot:'ring', slotName:'戒指', tier:4, reqLv:35, wear:null, def:[0,1], mdef:[0,1], hp:70, source:'old' },
  { id:'chuansong', name:'传送戒指', cls:'mage', icon:'🌀', slot:'ring', slotName:'戒指', tier:4, reqLv:35, wear:null, spd:16, source:'old' },
  { id:'shengzhanjie', name:'圣战戒指', cls:'war', icon:'👑', slot:'ring', slotName:'戒指', tier:4, reqLv:40, wear:null, atk:[0,7], mdef:[0,1], source:'old' },
  { id:'fashenjie', name:'法神戒指', cls:'mage', icon:'🔮', slot:'ring', slotName:'戒指', tier:4, reqLv:40, wear:null, mag:[1,6], source:'old' },
  { id:'tianzunjie', name:'天尊戒指', cls:'tao', icon:'📿', slot:'ring', slotName:'戒指', tier:4, reqLv:40, wear:null, dao:[2,6], source:'old' },
  { id:'liliang', name:'力量戒指', cls:'war', icon:'💪', slot:'ring', slotName:'戒指', tier:3, reqLv:26, wear:{ atk:46 }, atk:[0,6], verified:false, source:'memory-wear', note:'MEMORY.md 给穿戴门槛需攻击 46；旧版与公开版均无此装备条目，属性为估值，未核实' },
  { id:'qishijiezhi', name:'骑士戒指', cls:'war', icon:'⚔️', slot:'ring', slotName:'戒指', tier:3, reqLv:26, wear:{ atk:37 }, atk:[2,2], verified:false, source:'memory-wear', note:'MEMORY.md“骑士/龙之戒指 37”；旧版与公开版均无此装备条目，属性为估值，未核实' },
  { id:'longzhijiezhi', name:'龙之戒指', cls:'war', icon:'🐉', slot:'ring', slotName:'戒指', tier:3, reqLv:26, wear:{ atk:37 }, atk:[0,5], verified:false, source:'memory-wear', note:'MEMORY.md“骑士/龙之戒指 37”；旧版与公开版均无此装备条目，属性为估值，未核实' },
  { id:'bojinjiezhi', name:'铂金戒指', cls:'tao', icon:'💍', slot:'ring', slotName:'戒指', tier:3, reqLv:26, wear:null, dao:[0,4], verified:false, source:'public-html-name', note:'仅公开版出现名字；属性为估值，未核实' },
  // 鞋靴 / 腰带（旧版 9 件）
  { id:'buxie', name:'布鞋', cls:'war', icon:'👟', slot:'boots', slotName:'鞋靴', tier:0, reqLv:1, wear:null, def:[0,1], spd:4, source:'old' },
  { id:'lupixue', name:'鹿皮靴', cls:'tao', icon:'👢', slot:'boots', slotName:'鞋靴', tier:1, reqLv:8, wear:null, def:[0,1], spd:6, source:'old' },
  { id:'shoupiyaodai', name:'兽皮腰带', cls:'war', icon:'🎗️', slot:'boots', slotName:'腰带', tier:1, reqLv:12, wear:null, def:[0,1], mdef:[0,1], spd:6, source:'old' },
  { id:'zichouxue', name:'紫绸靴', cls:'mage', icon:'👢', slot:'boots', slotName:'鞋靴', tier:1, reqLv:14, wear:null, def:[0,2], mdef:[0,1], spd:8, source:'old' },
  { id:'tieyaodai', name:'铁腰带', cls:'war', icon:'🎗️', slot:'boots', slotName:'腰带', tier:2, reqLv:20, wear:null, def:[0,2], mdef:[0,2], spd:8, source:'old' },
  { id:'bihunxue', name:'避魂靴', cls:'tao', icon:'👞', slot:'boots', slotName:'鞋靴', tier:2, reqLv:22, wear:null, def:[0,2], mdef:[0,2], spd:10, source:'old' },
  { id:'shengzhanyaodai', name:'圣战腰带', cls:'war', icon:'🎗️', slot:'boots', slotName:'腰带', tier:4, reqLv:40, wear:null, def:[2,3], atk:[0,1], spd:10, source:'old' },
  { id:'fashenyaodai', name:'法神腰带', cls:'mage', icon:'🔥', slot:'boots', slotName:'腰带', tier:4, reqLv:40, wear:null, def:[1,2], mag:[0,1], spd:10, source:'old' },
  { id:'tianzunyaodai', name:'天尊腰带', cls:'tao', icon:'📿', slot:'boots', slotName:'腰带', tier:4, reqLv:40, wear:null, def:[1,2], dao:[0,1], spd:10, source:'old' },
];

// ---- 穿戴门槛总表（装备 id → {atk|mag|dao}，与等级需求 reqLv 分开校验） ----
// 有据可查的 14 件（MEMORY.md 举例 + 旧版 reqTxt），见各条 note。
// 任务要求“85 件门槛装备逐件核对”：85 件全表不在 MEMORY.md、
//   公开版 HTML、旧版 data.js 任何一处来源里，未编造；缺失部分见
//   MISSING_WEAR_REQ，需用户或主程补表后再扩充本表。
const WEAR_REQ = {
  liliang:{ atk:46 }, qishijiezhi:{ atk:37 }, longzhijiezhi:{ atk:37 },
  lvse:{ atk:39 }, heitietoukui:{ atk:46 }, zhanshenkui:{ atk:46 },
  kuloujie:{ atk:30 }, shanhu:{ mag:24 },
  sanyanshouzhuo:{ dao:22 }, linghunxianglian:{ dao:23 },
  longzhishouzhuo:{ mag:28 }, emochangpao:{ mag:28 }, longya:{ mag:28 },
  xueyin:{ mag:27 },
};
const MISSING_WEAR_REQ = '85 件穿戴门槛全表未找到：MEMORY.md 只举例 11 项（力量戒指 46、骑士/龙之戒指 37、绿色项链 39、黑铁/战神 46、三眼道术 22、灵魂项链 23、龙之手镯/恶魔长袍/龙牙魔法 28、血饮魔法 27），旧版另有珊瑚戒指魔法 24、骷髅戒指攻击 30，其余 71 件无来源。本表只收录有据可查的 14 件，勿把 wear:null 理解为“无门槛”。';

// ---- 药水三档（MEMORY.md / 任务口径） ----
// 小/中/大：血瓶回 30%/55%/90% 最大生命，魔法瓶回 30%/60%/95%
//   最大魔法；价格 20/40/80 金币。
// 注意：公开版商店只卖中瓶 30 金币（红回 50% / 蓝回 60%），
//   与本表价格与红瓶回复不一致，以任务口径为准。
// 自动喝蓝：蓝不够放技能时自动喝一瓶魔法瓶，回 60% 魔法
//   （即中瓶档，AUTO_MP_POTION_PCT）；开局中瓶红/蓝各 20 瓶
//   （公开版 newPlayer hpPot/mpPot:20；旧版单机版为各 100 瓶，
//   服务器版开局以公开版 20 瓶为准，见注）。
const POTIONS = {
  tiers: [
    { id:'small', name:'小瓶', hpPct:0.30, mpPct:0.30, price:20 },
    { id:'mid', name:'中瓶', hpPct:0.55, mpPct:0.60, price:40 },
    { id:'big', name:'大瓶', hpPct:0.90, mpPct:0.95, price:80 },
  ],
  startCount: { hp:100, mp:100, tier:'mid' },
  autoMpPct: 0.60,
  note:'开局药水数：任务口径与 MEMORY.md 均为新角色中瓶各 100 瓶；公开版写 20 瓶，但公开版药水系统本身与服务器版口径不符（中瓶回 50%/30 金 vs 服务器版 55%/40 金），属简化复刻，故按任务口径取 100 瓶，待用户确认。',
};

// ---- 商店规则（任务口径；旧版 tradePrice 公式原样保留） ----
// 货架：只卖本职业 tier 0–1 基础装备，无极品；买价 = 估价×2+10，
//   卖价 = 估价；估价 = (30 + 等级需求×6 + 品阶×60 + 属性和×9)
//   × (极品 1.8 : 1)。属性和 = 攻/魔/道/防/魔御上限之和。
// 注意：公开版商店计价为 price = 120+tier×110（shopItem），
//   出售为半价（price/2），与本公式不一致，以任务口径为准；
//   公开版维修为每件 30 金币（repairAll），旧版为缺失耐久×2×(1+tier)，
//   联机版维修计价待主程定，见 SHOP.repairNote。
const SHOP = {
  stockRule:'本职业 tier 0–1 基础装备，无极品',
  buyPrice:'tradePrice * 2 + 10',
  sellPrice:'tradePrice',
  priceFormula:'(30 + reqLv*6 + tier*60 + statSum*9) * (epic ? 1.8 : 1)',
  repairNote:'公开版：维修全部已穿装备每件 30 金币；旧版：缺失耐久×2×(1+tier) 金币/件。联机版采用哪种待定。',
};
function tradePrice(it){
  var statSum = 0;
  [['atk'],['mag'],['dao'],['def'],['mdef']].forEach(function(k){
    var v = it[k[0]];
    if (Array.isArray(v)) statSum += v[1];
  });
  var base = 30 + (it.reqLv||0)*6 + (it.tier||0)*60 + statSum*9;
  return Math.round(base * (it.epic ? 1.8 : 1));
}
function shopBuyPrice(it){ return tradePrice(it)*2 + 10; }

// ---- 灵魂火符实测表（MEMORY.md 2026-11-20：道术 → 伤害） ----
// 道术 5→27、20→40、40→57、60→73；表中未列的道术值线性插值；
// 低于 5 按 5 计、高于 60 按末段斜率外推（73 + (dao-60)×0.8）。
// 实战以本表为准，SKILLS.tao_huofu.base 仅供参考。
const SOUL_FIRE_TABLE = [[5,27],[20,40],[40,57],[60,73]];
function soulFireDmg(dao){
  var t = SOUL_FIRE_TABLE;
  if (dao <= t[0][0]) return t[0][1];
  for (var i=0;i<t.length-1;i++){
    if (dao <= t[i+1][0]){
      var d0=t[i][0], v0=t[i][1], d1=t[i+1][0], v1=t[i+1][1];
      return Math.round(v0 + (v1-v0)*(dao-d0)/(d1-d0));
    }
  }
  return Math.round(t[t.length-1][1] + (dao-t[t.length-1][0])*0.8);
}

// ---- 掉落规则（任务口径 / MEMORY.md；精英档已随精英删除而取消） ----
// 注意：公开版实测代码为 Boss 装备 85% / 普通 10%、药水合计 8%/
//   尸王殿 Boss 掉书 45% / 普通 6%，与本表不一致，以本表为准。
const DROP_RULES = {
  equip:{
    chance:{ boss:1.0, bossSecond:0.5, normal:0.08 },
    note:'Boss 必掉 1 件 + 50% 再掉 1 件；普通怪 8% 掉 1 件。',
    pool:'装备等级需求 ≤ 怪物等级+12，品阶上限 Boss 4 / 普通 2；无候选时退回 reqLv≤8 的池子（旧版规则沿用）',
  },
  jp:{ chance:{ boss:0.50, normal:0 }, bonusSplit:[0.60,0.30,0.10],
    note:'极品：Boss 50% / 普通 0%；+1/+2/+3 为 60/30/10%，加到主属性上限（无主属性则加防御）。' },
  jackpot:{ chance:{ boss:0.03, normal:0.003 }, equips:'6~9 件', potions:'8~12 瓶',
    bonusGold:'80~200 + 怪物等级×10', note:'大爆：Boss 3% / 普通 0.3%。' },
  gold:{ normal:'round((rand(2,6) + 怪物lv × rand(0.4,1.1)))，击杀直接进钱包（旧版公式沿用）',
    boss:'BOSSES.gold 字段（击杀直接获得）' },
  potion:{ hp:0.055, mp:0.05, note:'每只怪一次判定：血瓶 5.5% / 魔法瓶 5%。' },
  skillBook:{ boss:0.30, normal:0.014,
    note:'技能书：Boss 30% / 普通 1.4%；全职业书池，本职业已学或已有的不重复掉；其他职业的书捡进背包后学不了、但可以交易。尸王殿另按 BOSSES.bookRateLow/bookRateHigh（<25 级 38%、≥25 级 0.3%）。' },
  dropLingerSec:45,
};

// ---- 穿戴位 9 个（MEMORY.md：手镯、戒指各分左、右） ----
const SLOT_ORDER = ['weapon','armor','helmet','necklace','braceL','braceR','ringL','ringR','boots'];
const SLOT_LABEL = { weapon:'武器', armor:'衣服', helmet:'头盔', necklace:'项链', braceL:'左手镯', braceR:'右手镯', ringL:'左戒指', ringR:'右戒指', boots:'鞋靴' };
// 穿戴规则：有空位直接穿上，两位都满才替换较弱一件、被换下的回背包；
//   异职业装备能穿但不计属性；已穿装备不强制脱下。

// ---- 矿石（旧版 ORES 全表沿用，未核实） ----
const ORES = [
  { id:'copper', name:'铜矿', icon:'🟠', val:1 },
  { id:'iron', name:'铁矿', icon:'⚫', val:2 },
  { id:'silver', name:'银矿', icon:'⚪', val:4 },
  { id:'gold', name:'金矿', icon:'🟡', val:7 },
  { id:'blackiron', name:'黑铁矿', icon:'💎', val:12 },
];
const ENHANCE = { max:10, cost:'(当前强化等级+1) × 4 点矿石', effect:'每 +1：主属性 +2，衣服/头盔防御 +1', success:'必成功，不碎装备', source:'old' };

// ---- 死亡规则（MEMORY.md） ----
const DEATH_RULE = {
  dropChance:0.35, dropCount:1,
  dropFrom:'优先穿戴装备随机一件（属性同步扣除），无穿戴则从背包备用装备随机一件，交易栏不掉',
  keep:'等级、经验、全部技能（含熟练度）、金币、矿石、药瓶全部保留；满血满蓝重打本关，本关击杀进度与用时重算（旧版规则沿用）',
  source:'memory',
};

// ---- 与旧版数据的主要差异清单（供主程核对） ----
const DIFF_NOTES = [
  'XP：旧公式 300×等级^1.55 废弃，改 XP_TABLE 查表（59 项，1→60 级）；60 级以上服务端用 expNeed 兜底公式。',
  '血量：旧版战士 170+14/级、法师 100+6/级、道士 130+9/级废弃，改 MEMORY.md 锚点表 + hpAt() 线性插值。',
  '技能：旧版 26 门 → 33 门；新增法师诱惑之光/地狱火/瞬息移动/大火球、道士集体隐身术/心灵启示/群体治愈术；满级 5 → 4。',
  '精英：整套删除（eliteQuota、精英倍率、精英技能书 7%、精英极品 30%、精英大爆 1% 全部取消）。',
  '地图：旧版 6 关 → 15 张世界地图（14 主线 + 未知暗殿隐藏图）；整图入口制 + 比奇城传送员；取消进图直达，重进从第一层开始。',
  '药水：旧版一档（血 55%/蓝 60%，40 金币）→ 三档小/中/大（血 30/55/90%、蓝 30/60/95%，20/40/80 金币）。',
  '穿戴位：旧版 7 个 → 9 个（手镯/戒指分左右）。',
  '战士耗魔：旧版基本剑术 6/攻杀 14/刺杀 13/野蛮 20 → 只有半月弯刀 6、烈火剑法 13，其余 0。',
  '治愈术：旧版回血兼圣光伤敌 → 只回血。',
  '怪物伤害：旧版无倍率 → ×0.5；怪物闪避旧版无 → 普通 12%/Boss 28%，准确每点抵消 2%（最低留 2%）。',
  '耐久：旧版上限 18+tier×6 → 统一 100。',
  '伤害：旧版“每点主属性 +2% 伤害”乘区取消，改原版实测框架（面板随机发挥 → 技能倍率/附加 → 减防御/魔御固定值）；怪物防御 = floor(等级×0.55)；灵魂火符按 SOUL_FIRE_TABLE。',
  '怪物经验：旧版 ×1 → ×7.8。',
  '技能书：旧版只出本职业未习得 → 全职业书池（已学/已有不重复掉），异职业书可交易。',
  '存档：旧版单机单档 → 最多 5 个存档位；联机方式为 5 位房间码（无账号注册），设备 ID + 一次性认领码绑定三个角色（MEMORY.md 2026-11-23）。',
  '内容上限：1.75 及以前，无 1.76 重装密室、无赤月峡谷之后地图；封魔谷/自然洞穴/苍月岛/尸魔洞/骨魔洞/牛魔寺庙 6 张图已删。',
];

// ---- 导出 ----
var LegendData = {
  VERSION: VERSION,
  CLASSES: CLASSES, hpAt: hpAt,
  XP_TABLE: XP_TABLE, expNeed: expNeed,
  SKILLS: SKILLS, SKILL_REQ: SKILL_REQ, CLASS_SKILLS: CLASS_SKILLS,
  TOGGLE_SKILLS: TOGGLE_SKILLS, SKILL_MAX_LV: SKILL_MAX_LV,
  SKILL_PROF_PER_LV: SKILL_PROF_PER_LV, MAX_ACTIVE_SKILLS: MAX_ACTIVE_SKILLS,
  MONSTERS: MONSTERS, BOSSES: BOSSES, STAGES: STAGES,
  TIER_NAMES: TIER_NAMES, EQUIPS: EQUIPS, WEAR_REQ: WEAR_REQ,
  MISSING_WEAR_REQ: MISSING_WEAR_REQ, ORES: ORES, ENHANCE: ENHANCE,
  POTIONS: POTIONS, SHOP: SHOP, tradePrice: tradePrice, shopBuyPrice: shopBuyPrice,
  SOUL_FIRE_TABLE: SOUL_FIRE_TABLE, soulFireDmg: soulFireDmg,
  DROP_RULES: DROP_RULES, DEATH_RULE: DEATH_RULE,
  SLOT_ORDER: SLOT_ORDER, SLOT_LABEL: SLOT_LABEL,
  MONSTER_XP_MUL: MONSTER_XP_MUL, MONSTER_DMG_TO_PLAYER_MUL: MONSTER_DMG_TO_PLAYER_MUL,
  DODGE: DODGE, DODGE_PER_ACC: DODGE_PER_ACC, DODGE_MIN: DODGE_MIN,
  DEATH_DROP_CHANCE: DEATH_DROP_CHANCE, DEATH_DROP_COUNT: DEATH_DROP_COUNT,
  DUR_MAX: DUR_MAX, MAX_SLOTS: MAX_SLOTS, ROOM_MAX: ROOM_MAX,
  AUTO_MP_POTION_PCT: AUTO_MP_POTION_PCT, BAG_CAP: BAG_CAP, START_GOLD: START_GOLD,
  DIFF_NOTES: DIFF_NOTES,
};
if (typeof module !== 'undefined' && module.exports) { module.exports = LegendData; }
if (typeof window !== 'undefined') { window.LegendData = LegendData; }
if (typeof globalThis !== 'undefined') { globalThis.LegendData = LegendData; }
