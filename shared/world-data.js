'use strict';
// 由 scripts/gen-world-data.mjs 从服务器版 artifact game-data.ts 生成，勿手改。
// 世界引擎只用 STAGES / MONSTER_MAP / WORLD_HALF / MONSTER_XP_MUL。
"use strict";
// 热血传奇 割草 · 国服服务器版游戏数据（原版 1.75 及以前内容）
// 三职业 / 原版技能 / 怪物 / 15 张按原版分层与连接编排的地图 / 原版装备
// 地图范围（2026-11-20 按用户要求）：只做到 1.75，且封魔谷、自然洞穴与赤月之后的地图
// （苍月岛、尸魔洞、骨魔洞、牛魔寺庙）已按用户要求删除，赤月峡谷为最后一张地图；
// 不含 1.76 新增的六大重装密室（地狱烈焰/堕落坟场/深渊魔域/钳虫巢穴/死亡神殿/困惑殿堂），
// 也不含幻境、圣域、魔龙城等 1.76 之后的内容。
Object.defineProperty(exports, "__esModule", { value: true });
exports.potionTotal = exports.MP_POTION_TIERS = exports.HP_POTION_TIERS = exports.POTION_PRICE = exports.ORES = exports.BOSS_DROPS = exports.DROP_PROFILES = exports.BOOK_HIGH_REQ = exports.GRADE_NAMES = exports.DROP_SETS = exports.EQUIP_BY_NAME = exports.EQUIPS = exports.JP_LABEL = exports.POINT_COLOR_NAMES = exports.POINT_COLORS = exports.TIER_NAMES = exports.EMPTY_GEAR = exports.WORN_LABEL = exports.WORN_SLOTS = exports.SLOT_LABEL = exports.SLOT_ORDER = exports.STAGE_MAP = exports.STAGES = exports.MONSTER_MAP = exports.MONSTERS = exports.BAG_GRID_MIN = exports.MAX_ACTIVE_SKILLS = exports.CLASS_SKILLS = exports.SKILLS = exports.skillMpCost = exports.huofuMpCost = exports.shieldBlock = exports.youhuoCount = exports.yemanTargets = exports.banyueSide = exports.cishaIgnoreDef = exports.gongshaAdd = exports.liehuoMul = exports.DODGE_MIN = exports.DODGE_PER_ACC = exports.DODGE_BOSS = exports.DODGE_NORMAL = exports.GONGSHA_ACC_PER_LEVEL = exports.WARRIOR_BASE_ACC = exports.SKILL_ACC_PER_LEVEL = exports.SKILL_XP_PER_LEVEL = exports.BASIC_ATTACKS = exports.CLASS_NAME = exports.HP_ANCHORS = exports.CLASSES = void 0;
exports.EQUIP_MAX_DUR = exports.MAP_MONSTER_COUNT = exports.MONSTER_XP_MUL = exports.WORLD_HALF = exports.ENH_MAX = void 0;
exports.hpAtLevel = hpAtLevel;
exports.basicAttackOf = basicAttackOf;
exports.bookSellPrice = bookSellPrice;
exports.monsterDodgeChance = monsterDodgeChance;
exports.huofuDamage = huofuDamage;
exports.slotKeys = slotKeys;
exports.wornItems = wornItems;
exports.gearLookOf = gearLookOf;
exports.gearLookToString = gearLookToString;
exports.gearLookFromString = gearLookFromString;
exports.jpPoints = jpPoints;
exports.equipColorOf = equipColorOf;
exports.equipNeedsRoll = equipNeedsRoll;
exports.equipGrade = equipGrade;
exports.pickPotionTier = pickPotionTier;
exports.nextUid = nextUid;
exports.xpNeed = xpNeed;
exports.newSave = newSave;
exports.equipScore = equipScore;
exports.makeEquip = makeEquip;
exports.repairCost = repairCost;
exports.statLines = statLines;
exports.statRows = statRows;
exports.statCompare = statCompare;
exports.wornTotals = wornTotals;
exports.derivedStats = derivedStats;
exports.rollMain = rollMain;
exports.reqStatOf = reqStatOf;
exports.wearReqText = wearReqText;
exports.canWear = canWear;
exports.fmtTime = fmtTime;
exports.CLASSES = [
    {
        id: "warrior", name: "战士", face: "🗡️", sub: "近战 · 血厚防高 · 普攻不耗魔",
        desc: "血厚攻高，贴身肉搏。血量与防御全职业最高：生命按原版 1.76 数值表的 10 级锚点走（1 级 100、10 级 180、20 级 280、30 级 380、40 级 500、50 级 700、60 级 900，锚点之间线性递增），基础防御 8（另带基础魔御 4）。自带普通攻击：贴近怪物自动挥剑平砍，0.9 秒一刀、不消耗魔法，不占操作栏，技能冷却或没蓝时也能一直打。开局只有一门原版 7 级入门的基本剑术，其余技能按 1.76 原版学习等级（19/25/28/30/35）靠打怪爆技能书、在背包里使用习得，依次学攻杀、刺杀、半月、野蛮冲撞、烈火，共 6 门。战士只有半月弯刀、烈火剑法消耗魔法，其余技能不耗魔；战士技能里只有半月弯刀是群体攻击，普通攻击与其余技能都是单体攻击、只打最近的一只怪。基本剑术的属性是命中率：每级被动 +3 点准确，攻杀剑术每级再 +1 点准确（战士基础命中 5 点）——怪物会闪避攻击，准确越高越不容易被闪开。伤害按原版实测框架结算：每次攻击在面板攻击下限至上限之间随机发挥，乘技能倍率（或加技能附加伤害）后减去目标防御。",
        hp: 100, mp: 60, mpLv: 3, hpLv: 20, speed: 212, armor: 8, atk: 15, mag: 0, dao: 0,
        mainKey: "atk", mainLabel: "攻击",
        route: "普通攻击（自带）·基本剑术→攻杀剑术→刺杀剑术→半月弯刀→野蛮冲撞→烈火剑法",
    },
    {
        id: "mage", name: "法师", face: "🔮", sub: "远程 · 火球术起手",
        desc: "身板脆弱却掌控雷火冰。生命按原版 1.76 数值表的 10 级锚点走（1 级 80、10 级 130、20 级 180、30 级 230、40 级 280、50 级 350、60 级 420，锚点之间线性递增）。开局只有火球术，其余技能按 1.76 原版学习等级（12/13/16/17/19/19/22/24/26/30/31/32/35）靠打怪爆技能书、在背包里使用习得，依次学抗拒火环、诱惑之光、地狱火、雷电、瞬息移动、大火球、爆裂火焰、火墙、疾光电影、地狱雷光、魔法盾、圣言术、冰咆哮，共 14 门。伤害按原版实测框架结算：每次攻击在面板魔力下限至上限之间随机发挥，加上技能威力后减去目标魔御。魔法盾习得后自动释放，不占操作栏，按官服口径抵挡 15%/30%/45%/60% 的伤害（随技能等级）。",
        hp: 80, mp: 170, mpLv: 9, hpLv: 6, speed: 202, armor: 0, atk: 0, mag: 15, dao: 0,
        mainKey: "mag", mainLabel: "魔力",
        route: "火球术→抗拒火环→诱惑之光→地狱火→雷电术→瞬息移动→大火球→爆裂火焰→火墙术→疾光电影→地狱雷光→魔法盾→圣言术→冰咆哮",
    },
    {
        id: "taoist", name: "道士", face: "📿", sub: "召唤 · 血防兼备 · 普攻不耗魔",
        desc: "攻守兼备，驱符唤兽。血量与防御仅次于战士、远比法师耐打：生命按原版 1.76 数值表的 10 级锚点走（1 级 90、10 级 150、20 级 220、30 级 300、40 级 380、50 级 500、60 级 620，锚点之间线性递增），基础防御 5（另带基础魔御 2）。自带普通攻击：贴近怪物自动挥剑平砍，0.9 秒一刀、不消耗魔法，不占操作栏，技能冷却或没蓝时也能一直打；普通攻击是单体攻击，只打最近的一只怪。开局只有治愈术，其余技能按 1.76 原版学习等级（9/14/18/19/20/21/22/25/26/28/33/35）靠打怪爆技能书、在背包里使用习得，依次学精神力战法、施毒、火符、召唤骷髅、隐身、集体隐身、幽灵盾、神圣战甲、心灵启示、困魔咒、群体治愈、召唤神兽，共 13 门。治愈术只回复生命、不造成伤害；精神力战法的属性是命中率：每级被动 +3 点准确——怪物会闪避攻击，准确越高越不容易被闪开。伤害按原版实测框架结算：每次攻击在面板道术下限至上限之间随机发挥，加上技能威力后减去目标魔御；灵魂火符的伤害按原版道术实测表校准（道术 5→27、20→40、40→57、60→73）。",
        hp: 90, mp: 110, mpLv: 6, hpLv: 13, speed: 206, armor: 5, atk: 5, mag: 0, dao: 15,
        mainKey: "dao", mainLabel: "道术",
        route: "普通攻击（自带）·治愈术→精神力战法→施毒术→灵魂火符→召唤骷髅→隐身术→集体隐身术→幽灵盾→神圣战甲术→心灵启示→困魔咒→群体治愈术→召唤神兽",
    },
];
/* ---------------- 职业生命锚点（2026-11-20 按原版 1.76 数值表表一） ----------------
 * 表一只给出每 10 级一个锚点（单源、逐级表待核实）；本作逐级血量按用户确认的口径在锚点之间
 * 按段内平均增量线性递增（这是为游戏逐级所需做的插值，不冒充原版逐级表），60 级以上沿用
 * 50→60 段的增量。初始魔法值、每级魔法成长、每级主属性成长公式在表里全部待核实，保持现有。 */
exports.HP_ANCHORS = {
    warrior: [[1, 100], [10, 180], [20, 280], [30, 380], [40, 500], [50, 700], [60, 900]],
    mage: [[1, 80], [10, 130], [20, 180], [30, 230], [40, 280], [50, 350], [60, 420]],
    taoist: [[1, 90], [10, 150], [20, 220], [30, 300], [40, 380], [50, 500], [60, 620]],
};
/** 某职业在某等级的裸生命（不含装备生命加成）：锚点之间线性递增，60 级以上沿用最后一段增量 */
function hpAtLevel(classId, level) {
    const anchors = exports.HP_ANCHORS[classId];
    const lv = Math.max(1, Math.floor(level));
    for (let i = 0; i < anchors.length; i++) {
        const [al, ah] = anchors[i];
        if (lv === al)
            return ah;
        if (lv < al) {
            const [pl, ph] = anchors[i - 1];
            return Math.round(ph + ((ah - ph) / (al - pl)) * (lv - pl));
        }
    }
    const [ll, lh] = anchors[anchors.length - 1];
    const [pl, ph] = anchors[anchors.length - 2];
    return Math.round(lh + ((lh - ph) / (ll - pl)) * (lv - ll));
}
exports.CLASS_NAME = {
    warrior: "战士",
    mage: "法师",
    taoist: "道士",
};
exports.BASIC_ATTACKS = {
    warrior: { name: "普通攻击", icon: "⚔️", cd: 0.9, range: 135, base: 10 },
    taoist: { name: "普通攻击", icon: "🗡️", cd: 0.9, range: 135, base: 10 },
};
function basicAttackOf(classId) {
    return exports.BASIC_ATTACKS[classId] ?? null;
}
// 熟练度规则（2026-11-18 按用户要求）：技能靠命中怪物积攒熟练度，每级固定 1000 点
exports.SKILL_XP_PER_LEVEL = 1000;
/** 技能书卖给商店的回收价（2026-11-19 按用户要求，技能书可在商店出售）：按学习等级定价，等级越高的书越值钱 */
function bookSellPrice(def) {
    return 60 + def.req * 25;
}
/* ---------------- 命中与闪避（2026-11-18 按用户要求；精英怪已于 2026-11-20 按用户要求删除） ----------------
 * 怪物会闪避玩家的攻击：普通怪 12%、Boss 28% 概率闪开（闪开不掉血、不算命中、不积攒熟练度）。
 * 玩家的「准确」抵消闪避：每点准确 −2% 闪避概率，最低保留 2%。
 * 准确来源：装备「准确」属性 + 基本剑术（战士）/ 精神力战法（道士）的被动加成，每级 +3 点——
 * 这两门技能的属性就是命中率（与 1.76 原版一致）。 */
exports.SKILL_ACC_PER_LEVEL = 3;
/** 战士基础命中 5 点（原版 1.76 数值表表一，两处来源一致的基本剑术/攻杀剑术准确口径衔接） */
exports.WARRIOR_BASE_ACC = 5;
/** 攻杀剑术每级 +1 点准确（满级 +3，原版 1.76 数值表表二，两处来源一致） */
exports.GONGSHA_ACC_PER_LEVEL = 1;
exports.DODGE_NORMAL = 0.12;
exports.DODGE_BOSS = 0.28;
exports.DODGE_PER_ACC = 0.02;
exports.DODGE_MIN = 0.02;
/** 某只怪物闪开一次攻击的概率：按普通怪/Boss 定基础值，再被玩家准确抵消（精英怪已删除） */
function monsterDodgeChance(e, acc) {
    const base = e.boss ? exports.DODGE_BOSS : exports.DODGE_NORMAL;
    return Math.max(exports.DODGE_MIN, base - acc * exports.DODGE_PER_ACC);
}
/* ---------------- 技能效果口径（2026-11-20 按原版 1.76 数值表表二已核实项） ----------------
 * 本作技能等级 1 级对应原版 0 级、2 级对应原版 1 级、3 级对应原版 2 级、4 级对应原版 3 级；
 * 5 级是本作扩展，沿用原版 3 级口径封顶。表里待核实的（多数耗魔/冷却/各级伤害/熟练度点数）
 * 全部保持本作现有数值，不在此列。 */
const bySkillLv = (table, lv) => table[Math.min(Math.max(lv, 1), 4) - 1] ?? table[table.length - 1] ?? 0;
/** 烈火剑法倍率 0/1/2/3 级 = 1.4/1.8/2.2/2.6（四源一致） */
const liehuoMul = (lv) => bySkillLv([1.4, 1.8, 2.2, 2.6], lv);
exports.liehuoMul = liehuoMul;
/** 攻杀剑术附加伤害 0/1/2/3 级 = +5/+6/+7/+8（3 级 +8 两源一致，0–2 级取常见引擎口径） */
const gongshaAdd = (lv) => bySkillLv([5, 6, 7, 8], lv);
exports.gongshaAdd = gongshaAdd;
/** 刺杀剑术破防（无视防御）比例 0/1/2/3 级 = 40%/60%/80%/100% */
const cishaIgnoreDef = (lv) => bySkillLv([0.4, 0.6, 0.8, 1], lv);
exports.cishaIgnoreDef = cishaIgnoreDef;
/** 半月弯刀侧面剑气占正面伤害比例 0/1/2/3 级 = 15%/23%/约30%/约38%（正面 100%） */
const banyueSide = (lv) => bySkillLv([0.15, 0.23, 0.3, 0.38], lv);
exports.banyueSide = banyueSide;
/** 野蛮冲撞可撞人数：0–2 级 1 人、3 级 2 人 */
const yemanTargets = (lv) => (lv >= 4 ? 2 : 1);
exports.yemanTargets = yemanTargets;
/** 诱惑之光可召数量 0/1/2/3 级 = 2/3/4/5 只 */
const youhuoCount = (lv) => bySkillLv([2, 3, 4, 5], lv);
exports.youhuoCount = youhuoCount;
/** 魔法盾抵挡比例（官服口径）0/1/2/3 级 = 15%/30%/45%/60% */
const shieldBlock = (lv) => bySkillLv([0.15, 0.3, 0.45, 0.6], lv);
exports.shieldBlock = shieldBlock;
/** 灵魂火符耗魔：基础 5 点，每升 1 级 +2 点（Magic.DB 口径） */
const huofuMpCost = (lv) => 5 + (Math.max(1, lv) - 1) * 2;
exports.huofuMpCost = huofuMpCost;
/** 技能实际耗魔：只有灵魂火符随技能等级涨，其余读 def.mp */
const skillMpCost = (def, lv) => def.id === "huofu" ? (0, exports.huofuMpCost)(lv) : def.mp;
exports.skillMpCost = skillMpCost;
/* ---------------- 灵魂火符伤害校准（2026-11-20 按原版 1.76 数值表表四实测表） ----------------
 * 道术→火符伤害实测（目标黑野猪魔御 0、幸运 10）：道术 5→27、10→32、15→36、20→40、25→44、
 * 30→48、35→52、40→57、45→61、50→65、55→69、60→73。本作按实测点分段线性取值：
 * 5 以下按第一段斜率（每点道术 +1 伤害）外推，60 以上按最后一段斜率（每点道术 +0.8 伤害）外推。
 * 输入是本次发挥的道术（面板下限至上限之间随机），输出是减魔御前的原始伤害。 */
const HUOFU_CAL = [
    [5, 27], [10, 32], [15, 36], [20, 40], [25, 44], [30, 48],
    [35, 52], [40, 57], [45, 61], [50, 65], [55, 69], [60, 73],
];
function huofuDamage(daoRoll) {
    const first = HUOFU_CAL[0];
    const last = HUOFU_CAL[HUOFU_CAL.length - 1];
    if (daoRoll <= first[0])
        return first[1] - (first[0] - daoRoll) * 1;
    if (daoRoll >= last[0])
        return last[1] + (daoRoll - last[0]) * 0.8;
    for (let i = 1; i < HUOFU_CAL.length; i++) {
        const [x1, y1] = HUOFU_CAL[i];
        if (daoRoll <= x1) {
            const [x0, y0] = HUOFU_CAL[i - 1];
            return y0 + ((y1 - y0) / (x1 - x0)) * (daoRoll - x0);
        }
    }
    return last[1];
}
const S = (id, name, icon, cls, reqs, mp, cd, kind, _need, base, grow, desc) => ({ id, name, icon, cls, req: reqs[0], reqs, mp, cd, kind, max: 5, need: [exports.SKILL_XP_PER_LEVEL, exports.SKILL_XP_PER_LEVEL, exports.SKILL_XP_PER_LEVEL, exports.SKILL_XP_PER_LEVEL], base, grow, desc });
exports.SKILLS = {
    // 战士耗魔规则（2026-11-18 按用户要求）：只有半月弯刀、烈火剑法消耗魔法，其余战士技能耗魔为 0、不消耗魔法
    jiben: S("jiben", "基本剑术", "🗡️", "warrior", [7, 11, 16], 0, 1.65, "swing", [40, 90, 160, 260], 14, 1.4, (l) => `原版 7 级入门剑术，属性是命中率：被动 +${exports.SKILL_ACC_PER_LEVEL * l} 点准确（每级 +${exports.SKILL_ACC_PER_LEVEL}），准确抵消怪物的闪避、提高命中率。单体攻击：只劈最近的一只魔物，伤害 = 本次发挥的攻击 + 技能威力 ${Math.round(14 * Math.pow(1.4, l - 1))}，出手快，是战士唯一的初始技能。不消耗魔法。`),
    gongsha: S("gongsha", "攻杀剑术", "⚔️", "warrior", [19, 22, 24], 0, 2.6, "heavy", [25, 60, 110, 180], 38, 1.45, (l) => `单体攻击：每 2.6 秒一记攻杀重斩，只打最近的一只魔物，伤害 = 本次发挥的攻击 + 附加伤害 ${(0, exports.gongshaAdd)(l)}（原版口径 0/1/2/3 级 +5/+6/+7/+8）；被动每级 +${exports.GONGSHA_ACC_PER_LEVEL} 点准确。不消耗魔法。`),
    cisha: S("cisha", "刺杀剑术", "🎯", "warrior", [25, 27, 29], 0, 2.2, "line", [30, 70, 120, 200], 30, 1.42, (l) => `单体攻击：隔位刺杀，剑气只命中最近的一只魔物，伤害 = 本次发挥的攻击 + 技能威力 ${Math.round(30 * Math.pow(1.42, l - 1))}，其中 ${Math.round((0, exports.cishaIgnoreDef)(l) * 100)}% 无视目标防御（原版口径 0/1/2/3 级 40%/60%/80%/100%），不再贯穿一排。不消耗魔法。`),
    banyue: S("banyue", "半月弯刀", "🌙", "warrior", [28, 31, 34], 6, 0.55, "blades", [30, 70, 120, 200], 11, 1.4, (l) => `战士唯一的群体攻击：正对的魔物吃 100% 伤害，侧面魔物只吃剑气伤害 ${Math.round((0, exports.banyueSide)(l) * 100)}%（原版实测口径 0/1/2/3 级 15%/23%/约30%/约38%）。每次命中积攒熟练度。战士技能里只有半月弯刀与烈火剑法消耗魔法。`),
    yeman: S("yeman", "野蛮冲撞", "🐂", "warrior", [30, 34, 39], 0, 4.6, "dash", [8, 20, 36, 60], 45, 1.4, (l) => `冲撞最近的魔物：${l >= 4 ? "一次撞 2 只（原版 3 级口径）" : "一次撞 1 只（原版 3 级起可撞 2 只）"}，对撞中的魔物造成伤害 ${Math.round(45 * Math.pow(1.4, l - 1))} 并将其击退，冲撞后短暂无敌。不消耗魔法。`),
    liehuo: S("liehuo", "烈火剑法", "🔥", "warrior", [35, 37, 40], 13, 1.95, "flame", [25, 60, 110, 180], 26, 1.45, (l) => `单体攻击：对最近的一只魔物挥出烈火剑气，伤害 = 本次发挥的攻击 × ${(0, exports.liehuoMul)(l)} 倍（原版口径 0/1/2/3 级 1.4/1.8/2.2/2.6，四源一致）。战士技能里只有半月弯刀与烈火剑法消耗魔法。`),
    huoqiu: S("huoqiu", "火球术", "🔥", "mage", [7, 11, 16], 3, 0.5, "fireball", [35, 80, 140, 220], 15, 1.4, (l) => `原版 7 级入门魔法，耗魔 3 点。冷却 0.5 秒。火球沿直线飞行，不追踪、不穿透：命中第一个敌人或撞上矿脉等障碍就熄灭。每轮 ${1 + Math.floor(l / 2)} 发，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(15 * Math.pow(1.4, l - 1))}。`),
    kangju: S("kangju", "抗拒火环", "🔆", "mage", [12, 15, 19], 20, 4.0, "knocknova", [12, 28, 50, 85], 10, 1.35, (l) => `爆发抗拒火环，范围 ${105 + l * 12}，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(10 * Math.pow(1.35, l - 1))} 并把贴身魔物强力推开。`),
    youhuo: S("youhuo", "诱惑之光", "🌀", "mage", [13, 18, 24], 20, 6.0, "charm", [20, 45, 80, 130], 10, 1.3, (l) => `诱惑周围最近的 ${(0, exports.youhuoCount)(l)} 只普通魔物（原版口径 0/1/2/3 级可召 2/3/4/5 只）为你而战一段时间，Boss 不受诱惑；诱惑期间它们会攻击其他魔物，你的攻击也不会误伤它们。`),
    diyuhuo: S("diyuhuo", "地狱火", "🔥", "mage", [16, 21, 26], 18, 2.4, "hellfire", [25, 60, 110, 180], 30, 1.4, (l) => `向前方喷出一道地狱火焰，贯穿一排魔物，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(30 * Math.pow(1.4, l - 1))}。`),
    leidian: S("leidian", "雷电术", "⚡", "mage", [17, 20, 23], 16, 1.8, "thunder", [30, 70, 120, 200], 20, 1.4, (l) => `天雷劈向最近的 ${Math.min(2 + l, 7)} 只魔物，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(20 * Math.pow(1.4, l - 1))}。`),
    shunxi: S("shunxi", "瞬息移动", "💨", "mage", [19, 22, 25], 15, 8.0, "teleport", [10, 24, 42, 70], 0, 1, (_l) => `被魔物贴身时自动触发：瞬间移动到附近随机位置脱离包围，并短暂无敌。`),
    dahuoqiu: S("dahuoqiu", "大火球", "🟠", "mage", [19, 23, 25], 10, 1.6, "bigball", [30, 70, 120, 200], 26, 1.4, (l) => `火球术的进阶：射出一颗大火球，沿直线飞行、命中第一个敌人就熄灭，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(26 * Math.pow(1.4, l - 1))}。`),
    baolie: S("baolie", "爆裂火焰", "💥", "mage", [22, 27, 31], 20, 2.9, "blast", [16, 36, 64, 105], 36, 1.4, (l) => `在怪群中引爆爆裂火焰，范围 ${85 + l * 10}，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(36 * Math.pow(1.4, l - 1))}。`),
    huoqiang: S("huoqiang", "火墙术", "🧱", "mage", [24, 29, 33], 3, 0.5, "firewall", [70, 160, 280, 450], 9, 1.35, 
    // 火墙改版（2026-11-19 按用户要求）：释放在当前目标怪物脚下，持续固定 8 秒，实际冷却 1.5 秒（基础 0.5 + 1）；伤害、耗魔不变
    // 火墙面积（2026-11-19 按用户要求）：灼烧面积增大到原来的 2 倍（半径 42→42×√2，见 App.tsx 的 FWALL_R）
    (_l) => `在当前目标怪物脚下放出火墙，持续 8 秒，冷却 1.5 秒，灼烧面积是原来的 2 倍，踏入的魔物被灼烧，每次灼烧命中积攒熟练度。`),
    jiguang: S("jiguang", "疾光电影", "🌟", "mage", [26, 29, 32], 22, 2.7, "beam", [16, 36, 64, 105], 38, 1.4, (l) => `向前方射出一道疾光电影，直线贯穿一排魔物，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(38 * Math.pow(1.4, l - 1))}。`),
    diyu: S("diyu", "地狱雷光", "🌩️", "mage", [30, 32, 34], 28, 3.4, "nova", [14, 32, 56, 90], 28, 1.4, (l) => `以自身为中心爆发雷光，范围 ${110 + l * 18}，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(28 * Math.pow(1.4, l - 1))}。`),
    mohudun: S("mohudun", "魔法盾", "🛡️", "mage", [31, 34, 38], 24, 9, "shield", [6, 14, 25, 40], 0, 1, (l) => `自动释放：习得后自动维持魔法盾，抵挡 ${Math.round((0, exports.shieldBlock)(l) * 100)}% 所受伤害（官服口径 0/1/2/3 级 15%/30%/45%/60%）；不占操作栏名额。`),
    shengyan: S("shengyan", "圣言术", "✨", "mage", [32, 35, 39], 22, 3.8, "holy", [12, 28, 50, 85], 46, 1.4, (l) => `圣言审判怪群最密集处，范围 ${95 + l * 10}，伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(46 * Math.pow(1.4, l - 1))}，对不死系格外致命。`),
    bingpao: S("bingpao", "冰咆哮", "❄️", "mage", [35, 37, 40], 32, 4.0, "ice", [12, 28, 50, 85], 42, 1.4, 
    // 冰咆哮范围（2026-11-19 按用户要求）：作用半径改成与火墙相同（42×√2≈59，见 App.tsx 的 FWALL_R，两技能共用同一半径）；伤害、耗魔、冷却、减速不变
    (l) => `冰咆哮席卷周身，释放时脚下升起旋转的冰圈龙卷风，范围与火墙相同（约 ${Math.round(42 * Math.SQRT2)}），伤害 = 本次发挥的魔力 + 技能威力 ${Math.round(42 * Math.pow(1.4, l - 1))} 并减速魔物。`),
    zhiyu: S("zhiyu", "治愈术", "💚", "taoist", [7, 11, 16], 18, 3.8, "heal", [12, 28, 50, 85], 12, 1.35, (l) => `原版 7 级入门道术。每 3.8 秒回复 ${6 + l * 4} 点生命（随道术提升）。纯治愈技能：只回复生命，不对怪物造成任何伤害。`),
    jingshen: S("jingshen", "精神力战法", "🧘", "taoist", [9, 13, 19], 11, 2.3, "swing", [25, 60, 110, 180], 22, 1.4, (l) => `精神力战法，属性是命中率：被动 +${exports.SKILL_ACC_PER_LEVEL * l} 点准确（每级 +${exports.SKILL_ACC_PER_LEVEL}），准确抵消怪物的闪避、提高命中率。精神力灌注符剑，单体劈砍最近的一只魔物，伤害 = 本次发挥的道术 + 技能威力 ${Math.round(22 * Math.pow(1.4, l - 1))}。`),
    shidu: S("shidu", "施毒术", "☠️", "taoist", [14, 17, 20], 6, 0.6, "poison", [30, 70, 120, 200], 7, 1.35, (l) => `周身毒雾范围 ${90 + l * 22}，魔物身处其中持续掉血并减速。持续施毒计释放次数。`),
    huofu: S("huofu", "灵魂火符", "🧧", "taoist", [18, 21, 24], 5, 1.7, "homing", [35, 80, 140, 220], 16, 1.4, (l) => `火符自动追踪敌人，每轮 ${1 + l} 张。耗魔 ${(0, exports.huofuMpCost)(l)} 点（基础 5 点、每升 1 级 +2 点）。伤害按原版道术实测表校准：道术 5→27、20→40、40→57、60→73（按本次发挥的道术分段取值，再减目标魔御）。`),
    kulou: S("kulou", "召唤骷髅", "💀", "taoist", [19, 23, 26], 2, 1.1, "summon", [45, 110, 200, 320], 13, 1.4, (l) => `召唤骷髅 ${Math.min(1 + Math.floor(l / 3), 2)} 只在旁撕咬，伤害随等级提升。骷髅每次撕咬命中积攒熟练度。`),
    yinshen: S("yinshen", "隐身术", "👻", "taoist", [20, 23, 26], 22, 10, "nova", [10, 24, 42, 70], 16, 1.35, (l) => `隐身气浪冲击周身，范围 120，伤害 = 本次发挥的道术 + 技能威力 ${Math.round(16 * Math.pow(1.35, l - 1))}，并让魔物短暂丢失目标。`),
    jiti: S("jiti", "集体隐身术", "👻", "taoist", [21, 25, 29], 24, 10, "groupinvis", [10, 24, 42, 70], 18, 1.35, (l) => `集体隐身气浪冲击周身，范围 130，伤害 = 本次发挥的道术 + 技能威力 ${Math.round(18 * Math.pow(1.35, l - 1))}，隐身时间比隐身术更长，魔物短暂丢失目标。`),
    youling: S("youling", "幽灵盾", "🔰", "taoist", [22, 24, 26], 22, 9, "nova", [10, 24, 42, 70], 18, 1.35, (l) => `幽灵盾光爆发，范围 125，伤害 = 本次发挥的道术 + 技能威力 ${Math.round(18 * Math.pow(1.35, l - 1))}，并短暂提升自身防御。`),
    shensheng: S("shensheng", "神圣战甲术", "🛡️", "taoist", [25, 27, 29], 22, 9, "nova", [10, 24, 42, 70], 20, 1.35, (l) => `神圣战甲光环爆发，范围 130，伤害 = 本次发挥的道术 + 技能威力 ${Math.round(20 * Math.pow(1.35, l - 1))}，并短暂提升自身防御。`),
    xinling: S("xinling", "心灵启示", "👁️", "taoist", [26, 30, 35], 15, 20, "reveal", [8, 18, 32, 55], 0, 1, (_l) => `心灵启示：20 秒内所有魔物头顶直接显示剩余生命数字，看清血量再决定打哪只。`),
    kunmo: S("kunmo", "困魔咒", "🌀", "taoist", [28, 30, 32], 26, 4.5, "blast", [14, 32, 56, 90], 34, 1.4, (l) => `困魔咒在怪群中炸开，范围 ${90 + l * 10}，伤害 = 本次发挥的道术 + 技能威力 ${Math.round(34 * Math.pow(1.4, l - 1))} 并定身魔物片刻。`),
    qunliao: S("qunliao", "群体治愈术", "💚", "taoist", [33, 35, 38], 26, 6.0, "heal", [12, 28, 50, 85], 12, 1.35, (l) => `群体治愈：每 6 秒回复 ${Math.round((6 + l * 4) * 2.2)} 点生命（随道术提升），回复量约为治愈术的 2.2 倍。纯治愈技能，不造成伤害。`),
    shenshou: S("shenshou", "召唤神兽", "🐕", "taoist", [35, 37, 40], 2, 1.1, "summon", [45, 110, 200, 320], 24, 1.45, (l) => `神兽数量 ${Math.min(1 + Math.floor((l - 1) / 2), 3)} 只，撕咬伤害随等级提升。神兽每次撕咬命中积攒熟练度。`),
};
exports.CLASS_SKILLS = {
    warrior: ["jiben", "gongsha", "cisha", "banyue", "yeman", "liehuo"],
    mage: ["huoqiu", "kangju", "youhuo", "diyuhuo", "leidian", "shunxi", "dahuoqiu", "baolie", "huoqiang", "jiguang", "diyu", "mohudun", "shengyan", "bingpao"],
    taoist: ["zhiyu", "jingshen", "shidu", "huofu", "kulou", "yinshen", "jiti", "youling", "shensheng", "xinling", "kunmo", "qunliao", "shenshou"],
};
exports.MAX_ACTIVE_SKILLS = 2;
// 背包无容量上限：装备、技能书想装多少装多少。此常量只是格子盘最少画出的格子数，东西多了格子盘自动变长。
exports.BAG_GRID_MIN = 24;
const M = (key, lv, emoji, name, hp, spd, dmg, xp, r, color, range = 0) => ({ key, lv, emoji, name, hp, spd, dmg, xp, r, color, range });
exports.MONSTERS = [
    M("ji", 5, "🐔", "鸡", 5, 52, 4, 5, 13, "#e8e0cc"),
    M("lu", 12, "🦌", "鹿", 15, 66, 5, 15, 14, "#b08954"),
    M("daocao", 10, "🌾", "稻草人", 15, 44, 7, 12, 15, "#c9a94e"),
    M("hama", 12, "🐸", "蛤蟆", 20, 58, 8, 15, 14, "#6fae4e"),
    M("duogou", 13, "🐱", "多钩猫", 22, 74, 8, 17, 14, "#8a8f98"),
    M("dingpa", 13, "🐈", "钉耙猫", 23, 70, 9, 18, 14, "#8d9299"),
    M("shiren", 20, "🌺", "食人花", 28, 38, 11, 28, 15, "#c94f6d"),
    M("duzhu", 16, "🕷️", "毒蜘蛛", 42, 88, 10, 42, 14, "#5d4a72"),
    M("banshou", 15, "👹", "半兽人", 30, 62, 10, 25, 16, "#7d9b4e"),
    M("xueren", 16, "⛄", "雪人", 36, 56, 12, 30, 16, "#dfe8ee"),
    M("kulou", 19, "💀", "骷髅战士", 105, 72, 13, 95, 16, "#ddd6c2"),
    M("dongqu", 21, "🐛", "洞蛆", 65, 60, 12, 60, 14, "#9db36a"),
    M("xiezi", 18, "🦂", "蝎子", 45, 80, 17, 45, 15, "#8a5a2b"),
    M("kuloujiang", 20, "💀", "骷髅战将", 110, 70, 20, 100, 18, "#cfc39f"),
    M("toufu", 18, "🪓", "投斧骷髅", 100, 68, 16, 90, 16, "#d8c9a8", 300),
    M("dushe", 16, "🐍", "毒蛇", 125, 84, 14, 4, 15, "#4e8a4a"),
    M("hongshe", 17, "🐍", "红蛇", 50, 90, 16, 50, 15, "#b0402f"),
    M("hushe", 18, "🐍", "虎蛇", 53, 86, 19, 53, 16, "#c78a2e"),
    M("jiangshi", 25, "🧟", "僵尸", 155, 50, 16, 160, 17, "#5f7a5a"),
    M("paxing", 22, "🧟", "爬行僵尸", 165, 64, 17, 5, 16, "#667d52"),
    M("kuangjiang", 25, "⛏️", "矿洞僵尸", 225, 54, 19, 6, 17, "#6b6f66"),
    M("tiejiang", 28, "⛓️", "铁链僵尸", 285, 52, 22, 7, 18, "#59524a"),
    M("bsys", 25, "🪓", "半兽勇士", 300, 68, 18, 6, 17, "#6d8a3e"),
    M("jiaoying", 30, "🦟", "角蝇", 200, 108, 27, 300, 14, "#7a6a4f"),
    M("hongye", 32, "🐗", "红野猪", 330, 88, 30, 320, 18, "#a34a3a"),
    M("xieshe", 35, "🦎", "蝎蛇", 330, 82, 31, 12, 16, "#7d8a3a"),
    M("heiye", 35, "🐗", "黑野猪", 310, 90, 33, 13, 19, "#3d3a38"),
    M("baiye", 50, "🐗", "白野猪", 1000, 92, 33, 1600, 20, "#e3ddd2"),
    M("xiedu", 50, "🐍", "邪恶毒蛇", 1100, 92, 46, 26, 20, "#4a7d3a"),
    // —— 怪物等级/血量/经验基础值已于 2026-11-20 按原版 1.76 数值表表二全面对齐（多源交叉验证，见交付研究报告）：
    // 冲突以 17173 怪物图鉴（S2）为准、牛魔系以 2003 年牛魔洞攻略（S3）为准（牛魔寺庙已于 2026-11-20 按用户要求删除，牛魔系怪物定义保留为死数据、不再刷出）；
    // 表里标「待核实」或仅单源的经验（如尸王、触龙神、赤月恶魔、双头金刚/血魔 4000、邪恶钳虫 1400 等）保持本作原有数值不硬套；
    // 表里没有的怪物（毒蛇、爬行僵尸、矿洞僵尸、铁链僵尸等）保持原有数值。伤害/速度/体型不在表内、不动。
    // 实战血量仍按本作既有规则 = 基础血 × 本层 hpMul（多人加成）；击杀经验 = 基础经验（倍率已取消）。精英怪已于 2026-11-20 按用户要求删除。
    M("yang", 13, "🐑", "羊", 20, 58, 9, 20, 14, "#d8d2c4"),
    M("banshouzhan", 22, "👹", "半兽战士", 100, 64, 16, 6, 16, "#7d9b4e"),
    M("shandong", 20, "🦇", "山洞蝙蝠", 25, 110, 12, 25, 13, "#6a5a7a"),
    M("bianfu", 5, "🦇", "蝙蝠", 3, 105, 8, 25, 12, "#7a6a8a"),
    M("kuijia", 16, "🪲", "盔甲虫", 50, 55, 11, 37, 14, "#5a6e46"),
    M("duojiao", 16, "🐛", "多角虫", 52, 58, 12, 42, 14, "#8a7a4a"),
    M("juxing", 25, "🐛", "巨型多角虫", 280, 60, 18, 8, 18, "#8a7a4a"),
    M("eling", 28, "🧟", "恶灵僵尸", 180, 54, 20, 7, 17, "#5f7a5a"),
    M("fengchong", 26, "🐛", "粪虫", 155, 56, 15, 180, 14, "#9db36a"),
    M("anhei", 26, "🗡️", "暗黑战士", 165, 72, 17, 200, 16, "#4a4a55"),
    M("woma-zhanshi", 30, "⚔️", "沃玛战士", 265, 74, 20, 9, 16, "#7a4a3a"),
    M("woma-yongshi", 30, "🛡️", "沃玛勇士", 285, 72, 21, 280, 16, "#8a5a3a"),
    M("woma-zhanjiang", 30, "🪓", "沃玛战将", 285, 76, 22, 280, 17, "#8a4a2f"),
    M("huoyan-woma", 31, "🔥", "火焰沃玛", 340, 74, 23, 290, 17, "#c25a2e"),
    M("woma-weishi", 50, "🛡️", "沃玛卫士", 1000, 78, 30, 260, 19, "#a8763e"),
    M("wugong", 26, "🐛", "蜈蚣", 230, 62, 17, 8, 17, "#6e5a3a"),
    M("qianchong", 31, "🦂", "钳虫", 270, 66, 22, 10, 16, "#7a5a2b"),
    M("tiaotiao", 26, "🦗", "跳跳蜂", 200, 96, 17, 8, 14, "#a8a03a"),
    M("heie", 28, "🐛", "黑色恶蛆", 230, 88, 19, 9, 14, "#3a3a3a"),
    M("xiee", 32, "🦋", "楔蛾", 220, 92, 18, 350, 14, "#b0a6c8"),
    M("dalaoshu", 24, "🐀", "大老鼠", 385, 84, 19, 330, 15, "#8a7a6a"),
    M("zuma-gong", 40, "🏹", "祖玛弓箭手", 385, 70, 24, 370, 16, "#6a7a8a"),
    M("zuma-diao", 42, "🗿", "祖玛雕像", 495, 48, 26, 450, 18, "#9a958a"),
    M("zuma-wei", 43, "🛡️", "祖玛卫士", 495, 66, 27, 370, 18, "#7a6a4a"),
    M("gumo-qiang", 32, "💀", "骷髅长枪兵", 390, 70, 26, 12, 17, "#ddd6c2"),
    M("gumo-chui", 35, "💀", "骷髅锤兵", 390, 62, 30, 13, 17, "#cfc39f"),
    M("gumo-dao", 35, "💀", "骷髅刀斧手", 440, 74, 30, 13, 17, "#d8d0b8"),
    M("gumo-gong", 32, "💀", "骷髅弓箭手", 190, 72, 28, 12, 16, "#ddd6c2"),
    M("hongmo-zhu", 60, "🐗", "虹魔猪卫", 1500, 88, 28, 24, 19, "#a34a3a"),
    M("hongmo-xie", 60, "🦂", "虹魔蝎卫", 2000, 80, 28, 26, 19, "#8a5a2b"),
    M("niutou", 32, "🐂", "牛头魔", 330, 68, 24, 360, 17, "#8a6a4a"),
    M("niu-zhanshi", 33, "🐂", "牛魔战士", 420, 70, 28, 400, 17, "#8a5a3a"),
    M("niu-doushi", 40, "🐂", "牛魔斗士", 460, 72, 30, 480, 17, "#7a4a30"),
    M("niu-shiwei", 40, "🐂", "牛魔侍卫", 500, 74, 30, 580, 18, "#6a4030"),
    M("niu-jiangjun", 45, "🐂", "牛魔将军", 750, 76, 34, 780, 19, "#5a3428"),
    M("niu-fashi", 40, "🔮", "牛魔法师", 360, 70, 32, 440, 17, "#7a5a8a"),
    M("niu-jisi", 45, "📿", "牛魔祭司", 750, 68, 38, 750, 19, "#8a3a3a"),
    M("tianlang", 43, "🕷️", "天狼蜘蛛", 500, 90, 27, 15, 16, "#5d4a72"),
    M("judu", 50, "🕷️", "剧毒蜘蛛", 1200, 84, 30, 24, 18, "#4a7d3a"),
    M("baoya", 43, "🕷️", "暴牙蜘蛛", 500, 92, 20, 17, 16, "#6a5a7a"),
    M("yuemo", 52, "🕷️", "月魔蜘蛛", 850, 96, 26, 20, 17, "#7a4a6a"),
    M("gangya", 53, "🕷️", "钢牙蜘蛛", 800, 88, 24, 20, 17, "#5a6a7a"),
    M("hee", 53, "🕷️", "黑锷蜘蛛", 1200, 90, 28, 21, 17, "#3a3a44"),
    M("huanying", 53, "🕷️", "幻影蜘蛛", 1200, 94, 10, 19, 16, "#8a7ab0"),
    M("huawen", 54, "🕷️", "花吻蜘蛛", 750, 90, 27, 21, 17, "#c94f6d"),
    M("xuejiang", 55, "🧟", "血僵尸", 1200, 60, 32, 24, 18, "#8a3a3a"),
    M("xuejuren", 55, "👹", "血巨人", 1200, 64, 36, 26, 20, "#9a4a3a"),
    M("xieju", 54, "👹", "邪恶巨人", 2000, 62, 40, 28, 21, "#6a3a5a"),
    // —— 2026-11-20 按盛大原版 1.76 地图研究报告（只取 1.75 及以前内容）补入的怪物 ——
    // 巨型蠕虫（蜈蚣洞/死亡山谷）、骷髅武士与半兽武士（苍月岛野外）、骨魔战士/法师/将领（骨魔洞）、
    // 尸魔（骨魔洞五层少量、尸魔洞）。原版无公开精确数值表：等级按报告推荐区间取，
    // 血量/经验按本作同档怪物口径定，不冒充原版数值。
    M("juxing-worm", 30, "🐛", "巨型蠕虫", 300, 55, 24, 260, 18, "#7a6a4a"),
    M("kulou-wushi", 28, "💀", "骷髅武士", 300, 70, 24, 260, 16, "#ddd6c2"),
    M("banshou-wushi", 30, "👹", "半兽武士", 260, 66, 22, 240, 17, "#6d8a3e"),
    M("gumo-zhanshi", 33, "💀", "骨魔战士", 420, 68, 27, 330, 17, "#cfc39f"),
    M("gumo-fashi", 34, "💀", "骨魔法师", 380, 66, 30, 350, 17, "#b8a888"),
    M("gumo-jiangling", 38, "💀", "骨魔将领", 520, 64, 32, 480, 19, "#a89878"),
    M("shimo", 30, "🧟", "尸魔", 350, 56, 24, 300, 17, "#5f7a5a"),
];
exports.MONSTER_MAP = Object.fromEntries(exports.MONSTERS.map((m) => [m.key, m]));
const B = (name, emoji, lv, hp, spd, dmg, xp, r, gold, color) => ({ name, emoji, lv, hp, spd, dmg, xp, r, gold, color });
exports.STAGES = [
    {
        id: 1, name: "新手村", full: "地图一 · 新手村", face: "🏡", mine: false,
        desc: "出生的小村子（银杏山谷）。鹿、鸡还在村口转悠，稻草人立在田边，多钩猫、钉耙猫在林边窜动，毒蜘蛛藏在草丛里——先把村子守住再谈玛法。村外有三个入口：一个通往比奇野外，一个是比奇城北半兽人古墓的入口（骷髅洞穴），还有一条南去边界村的路。",
        clearLine: "新手村守住了，村民把干粮塞进了你的行囊",
        layers: [{
                name: "新手村", label: "银杏山谷 · 村外草地与土路", ground: "#22301a",
                pool: ["lu", "ji", "dingpa", "daocao", "duogou", "duzhu"],
                killTarget: 200, hpMul: 1, dmgMul: 1, monsterCount: 300,
                boss: B("钉耙猫王", "🐈", 12, 3400, 74, 36, 90, 36, 220, "#8d9299"),
            }],
    },
    {
        id: 20, name: "边界村", full: "地图二 · 边界村", face: "🏘️", mine: false,
        desc: "比奇省南边的边境小村（与银杏山谷并列的新手村）：村外田野里鸡、鹿悠闲踱步，稻草人立在田边，多钩猫在村口窜动。这片田野最凶的就是多钩猫王，击败它即算通关。",
        clearLine: "边界村守住了，村民们又能安心下地了",
        layers: [{
                name: "边界村", label: "边界村 · 村外田野", ground: "#24301c",
                pool: ["ji", "lu", "daocao", "duogou"],
                killTarget: 120, hpMul: 0.9, dmgMul: 0.95, monsterCount: 220,
                boss: B("多钩猫王", "🐱", 10, 2600, 76, 30, 70, 34, 180, "#8a8f98"),
            }],
    },
    {
        id: 19, name: "比奇野外", full: "地图三 · 比奇野外", face: "🌾", mine: false,
        desc: "比奇城周边的野外：鹿与稻草人在田边，半兽人成群游荡，钉耙猫、毒蜘蛛藏在草丛里，食人花张着大口，森林雪人在林边出没。半兽勇士是这片野外最强的怪物，击败它才算把比奇城外清理干净；野外东边就是沃玛森林。",
        clearLine: "比奇野外清理干净了，沃玛森林就在东边",
        layers: [{
                name: "比奇野外", label: "比奇城 · 城外野外", ground: "#22301a",
                pool: ["lu", "daocao", "banshou", "dingpa", "duzhu", "shiren", "xueren"],
                killTarget: 160, hpMul: 1.3, dmgMul: 1.1, monsterCount: 340,
                boss: B("半兽勇士", "🪓", 25, 9000, 68, 52, 160, 40, 380, "#6d8a3e"),
            }],
    },
    {
        id: 2, name: "沃玛森林", full: "地图四 · 沃玛森林", face: "🌲", mine: false,
        desc: "比奇城外的沃玛森林：半兽人、半兽战士成群结队，森林雪人盘踞林间，半兽勇士已经压阵，沃玛战士也在林边游荡。森林里有两个入口：南边的山道通往毒蛇山谷，森林深处藏着沃玛寺庙的入口——走到哪个入口，就进它相连的那张图。",
        clearLine: "沃玛森林杀穿了，通往毒蛇山谷的山道就在前方",
        layers: [{
                name: "沃玛森林", label: "沃玛森林 · 林间大道", ground: "#1f3018",
                pool: ["xueren", "banshou", "banshouzhan", "bsys", "duogou", "dingpa", "woma-zhanshi"],
                killTarget: 200, hpMul: 1.6, dmgMul: 1.25, monsterCount: 380,
                boss: B("半兽统领", "👹", 28, 14400, 68, 64, 220, 42, 520, "#7d9b4e"),
            }],
    },
    {
        id: 3, name: "毒蛇山谷", full: "地图五 · 毒蛇山谷", face: "🐍", mine: false,
        desc: "连接比奇与盟重的山谷：红蛇、虎蛇在谷里游走，毒蜘蛛守着谷口，蛇王盘踞谷底。谷里有两个入口：一个是毒蛇矿区的入口（僵尸洞穴），另一个北行通往盟重野外——蜈蚣洞、石墓、祖玛寺庙、白日门的入口都在盟重土城那一带。",
        clearLine: "毒蛇山谷杀穿了，通往盟重野外的路打通了",
        layers: [{
                name: "毒蛇山谷", label: "毒蛇山谷 · 蛇道", ground: "#243118",
                pool: ["hongshe", "hushe", "duzhu", "dushe"],
                killTarget: 200, hpMul: 2.4, dmgMul: 1.5, monsterCount: 320,
                boss: B("毒蛇王", "🐍", 38, 26000, 72, 88, 320, 44, 800, "#4e8a4a"),
            }],
    },
    {
        id: 21, name: "盟重野外", full: "地图六 · 盟重野外", face: "🏜️", mine: false,
        desc: "盟重土城周边的沙漠野外：黑色恶蛆在沙里钻动，楔蛾会麻痹人，角蝇成群嗡嗡作响，毒蜘蛛藏在枯石后。土城相连的洞穴入口都分布在这一带——西北是死亡山谷（蜈蚣洞），土城边上是石墓，祖玛寺庙与白日门的入口也在这里，走到哪个入口就进哪张图。角蝇王是这片沙漠最强的怪物，击败它才算通关。",
        clearLine: "盟重野外清理干净了，几座洞穴的入口都找到了",
        layers: [{
                name: "盟重野外", label: "盟重省 · 土城周边沙漠", ground: "#2e2416",
                pool: ["heie", "xiee", "jiaoying", "duzhu"],
                killTarget: 200, hpMul: 8.0, dmgMul: 2.8, monsterCount: 360,
                boss: B("角蝇王", "🦟", 45, 60000, 92, 200, 800, 46, 2400, "#7a6a4f"),
            }],
    },
    {
        id: 4, name: "骷髅洞穴", full: "地图七 · 骷髅洞穴", face: "💀", mine: false,
        desc: "原版比奇城北的半兽人古墓（俗称骷髅洞），分三层：骷髅战士与投斧骷髅在黑暗里游荡，洞蛆潜伏、蝎子藏在石缝中，半兽人也混在墓道里，投斧骷髅会掷出飞斧。逐层走入口下潜，第三层击败骷髅精灵才算通关。",
        clearLine: "骷髅精灵倒下了，洞穴深处传来矿镐的声音",
        layers: [
            {
                name: "骷髅洞一层", label: "半兽人古墓 · 一层", ground: "#1d1a24",
                pool: ["kulou", "dongqu", "xiezi", "kuloujiang", "toufu", "shandong", "banshou"],
                killTarget: 120, hpMul: 3.0, dmgMul: 1.7, monsterCount: 260,
                boss: B("骷髅战将王", "💀", 40, 30000, 70, 100, 400, 44, 900, "#cfc39f"),
            },
            {
                name: "骷髅洞二层", label: "半兽人古墓 · 二层", ground: "#1a1622",
                pool: ["kulou", "dongqu", "xiezi", "toufu", "banshou", "kuloujiang"],
                killTarget: 120, hpMul: 3.6, dmgMul: 1.85, monsterCount: 260,
                boss: B("骷髅战将王", "💀", 44, 40000, 70, 112, 500, 44, 1200, "#cfc39f"),
            },
            {
                name: "骷髅洞三层", label: "半兽人古墓 · 三层", ground: "#171320",
                pool: ["kuloujiang", "kulou", "xiezi", "dongqu", "toufu", "banshouzhan"],
                killTarget: 120, hpMul: 4.2, dmgMul: 2.0, monsterCount: 240,
                boss: B("骷髅精灵", "💀", 25, 350, 74, 125, 600, 46, 1500, "#e8e2cc"),
            },
        ],
    },
    {
        id: 5, name: "僵尸洞穴", full: "地图八 · 僵尸洞穴", face: "⛏️", mine: true,
        desc: "分四层：矿区一层 → 矿区二层 → 矿区三层 → 尸王殿。三层通往尸王殿的不是门，而是地上的一个洞口 🕳️——一只穿黄衣服的僵尸正从洞里往外爬，钻进洞里就到尸王殿。尸王殿只有手机一屏大小、只刷尸王：每小时刷新一次，一次按格子刷满全殿（只留入口四个格子的位置落脚），尸王主要爆技能书，但 25 级以上的高级书极难爆。僵尸在矿道里游荡，金色矿脉散布各层，走近停留即可挖矿，越深矿越好。尸王殿击败尸王才算通关。",
        clearLine: "尸王倒下了，矿区重见天日",
        layers: [
            {
                name: "矿区一层", label: "比奇矿区 · 一层", ground: "#201a14",
                pool: ["jiangshi", "paxing", "kuangjiang", "tiejiang", "dongqu", "xiezi"],
                killTarget: 140, hpMul: 5.0, dmgMul: 2.15, monsterCount: 300,
                boss: B("铁链僵尸王", "⛓️", 50, 55000, 56, 140, 650, 46, 1600, "#59524a"),
            },
            {
                name: "矿区二层", label: "比奇矿区 · 二层", ground: "#1d1712",
                pool: ["jiangshi", "dongqu", "paxing", "xiezi"],
                killTarget: 140, hpMul: 5.6, dmgMul: 2.3, monsterCount: 280,
                boss: B("铁链僵尸王", "⛓️", 53, 64000, 56, 152, 750, 46, 1800, "#59524a"),
            },
            {
                name: "矿区三层", label: "比奇矿区 · 三层", ground: "#1a140f",
                pool: ["paxing", "jiangshi", "kuangjiang", "dongqu"],
                killTarget: 140, hpMul: 6.2, dmgMul: 2.45, monsterCount: 260,
                boss: B("矿洞僵尸王", "⛏️", 55, 70000, 58, 160, 820, 47, 2000, "#6b6f66"),
            },
            {
                // 尸王殿（2026-11-19 按用户要求）：地图缩小到只有手机一屏大小（worldHalf=300，世界 600×600，
                // 与赤月魔穴同口径）；殿里只刷尸王——普通刷怪池清空、普通怪总数 0。
                // 刷新规则（2026-11-19 按用户要求改）：每小时刷新一次，一次刷满全屏——按 100 一格把
                // 600×600 全殿铺成 6×6 格，只留正中入口的 2×2 四个格子不刷（玩家钻洞进来落脚），
                // 其余 32 格每格一只尸王（1 只通关尸王 + 31 只常驻尸王，格子排布在 App.tsx 的尸王殿网格）；
                // 杀掉不单独补刷，等满一小时整波把空格全部补满。尸王主爆技能书（分档爆率见 BOSS_DROPS）。
                // 入口不在本层：从三层地上的洞口 🕳️ 钻进来（洞口与黄衣僵尸的绘制/判定在 App.tsx 按关卡+层号识别）。
                name: "尸王殿", label: "尸王殿", ground: "#17110c",
                pool: [],
                killTarget: 140, hpMul: 6.8, dmgMul: 2.6,
                boss: B("尸王", "👑", 40, 500, 62, 168, 900, 24, 2200, "#8a2f2a"),
                worldHalf: 300, monsterCount: 0, bossAlive: 32, bossRespawnSec: 3600,
            },
        ],
    },
    // —— 以下地图与分层、怪物分布按盛大原版 1.76 地图研究报告编排（只取 1.75 及以前的内容，
    // 不含 1.76 新增的六大重装密室：地狱烈焰/堕落坟场/深渊魔域/钳虫巢穴/死亡神殿/困惑殿堂一概不做）——
    // 地图之间按原版地理相连：走本图出口的入口进下一张图、走入口旁的出口回上一张图（见 App.tsx 的入口系统）。
    {
        id: 7, name: "沃玛寺庙", full: "地图九 · 沃玛寺庙", face: "🛕", mine: false,
        desc: "入口在沃玛森林深处，分三层：粪虫、暗黑战士在回廊里游荡，沃玛战士、勇士、战将成群盘踞，火焰沃玛守着深处。三层是沃玛大殿（只有上两层一半大），背生一对绿翅的沃玛教主盘踞殿中——它会瞬间移动、双手放闪电近身攻击，击败它才算通关。沃玛装备的主产地，教主还掉建行会的沃玛号角。寺庙后面就是盟重土城：大殿里的入口直通土城。",
        clearLine: "沃玛教主倒下了，沃玛号角在你手中嗡嗡作响",
        layers: [
            {
                name: "沃玛寺庙一层", label: "沃玛寺庙 · 一层", ground: "#231a20",
                pool: ["woma-zhanshi", "woma-yongshi", "anhei"],
                killTarget: 200, hpMul: 10.5, dmgMul: 3.9, monsterCount: 300,
                boss: B("沃玛卫士", "🛡️", 50, 1000, 78, 255, 260, 50, 4600, "#a8763e"),
            },
            {
                name: "沃玛寺庙二层", label: "沃玛寺庙 · 二层", ground: "#20161e",
                pool: ["woma-yongshi", "woma-zhanjiang", "woma-weishi"],
                killTarget: 200, hpMul: 11.5, dmgMul: 4.05, monsterCount: 300,
                boss: B("沃玛卫士", "🛡️", 50, 1000, 78, 268, 260, 50, 5000, "#a8763e"),
            },
            {
                // 沃玛大殿（2026-11-19 按用户要求）：原第三层改名沃玛大殿，地图缩小一倍——
                // 世界半径 1350 → 675、怪物总数 500 → 250；沃玛教主会瞬间移动、双手放闪电近身攻击，背生一对绿翅（逻辑与造型在 App.tsx 按教主名识别）
                name: "沃玛大殿", label: "沃玛寺庙 · 沃玛大殿", ground: "#1d121c",
                pool: ["huoyan-woma", "woma-yongshi", "woma-zhanjiang"],
                killTarget: 200, hpMul: 12.5, dmgMul: 4.2,
                worldHalf: 675, monsterCount: 250,
                boss: B("沃玛教主", "👑", 60, 2200, 80, 285, 2500, 52, 5600, "#8a2f2a"),
            },
        ],
    },
    {
        // 盟重土城（2026-11-20 按用户要求新增）：沃玛寺庙后面的安全区枢纽城——整座城不刷怪、
        // 没有 Boss、玩家不受伤害；城里立着通往后面地图的入口（蜈蚣洞/石墓/祖玛寺庙/白日门，
        // 见 App.tsx 的 MAP_LINKS[22]），走到哪个入口就直接进哪张图。进城即记通关（见 startBattle）。
        id: 22, name: "盟重土城", full: "地图十 · 盟重土城", face: "🏜️", mine: false, safe: true,
        desc: "盟重省的土城，玛法大陆的第二座城池，就建在沃玛寺庙后面，整座城都是安全区：不刷怪、没有 Boss、在城里不会受到伤害。城里立着通往后面地图的入口——死亡山谷（蜈蚣洞）、石墓、祖玛寺庙、白日门都在城里，走到哪个入口就直接进哪张图；回比奇城找传送员也能传送过来。安顿、整备、出发，都从这里走。",
        clearLine: "",
        layers: [{
                name: "盟重土城", label: "盟重省 · 土城（安全区）", ground: "#2e2416",
                pool: [],
                killTarget: 1, hpMul: 1, dmgMul: 1,
                worldHalf: 900, monsterCount: 0,
                boss: B("", "🏯", 1, 1, 0, 0, 0, 0, 0, "#000000"),
            }],
    },
    {
        id: 8, name: "蜈蚣洞", full: "地图十一 · 蜈蚣洞", face: "🐛", mine: false,
        desc: "盟重西北的死亡山谷（蜈蚣洞）：原版不是简单的 1–5 层，而是网状分支——地牢一层东/西分叉，经黑暗地带、一线天通向死亡棺材。本作按原版分支编排为五段：地牢一层东 → 地牢一层西 → 黑暗地带 → 一线天 → 死亡棺材。地牢一层东还有一条连接通道，通往单独设立的隐藏地图未知暗殿（不在关卡列表里，通道随时可走）。蜈蚣、钳虫、黑色恶蛆、跳跳蜂在洞里乱窜，楔蛾会麻痹人，巨型蠕虫盘踞深处。死亡棺材击败触龙神才算通关——它魔御极高，法师要格外小心。",
        clearLine: "触龙神倒下了，死亡棺材重归寂静",
        layers: [
            {
                name: "地牢一层东", label: "蜈蚣洞 · 地牢一层东", ground: "#1c1c14",
                pool: ["wugong", "tiaotiao", "heie", "duzhu"],
                killTarget: 180, hpMul: 13.5, dmgMul: 4.35, monsterCount: 280,
                boss: B("邪恶钳虫", "🦂", 60, 1000, 72, 295, 2200, 50, 5800, "#7a5a2b"),
            },
            {
                name: "地牢一层西", label: "蜈蚣洞 · 地牢一层西", ground: "#1a1a12",
                pool: ["qianchong", "wugong", "xiee"],
                killTarget: 180, hpMul: 14.0, dmgMul: 4.42, monsterCount: 280,
                boss: B("邪恶钳虫", "🦂", 60, 1000, 72, 302, 2250, 50, 5950, "#7a5a2b"),
            },
            {
                name: "黑暗地带", label: "蜈蚣洞 · 黑暗地带", ground: "#191910",
                pool: ["qianchong", "wugong", "xiee", "jiaoying"],
                killTarget: 180, hpMul: 14.5, dmgMul: 4.5, monsterCount: 260,
                boss: B("邪恶钳虫", "🦂", 60, 1000, 72, 308, 2300, 50, 6100, "#7a5a2b"),
            },
            {
                name: "一线天", label: "蜈蚣洞 · 一线天", ground: "#17150e",
                pool: ["qianchong", "juxing-worm", "heie", "xiee"],
                killTarget: 180, hpMul: 15.0, dmgMul: 4.58, monsterCount: 240,
                boss: B("邪恶钳虫", "🦂", 60, 1000, 72, 312, 2350, 50, 6250, "#7a5a2b"),
            },
            {
                name: "死亡棺材", label: "蜈蚣洞 · 死亡棺材", ground: "#15130c",
                pool: ["qianchong", "xiee", "heie", "juxing"],
                killTarget: 200, hpMul: 15.5, dmgMul: 4.65, monsterCount: 220,
                boss: B("触龙神", "🐉", 60, 1000, 60, 315, 2400, 54, 6400, "#4a7d3a"),
            },
        ],
    },
    {
        id: 14, name: "未知暗殿", full: "隐藏地图 · 未知暗殿", face: "🕯️", mine: false,
        desc: "单独设立的一张独立隐藏地图，不算在关卡里面：不在传送员的传送列表里、不能建房、也不计通关数。唯一的通路是死亡山谷（蜈蚣洞）地牢一层东的连接通道（原版连接通道 1–3），走到通道口就能进、不用先通关蜈蚣洞，殿里的出口原路回地牢一层东。殿里游荡着各种 Boss 的真假身——沃玛卫士、祖玛卫士、巨型多角虫、半兽勇士混在一起，真身爆顶级装备、假身基本不爆，全看眼力。本作的暗殿教主按真身算。注意：这里不是 1.76 的重装密室，未知暗殿是 1.50 就有的老地图。",
        clearLine: "未知暗殿的真身倒下了，假身们四散而逃",
        layers: [{
                name: "未知暗殿", label: "未知暗殿 · 真假殿", ground: "#14101c",
                pool: ["woma-weishi", "zuma-wei", "juxing", "bsys", "hee"],
                killTarget: 120, hpMul: 16.5, dmgMul: 4.75, monsterCount: 220,
                boss: B("沃玛教主", "👑", 60, 120000, 80, 330, 3200, 52, 8000, "#8a2f2a"),
            }],
    },
    {
        id: 6, name: "石墓", full: "地图十三 · 石墓", face: "🐗", mine: false,
        desc: "从盟重土城（或盟重野外）的入口进石墓，分七层外加石墓阵与桃源之门：石墓一层 → 二层 → 三层 → 四层 → 五层 → 石墓阵（五层与六层之间的独立迷宫，不是第六层本身）→ 六层 → 七层，逐层走入口下潜，七层击败石墓尸王后，踩它钻出的洞口还能进桃源之门（俗称石墓八层）。只刷猪洞本地怪：红野猪、黑野猪、蝎蛇、角蝇、白野猪、邪恶毒蛇；桃源之门里有月魔蜘蛛出没。（桃源之门里的困惑殿堂是 1.76 重装密室，不在本作范围。）",
        clearLine: "石墓尸王倒下了，猪洞七层被你杀穿了",
        layers: [
            {
                name: "石墓一层", label: "石墓 · 一层墓道", ground: "#241c16",
                pool: ["hongye", "heie", "jiaoying", "xieshe"],
                killTarget: 160, hpMul: 17.0, dmgMul: 4.85, monsterCount: 300,
                boss: B("红野猪王", "🐗", 60, 90000, 80, 340, 1100, 48, 2600, "#a34a3a"),
            },
            {
                name: "石墓二层", label: "石墓 · 二层墓道", ground: "#221a14",
                pool: ["heiye", "hongye", "heie", "jiaoying"],
                killTarget: 170, hpMul: 17.5, dmgMul: 4.92, monsterCount: 300,
                boss: B("黑野猪王", "🐗", 62, 100000, 82, 352, 1200, 48, 2900, "#3d3a38"),
            },
            {
                name: "石墓三层", label: "石墓 · 三层墓道", ground: "#201812",
                pool: ["xieshe", "heiye", "hongye", "jiaoying", "heie"],
                killTarget: 180, hpMul: 18.0, dmgMul: 5.0, monsterCount: 320,
                boss: B("蝎蛇王", "🦎", 64, 110000, 80, 364, 1300, 49, 3200, "#7d8a3a"),
            },
            {
                name: "石墓四层", label: "石墓 · 四层墓道", ground: "#1f1611",
                pool: ["baiye", "heiye", "heie", "xieshe"],
                killTarget: 180, hpMul: 18.5, dmgMul: 5.08, monsterCount: 320,
                boss: B("白野猪王", "🐗", 66, 120000, 84, 376, 1400, 49, 3500, "#e3ddd2"),
            },
            {
                name: "石墓五层", label: "石墓 · 五层墓道", ground: "#1d1510",
                pool: ["baiye", "hongye", "heiye", "xieshe", "jiaoying", "heie"],
                killTarget: 190, hpMul: 19.0, dmgMul: 5.15, monsterCount: 340,
                boss: B("白野猪王", "🐗", 68, 130000, 84, 388, 1500, 50, 3800, "#e3ddd2"),
            },
            {
                name: "石墓阵", label: "石墓 · 石墓阵（迷宫）", ground: "#1c1410",
                pool: ["baiye", "hongye", "heiye", "xieshe", "jiaoying"],
                killTarget: 190, hpMul: 19.4, dmgMul: 5.2, monsterCount: 260,
                boss: B("白野猪王", "🐗", 68, 135000, 84, 396, 1550, 50, 3900, "#e3ddd2"),
            },
            {
                name: "石墓六层", label: "石墓 · 六层墓道", ground: "#1b130e",
                pool: ["xiedu", "baiye", "xieshe", "heiye"],
                killTarget: 200, hpMul: 19.8, dmgMul: 5.28, monsterCount: 320,
                boss: B("邪恶毒蛇", "🐍", 50, 1100, 86, 404, 1550, 50, 4000, "#4a7d3a"),
            },
            {
                name: "石墓七层", label: "石墓 · 七层 · 尸王座", ground: "#18100c",
                pool: ["baiye", "xiedu", "heiye", "xieshe"],
                killTarget: 200, hpMul: 20.2, dmgMul: 5.35, monsterCount: 340,
                boss: B("石墓尸王", "👑", 55, 5000, 64, 416, 1600, 50, 4200, "#8a2f2a"),
            },
            {
                name: "桃源之门", label: "石墓 · 桃源之门（石墓八层）", ground: "#1a1418",
                pool: ["yuemo", "baiye", "hee"],
                killTarget: 140, hpMul: 20.6, dmgMul: 5.4, monsterCount: 220,
                boss: B("白野猪王", "🐗", 70, 140000, 84, 424, 1700, 50, 4300, "#e3ddd2"),
            },
        ],
    },
    {
        id: 9, name: "祖玛寺庙", full: "地图十四 · 祖玛寺庙", face: "🗿", mine: false,
        desc: "原版共七层：一至五层 → 祖玛阁（第六层迷宫）→ 七层，七层之后另有独立的教主之家。本作按原版分层：一层 → 二层 → 三层 → 四层 → 五层 → 祖玛阁 → 七层 → 教主之家。祖玛弓箭手、雕像、卫士层层把守，大老鼠在角落里乱窜。教主之家击败祖玛教主才算通关——祖玛装备的主产地。",
        clearLine: "祖玛教主倒下了，教主之家的宝藏归你了",
        layers: [
            {
                name: "祖玛寺庙一层", label: "祖玛寺庙 · 一层", ground: "#201d16",
                pool: ["zuma-gong", "dalaoshu", "xiee", "jiaoying", "heie"],
                killTarget: 200, hpMul: 21.0, dmgMul: 5.45, monsterCount: 320,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 430, 370, 50, 6600, "#7a6a4a"),
            },
            {
                name: "祖玛寺庙二层", label: "祖玛寺庙 · 二层", ground: "#1f1c15",
                pool: ["zuma-gong", "zuma-diao", "dalaoshu"],
                killTarget: 200, hpMul: 21.4, dmgMul: 5.5, monsterCount: 320,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 438, 370, 50, 6700, "#7a6a4a"),
            },
            {
                name: "祖玛寺庙三层", label: "祖玛寺庙 · 三层", ground: "#1e1b14",
                pool: ["zuma-diao", "zuma-gong", "xiee"],
                killTarget: 200, hpMul: 21.8, dmgMul: 5.55, monsterCount: 340,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 446, 370, 50, 6800, "#7a6a4a"),
            },
            {
                name: "祖玛寺庙四层", label: "祖玛寺庙 · 四层", ground: "#1d1a13",
                pool: ["zuma-diao", "zuma-wei", "dalaoshu"],
                killTarget: 200, hpMul: 22.2, dmgMul: 5.6, monsterCount: 340,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 454, 370, 50, 6900, "#7a6a4a"),
            },
            {
                name: "祖玛寺庙五层", label: "祖玛寺庙 · 五层", ground: "#1c1912",
                pool: ["zuma-wei", "zuma-diao", "zuma-gong"],
                killTarget: 200, hpMul: 22.6, dmgMul: 5.65, monsterCount: 360,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 462, 370, 50, 7000, "#7a6a4a"),
            },
            {
                name: "祖玛阁", label: "祖玛寺庙 · 祖玛阁（第六层迷宫）", ground: "#1b1811",
                pool: ["zuma-diao", "zuma-gong", "dalaoshu"],
                killTarget: 200, hpMul: 23.0, dmgMul: 5.7, monsterCount: 260,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 470, 370, 50, 7100, "#7a6a4a"),
            },
            {
                name: "祖玛寺庙七层", label: "祖玛寺庙 · 七层", ground: "#1a1710",
                pool: ["zuma-wei", "zuma-diao", "zuma-gong", "xiee"],
                killTarget: 200, hpMul: 23.4, dmgMul: 5.75, monsterCount: 340,
                boss: B("祖玛卫士", "🗿", 43, 495, 66, 478, 370, 50, 7200, "#7a6a4a"),
            },
            {
                name: "教主之家", label: "祖玛寺庙 · 教主之家", ground: "#191510",
                pool: ["zuma-wei", "zuma-diao", "zuma-gong"],
                killTarget: 200, hpMul: 23.8, dmgMul: 5.8, monsterCount: 160,
                boss: B("祖玛教主", "👑", 60, 3000, 72, 486, 3000, 54, 7400, "#8a2f2a"),
            },
        ],
    },
    {
        id: 15, name: "白日门", full: "地图十五 · 白日门", face: "🌞", mine: false,
        desc: "按原版俯视全图重做：东边临海、西边是棕色陆地、中间是大片丛林，白日门城就在地图正中央——城里面是安全区（不刷怪、怪物进不来），传送或走入口进来都落在城里，出城门进丛林才是野外。城外野外有血僵尸、血巨人、蜘蛛系出没，再往深处是丛林迷宫——天狼蜘蛛、花吻蜘蛛、月魔蜘蛛在密林里结网，穿过迷宫就是赤月峡谷的入口。",
        clearLine: "丛林迷宫穿过去了，赤月峡谷的入口就在前方",
        layers: [
            {
                name: "白日门野外", label: "白日门 · 中央城池（安全区）与丛林野外", ground: "#22301a",
                pool: ["xuejiang", "xuejuren", "tianlang", "bsys"],
                killTarget: 200, hpMul: 27.5, dmgMul: 6.4, monsterCount: 340,
                boss: B("血巨人", "👹", 55, 160000, 64, 610, 2600, 50, 9000, "#9a4a3a"),
            },
            {
                name: "丛林迷宫", label: "白日门 · 丛林迷宫", ground: "#1e2c16",
                pool: ["huawen", "tianlang", "xuejiang", "yuemo", "xuejuren"],
                killTarget: 200, hpMul: 28.0, dmgMul: 6.5, monsterCount: 300,
                boss: B("邪恶巨人", "👹", 54, 180000, 62, 620, 2800, 52, 10000, "#6a3a5a"),
            },
        ],
    },
    {
        id: 13, name: "赤月峡谷", full: "地图十六 · 赤月峡谷", face: "🌋", mine: false,
        desc: "按原版路线：丛林迷宫有东/南/北三个入口进峡谷（本作合为一个峡谷入口）→ 赤月峡谷广场 → 回廊 → 抉择之地 → 山谷密道 → 恶魔祭坛 → 赤月魔穴。天狼、剧毒、月魔、钢牙、黑锷、花吻蜘蛛遍布峡谷，血僵尸、血巨人、邪恶巨人守着深处；抉择之地有双头金刚、恶魔祭坛有双头血魔；最后一层赤月魔穴缩到一屏大小、怪物密集布满全图，赤月恶魔就盘踞其中。圣战、法神、天尊套装的主产地。赤月峡谷是最后一张地图：打完赤月恶魔通关后留在峡谷里继续刷怪，没有再往后的地图了。",
        clearLine: "赤月恶魔倒下了，赤月峡谷迎来了黎明",
        layers: [
            {
                name: "赤月峡谷入口", label: "赤月峡谷 · 东/南/北入口", ground: "#241016",
                pool: ["tianlang", "judu", "baoya", "yuemo"],
                killTarget: 200, hpMul: 28.5, dmgMul: 6.55, monsterCount: 260,
                boss: B("血巨人", "👹", 55, 190000, 64, 630, 3000, 52, 11000, "#9a4a3a"),
            },
            {
                name: "赤月峡谷广场", label: "赤月峡谷 · 广场", ground: "#22101a",
                pool: ["gangya", "hee", "xuejiang", "xuejuren"],
                killTarget: 200, hpMul: 29.0, dmgMul: 6.6, monsterCount: 280,
                boss: B("血僵尸", "🧟", 55, 200000, 60, 640, 3200, 52, 11500, "#8a3a3a"),
            },
            {
                name: "回廊", label: "赤月峡谷 · 左/右回廊", ground: "#20101a",
                pool: ["huawen", "huanying", "hee", "xuejuren"],
                killTarget: 200, hpMul: 29.5, dmgMul: 6.65, monsterCount: 240,
                boss: B("邪恶巨人", "👹", 54, 210000, 62, 650, 3400, 54, 12000, "#6a3a5a"),
            },
            {
                name: "抉择之地", label: "赤月峡谷 · 抉择之地", ground: "#1f1016",
                pool: ["xuejiang", "xuejuren", "yuemo", "hee"],
                killTarget: 200, hpMul: 30.0, dmgMul: 6.7, monsterCount: 280,
                boss: B("双头金刚", "🦍", 50, 5000, 72, 660, 4600, 54, 12400, "#7a5a3a"),
            },
            {
                name: "山谷密道", label: "赤月峡谷 · 山谷密道", ground: "#1e0e14",
                pool: ["gangya", "huawen", "yuemo"],
                killTarget: 200, hpMul: 30.3, dmgMul: 6.75, monsterCount: 220,
                boss: B("邪恶巨人", "👹", 54, 220000, 62, 670, 3600, 54, 12800, "#6a3a5a"),
            },
            {
                name: "恶魔祭坛", label: "赤月峡谷 · 恶魔祭坛", ground: "#1d0c14",
                pool: ["gangya", "hee", "huanying", "huawen", "xuejiang"],
                killTarget: 200, hpMul: 30.6, dmgMul: 6.8, monsterCount: 240,
                boss: B("双头血魔", "👹", 55, 5000, 74, 680, 4900, 54, 13200, "#8a2f2a"),
            },
            {
                name: "赤月魔穴", label: "赤月峡谷 · 赤月魔穴（单屏小图）", ground: "#1c0c14",
                pool: ["xuejuren", "xieju", "yuemo", "hee"],
                killTarget: 200, hpMul: 31.0, dmgMul: 6.85,
                boss: B("赤月恶魔", "👑", 60, 5000, 66, 700, 5500, 58, 15000, "#5a1f2a"),
                worldHalf: 300, monsterCount: 200,
            },
        ],
    },
];
exports.STAGE_MAP = Object.fromEntries(exports.STAGES.map((s) => [s.id, s]));
exports.SLOT_ORDER = ["weapon", "armor", "helmet", "necklace", "bracelet", "ring", "boots"];
exports.SLOT_LABEL = {
    weapon: "武器", armor: "衣服", helmet: "头盔", necklace: "项链",
    bracelet: "手镯", ring: "戒指", boots: "鞋靴",
};
exports.WORN_SLOTS = [
    "weapon", "armor", "helmet", "necklace",
    "bracelet", "bracelet2", "ring", "ring2", "boots",
];
exports.WORN_LABEL = {
    weapon: "武器", armor: "衣服", helmet: "头盔", necklace: "项链",
    bracelet: "手镯·左", bracelet2: "手镯·右",
    ring: "戒指·左", ring2: "戒指·右", boots: "鞋靴",
};
/** 某类装备可占的穿戴位（手镯/戒指两个，其余一个） */
function slotKeys(slot) {
    if (slot === "bracelet")
        return ["bracelet", "bracelet2"];
    if (slot === "ring")
        return ["ring", "ring2"];
    return [slot];
}
/** 当前穿着的全部装备（含双手镯/双戒指） */
function wornItems(save) {
    return exports.WORN_SLOTS.map((k) => save.worn[k]).filter((x) => !!x);
}
exports.EMPTY_GEAR = {
    weaponName: "", weaponIcon: "", weaponTier: -1, weaponEnh: 0,
    armorName: "", armorIcon: "", armorTier: -1,
    helmetTier: -1, necklaceTier: -1, braceletTier: -1, ringTier: -1, bootsTier: -1,
};
/** 从存档的穿戴装备算出人物外观摘要 */
function gearLookOf(save) {
    const w = save.worn;
    const wpn = w.weapon;
    const arm = w.armor;
    const pair = (a, b) => Math.max(a?.tier ?? -1, b?.tier ?? -1);
    return {
        weaponName: wpn?.name ?? "", weaponIcon: wpn?.icon ?? "",
        weaponTier: wpn?.tier ?? -1, weaponEnh: wpn?.enh ?? 0,
        armorName: arm?.name ?? "", armorIcon: arm?.icon ?? "", armorTier: arm?.tier ?? -1,
        helmetTier: w.helmet?.tier ?? -1,
        necklaceTier: w.necklace?.tier ?? -1,
        braceletTier: pair(w.bracelet, w.bracelet2),
        ringTier: pair(w.ring, w.ring2),
        bootsTier: w.boots?.tier ?? -1,
    };
}
/** 心跳同步用的外观串（JSON）；解析失败返回全空外观 */
function gearLookToString(g) {
    return JSON.stringify(g);
}
function gearLookFromString(raw) {
    if (!raw)
        return exports.EMPTY_GEAR;
    try {
        const p = JSON.parse(raw);
        const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
        const str = (v) => (typeof v === "string" ? v : "");
        return {
            weaponName: str(p.weaponName), weaponIcon: str(p.weaponIcon),
            weaponTier: num(p.weaponTier, -1), weaponEnh: num(p.weaponEnh, 0),
            armorName: str(p.armorName), armorIcon: str(p.armorIcon), armorTier: num(p.armorTier, -1),
            helmetTier: num(p.helmetTier, -1), necklaceTier: num(p.necklaceTier, -1),
            braceletTier: num(p.braceletTier, -1), ringTier: num(p.ringTier, -1), bootsTier: num(p.bootsTier, -1),
        };
    }
    catch {
        return exports.EMPTY_GEAR;
    }
}
exports.TIER_NAMES = ["普通", "优秀", "稀有", "史诗", "传说"];
/* ---------------- 装备颜色：按极品附加属性点数定（2026-11-24 按用户要求） ----------------
 * 颜色不再看模板品阶 tier（品阶文字如「史诗」保留、人物造型的刃色/衣服色也不变），
 * 只看这件装备实例的极品点数：0 点白色、1 点绿色、2 点蓝色、3 点红色、4 点紫色、5 点橙色；
 * 有强化等级（enh>0）的装备一律彩色（彩虹色），优先于点数色。
 * 点数由极品属性 jp 归一化得到（jp 只有一个属性，val 按属性分档生成，必须归一化到 0..5，
 * 否则生命极品会全算橙色、主属性极品永远到不了紫/橙）：
 * 生命 val 10..30 → val/10 取整（1..3 点）；移速 val 2..5 → 就是点数（2..5 点）；
 * 其余属性（攻击/魔力/道术/防御/魔御/准确/敏捷）val 1..3 → 就是点数（1..3 点）。
 * 本函数只读 jp 本身、不依赖存档其他字段，新老存档同一件装备算出的点数永远一致。 */
function jpPoints(it) {
    if (!it.jp)
        return 0;
    const { key, val } = it.jp;
    const raw = key === "hp" ? Math.floor(val / 10) : val;
    return Math.max(0, Math.min(5, Math.floor(raw)));
}
/** 点数 → 颜色（0 白 / 1 绿 / 2 蓝 / 3 红 / 4 紫 / 5 橙） */
exports.POINT_COLORS = ["#f2f2f2", "#57c84a", "#3e9bd4", "#e5484d", "#b06ee0", "#ff8c1a"];
exports.POINT_COLOR_NAMES = ["白色", "绿色", "蓝色", "红色", "紫色", "橙色"];
/** 这件装备的颜色档：enh>0 为彩色（rainbow），否则按极品点数 0..5 */
function equipColorOf(it) {
    const points = jpPoints(it);
    if (it.enh > 0)
        return { points, rainbow: true, hex: "#b06ee0", name: "彩色" };
    return { points, rainbow: false, hex: exports.POINT_COLORS[points] ?? "#f2f2f2", name: exports.POINT_COLOR_NAMES[points] ?? "白色" };
}
/** 多人组队时是否要走 Roll 点：蓝色（2 点）及以上、以及彩色（强化过的）都要 Roll；
 * 白色（0 点）与绿色（1 点）直接拾取。单人模式不用本判定、全部直接拾取。 */
function equipNeedsRoll(it) {
    return it.enh > 0 || jpPoints(it) >= 2;
}
exports.JP_LABEL = {
    atk: "攻击", mag: "魔力", dao: "道术", def: "防御", mdef: "魔御",
    acc: "准确", agi: "敏捷", hp: "生命", spd: "移速",
};
const E = (name, cls, icon, slot, tier, reqLv, stats, reqStat) => ({ name, cls, icon, slot, tier, reqLv, stats, ...(reqStat ? { reqStat } : {}) });
// 装备需求按热血传奇 1.76 原版（2026-11-18 按用户要求核对；2026-11-20 再按数值表表三逐件复核）：
// 「需要等级」与「需要攻击/魔法/道术」是两种门槛、同一装备只取其一——等级门槛看 reqLv，
// 属性门槛看 reqStat（如力量戒指只看攻击 46、裁决之杖只看等级 30，不要混淆）。表三有来源的
// 逐件对齐：裁决 30 级、骨玉/龙纹 35 级、炼狱/魔杖/银蛇 26 级、井中月 28 级、降魔/偃月 20 级、
// 血饮需魔法 27、龙牙需魔法 28、战神盔甲/黑铁头盔需攻击 46、幽灵战衣需道术 27、恶魔长袍需魔法 28、
// 绿色项链需攻击 39、骑士手镯/龙之戒指需攻击 37、三眼手镯需道术 22、灵魂项链需道术 23、
// 龙之手镯需魔法 28、思贝儿需魔法 24、心灵手镯/泰坦戒指需道术 24、阎罗手套 30 级、40 级重装需 40 级；
// 装备本身属性也按表三有来源的核对（魔杖补攻击 5-10、血饮补攻击 3-14、龙纹补准确 +1、
// 灵魂项链补准确 +2、三眼手镯补防御 1-1、幽灵手套改防御 0-3、重盔甲魔御 2-3、魔法长袍魔御 3-4、
// 灵魂战衣防御 3-6/魔御 3-3、恶魔长袍/幽灵战衣主属性 1-4、法神/天尊头盔防御 4-4 等）。
// 穿戴要求待核实的（生命项链、恶魔铃铛、紫碧螺、圣战/法神/天尊多数件、怒斩等）保持原有等级门槛；
// 隐藏属性不加。门槛不满足时装备只能躺在背包里（可买卖、可维修强化），自动穿戴、手动换上、
// 商店买下直穿都会先校验；此前已经穿在身上的不受影响（不强制脱下），旧存档兼容。
exports.EQUIPS = [
    E("木剑", "warrior", "🗡️", "weapon", 0, 1, { atk: [2, 5] }),
    E("匕首", "warrior", "🔪", "weapon", 0, 1, { atk: [4, 5] }),
    E("青铜剑", "warrior", "⚔️", "weapon", 0, 5, { atk: [3, 7] }),
    E("铁剑", "warrior", "⚔️", "weapon", 1, 10, { atk: [5, 9] }),
    E("短剑", "warrior", "🗡️", "weapon", 1, 10, { atk: [3, 11] }),
    E("青铜斧", "warrior", "🪓", "weapon", 1, 13, { atk: [0, 15] }),
    E("乌木剑", "mage", "🗡️", "weapon", 0, 1, { atk: [4, 8], mag: [0, 1] }),
    E("海魂", "mage", "🔱", "weapon", 1, 15, { atk: [3, 10], mag: [1, 2] }),
    E("半月", "taoist", "🌙", "weapon", 1, 15, { atk: [5, 10], mag: [0, 1], dao: [1, 1] }),
    E("凌风", "warrior", "💨", "weapon", 2, 19, { atk: [6, 12] }),
    E("斩马刀", "warrior", "🔪", "weapon", 2, 20, { atk: [5, 15] }),
    E("偃月", "mage", "🌙", "weapon", 2, 20, { atk: [4, 10], mag: [1, 3] }),
    E("破魂", "warrior", "🗡️", "weapon", 2, 20, { atk: [8, 10], acc: 2 }),
    E("降魔", "taoist", "🗡️", "weapon", 2, 20, { atk: [6, 11], dao: [1, 2], acc: 1 }),
    E("修罗", "warrior", "🪓", "weapon", 2, 22, { atk: [0, 20] }),
    E("凝霜", "warrior", "❄️", "weapon", 2, 25, { atk: [10, 13] }),
    E("无极棍", "taoist", "🥢", "weapon", 2, 28, { atk: [8, 16], dao: [3, 5] }),
    E("炼狱", "warrior", "🔥", "weapon", 3, 26, { atk: [0, 25] }),
    E("魔杖", "mage", "🪄", "weapon", 3, 26, { atk: [5, 10], mag: [2, 5] }),
    E("银蛇", "taoist", "🐍", "weapon", 3, 26, { atk: [7, 14], dao: [1, 3], acc: 1 }),
    E("井中月", "warrior", "🌙", "weapon", 3, 28, { atk: [7, 22] }),
    E("血饮", "mage", "🩸", "weapon", 3, 28, { atk: [3, 14], mag: [3, 5], acc: 5 }, { key: "mag", val: 27 }),
    E("裁决之杖", "warrior", "⚖️", "weapon", 3, 30, { atk: [0, 30] }),
    E("屠龙", "warrior", "🐲", "weapon", 3, 34, { atk: [5, 35] }),
    E("骨玉权杖", "mage", "🦴", "weapon", 4, 35, { atk: [6, 12], mag: [2, 6] }),
    E("龙纹剑", "taoist", "🐉", "weapon", 4, 35, { atk: [8, 20], dao: [3, 6], acc: 1 }),
    E("嗜魂法杖", "mage", "🔮", "weapon", 4, 35, { mag: [2, 8] }),
    E("命运之刃", "warrior", "🗡️", "weapon", 4, 35, { atk: [12, 16] }),
    E("怒斩", "warrior", "🪓", "weapon", 4, 35, { atk: [12, 26], acc: 3 }),
    E("龙牙", "mage", "🐉", "weapon", 4, 35, { atk: [10, 18], mag: [3, 6], acc: 5 }, { key: "mag", val: 28 }),
    E("逍遥扇", "taoist", "🪭", "weapon", 4, 35, { atk: [5, 13], dao: [4, 10] }),
    E("布衣", "warrior", "👕", "armor", 0, 1, { def: [2, 2], mdef: [2, 3] }),
    E("轻型盔甲", "mage", "🥋", "armor", 1, 11, { def: [3, 3], mdef: [3, 4] }),
    E("中型盔甲", "taoist", "🛡️", "armor", 2, 16, { def: [3, 5], mdef: [3, 5] }),
    E("重盔甲", "warrior", "🛡️", "armor", 2, 22, { def: [4, 7], mdef: [2, 3] }),
    E("恶魔长袍", "mage", "🧥", "armor", 3, 28, { def: [4, 7], mdef: [3, 4], mag: [1, 4] }, { key: "mag", val: 28 }),
    E("幽灵战衣", "taoist", "👻", "armor", 3, 28, { def: [4, 7], mdef: [3, 4], dao: [1, 4] }, { key: "dao", val: 27 }),
    E("战神盔甲", "warrior", "⚜️", "armor", 4, 40, { def: [5, 9], mdef: [3, 5] }, { key: "atk", val: 46 }),
    E("圣战宝甲", "warrior", "👑", "armor", 4, 40, { def: [5, 12], mdef: [4, 7], atk: [1, 2] }),
    E("法神披风", "mage", "🧙", "armor", 4, 40, { def: [4, 9], mdef: [4, 6], mag: [2, 5] }),
    E("天尊道袍", "taoist", "📿", "armor", 4, 40, { def: [4, 9], mdef: [4, 6], dao: [2, 5] }),
    E("魔法长袍", "mage", "🧥", "armor", 2, 22, { def: [3, 5], mdef: [3, 4], mag: [0, 2] }),
    E("灵魂战衣", "taoist", "🥋", "armor", 2, 22, { def: [3, 6], mdef: [3, 3], dao: [0, 2] }),
    E("天魔神甲", "warrior", "👑", "armor", 4, 40, { def: [5, 12], mdef: [4, 7], atk: [1, 2] }),
    E("霓裳羽衣", "mage", "🪶", "armor", 4, 40, { def: [4, 9], mdef: [4, 6], mag: [2, 5] }),
    E("天师长袍", "taoist", "📿", "armor", 4, 40, { def: [4, 9], mdef: [4, 6], dao: [2, 5] }),
    E("青铜头盔", "warrior", "⛑️", "helmet", 1, 10, { def: [0, 1] }),
    E("骷髅头盔", "warrior", "💀", "helmet", 2, 30, { def: [2, 3], mdef: [0, 1] }),
    E("祈祷头盔", "warrior", "🙏", "helmet", 2, 15, { def: [3, 4], mdef: [1, 2] }),
    E("记忆头盔", "mage", "🧠", "helmet", 3, 25, { def: [2, 3], mdef: [2, 3] }),
    E("幽灵头盔", "warrior", "👻", "helmet", 3, 30, { def: [0, 2], mdef: [1, 2], atk: [0, 1] }),
    E("魔法头盔", "mage", "🎩", "helmet", 1, 14, { def: [1, 2], mdef: [0, 1] }),
    E("道士头盔", "taoist", "🙏", "helmet", 2, 24, { def: [1, 2], mdef: [2, 3], dao: [0, 1] }),
    E("黑铁头盔", "warrior", "🪖", "helmet", 4, 38, { def: [4, 5], mdef: [2, 3] }, { key: "atk", val: 46 }),
    E("圣战头盔", "warrior", "👑", "helmet", 4, 40, { def: [4, 5], mdef: [2, 3], atk: [0, 1] }),
    E("法神头盔", "mage", "🔮", "helmet", 4, 40, { def: [4, 4], mdef: [1, 2], mag: [0, 1] }),
    E("天尊头盔", "taoist", "📿", "helmet", 4, 40, { def: [4, 4], mdef: [1, 2], dao: [0, 1] }),
    E("金项链", "warrior", "📿", "necklace", 0, 2, { atk: [0, 1], agi: 1 }),
    E("传统项链", "mage", "📿", "necklace", 0, 2, { mag: [0, 1] }),
    E("凤凰明珠", "taoist", "🔆", "necklace", 2, 17, { dao: [1, 2], acc: 1 }),
    E("幽灵项链", "warrior", "👻", "necklace", 2, 24, { atk: [0, 5], agi: 1 }),
    E("生命项链", "mage", "💖", "necklace", 2, 25, { mag: [1, 5], acc: 1 }),
    E("绿色项链", "warrior", "💚", "necklace", 3, 27, { atk: [2, 5] }, { key: "atk", val: 39 }),
    E("恶魔铃铛", "mage", "🔔", "necklace", 3, 27, { mag: [0, 7], acc: 2 }),
    E("天珠项链", "taoist", "📿", "necklace", 2, 20, { dao: [1, 5] }),
    E("灵魂项链", "taoist", "📿", "necklace", 3, 24, { dao: [1, 6], acc: 2 }, { key: "dao", val: 23 }),
    E("记忆项链", "warrior", "📿", "necklace", 3, 26, { atk: [2, 4] }),
    E("圣战项链", "warrior", "👑", "necklace", 4, 40, { atk: [3, 6] }),
    E("法神项链", "mage", "🔮", "necklace", 4, 40, { mag: [1, 8], acc: 2 }),
    E("天尊项链", "taoist", "📿", "necklace", 4, 40, { dao: [2, 7], acc: 2 }),
    E("铁手镯", "warrior", "⭕", "bracelet", 0, 3, { acc: 1 }),
    E("小手镯", "mage", "✨", "bracelet", 0, 3, { agi: 1 }),
    E("钢手镯", "warrior", "⭕", "bracelet", 1, 8, { def: [0, 1], mdef: [0, 1] }),
    E("魔法手镯", "mage", "✨", "bracelet", 1, 18, { def: [0, 1], mdef: [1, 2] }),
    E("道士手镯", "taoist", "📿", "bracelet", 1, 15, { dao: [0, 1] }),
    E("心灵手镯", "taoist", "💗", "bracelet", 2, 21, { dao: [1, 2] }, { key: "dao", val: 24 }),
    E("幽灵手套", "warrior", "🧤", "bracelet", 2, 25, { def: [0, 3] }),
    E("思贝儿手镯", "mage", "✨", "bracelet", 2, 19, { mag: [0, 2] }, { key: "mag", val: 24 }),
    E("三眼手镯", "taoist", "👁️", "bracelet", 2, 20, { def: [1, 1], dao: [1, 3] }, { key: "dao", val: 22 }),
    E("龙之手镯", "mage", "🐉", "bracelet", 3, 28, { mag: [0, 3] }, { key: "mag", val: 28 }),
    E("阎罗手套", "warrior", "🧤", "bracelet", 2, 30, { def: [0, 4] }),
    E("骑士手镯", "warrior", "⚔️", "bracelet", 3, 26, { atk: [2, 2] }, { key: "atk", val: 37 }),
    E("圣战手镯", "warrior", "👑", "bracelet", 4, 40, { def: [0, 1], atk: [2, 3] }),
    E("法神手镯", "mage", "🔮", "bracelet", 4, 40, { def: [0, 1], mag: [0, 4] }),
    E("天尊手镯", "taoist", "📿", "bracelet", 4, 40, { def: [1, 2], dao: [1, 4] }),
    E("古铜戒指", "warrior", "💍", "ring", 0, 3, { atk: [0, 1] }),
    E("铁戒指", "warrior", "💍", "ring", 0, 7, { atk: [0, 2] }),
    E("珍珠戒指", "taoist", "🦪", "ring", 2, 18, { dao: [0, 2] }),
    E("珊瑚戒指", "mage", "🪸", "ring", 2, 24, { mag: [0, 4] }),
    E("降妖除魔戒指", "taoist", "👹", "ring", 2, 25, { atk: [1, 2], mag: [1, 2], dao: [1, 2], mdef: [0, 4] }),
    E("骷髅戒指", "warrior", "💀", "ring", 3, 30, { atk: [0, 3] }),
    E("龙之戒指", "warrior", "💍", "ring", 3, 30, { atk: [0, 5] }, { key: "atk", val: 37 }),
    E("红宝石戒指", "mage", "💍", "ring", 2, 19, { mag: [0, 4] }),
    E("铂金戒指", "taoist", "💍", "ring", 2, 20, { dao: [0, 4] }),
    E("力量戒指", "warrior", "💍", "ring", 4, 35, { atk: [0, 6] }, { key: "atk", val: 46 }),
    E("紫碧螺", "mage", "💜", "ring", 3, 30, { mag: [0, 5] }),
    E("泰坦戒指", "taoist", "🗿", "ring", 3, 30, { dao: [2, 6] }, { key: "dao", val: 24 }),
    E("麻痹戒指", "warrior", "⚡", "ring", 4, 35, { atk: [0, 1], crit: 0.08 }),
    E("护身戒指", "mage", "🛡️", "ring", 4, 35, { def: [0, 1], hp: 45 }),
    E("复活戒指", "taoist", "❤️", "ring", 4, 35, { def: [0, 1], mdef: [0, 1], hp: 70 }),
    E("传送戒指", "mage", "🌀", "ring", 4, 35, { spd: 16 }),
    E("圣战戒指", "warrior", "👑", "ring", 4, 40, { atk: [0, 7], mdef: [0, 1] }),
    E("法神戒指", "mage", "🔮", "ring", 4, 40, { mag: [1, 6], mdef: [0, 1] }),
    E("天尊戒指", "taoist", "📿", "ring", 4, 40, { dao: [2, 7], mdef: [0, 1] }),
    // —— 以下为 2026-11-18 按 1.76 怪物掉落总表补入的套装散件（掉落表里有出处、此前装备库里缺的） ——
    // 虹魔套（战士）/ 魔血套（法道）：原为封魔谷出（报告第 9 节）；封魔谷已于 2026-11-20 按用户要求
    // 再次删除，这两套装备不再有掉落来源，模板保留供老存档已有装备照常穿戴/买卖；
    // 记忆手镯：尸王出（报告第 4 节，说法待核实）；记忆戒指：沃玛/祖玛教主出（报告装备档次速查，待核实）；
    // 祈祷项链/手镯/戒指：蜈蚣洞/猪洞/祖玛中高级怪散出（报告装备档次速查；邪恶钳虫、触龙神清单含祈祷部件）。
    // 报告只给出掉落归属、未给这些装备的属性数值，属性按本作同档装备曲线折算。
    E("虹魔戒指", "warrior", "💍", "ring", 3, 33, { atk: [0, 4] }),
    E("虹魔项链", "warrior", "📿", "necklace", 3, 33, { atk: [0, 2], agi: 2 }),
    E("虹魔手镯", "warrior", "⭕", "bracelet", 3, 33, { def: [0, 2], atk: [0, 1] }),
    E("魔血戒指", "mage", "💍", "ring", 3, 33, { mag: [0, 3], hp: 25 }),
    E("魔血项链", "mage", "📿", "necklace", 3, 33, { mag: [0, 2], hp: 30 }),
    E("魔血手镯", "taoist", "📿", "bracelet", 3, 33, { dao: [0, 2], hp: 20 }),
    E("记忆手镯", "mage", "🧠", "bracelet", 3, 26, { mag: [1, 1], def: [0, 1] }),
    E("记忆戒指", "taoist", "💍", "ring", 3, 26, { dao: [1, 3] }),
    E("祈祷项链", "taoist", "🙏", "necklace", 2, 18, { dao: [0, 3] }),
    E("祈祷手镯", "warrior", "🙏", "bracelet", 2, 18, { atk: [0, 2] }),
    E("祈祷戒指", "mage", "🙏", "ring", 2, 18, { mag: [0, 3] }),
    E("布鞋", "warrior", "👟", "boots", 0, 1, { def: [0, 1], spd: 4 }),
    E("鹿皮靴", "taoist", "👢", "boots", 1, 8, { def: [0, 1], spd: 6 }),
    E("兽皮腰带", "warrior", "🎗️", "boots", 1, 12, { def: [0, 1], mdef: [0, 1], spd: 6 }),
    E("紫绸靴", "mage", "👢", "boots", 1, 14, { def: [0, 2], mdef: [0, 1], spd: 8 }),
    E("铁腰带", "warrior", "🎗️", "boots", 2, 20, { def: [0, 2], mdef: [0, 2], spd: 8 }),
    E("避魂靴", "taoist", "👞", "boots", 2, 22, { def: [0, 2], mdef: [0, 2], spd: 10 }),
    E("圣战腰带", "warrior", "🎗️", "boots", 4, 40, { def: [2, 3], atk: [0, 1], spd: 10 }),
    E("法神腰带", "mage", "🔥", "boots", 4, 40, { def: [1, 2], mag: [0, 1], spd: 10 }),
    E("天尊腰带", "taoist", "📿", "boots", 4, 40, { def: [1, 2], dao: [0, 1], spd: 10 }),
];
/* ---------------- 怪物掉落（2026-11-18 按《1.76 怪物掉落总表》重做） ----------------
 * 依据调研报告 research_notes/re-xie-chuan-qi-1-76-guai-wu-diao-luo-20261118-1033/report.md：
 * 报告能可靠确认的是「掉落归属」——哪类怪出哪个档次/哪件装备；1.76 原版从未公开逐怪精确爆率，
 * 报告中唯一成体系的数字来自《传奇3D点卡版》2026-11-07 公示（非 1.76 原版端），报告明示只能作
 * 爆率结构参考、不能直接当原版爆率写入游戏。因此本作按报告的结构落地：普通怪只出本图档次的
 * 低级/中级装备、沃玛装备极低概率；强力怪种（白野猪、邪恶钳虫、沃玛卫士、血僵尸、
 * 血巨人等）按各自掉落表高概率出本档装备并出中/高级技能书与祝福油；Boss 必掉本档装备、稀有档概率
 * 大幅提升。具体概率数值按本作割草节奏折算（不照搬公示数字），归属关系逐条对报告：
 * 尸王是高级技能书主产（公示 40%）、石墓尸王高级书必掉；双头金刚→法神套、双头血魔→圣战套、
 * 赤月恶魔→天尊套；（封魔谷、骨魔洞、牛魔寺庙已于 2026-11-20 按用户要求删除：
 * 牛魔王/黄泉教主的苍月三神兵、虹魔猪卫/蝎卫/教主的虹魔/魔血套掉落来源随图一并移除）；
 * 血僵尸极低概率出血饮；红蛇出战神油、虎蛇出祝福油；沃玛教主必掉沃玛号角；
 * 特戒（麻痹/护身/复活/传送）只有教主级 Boss 极低概率出（报告标注归属与爆率待核实，未做必掉）；
 * 黑铁矿石靠挖矿、不是怪物掉落（报告纠正），本作怪物不掉矿石。
 * 祝福油/战神油/沃玛号角/祖玛头像：本作没有幸运、行会、攻城系统，做成特殊掉落物，
 * 拾取后按其价值折算成金币（图标下会写明名字），归属仍按报告走。
 * 追加规则（用户 2026-11-18）：第四关之前（第一~三关：新手村/沃玛森林/毒蛇山谷）只能掉落
 * 低级装备——这三关的怪与 Boss 掉落表只含 low 档（技能书、药水、金币、蛇的油类特殊物品不变）；
 * 第四关骷髅洞穴起恢复中级装备，关底 Boss 骷髅精灵可掉落少量沃玛装备（沃玛档 8% 掷骰，
 * 另有龙之戒指 10%），同关层主骷髅战将王不掉沃玛。 */
exports.EQUIP_BY_NAME = Object.fromEntries(exports.EQUIPS.map((t) => [t.name, t]));
/** 掉落档次池（按装备名列具体装备，归属出自报告的装备档次速查与各地图清单） */
exports.DROP_SETS = {
    // 低级装备：新手区/低层怪的主池（11–19 级武器、轻盔、10–20 级首饰一档）
    low: ["布衣", "木剑", "匕首", "青铜剑", "铁剑", "短剑", "青铜斧", "乌木剑", "海魂", "半月",
        "轻型盔甲", "金项链", "传统项链", "古铜戒指", "铁戒指", "铁手镯", "小手镯", "钢手镯",
        "青铜头盔", "魔法头盔", "布鞋", "鹿皮靴", "兽皮腰带"],
    // 中级装备：20–25 级武器、中盔、20 级以上首饰一档（各图中层怪的主池）
    mid: ["凌风", "斩马刀", "偃月", "破魂", "降魔", "修罗", "凝霜", "无极棍",
        "中型盔甲", "魔法长袍", "灵魂战衣", "魔法手镯", "道士手镯", "心灵手镯", "思贝儿手镯",
        "珍珠戒指", "珊瑚戒指", "红宝石戒指", "铂金戒指", "凤凰明珠", "天珠项链",
        "祈祷头盔", "祈祷项链", "祈祷手镯", "祈祷戒指", "道士头盔", "紫绸靴", "铁腰带", "避魂靴", "降妖除魔戒指"],
    // 沃玛套（报告速查清单）：炼狱/魔杖/银蛇 + 沃玛首饰
    woma: ["炼狱", "魔杖", "银蛇", "无极棍", "井中月", "龙之戒指", "红宝石戒指", "铂金戒指",
        "幽灵项链", "生命项链", "天珠项链", "幽灵手套", "思贝儿手镯", "心灵手镯", "三眼手镯",
        "记忆项链", "记忆头盔", "记忆手镯", "降妖除魔戒指"],
    // 祖玛套（报告速查清单）：三神兵 + 祖玛首饰
    zuma: ["裁决之杖", "骨玉权杖", "龙纹剑", "井中月", "无极棍", "黑铁头盔", "力量戒指",
        "骑士手镯", "绿色项链", "紫碧螺", "龙之手镯", "恶魔铃铛", "泰坦戒指", "三眼手镯",
        "灵魂项链", "阎罗手套", "心灵手镯"],
    // 三神兵（祖玛武器）：白野猪、邪恶毒蛇等强力怪种低概率出的就是这一档
    zumaWeapon: ["裁决之杖", "骨玉权杖", "龙纹剑"],
    // 苍月三神兵（1.75 新增）：原主产牛魔王、黄泉教主（骨魔洞/牛魔寺庙已于 2026-11-20 按用户要求删除，本池暂无掉落来源，池定义保留）
    cangyue: ["怒斩", "龙牙", "逍遥扇"],
    // 虹魔套 + 魔血套散件：原封魔谷出（封魔谷已于 2026-11-20 按用户要求删除，本池暂无掉落来源，池定义保留）
    hongmo: ["虹魔戒指", "虹魔项链", "虹魔手镯", "魔血戒指", "魔血项链", "魔血手镯"],
    // 赤月三套（分工：双头血魔→圣战、双头金刚→法神、赤月恶魔→天尊）
    shengzhan: ["圣战头盔", "圣战项链", "圣战手镯", "圣战戒指", "圣战宝甲", "天魔神甲"],
    fashen: ["法神头盔", "法神项链", "法神手镯", "法神戒指", "法神披风", "霓裳羽衣"],
    tianzun: ["天尊头盔", "天尊项链", "天尊手镯", "天尊戒指", "天尊道袍", "天师长袍"],
    // 赤月散件（三套合池，黑锷/幻影蜘蛛、血僵尸的「赤月首饰单件」说法用）
    chiyue: ["圣战头盔", "圣战项链", "圣战手镯", "圣战戒指", "法神头盔", "法神项链", "法神手镯",
        "法神戒指", "天尊头盔", "天尊项链", "天尊手镯", "天尊戒指"],
    // 40 级重装/战神级衣服（血巨人老攻略清单：战神盔甲/幽灵战衣/恶魔长袍）
    heavy: ["战神盔甲", "恶魔长袍", "幽灵战衣"],
    // 特戒：教主级 Boss 极低概率（报告标注归属与爆率待核实）
    specialRing: ["麻痹戒指", "护身戒指", "复活戒指", "传送戒指"],
};
/** 装备档次（背包筛选 / 批量出售按档选用）：0 低级 / 1 中级 / 2 沃玛 / 3 祖玛 / 4 赤月 */
exports.GRADE_NAMES = ["低级", "中级", "沃玛", "祖玛", "赤月"];
// 掉落档次池 → 五档归并：虹魔/魔血套、三神兵、重装归祖玛档；苍月三神兵与赤月三套、特戒归赤月档
const SET_GRADE = {
    low: 0, mid: 1, woma: 2,
    hongmo: 3, zuma: 3, zumaWeapon: 3, heavy: 3,
    cangyue: 4, shengzhan: 4, fashen: 4, tianzun: 4, chiyue: 4, specialRing: 4,
};
const NAME_GRADE = (() => {
    const m = {};
    for (const [set, grade] of Object.entries(SET_GRADE)) {
        for (const name of exports.DROP_SETS[set] ?? []) {
            if (m[name] === undefined || grade > m[name])
                m[name] = grade;
        }
    }
    return m;
})();
/** 一件装备的档次（0..4）：按装备名查掉落档次池归属（在多个池里出现时取最高档）；
 * 不在任何池里的装备按佩戴等级兜底分档。模板与实例通用（都带 name / reqLv）。 */
function equipGrade(it) {
    const g = NAME_GRADE[it.name];
    if (g !== undefined)
        return g;
    if (it.reqLv <= 15)
        return 0;
    if (it.reqLv <= 25)
        return 1;
    if (it.reqLv <= 32)
        return 2;
    if (it.reqLv <= 39)
        return 3;
    return 4;
}
/** 高级技能书的门槛：学习等级 ≥25 级的技能书算高级书（尸王殿里被单独压到极低爆率） */
exports.BOOK_HIGH_REQ = 25;
const OIL = (chance) => ({ name: "祝福油", icon: "🍶", gold: 300, chance });
/** 普通怪种的掉落表（按怪物 key）；每种怪按本表概率掉落，不再有精英强化个体 */
exports.DROP_PROFILES = {
    // —— 比奇野外 / 新手村（报告第 1 节：鸡/鹿/羊不爆装备，只出肉换钱，本作只掉金币） ——
    ji: { rolls: [] },
    lu: { rolls: [] },
    yang: { rolls: [] },
    daocao: { rolls: [{ set: "low", chance: 0.05 }] },
    hama: { rolls: [{ set: "low", chance: 0.05 }] },
    duogou: { rolls: [{ set: "low", chance: 0.07 }] },
    dingpa: { rolls: [{ set: "low", chance: 0.07 }] },
    shiren: { rolls: [{ set: "low", chance: 0.05 }] },
    duzhu: { rolls: [{ set: "low", chance: 0.05 }] },
    banshou: { rolls: [{ set: "low", chance: 0.07 }] },
    banshouzhan: { rolls: [{ set: "low", chance: 0.08 }] },
    xueren: { rolls: [{ set: "low", chance: 0.06 }] },
    dushe: { rolls: [{ set: "low", chance: 0.06 }] },
    // 半兽勇士：只出低级装备（前三关只掉低级装备的规则）、低/中级书
    bsys: { rolls: [{ set: "low", chance: 0.4 }], bookChance: 0.05 },
    // —— 毒蛇山谷（报告第 2 节：红蛇出战神油、虎蛇出祝福油） ——
    hongshe: { rolls: [{ set: "low", chance: 0.06 }], specials: [{ name: "战神油", icon: "🫙", gold: 150, chance: 0.03 }] },
    hushe: { rolls: [{ set: "low", chance: 0.06 }], specials: [OIL(0.02)] },
    // —— 骷髅洞（报告第 3 节：11–19 级武器/轻盔/10–20 级首饰档） ——
    kulou: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }] },
    toufu: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }] },
    kuloujiang: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }] },
    dongqu: { rolls: [{ set: "low", chance: 0.05 }] },
    xiezi: { rolls: [{ set: "low", chance: 0.06 }] },
    shandong: { rolls: [{ set: "low", chance: 0.05 }] },
    bianfu: { rolls: [{ set: "low", chance: 0.04 }] },
    kuijia: { rolls: [{ set: "low", chance: 0.05 }] },
    duojiao: { rolls: [{ set: "low", chance: 0.05 }] },
    // —— 僵尸洞（报告第 4 节：低级书主产地之一，电僵尸档位略高；本作僵尸系共用） ——
    jiangshi: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }], bookChance: 0.03 },
    paxing: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }], bookChance: 0.03 },
    kuangjiang: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }], bookChance: 0.03 },
    tiejiang: { rolls: [{ set: "low", chance: 0.05 }, { set: "mid", chance: 0.03 }], bookChance: 0.035 },
    eling: { rolls: [{ set: "mid", chance: 0.06 }, { set: "woma", chance: 0.01 }], bookChance: 0.04 },
    // —— 沃玛寺庙（报告第 5 节：中级档为主，沃玛装备极低概率） ——
    fengchong: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    anhei: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    "woma-zhanshi": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    "woma-yongshi": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    "woma-zhanjiang": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    "huoyan-woma": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    "woma-weishi": { rolls: [{ set: "mid", chance: 0.4 }, { set: "woma", chance: 0.06 }], bookChance: 0.03 },
    // —— 蜈蚣洞（报告第 8 节：中级档为主） ——
    wugong: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.01 }] },
    qianchong: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.01 }] },
    tiaotiao: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.01 }] },
    heie: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.01 }] },
    xiee: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.01 }] },
    jiaoying: { rolls: [{ set: "mid", chance: 0.07 }, { set: "woma", chance: 0.01 }] },
    juxing: { rolls: [{ set: "mid", chance: 0.3 }] },
    // —— 石墓（报告第 7 节：白野猪、邪恶毒蛇——沃玛主产、三神兵低概率、高级书来源） ——
    hongye: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    heiye: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }], bookChance: 0.015 },
    xieshe: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.015 }] },
    baiye: {
        rolls: [{ set: "mid", chance: 0.45 }, { set: "woma", chance: 0.12 }, { set: "zumaWeapon", chance: 0.012 }],
        bookChance: 0.07, bookHigh: true, specials: [OIL(0.06)],
    },
    xiedu: {
        rolls: [{ set: "mid", chance: 0.4 }, { set: "woma", chance: 0.1 }, { set: "zumaWeapon", chance: 0.015 }],
        bookChance: 0.05, bookHigh: true, specials: [OIL(0.08)],
    },
    // —— 祖玛寺庙（报告第 6 节：中级档 + 沃玛低概率 + 祖玛极低概率，高级书低概率） ——
    "zuma-gong": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }, { set: "zuma", chance: 0.008 }], bookChance: 0.02, bookHigh: true },
    "zuma-diao": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }, { set: "zuma", chance: 0.008 }], bookChance: 0.02, bookHigh: true },
    "zuma-wei": { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }, { set: "zuma", chance: 0.008 }], bookChance: 0.02, bookHigh: true },
    dalaoshu: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }] },
    // —— 赤月峡谷（报告第 11 节：蜘蛛系中级档 + 沃玛低概率；黑锷/幻影有赤月单件说法；
    //     血僵尸——赤月单件 + 血饮极低概率；血巨人——重装/祖玛武器） ——
    tianlang: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }], specials: [OIL(0.02)] },
    judu: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }] },
    baoya: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }] },
    yuemo: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }] },
    gangya: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }] },
    hee: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }, { set: "chiyue", chance: 0.006 }], bookChance: 0.02, bookHigh: true },
    huanying: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }, { set: "chiyue", chance: 0.006 }] },
    huawen: { rolls: [{ set: "mid", chance: 0.08 }, { set: "woma", chance: 0.02 }] },
    xuejiang: {
        rolls: [{ set: "mid", chance: 0.3 }, { set: "zuma", chance: 0.03 }, { set: "chiyue", chance: 0.02 }],
        named: [{ name: "血饮", chance: 0.006 }],
        bookChance: 0.04, bookHigh: true,
    },
    xuejuren: {
        rolls: [{ set: "mid", chance: 0.45 }, { set: "woma", chance: 0.06 }, { set: "heavy", chance: 0.08 }, { set: "zumaWeapon", chance: 0.01 }],
        bookChance: 0.04,
    },
    xieju: {
        rolls: [{ set: "mid", chance: 0.45 }, { set: "woma", chance: 0.06 }, { set: "zuma", chance: 0.03 }],
        bookChance: 0.04, bookHigh: true,
    },
    // —— 2026-11-20 按原版 1.75 地图范围补入的怪物掉落（归属按研究报告，概率按本作同档口径） ——
    // 蜈蚣洞巨型蠕虫：与巨型多角虫同档掉落
    "juxing-worm": { rolls: [{ set: "mid", chance: 0.3 }] },
    // 注：封魔谷、自然洞穴、苍月岛、尸魔洞、骨魔洞、牛魔寺庙已于 2026-11-20 按用户要求删除，
    // 这六张图专属怪（虹魔系/骨魔系/牛魔系/尸魔/骷髅武士等）的掉落表已随图一并删除；
    // 虹魔/魔血套与苍月三神兵（怒斩/龙牙/逍遥扇）不再有掉落来源，装备模板本身保留（老存档已有装备照常穿戴/买卖）。
};
/** Boss / 层主的掉落表（按 Boss 名）；guaranteed 为必掉档次，rolls 为额外掷骰 */
exports.BOSS_DROPS = {
    // —— 前三关的 Boss 同样只掉低级装备（用户规则：第四关之前只能掉落低级装备） ——
    "钉耙猫王": { guaranteed: ["low"], rolls: [{ set: "low", chance: 0.3 }], bookChance: 0.1 },
    "半兽统领": { guaranteed: ["low"], rolls: [{ set: "low", chance: 0.4 }] },
    "多钩猫王": { guaranteed: ["low"], rolls: [{ set: "low", chance: 0.3 }], bookChance: 0.1 },
    "半兽勇士": { guaranteed: ["low"], rolls: [{ set: "low", chance: 0.35 }] },
    "角蝇王": { guaranteed: ["mid"], rolls: [{ set: "mid", chance: 0.4 }, { set: "woma", chance: 0.08 }], bookChance: 0.15 },
    "毒蛇王": { guaranteed: ["low"], rolls: [{ set: "low", chance: 0.4 }] },
    // 骷髅战将王（骷髅洞一、二层层主）：只掉中级装备，不掉沃玛——第四关里只有骷髅精灵掉沃玛
    "骷髅战将王": { guaranteed: ["mid"], rolls: [{ set: "mid", chance: 0.4 }] },
    // 骷髅精灵（报告第 3 节）：中级武器多件 + 龙之戒指 8%【3D点卡版公示】，本作折算 10%；
    // 另按用户要求可掉落少量沃玛装备（沃玛档 8% 掷骰）
    "骷髅精灵": { guaranteed: ["mid"], rolls: [{ set: "mid", chance: 0.5 }, { set: "woma", chance: 0.08 }], named: [{ name: "龙之戒指", chance: 0.1 }], bookChance: 0.2 },
    "铁链僵尸王": { guaranteed: ["mid"], rolls: [], bookChance: 0.15 },
    "矿洞僵尸王": { guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.05 }], bookChance: 0.18 },
    // 尸王（2026-11-19 按用户要求重做）：尸王殿里只刷尸王、尸王主要爆技能书——
    // 装备只剩小概率陪衬（中级 18% / 沃玛 3%，不再必掉装备），记忆手镯「只尸王掉」为待核实说法保留 5%；
    // 爆书改分档独立掷骰：25 级以下的书 38%（尸王的主产），25 级以上的高级书只有 0.3%。
    // 高级书口径：尸王殿每小时整波刷新 32 只（刷满全殿、只留入口四格），爆率本身不变；
    // 每小时最多 32 只的节奏下高级书出得比旧的常驻补刷更慢（整波全清、每小时一波，
    // 8 小时约 256 只、期望约 0.8 本），这是用户改成每小时刷新后的自然结果，不另调爆率；
    // 分档独立掷骰保证玩家把低级书学完之后，高级书爆率也不会被动抬高。
    "尸王": {
        rolls: [{ set: "mid", chance: 0.18 }, { set: "woma", chance: 0.03 }],
        named: [{ name: "记忆手镯", chance: 0.05 }],
        bookLowChance: 0.38, bookHighChance: 0.003,
    },
    // 沃玛卫士作层主时：中级必掉 + 沃玛 25%
    "沃玛卫士": { guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.25 }], specials: [OIL(0.2)] },
    // 沃玛教主（报告第 5/14 节）：沃玛套必掉、沃玛号角必掉（多源一致）、记忆戒指待核实说法低概率、特戒极低概率
    "沃玛教主": {
        guaranteed: ["woma"], rolls: [{ set: "mid", chance: 0.6 }, { set: "woma", chance: 0.35 }, { set: "specialRing", chance: 0.006 }],
        named: [{ name: "记忆戒指", chance: 0.08 }], bookChance: 0.18, bookHigh: true,
        specials: [{ name: "沃玛号角", icon: "📯", gold: 1000, chance: 1 }, OIL(0.5)],
    },
    // 邪恶钳虫（报告第 8 节）：沃玛级为主，出祈祷部件（待核实说法）、中级书较高概率
    "邪恶钳虫": {
        guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.3 }], bookChance: 0.22,
        named: [{ name: "祈祷手镯", chance: 0.05 }, { name: "祈祷戒指", chance: 0.05 }, { name: "祈祷项链", chance: 0.05 }],
        specials: [OIL(0.4)],
    },
    // 触龙神（报告第 8 节）：沃玛套 + 祖玛武器（裁决/龙纹/骨玉），死亡棺材清单含祈祷部件
    "触龙神": {
        guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.5 }, { set: "zumaWeapon", chance: 0.08 }],
        named: [{ name: "祈祷手镯", chance: 0.04 }, { name: "祈祷戒指", chance: 0.04 }],
        bookChance: 0.15, bookHigh: true, specials: [OIL(0.4)],
    },
    "红野猪王": { guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.1 }] },
    "黑野猪王": { guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.12 }] },
    "蝎蛇王": { guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.12 }] },
    "白野猪王": {
        guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.35 }, { set: "zumaWeapon", chance: 0.02 }],
        bookChance: 0.12, bookHigh: true, specials: [OIL(0.15)],
    },
    "邪恶毒蛇": {
        guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.4 }, { set: "zumaWeapon", chance: 0.03 }],
        bookChance: 0.1, bookHigh: true, specials: [OIL(0.2)],
    },
    // 石墓尸王（报告第 7 节）：高级技能书 100%【3D点卡版公示】——本作必掉一本（全职业书池，见 App 的 bookPool）且偏向高级书
    "石墓尸王": { guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.15 }], bookChance: 1, bookHigh: true },
    "祖玛卫士": { guaranteed: ["mid"], rolls: [{ set: "zuma", chance: 0.18 }, { set: "woma", chance: 0.2 }] },
    // 祖玛教主（报告第 6/14 节）：沃玛必掉、祖玛装备主产、祖玛头像、祝福油必掉、特戒极低概率
    "祖玛教主": {
        guaranteed: ["woma"], rolls: [{ set: "zuma", chance: 0.28 }, { set: "mid", chance: 0.5 }, { set: "specialRing", chance: 0.008 }],
        bookChance: 0.15, bookHigh: true,
        specials: [OIL(1), { name: "祖玛头像", icon: "🗿", gold: 800, chance: 0.5 }],
    },
    // 双头金刚→法神套、双头血魔→圣战套（报告第 11 节，多源一致的分工）
    "双头金刚": {
        guaranteed: ["mid"], rolls: [{ set: "fashen", chance: 0.35 }, { set: "zuma", chance: 0.15 }],
        bookChance: 0.12, bookHigh: true, specials: [OIL(0.5)],
    },
    "双头血魔": {
        guaranteed: ["mid"], rolls: [{ set: "shengzhan", chance: 0.35 }, { set: "zuma", chance: 0.15 }],
        bookChance: 0.12, bookHigh: true, specials: [OIL(0.5)],
    },
    // 赤月恶魔（报告第 11/14 节）：天尊套主产，另出圣战/法神散件与三神兵，特戒极低概率
    "赤月恶魔": {
        guaranteed: ["woma"], rolls: [{ set: "tianzun", chance: 0.3 }, { set: "chiyue", chance: 0.1 }, { set: "zuma", chance: 0.25 }, { set: "specialRing", chance: 0.01 }],
        bookChance: 0.14, bookHigh: true, specials: [OIL(0.6)],
    },
    // —— 2026-11-20 按原版 1.75 地图范围补入/恢复的层主与 Boss 掉落 ——
    // 白日门/赤月前段的层主（血巨人/血僵尸/邪恶巨人作层主时）
    "血巨人": {
        guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.3 }, { set: "heavy", chance: 0.1 }, { set: "zumaWeapon", chance: 0.02 }],
        bookChance: 0.1, bookHigh: true, specials: [OIL(0.2)],
    },
    "血僵尸": {
        guaranteed: ["mid"], rolls: [{ set: "zuma", chance: 0.1 }, { set: "chiyue", chance: 0.05 }],
        named: [{ name: "血饮", chance: 0.01 }],
        bookChance: 0.1, bookHigh: true, specials: [OIL(0.2)],
    },
    "邪恶巨人": {
        guaranteed: ["mid"], rolls: [{ set: "woma", chance: 0.3 }, { set: "zuma", chance: 0.08 }],
        bookChance: 0.1, bookHigh: true, specials: [OIL(0.2)],
    },
    // 注：虹魔猪卫/虹魔蝎卫/虹魔教主（封魔谷）、恶灵尸王（尸魔洞）、黄泉教主（骨魔洞）、
    // 牛魔将军/牛魔王（牛魔寺庙）的 Boss 掉落已随这四张地图于 2026-11-20 按用户要求删除一并移除。
};
exports.ORES = [
    { id: "copper", name: "铜矿", icon: "🟠", val: 1 },
    { id: "iron", name: "铁矿", icon: "⚫", val: 2 },
    { id: "silver", name: "银矿", icon: "⚪", val: 4 },
    { id: "gold", name: "金矿", icon: "🟡", val: 7 },
    { id: "blackiron", name: "黑铁矿", icon: "💎", val: 12 },
];
exports.POTION_PRICE = 40; // 旧单价常量（中瓶价），保留兼容引用
exports.HP_POTION_TIERS = [
    { name: "小金创药", short: "小", frac: 0.3, price: 20 },
    { name: "金创药", short: "中", frac: 0.55, price: 40 },
    { name: "大金创药", short: "大", frac: 0.9, price: 80 },
];
exports.MP_POTION_TIERS = [
    { name: "小魔法药", short: "小", frac: 0.3, price: 20 },
    { name: "魔法药", short: "中", frac: 0.6, price: 40 },
    { name: "大魔法药", short: "大", frac: 0.95, price: 80 },
];
const potionTotal = (pots) => (pots[0] ?? 0) + (pots[1] ?? 0) + (pots[2] ?? 0);
exports.potionTotal = potionTotal;
/** 智能选瓶：优先用刚好够补上缺口的最小等级，没有够大的就用手头最大的（不浪费大瓶） */
function pickPotionTier(pots, tiers, missing, maxVal) {
    let largest = -1;
    for (let i = 0; i < 3; i++) {
        if ((pots[i] ?? 0) <= 0)
            continue;
        largest = i;
        if (tiers[i].frac * maxVal >= missing)
            return i;
    }
    return largest;
}
exports.ENH_MAX = 10;
// 地图半径：原 900，按用户要求在原地图基础上再增加一半 → 1350（地图边长 1800 → 2700）
exports.WORLD_HALF = 1350;
// 怪物经验倍率已取消（2026-11-20 按用户要求，配合怪物基础经验改按原版 1.76 数值表）：
// 击杀经验 = 怪物定义的基础经验（即表二经验值）。精英怪已删除，不再有精英 ×3。
// 常量保留为 1 仅为兼容既有三处结算引用（普通怪/Boss），不再有任何放大。
exports.MONSTER_XP_MUL = 1;
// 每层地图的怪物总量：2026-11-18 时曾统一为每层 500 只；2026-11-20 按用户要求改为
// 按 1.75 地图列表逐图定量——每层在 LayerDef.monsterCount 里写死自己的数量（见各层定义），
// 本常量只作旧数据/缺省兜底，不再有任何一层实际走这个统一值。进图时一次性全部刷出、
// 散布在整张地图上，不再分批补刷。不再有「击杀数任务」：
// 通关不看杀了多少怪——进图时 Boss 就已经刷新在本层地图某处，玩家自己在地图里找到并击败它即可。
// LayerDef.killTarget 已不再作为通关条件（仅保留字段兼容旧数据，不再读取）。
// 精英怪已于 2026-11-20 按用户要求删除：不再刷精英个体，eliteQuota 字段一并移除。
exports.MAP_MONSTER_COUNT = 500;
/* ---------------- 存档结构 ---------------- */
/** 装备耐久上限：所有装备统一 100（2026-11-19 按用户要求） */
exports.EQUIP_MAX_DUR = 100;
let uidCounter = 1;
function nextUid() {
    return Date.now() * 1000 + (uidCounter++ % 1000);
}
// 升级所需经验（2026-11-20 按用户要求改为逐级查表，废弃原公式 300×等级^1.55 / 30 级起 900×等级^1.55）：
// 按原版《热血传奇》1.76 数值表表一（多源交叉验证，见交付研究报告）：
// 1→40 级用表一每级所需经验（20→21 级采主流 14 万）；40→45 级 1200万/1600万/3000万/5000万/8000万；
// 45→50 级用 VMOS 版 1亿/1.2亿/1.5亿/2亿/2.5亿，50→51 级 3亿；51→60 级用 VMOS 版（3.5亿→10亿）；
// 60 级以上无表可查，沿用旧公式 900×等级^1.55 兜底。
// 升级经验条、角色面板、战斗 HUD 全部共用本函数。已有存档保留当前等级与已有经验，只按新表算下一级所需。
const XP_NEED_TABLE = {
    1: 100, 2: 200, 3: 300, 4: 400, 5: 600, 6: 900, 7: 1200, 8: 1700, 9: 2500, 10: 6000,
    11: 8000, 12: 10000, 13: 15000, 14: 30000, 15: 40000, 16: 50000, 17: 70000, 18: 100000, 19: 120000, 20: 140000,
    21: 250000, 22: 300000, 23: 350000, 24: 400000, 25: 500000, 26: 700000, 27: 1000000, 28: 1400000, 29: 1800000, 30: 2000000,
    31: 2400000, 32: 2800000, 33: 3200000, 34: 3600000, 35: 4000000, 36: 4800000, 37: 5600000, 38: 8200000, 39: 9000000, 40: 12000000,
    41: 16000000, 42: 30000000, 43: 50000000, 44: 80000000, 45: 100000000, 46: 120000000, 47: 150000000, 48: 200000000, 49: 250000000, 50: 300000000,
    51: 350000000, 52: 400000000, 53: 450000000, 54: 500000000, 55: 600000000, 56: 700000000, 57: 800000000, 58: 900000000, 59: 1000000000,
};
function xpNeed(level) {
    const t = XP_NEED_TABLE[level];
    if (t !== undefined)
        return t;
    // 60 级以上：表一无数值，沿用旧公式兜底
    return Math.round(900 * Math.pow(level, 1.55));
}
function newSave(name, classId) {
    const first = exports.CLASS_SKILLS[classId][0];
    return {
        v: 1,
        name,
        classId,
        level: 1,
        xp: 0,
        gold: 200,
        hpPots: [0, 100, 0], // 开局给 100 瓶中瓶（与旧版单瓶效果一致）
        mpPots: [0, 100, 0],
        skillsOn: true,
        soundOn: true,
        musicOn: true,
        books: [],
        learned: { [first]: { lv: 1, casts: 0 } },
        active: [first],
        worn: {},
        bag: [],
        ores: {},
        cleared: [],
        bonusLit: [],
        run: null,
        deepest: {},
        savedAt: Date.now(),
    };
}
/** 装备主属性分（用于强弱对比）：本职业主属性上限 + 次要项折算 */
function equipScore(it, cls) {
    const mainKey = cls === "warrior" ? "atk" : cls === "mage" ? "mag" : "dao";
    const s = it.stats;
    let score = 0;
    const rng = (v) => (v ? v[0] + v[1] : 0);
    score += rng(s[mainKey]) * 3;
    score += rng(s.def) + rng(s.mdef);
    score += rng(s.atk) + rng(s.mag) + rng(s.dao) - rng(s[mainKey]);
    score += (s.acc ?? 0) * 2 + (s.agi ?? 0) * 2;
    score += (s.hp ?? 0) / 8 + (s.spd ?? 0) / 2 + (s.crit ?? 0) * 60;
    if (it.jp)
        score += it.jp.val * 3;
    score += it.enh * 6;
    return score;
}
const JP_KEYS = ["atk", "mag", "dao", "def", "mdef", "acc", "agi", "hp", "spd"];
function makeEquip(tpl, withJp) {
    let jp = null;
    if (withJp) {
        const key = JP_KEYS[Math.floor(Math.random() * JP_KEYS.length)];
        const val = key === "hp" ? 10 + Math.floor(Math.random() * 21)
            : key === "spd" ? 2 + Math.floor(Math.random() * 4)
                : 1 + Math.floor(Math.random() * 3);
        jp = { key, val };
    }
    const base = (tpl.stats.atk ? tpl.stats.atk[1] : 0) +
        (tpl.stats.mag ? tpl.stats.mag[1] : 0) +
        (tpl.stats.dao ? tpl.stats.dao[1] : 0) +
        (tpl.stats.def ? tpl.stats.def[1] : 0) +
        (tpl.stats.mdef ? tpl.stats.mdef[1] : 0);
    const price = Math.round((30 + tpl.reqLv * 6 + tpl.tier * 60 + base * 9) * (jp ? 1.8 : 1));
    // 装备耐久上限统一 100（2026-11-19 按用户要求）：新装备满耐久 100，旧装备在读档时同步迁移（见 App.tsx parseSave）
    const maxDur = exports.EQUIP_MAX_DUR;
    return {
        uid: nextUid(),
        name: tpl.name,
        cls: tpl.cls,
        icon: tpl.icon,
        slot: tpl.slot,
        tier: tpl.tier,
        reqLv: tpl.reqLv,
        ...(tpl.reqStat ? { reqStat: tpl.reqStat } : {}),
        stats: tpl.stats,
        jp,
        enh: 0,
        dur: maxDur,
        maxDur,
        price,
    };
}
function repairCost(it) {
    const missing = Math.max(0, it.maxDur - it.dur);
    return missing * 2 * (1 + it.tier);
}
function statLines(it) {
    const lines = [];
    const s = it.stats;
    const rng = (label, v) => {
        if (v)
            lines.push(`${label} ${v[0]}-${v[1]}`);
    };
    rng("攻击", s.atk);
    rng("魔力", s.mag);
    rng("道术", s.dao);
    rng("防御", s.def);
    rng("魔御", s.mdef);
    if (s.acc)
        lines.push(`准确 +${s.acc}`);
    if (s.agi)
        lines.push(`敏捷 +${s.agi}`);
    if (s.hp)
        lines.push(`生命 +${s.hp}`);
    if (s.spd)
        lines.push(`移速 +${s.spd}`);
    if (s.crit)
        lines.push(`暴击 +${Math.round(s.crit * 100)}%`);
    if (it.enh > 0)
        lines.push(`强化 +${it.enh}（主属性 +${it.enh * 2}）`);
    if (it.jp)
        lines.push(`极品：${exports.JP_LABEL[it.jp.key] ?? it.jp.key} +${it.jp.val}`);
    return lines;
}
/** 把一件装备的属性拆成可逐项对比的行（与 statLines 同口径，含强化主属性与极品加成折算） */
function statRows(it) {
    const rows = [];
    const s = it.stats;
    const rng = (key, label, v) => {
        if (v)
            rows.push({ key, label, text: `${v[0]}-${v[1]}`, value: v[0] + v[1] });
    };
    rng("atk", "攻击", s.atk);
    rng("mag", "魔力", s.mag);
    rng("dao", "道术", s.dao);
    rng("def", "防御", s.def);
    rng("mdef", "魔御", s.mdef);
    const one = (key, label, v, text) => {
        if (v)
            rows.push({ key, label, text, value: v });
    };
    one("acc", "准确", s.acc, `+${s.acc}`);
    one("agi", "敏捷", s.agi, `+${s.agi}`);
    one("hp", "生命", s.hp, `+${s.hp}`);
    one("spd", "移速", s.spd, `+${s.spd}`);
    one("crit", "暴击", s.crit, `+${Math.round((s.crit ?? 0) * 100)}%`);
    // 强化：主属性每级 +2（与 wornTotals 口径一致），折进主属性行
    if (it.enh > 0) {
        const mainKey = it.cls === "warrior" ? "atk" : it.cls === "mage" ? "mag" : "dao";
        const mainLabel = mainKey === "atk" ? "攻击" : mainKey === "mag" ? "魔力" : "道术";
        const row = rows.find((r) => r.key === mainKey);
        if (row) {
            row.value += it.enh * 2;
            row.text += `（含强化 +${it.enh * 2}）`;
        }
        else
            rows.unshift({ key: mainKey, label: mainLabel, text: `强化 +${it.enh * 2}`, value: it.enh * 2 });
    }
    // 极品加成折进对应属性行
    if (it.jp) {
        const jpLabel = { atk: "攻击", mag: "魔力", dao: "道术", def: "防御", mdef: "魔御", acc: "准确", agi: "敏捷", hp: "生命", spd: "移速" };
        const row = rows.find((r) => r.key === it.jp.key);
        if (row) {
            row.value += it.jp.val;
            row.text += `（含极品 +${it.jp.val}）`;
        }
        else
            rows.push({ key: it.jp.key, label: jpLabel[it.jp.key] ?? it.jp.key, text: `极品 +${it.jp.val}`, value: it.jp.val });
    }
    return rows;
}
/** 两件装备逐项对比：返回并集属性行，delta>0 表示 a 在该项更强、<0 更弱、=0 相同 */
function statCompare(a, b) {
    const ra = statRows(a);
    const rb = statRows(b);
    const order = ["atk", "mag", "dao", "def", "mdef", "acc", "agi", "hp", "spd", "crit"];
    const keys = [...new Set([...ra.map((r) => r.key), ...rb.map((r) => r.key)])]
        .sort((x, y) => order.indexOf(x) - order.indexOf(y));
    return keys.map((key) => {
        const x = ra.find((r) => r.key === key);
        const y = rb.find((r) => r.key === key);
        return {
            key,
            label: x?.label ?? y?.label ?? key,
            aText: x?.text ?? "—",
            bText: y?.text ?? "—",
            delta: (x?.value ?? 0) - (y?.value ?? 0),
        };
    });
}
/** 汇总穿戴装备给人物的属性加成（atk/mag/dao/def/mdef 是上限口径，*Lo 是下限口径——
 * 伤害框架按面板下限至上限随机发挥，下限汇总只算装备区间下限，见 derivedStats） */
function wornTotals(save) {
    const t = {
        atk: 0, mag: 0, dao: 0, def: 0, mdef: 0,
        atkLo: 0, magLo: 0, daoLo: 0,
        acc: 0, agi: 0, hp: 0, spd: 0, crit: 0,
    };
    for (const slot of exports.WORN_SLOTS) {
        const it = save.worn[slot];
        if (!it)
            continue;
        // 异职业装备可以穿，但它加的属性对本职业无用：整件不计入属性汇总
        if (it.cls !== save.classId)
            continue;
        const s = it.stats;
        const up = (v) => (v ? v[1] : 0);
        const dn = (v) => (v ? v[0] : 0);
        t.atk += up(s.atk);
        t.mag += up(s.mag);
        t.dao += up(s.dao);
        t.atkLo += dn(s.atk);
        t.magLo += dn(s.mag);
        t.daoLo += dn(s.dao);
        t.def += up(s.def);
        t.mdef += up(s.mdef);
        t.acc += s.acc ?? 0;
        t.agi += s.agi ?? 0;
        t.hp += s.hp ?? 0;
        t.spd += s.spd ?? 0;
        t.crit += s.crit ?? 0;
        const mainKey = it.cls === "warrior" ? "atk" : it.cls === "mage" ? "mag" : "dao";
        t[mainKey] += it.enh * 2;
        t[`${mainKey}Lo`] += it.enh * 2;
        if (it.slot === "armor" || it.slot === "helmet")
            t.def += it.enh;
        if (it.jp) {
            const k = it.jp.key;
            if (k in t && typeof t[k] === "number")
                t[k] += it.jp.val;
            if (it.jp.key === "atk" || it.jp.key === "mag" || it.jp.key === "dao")
                t[`${it.jp.key}Lo`] += it.jp.val;
        }
    }
    return t;
}
function derivedStats(save) {
    const cls = exports.CLASSES.find((c) => c.id === save.classId) ?? exports.CLASSES[0];
    const w = wornTotals(save);
    const lv = save.level;
    // 生命按表一 10 级锚点插值（hpAtLevel），不再用旧的线性 hp + hpLv×(lv-1) 公式
    const maxHp = hpAtLevel(save.classId, lv) + w.hp;
    const maxMp = cls.mp + cls.mpLv * (lv - 1);
    // 面板主属性区间（2026-11-20 按数值表表四伤害框架）：下限 = 职业基础 + 等级成长 + 装备区间下限，
    // 上限 = 同口径取装备区间上限；每次攻击在下限至上限之间随机发挥（main 保留为上限、兼容旧引用）。
    // 原「每点主属性让伤害 +2%」的额外乘区（dmgMul）已取消——主属性已体现在面板攻/魔/道里，不再二次放大。
    const lvGrow = Math.floor(lv / 2);
    const mainHi = cls[cls.mainKey] + lvGrow + w[cls.mainKey];
    const mainLo = cls[cls.mainKey] + lvGrow + w[`${cls.mainKey}Lo`];
    // 总准确 = 职业基础命中（战士 5 点）+ 装备准确 + 基本剑术/精神力战法被动（每级 +3）+ 攻杀剑术被动（每级 +1）
    const skillAcc = (save.learned["jiben"]?.lv ?? 0) * exports.SKILL_ACC_PER_LEVEL +
        (save.learned["jingshen"]?.lv ?? 0) * exports.SKILL_ACC_PER_LEVEL +
        (save.learned["gongsha"]?.lv ?? 0) * exports.GONGSHA_ACC_PER_LEVEL;
    return {
        cls, worn: w, maxHp, maxMp, main: mainHi, mainLo, mainHi,
        acc: (save.classId === "warrior" ? exports.WARRIOR_BASE_ACC : 0) + w.acc + skillAcc, skillAcc,
        atk: cls.atk + w.atk, mag: cls.mag + w.mag, dao: cls.dao + w.dao,
        // 基础魔御 = 基础防御的一半（战士 4 / 道士 2 / 法师 0），再叠加装备魔御
        def: cls.armor + w.def, mdef: Math.floor(cls.armor / 2) + w.mdef,
        speed: cls.speed + w.spd,
    };
}
/** 本次攻击的发挥值：在面板主属性下限至上限之间随机取（原版实测框架；幸运/诅咒曲线待核实、本作未引入幸运属性） */
function rollMain(d) {
    return d.mainLo + Math.random() * (d.mainHi - d.mainLo);
}
const REQ_STAT_LABEL = { atk: "攻击", mag: "魔法", dao: "道术" };
/** 一件装备（模板或实例）的属性门槛：实例自带优先，旧存档实例没有时按同名模板回查 */
function reqStatOf(it) {
    return it.reqStat ?? exports.EQUIP_BY_NAME[it.name]?.reqStat;
}
/** 穿戴门槛的显示文案：属性门槛显示「需要攻击 46」，等级门槛显示「需要 30 级」 */
function wearReqText(it) {
    const rs = reqStatOf(it);
    return rs ? `需要${REQ_STAT_LABEL[rs.key]} ${rs.val}` : `需要 ${it.reqLv} 级`;
}
/** 当前存档是否满足一件装备的穿戴门槛（新穿戴时才校验；已穿在身上的不强制脱下）：
 * 有属性门槛只看对应面板属性（与门槛同口径：本职业主属性取面板上限，副属性取面板值），不看等级；
 * 没有属性门槛只看等级。 */
function canWear(save, it) {
    const rs = reqStatOf(it);
    if (!rs)
        return save.level >= it.reqLv;
    const d = derivedStats(save);
    const val = rs.key === d.cls.mainKey ? d.mainHi : d[rs.key];
    return val >= rs.val;
}
function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

module.exports = { STAGES: exports.STAGES, MONSTER_MAP: exports.MONSTER_MAP, WORLD_HALF: exports.WORLD_HALF, MONSTER_XP_MUL: exports.MONSTER_XP_MUL };
