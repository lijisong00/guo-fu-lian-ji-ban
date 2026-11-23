'use strict';
/**
 * 国服服务器版 · 独立联机版 — 服务端权威游戏逻辑（lib/game.js）
 *
 * 全部数值与数据表只来自 shared/data.js（CLASSES / XP_TABLE / SKILLS /
 * MONSTERS / BOSSES / STAGES / EQUIPS / WEAR_REQ / POTIONS / SHOP /
 * SOUL_FIRE_TABLE / DROP_RULES 与各常量）。凡 data.js 与 MEMORY.md /
 * 任务口径冲突处，以 data.js 的导出为准，冲突清单见 docs/protocol.md
 * 末尾「规则冲突与缺失」一节。
 *
 * 要点（MEMORY.md 为最终裁决，逐项实现）：
 *  - 升级查 XP_TABLE（expNeed()，60 级以上走 data.js 的兜底公式）；
 *    怪物经验 ×7.8，击杀者全额、同房队友一半；升级回 30% 血。
 *  - 职业血量按锚点表 hpAt()；战士基础准确 5，基本剑术每级 +3、
 *    攻杀每级 +1；怪物闪避普通 12%/Boss 28%，每点准确抵消 2%，
 *    最低留 2%；闪开飘「闪避」、不掉血、不计命中与熟练度。
 *  - 伤害：面板上下限随机发挥 → 乘技能倍率或加技能附加 → 减目标
 *    防御/魔御固定值；没有「每点主属性 +2%」乘区；灵魂火符按
 *    SOUL_FIRE_TABLE；怪物打玩家先算魔法盾抵挡百分比再减防御；
 *    怪物对玩家伤害 ×0.5。
 *  - 技能 33 门全实现；战士耗魔只有半月弯刀 6 与烈火剑法 13；
 *    火球术直线飞行不追踪不穿透；火墙放最近怪物脚下（560 内没怪
 *    不空放），持续 8 秒，半径 59.4，冷却 1.5 秒；冰咆哮同范围，
 *    附带减速；治愈术只回血；魔法盾习得后自动释放、不占操作栏；
 *    上场技能最多 2 门；熟练度每命中 1 次 +1、每级 1000 点、满级 4 级。
 *  - 技能书全职业书池，本职业已学或已有的不重复掉；Boss 30%/
 *    普通 1.4%；背包中使用习得，等级够了才能学。
 *  - 刷怪：每层 500 只普通怪，进图第一帧全部刷出、散布全图（不刷
 *    到玩家脸上 300 内），杀掉不补刷；没有精英；Boss 进图时刷在
 *    离玩家 850+ 的远处，只在刷新点附近游荡，玩家贴身 120 内或
 *    先挨打才追击，追出巢穴 600 就回头；怪物被动游荡。
 *  - 尸王殿 600×600，每小时整波补满 32 只（6×6 格、正中 2×2 留空，
 *    1 只通关尸王 + 31 只常驻，杀掉的不单独补）；尸王主要爆技能书
 *    （25 级以下 38%，25 级以上高级书单独 0.3%）；钻洞落点固定殿中心。
 *  - 黄衣僵尸：走近洞口 240 内约 2.2 秒完全爬出，爬出后变成一只
 *    黄衣僵尸扑向玩家（普通僵尸数值与掉落）；打掉它后本房所有人
 *    bonusLit 同时点亮蜈蚣洞与沃玛寺庙（只提示新点亮的部分）。
 *  - 掉落：Boss 必掉 1 件 + 50% 再掉 1 件、普通 8%；极品 Boss 50%/
 *    普通 0%，+1/+2/+3 为 60/30/10%；大爆 Boss 3%/普通 0.3%；
 *    药水血瓶 5.5%/魔法瓶 5%；金币掉落；掉落归属 1 分钟内只有击杀者
 *    能捡；地上掉落 45 秒消失。
 *  - 装备 9 穿戴位；穿戴门槛按 WEAR_REQ 与 reqLv 分开校验，已穿
 *    装备不强制脱下；异职业装备能穿但不计属性；拾取自动穿（本职业
 *    装备有空位直接穿上，两位都满才替换较弱一件、被换下的回背包）；
 *    耐久上限 100（新装备满耐久；迁移来的旧耐久原样保留）；
 *    没有幸运/诅咒系统。
 *  - 药水小/中/大三档，血 30/55/90%、蓝 30/60/95%，价格 20/40/80；
 *    喝药自动选刚好够补满的最小瓶；蓝不够放技能时自动喝一瓶魔法瓶；
 *    挂机时血量低于 35% 自动喝血瓶。药水两种格式（数组 [小,中,大]
 *    与数字旧单档）读档原样保留、按中瓶计，写回不改格式。
 *  - 商店只卖本职业 tier 0–1 基础装备，无极品；买价 = 估价×2+10，
 *    卖价 = 估价；维修按旧版公式（见 repairCost）。
 *  - 死亡 35% 概率掉 1 件已穿装备（掉在地上），保留技能与等级；
 *    5 秒后原地复活。
 *  - 地图 15 张按 STAGES 连接走；主线通关计数分母 14（未知暗殿不计）；
 *    击败层主/Boss 后在 Boss 倒下处开传送门，本层剩怪保留；谁先
 *    走进传送门全队一起下潜；分层关下潜到下一层，本关最后一层通关
 *    后门通往下一关第一层；赤月峡谷最后一层打完赤月恶魔不弹结算、
 *    不开回城门，留在图里继续打；比奇城是安全区不刷怪；白日门城里
 *    是安全区不刷怪、怪物进不了城；多层图重进永远从第一层开始；
 *    1.75 内容上限；所有地图默认可进，req/unlocks 链不拦进图。
 *  - 挂机：自动打怪、捡装备、血量低于 35% 自动喝血瓶；法师、道士
 *    风筝，战士贴身。
 */
const Data = require('../shared/data.js');
const store = require('./db.js');
const backup = require('./backup.js');

// ---- data.js 导出校验（缺什么启动即报错，不静默编造） ----
const REQUIRED = [
  'CLASSES', 'hpAt', 'XP_TABLE', 'expNeed', 'SKILLS', 'SKILL_REQ',
  'CLASS_SKILLS', 'MONSTERS', 'BOSSES', 'STAGES', 'EQUIPS', 'WEAR_REQ',
  'POTIONS', 'SHOP', 'tradePrice', 'shopBuyPrice', 'SOUL_FIRE_TABLE',
  'soulFireDmg', 'DROP_RULES', 'SLOT_ORDER', 'MONSTER_XP_MUL',
  'MONSTER_DMG_TO_PLAYER_MUL', 'DODGE', 'DODGE_PER_ACC', 'DODGE_MIN',
  'DEATH_DROP_CHANCE', 'DUR_MAX', 'MAX_SLOTS', 'ROOM_MAX',
  'SKILL_MAX_LV', 'SKILL_PROF_PER_LV', 'MAX_ACTIVE_SKILLS', 'BAG_CAP',
  'START_GOLD',
];
for (const k of REQUIRED) {
  if (Data[k] === undefined) throw new Error('[game] shared/data.js 缺少导出：' + k);
}
const {
  CLASSES, hpAt, expNeed, SKILLS, SKILL_REQ, CLASS_SKILLS, MONSTERS, BOSSES,
  STAGES, EQUIPS, WEAR_REQ, POTIONS, tradePrice, shopBuyPrice, soulFireDmg,
  DROP_RULES, SLOT_ORDER, MONSTER_XP_MUL, MONSTER_DMG_TO_PLAYER_MUL, DODGE,
  DODGE_PER_ACC, DODGE_MIN, DEATH_DROP_CHANCE, DUR_MAX, MAX_SLOTS, ROOM_MAX,
  SKILL_MAX_LV, SKILL_PROF_PER_LV, MAX_ACTIVE_SKILLS, BAG_CAP, START_GOLD,
} = Data;

// ---- 服务端自定常量（data.js 里没有的纯运行参数，见 protocol.md） ----
const TICK_MS = 100;
const PLAYER_SPEED = 220;      // 玩家移速（单位/秒）
const MONSTER_DEFAULT_SPD = 60; // data.js 里 spd 为 null 的怪物的默认移速
const BASIC_ATK_INTERVAL = 0.9; // 普攻间隔（秒）
const BASIC_RANGE = 95;         // 战士/道士普攻距离
const MAGE_BASIC_RANGE = 330;   // 法师弱化火球射程
const PICKUP_RADIUS = 60;       // 走过去拾取 / 自动拾取半径
const PORTAL_RADIUS = 80;       // 走进传送门的判定距离
const HOLE_TRIGGER_DIST = 240;  // 洞口黄衣僵尸爬出触发距离
const HOLE_CLIMB_SEC = 2.2;     // 爬出耗时（秒）
const DROP_LINGER_MS = 45 * 1000;  // 地上掉落 45 秒消失
const DROP_LOCK_MS = 60 * 1000;    // 掉落归属 1 分钟内只有击杀者能捡
const RESPAWN_SEC = 5;          // 死亡 5 秒后原地复活
const AUTOSAVE_SEC = 30;        // 房内每 30 秒自动存档
const SAFE_ZONE_RADIUS = 350;   // 白日门城中央安全区半径（城在正中央）

// ---- 旧 id → 新 id（迁移存档里的旧技能/职业 id，读档时归一化） ----
const OLD_CLASS_MAP = { warrior: 'war', mage: 'mage', taoist: 'tao', war: 'war', tao: 'tao' };
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
const OLD_WORN_MAP = { bracelet: 'braceL', bracelet2: 'braceR', ring: 'ringL', ring2: 'ringR' };
function normSkillId(id) {
  if (!id) return id;
  if (SKILLS[id]) return id;
  return OLD_SKILL_MAP[id] || id;
}
function normClsId(id) { return OLD_CLASS_MAP[id] || id; }

// 旧版 rules.md 里的技能自带暴击（data.js 的 SKILLS 表里没有暴击字段，
// 沿用旧版联机规则；基础暴击 8% ×1.6，装备 crit 额外叠加）。
const OLD_SKILL_CRIT = {
  war_gongsha: { ch: 0.35, mul: 1.5 },
  war_cisha: { ch: 0.18, mul: 1.8 },
  mage_jiguang: { ch: 0.18, mul: 1.8 },
  mage_leidian: { ch: 0.15, mul: 1.8 },
  mage_baolie: { ch: 0.15, mul: 1.8 },
  mage_shengyan: { ch: 0.20, mul: 1.8 },
};

// ---- 小工具 ----
let uidSeq = 1;
function nextUid() { return Date.now() * 1000 + (uidSeq++ % 1000); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function stageById(id) { return STAGES.find((s) => s.id === id) || null; }
function monsterById(id) { return MONSTERS.find((m) => m.id === id) || null; }
function bossById(id) { return BOSSES.find((b) => b.id === id) || null; }
function classById(id) { return CLASSES.find((c) => c.id === id) || null; }
function equipById(id) { return EQUIPS.find((e) => e.id === id) || null; }

// ---------------------------------------------------------------- 存档
/** 读档归一化（只在内存里做，不改库里原样存的 JSON，直到下次写回）。 */
function normalizeSave(save) {
  save.classId = normClsId(save.classId);
  save.level = save.level || 1;
  save.xp = save.xp || 0;
  save.gold = save.gold || 0;
  save.books = Array.isArray(save.books) ? save.books.map(normSkillId) : [];
  const learned = {};
  for (const [k, v] of Object.entries(save.learned || {})) {
    learned[normSkillId(k)] = { lv: v.lv || 1, casts: v.casts || v.prof || 0 };
  }
  save.learned = learned;
  save.active = Array.isArray(save.active)
    ? save.active.map(normSkillId).filter((id) => learned[id]).slice(0, MAX_ACTIVE_SKILLS)
    : [];
  // 穿戴位：旧单手镯/单戒指 + bracelet2/ring2 归一为左右位
  const worn = {};
  for (const [k, v] of Object.entries(save.worn || {})) {
    if (!v) continue;
    worn[OLD_WORN_MAP[k] || k] = v;
  }
  save.worn = worn;
  save.bag = Array.isArray(save.bag) ? save.bag : [];
  save.trade = Array.isArray(save.trade) ? save.trade : (Array.isArray(save.tradeBag) ? save.tradeBag : []);
  save.ores = save.ores || {};
  save.bonusLit = Array.isArray(save.bonusLit) ? save.bonusLit : [];
  save.cleared = Array.isArray(save.cleared) ? save.cleared : [];
  save.skillsOn = save.skillsOn !== false;
  save.run = save.run || {};
  return save;
}

/** 新角色（按现版本：金币 200，中瓶血瓶×100、中瓶魔法瓶×100，
 *  开局学会本职业 1 级技能，开局一把本职业 tier 0 武器）。 */
function newCharacterSave(name, cls) {
  const c = classById(cls);
  if (!c) throw new Error('职业不对：' + cls);
  const initial = c.initialSkill;
  const maxHp = hpAt(cls, 1);
  const maxMp = c.mp;
  // 开局武器：本职业 tier 0、1 级能穿的第一把。注意 data.js 的 EQUIPS 里
  // 法师/道士没有 tier 0 武器（见 protocol.md 数据缺口），此时无开局武器。
  const w = EQUIPS.find((e) => e.slot === 'weapon' && e.cls === cls && e.tier === 0 && (e.reqLv || 1) <= 1);
  const worn = {};
  if (w) worn.weapon = makeEquipInstance(w);
  const pot = POTIONS.startCount || { tier: 'mid', hp: 100, mp: 100 };
  const hpPots = pot.tier === 'mid' ? [0, pot.hp || 100, 0] : [pot.hp || 0, 0, 0];
  const mpPots = pot.tier === 'mid' ? [0, pot.mp || 100, 0] : [pot.mp || 0, 0, 0];
  return {
    v: 1, name, classId: cls, level: 1, xp: 0, gold: START_GOLD,
    hpPots, mpPots,
    skillsOn: true, soundOn: true, musicOn: true,
    books: [],
    learned: { [initial]: { lv: 1, casts: 0 } },
    active: [initial],
    worn, bag: [], trade: [], ores: {},
    bonusLit: [], cleared: [],
    run: { stageId: 'city', layer: 0, kills: 0, hp: maxHp, mp: maxMp },
    savedAt: Date.now(),
  };
}

/** 装备实例（掉落/开局/商店）：克隆库原件，满耐久 100。 */
function makeEquipInstance(tpl, jpBonus = 0) {
  const it = { ...tpl };
  delete it.source; delete it.note; delete it.verified;
  it.uid = nextUid();
  it.dur = DUR_MAX; it.maxDur = DUR_MAX;
  it.enh = 0;
  it.jp = jpBonus > 0 ? jpBonus : null;
  if (jpBonus > 0) {
    // 极品加到主属性上限（无主属性则加防御）
    const main = it.cls === 'war' ? 'atk' : it.cls === 'mage' ? 'mag' : 'dao';
    if (Array.isArray(it[main])) it[main] = [it[main][0], it[main][1] + jpBonus];
    else if (Array.isArray(it.def)) it.def = [it.def[0], it.def[1] + jpBonus];
  }
  it.price = tradePrice(it);
  return it;
}

// ---------------------------------------------------------------- 属性
/** 装备某条属性的上限（区间取上限；标量直接取）。 */
function statHi(it, key) {
  const v = it[key];
  if (Array.isArray(v)) return v[1];
  return typeof v === 'number' ? v : 0;
}
/** 装备主属性点数（上限 + 极品 + 强化），异职业装备返回 0（不计属性）。 */
function equipMainPoints(it, cls) {
  if (!it || it.cls !== cls) return 0;
  const main = cls === 'war' ? 'atk' : cls === 'mage' ? 'mag' : 'dao';
  let pts = statHi(it, main);
  if (typeof it.jp === 'number') pts += it.jp;
  if (it.enh) pts += it.enh * 2;
  return pts;
}
function calcStats(save) {
  const cls = normClsId(save.classId);
  const c = classById(cls);
  const level = save.level || 1;
  const maxHp = hpAt(cls, level);
  const maxMp = c.mp + c.mpLv * (level - 1);
  const mainKey = c.mainStat; // atk / mag / tao
  const baseRange = c[mainKey] || [0, 0];
  const perLv = c[mainKey + 'PerLv'] || c.atkPerLv || [0, 0];
  let lo = baseRange[0] + perLv[0] * (level - 1);
  let hi = baseRange[1] + perLv[1] * (level - 1);
  let def = c.def || 0, mdef = c.mdef || 0, acc = c.acc || 0;
  let crit = 0, hpBonus = 0, spdBonus = 0;
  for (const it of Object.values(save.worn || {})) {
    if (!it) continue;
    if (it.cls !== cls) continue; // 异职业装备能穿但不计属性
    lo += Array.isArray(it[mainKey]) ? it[mainKey][0] : 0;
    hi += equipMainPoints(it, cls);
    def += statHi(it, 'def') + (it.slot === 'armor' || it.slot === 'helmet' ? (it.enh || 0) : 0);
    mdef += statHi(it, 'mdef');
    acc += it.acc || 0;
    crit += it.crit || 0;
    hpBonus += it.hp || 0;
    spdBonus += it.spd || 0;
  }
  // 被动技能：幽灵盾 +魔御，神圣战甲术 +防御（每级 +1）
  const youling = save.learned && save.learned.tao_youling;
  if (youling) mdef += 2 + 1 * youling.lv;
  const shensheng = save.learned && save.learned.tao_shensheng;
  if (shensheng) def += 2 + 1 * shensheng.lv;
  // 准确：基本剑术每级 +3、攻杀每级 +1、精神力战法每级 +3
  const basic = save.learned && (save.learned.war_basic || save.learned.tao_jingshen);
  if (basic) acc += 3 * basic.lv;
  const gongsha = save.learned && save.learned.war_gongsha;
  if (gongsha) acc += 1 * gongsha.lv;
  // 魔法盾抵挡百分比（习得后自动开盾）
  const shield = save.learned && save.learned.mage_shield;
  const shieldPct = shield ? (SKILLS.mage_shield.shield[shield.lv - 1] || 0) : 0;
  return {
    cls, maxHp: maxHp + hpBonus, maxMp, atkLo: lo, atkHi: hi,
    def, mdef, acc, crit, spd: spdBonus, shieldPct,
    mainStat: hi, // 道术总值（灵魂火符查表用上限）
  };
}
/** 面板上下限随机发挥。 */
function rollPanel(stats) {
  return rand(stats.atkLo, stats.atkHi);
}
/** 装备评分（拾取自动穿比较用；异职业按 0 分计）。 */
function equipScore(it, cls) {
  if (!it || it.cls !== cls) return 0;
  const main = equipMainPoints(it, cls);
  const def = statHi(it, 'def');
  return main * 3 + def * 8 + (it.hp || 0) * 0.4 + (it.spd || 0) * 0.6
    + (it.crit || 0) * 160 + (typeof it.jp === 'number' ? it.jp * 12 : 0);
}
/** 穿戴门槛：等级需求 reqLv 与属性门槛 WEAR_REQ/装备 wear 分开校验。 */
function canWear(save, stats, it) {
  if ((save.level || 1) < (it.reqLv || 1)) return { ok: false, error: '等级不够（需 ' + (it.reqLv || 1) + ' 级）' };
  const wear = it.wear || WEAR_REQ[it.id] || null;
  if (wear) {
    const key = wear.atk !== undefined ? 'atk' : wear.mag !== undefined ? 'mag' : 'dao';
    const need = wear[key];
    // 当前主属性总值（面板上限）是否达到门槛
    const cur = key === 'atk' ? stats.atkHi : stats.mainStat;
    if (cur < need) return { ok: false, error: '属性不够（需' + ({ atk: '攻击', mag: '魔法', dao: '道术' })[key] + ' ' + need + '）' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- 掉落
function rollEquipDrop(monsterLv, tierCap) {
  let pool = EQUIPS.filter((e) => (e.reqLv || 1) <= monsterLv + 12 && (e.tier || 0) <= tierCap);
  if (pool.length === 0) pool = EQUIPS.filter((e) => (e.reqLv || 1) <= 8);
  if (pool.length === 0) return null;
  return pick(pool);
}
function rollJpBonus() {
  const r = Math.random();
  if (r < 0.6) return 1;
  if (r < 0.9) return 2;
  return 3;
}
function rollPotionTier() {
  const r = Math.random();
  return r < 0.15 ? 0 : r < 0.85 ? 1 : 2; // 小 15% / 中 70% / 大 15%
}

// ---------------------------------------------------------------- 房间与玩家
const rooms = new Map(); // code -> room
const playersByDevice = new Map(); // deviceId -> player（在线玩家）

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeRoomCode() : code;
}

function newPlayer(deviceId, slot, charRow) {
  const save = normalizeSave(JSON.parse(JSON.stringify(charRow.data)));
  const stats = calcStats(save);
  const run = save.run || {};
  const p = {
    deviceId, slot, charId: charRow.id,
    save, stats,
    x: 0, y: 0, moveX: 0, moveY: 0,
    hp: typeof run.hp === 'number' ? run.hp : stats.maxHp,
    mp: typeof run.mp === 'number' ? run.mp : stats.maxMp,
    cds: {}, basicCd: 0,
    auto: false, dead: false, respawnAt: 0,
    invisT: 0, roomCode: null,
    lastSaveAt: 0, lastMeAt: 0, lastTickSeen: Date.now(),
    toasts: [],
  };
  p.hp = clamp(p.hp, 0, stats.maxHp);
  p.mp = clamp(p.mp, 0, stats.maxMp);
  return p;
}

function createRoom(owner) {
  const code = makeRoomCode();
  const room = {
    code, ownerDeviceId: owner.deviceId,
    players: new Map(),
    stageId: 'city', floor: 1,
    monsters: [], drops: [], portal: null, hole: null,
    walls: [], projectiles: [], floats: [], pets: [],
    tick: 0, kills: 0, waveAt: Date.now(),
    monsterSeq: 1, dropSeq: 1, petSeq: 1,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  joinRoom(room, owner);
  enterStage(room, 'city', 1, true);
  return room;
}
function joinRoom(room, player) {
  if (room.players.size >= ROOM_MAX) return { ok: false, error: '房间已满（最多 ' + ROOM_MAX + ' 人）' };
  if (player.roomCode) leaveRoom(player);
  room.players.set(player.deviceId, player);
  player.roomCode = room.code;
  player.x = 0; player.y = 0; player.moveX = 0; player.moveY = 0;
  return { ok: true, room };
}
function leaveRoom(player) {
  const room = rooms.get(player.roomCode || '');
  if (!room) { player.roomCode = null; return; }
  room.players.delete(player.deviceId);
  player.roomCode = null;
  savePlayer(player, { force: true });
  if (room.players.size === 0 || room.ownerDeviceId === player.deviceId) {
    dissolveRoom(room, room.ownerDeviceId === player.deviceId ? '房主离开，房间解散' : '房间已空');
  }
}
function dissolveRoom(room, reason) {
  for (const p of room.players.values()) {
    p.roomCode = null;
    p.toasts.push(reason);
  }
  rooms.delete(room.code);
}
function roomOf(player) { return rooms.get(player.roomCode || '') || null; }

// ---------------------------------------------------------------- 进图与刷怪
function stageFloorName(stage, floor) {
  if (stage.layers > 1) return '第 ' + floor + ' 层';
  return stage.name;
}
/** 多层图重进永远从第一层开始（不读最深层记录）。 */
function enterStage(room, stageId, floor, isInitial = false) {
  const stage = stageById(stageId);
  if (!stage) return { ok: false, error: '地图不存在' };
  room.stageId = stageId;
  room.floor = floor;
  room.monsters = [];
  room.drops = [];
  room.portal = null;
  room.hole = null;
  room.walls = [];
  room.projectiles = [];
  room.pets = [];
  room.kills = 0;
  room.waveAt = Date.now();
  for (const p of room.players.values()) {
    p.x = 0; p.y = 0; p.moveX = 0; p.moveY = 0;
    p.cds = {};
    // 续玩进度：回城/进图时恢复离开时的血蓝（不回满）
    p.hp = clamp(p.hp, 1, p.stats.maxHp);
    p.mp = clamp(p.mp, 0, p.stats.maxMp);
  }
  if (!stage.safe) spawnMonsters(room, stage, floor);
  if (stageId === 'jiangshi' && floor === 3) spawnHole(room, stage);
  return { ok: true, stage, floor };
}

function randomPosIn(stage, minDistFromPlayers, room) {
  const hw = stage.w / 2 - 30, hh = stage.h / 2 - 30;
  for (let i = 0; i < 30; i++) {
    const x = rand(-hw, hw), y = rand(-hh, hh);
    if (stage.safeZone && Math.hypot(x, y) < SAFE_ZONE_RADIUS + 40) continue;
    let ok = true;
    for (const p of room.players.values()) {
      if (dist(x, y, p.x, p.y) < minDistFromPlayers) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return { x: rand(-hw, hw), y: rand(-hh, hh) };
}

function spawnMonsters(room, stage, floor) {
  if (stage.id === 'shiwang') { spawnShiwangWave(room, stage, true); return; }
  const layer = stage.layerInfo ? stage.layerInfo[floor - 1] : null;
  const hpMul = layer ? layer.hpMul : 1;
  const dmgMul = layer ? layer.dmgMul : 1;
  const kinds = stage.monsters || [];
  if (kinds.length === 0) return;
  for (let i = 0; i < 500; i++) {
    const tpl = pick(kinds);
    const base = monsterById(tpl.id) || {};
    const pos = randomPosIn(stage, 300, room);
    room.monsters.push({
      id: room.monsterSeq++, key: tpl.id, name: tpl.name,
      lv: tpl.lv, x: pos.x, y: pos.y,
      hp: Math.round(tpl.hp * hpMul), maxHp: Math.round(tpl.hp * hpMul),
      atk: Math.round(tpl.atk * dmgMul),
      def: base.def !== undefined ? base.def : Math.floor(tpl.lv * 0.55),
      spd: base.spd || MONSTER_DEFAULT_SPD,
      xp: tpl.xp, boss: false, isStageBoss: false,
      nestX: pos.x, nestY: pos.y,
      state: 'wander', targetId: null, touchCd: 0,
      slowT: 0, stunT: 0, poisonT: 0, poisonTick: 0, poisonDmg: 0,
      markT: 0, wanderT: 0, wx: pos.x, wy: pos.y,
    });
  }
  spawnStageBoss(room, stage, floor);
}

/** Boss 进图时刷在离玩家 850+ 的远处，只在刷新点附近游荡。 */
function spawnStageBoss(room, stage, floor) {
  let boss = null;
  const layer = stage.layerInfo ? stage.layerInfo[floor - 1] : null;
  if (layer && layer.boss) {
    const b = layer.boss;
    boss = { name: b.name, lv: b.lv, hp: b.hp, xp: b.xp, atk: b.atk, gold: b.gold };
  } else if (stage.bossId) {
    const b = bossById(stage.bossId);
    if (b) boss = { name: b.name, lv: b.lv, hp: b.hp, xp: b.xp, atk: b.atk, gold: b.gold };
  }
  if (!boss) return;
  const pos = randomPosIn(stage, 850, room);
  room.monsters.push({
    id: room.monsterSeq++, key: 'boss_' + stage.id + '_' + floor, name: boss.name,
    lv: boss.lv, x: pos.x, y: pos.y,
    hp: boss.hp, maxHp: boss.hp, atk: boss.atk,
    def: Math.floor(boss.lv * 0.55), spd: 62,
    xp: boss.xp, gold: boss.gold, boss: true, isStageBoss: true,
    nestX: pos.x, nestY: pos.y,
    state: 'wander', targetId: null, touchCd: 0,
    slowT: 0, stunT: 0, poisonT: 0, poisonTick: 0, poisonDmg: 0,
    markT: 0, wanderT: 0, wx: pos.x, wy: pos.y,
  });
}

/** 尸王殿整波：600×600，6×6 格，正中 2×2 留空，1 只通关尸王 + 31 只常驻。 */
function spawnShiwangWave(room, stage, initial = false) {
  const size = 600, cell = size / 6;
  const cells = [];
  for (let gy = 0; gy < 6; gy++) {
    for (let gx = 0; gx < 6; gx++) {
      if (gx >= 2 && gx <= 3 && gy >= 2 && gy <= 3) continue; // 正中 2×2 留空给玩家落脚
      cells.push({ x: -size / 2 + cell * (gx + 0.5), y: -size / 2 + cell * (gy + 0.5) });
    }
  }
  const existingBoss = room.monsters.some((m) => m.isStageBoss);
  const existingCount = room.monsters.filter((m) => m.key === 'shiwang' || m.key === 'tielianshiwang').length;
  // 补满到 32 只（通关尸王死了才补，活着不重复刷）
  const needBoss = existingBoss ? 0 : 1;
  const needRegular = 31 - Math.max(0, existingCount - (existingBoss ? 1 : 0));
  const freeCells = cells.filter(() => true);
  // 随机打乱格子
  for (let i = freeCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [freeCells[i], freeCells[j]] = [freeCells[j], freeCells[i]];
  }
  let ci = 0;
  const regTpl = stage.monsters.find((m) => m.id === 'shiwang') || stage.monsters[0];
  const regBase = monsterById('shiwang') || {};
  if (needBoss && ci < freeCells.length) {
    const b = bossById('boss_shiwang');
    const pos = freeCells[ci++];
    room.monsters.push({
      id: room.monsterSeq++, key: 'shiwang', name: b.name,
      lv: b.lv, x: pos.x, y: pos.y, hp: b.hp, maxHp: b.hp, atk: b.atk,
      def: Math.floor(b.lv * 0.55), spd: regBase.spd || MONSTER_DEFAULT_SPD,
      xp: b.xp, gold: b.gold, boss: true, isStageBoss: true,
      nestX: pos.x, nestY: pos.y,
      state: 'wander', targetId: null, touchCd: 0,
      slowT: 0, stunT: 0, poisonT: 0, poisonTick: 0, poisonDmg: 0,
      markT: 0, wanderT: 0, wx: pos.x, wy: pos.y,
    });
  }
  for (let n = 0; n < needRegular && ci < freeCells.length; n++) {
    const pos = freeCells[ci++];
    room.monsters.push({
      id: room.monsterSeq++, key: regTpl.id, name: regTpl.name,
      lv: regTpl.lv, x: pos.x, y: pos.y,
      hp: regTpl.hp, maxHp: regTpl.hp, atk: regTpl.atk,
      def: regBase.def !== undefined ? regBase.def : Math.floor(regTpl.lv * 0.55),
      spd: regBase.spd || MONSTER_DEFAULT_SPD,
      xp: regTpl.xp, boss: false, isStageBoss: false,
      nestX: pos.x, nestY: pos.y,
      state: 'wander', targetId: null, touchCd: 0,
      slowT: 0, stunT: 0, poisonT: 0, poisonTick: 0, poisonDmg: 0,
      markT: 0, wanderT: 0, wx: pos.x, wy: pos.y,
    });
  }
  room.waveAt = Date.now();
}

/** 僵尸洞穴三层：随机刷一个地面洞口（黑洞带土沿）。 */
function spawnHole(room, stage) {
  const pos = randomPosIn(stage, 300, room);
  room.hole = { x: pos.x, y: pos.y, zombieState: 'in', climbT: 0, guardianId: null };
}

/** 传送目的地：比奇城传送员列表 = STAGES[0].to（尸王殿与未知暗殿不在内）。 */
function teleportTargets() {
  const city = stageById('city');
  return (city && city.to) || [];
}
/** 传送：只能从比奇城出发；目标图必须在传送列表里；落点目标图第一层；
 *  蜈蚣洞与沃玛寺庙的传送点需先点亮（bonusLit），其余默认可进。 */
function teleportRoom(room, targetId, requester) {
  if (room.stageId !== 'city') return { ok: false, error: '只能从比奇城传送员出发' };
  const targets = teleportTargets();
  if (!targets.includes(targetId)) return { ok: false, error: '该地图不在传送列表里' };
  if ((targetId === 'wugong' || targetId === 'woma')
    && !(requester.save.bonusLit || []).includes(targetId)) {
    return { ok: false, error: '传送点未点亮（打掉僵尸洞三层洞口的黄衣僵尸，或打通对应地图）' };
  }
  const stage = stageById(targetId);
  enterStage(room, targetId, 1);
  return { ok: true, stage, floor: 1 };
}

/** 钻洞：僵尸洞穴三层、站在洞口附近时下尸王殿，落点固定殿中心。 */
function enterHole(room, player) {
  if (room.stageId !== 'jiangshi' || room.floor !== 3 || !room.hole) {
    return { ok: false, error: '这里没有通往尸王殿的洞口' };
  }
  if (dist(player.x, player.y, room.hole.x, room.hole.y) > 120) {
    return { ok: false, error: '先走到洞口边上' };
  }
  enterStage(room, 'shiwang', 1);
  return { ok: true, stage: stageById('shiwang'), floor: 1 };
}

/** 连接通道：蜈蚣洞地牢一层东 ↔ 未知暗殿（随时能走、不用先通关）。 */
function enterPassage(room, player) {
  if (room.stageId === 'wugong') {
    const stage = stageById('wugong');
    if (player.x < stage.w / 2 - 300) return { ok: false, error: '先走到地牢一层东的连接通道（东边）' };
    enterStage(room, 'andian', 1);
    return { ok: true, stage: stageById('andian'), floor: 1 };
  }
  if (room.stageId === 'andian') {
    enterStage(room, 'wugong', 1);
    for (const p of room.players.values()) { p.x = stageById('wugong').w / 2 - 150; p.y = 0; }
    return { ok: true, stage: stageById('wugong'), floor: 1 };
  }
  return { ok: false, error: '这里没有连接通道' };
}

/** 走进传送门：谁先走进，全队一起下潜。 */
function enterPortal(room, player) {
  if (!room.portal) return { ok: false, error: '传送门还没开' };
  if (dist(player.x, player.y, room.portal.x, room.portal.y) > PORTAL_RADIUS) {
    return { ok: false, error: '先走到传送门边上' };
  }
  const stage = stageById(room.stageId);
  if (stage.layers > 1 && room.floor < stage.layers) {
    enterStage(room, room.stageId, room.floor + 1);
    return { ok: true, stage, floor: room.floor };
  }
  const nextId = (stage.to && stage.to[0]) || null;
  if (!nextId) return { ok: false, error: '这里没有下一站' };
  enterStage(room, nextId, 1);
  return { ok: true, stage: stageById(nextId), floor: 1 };
}

// ---------------------------------------------------------------- 战斗结算
function addFloat(room, x, y, text, color) {
  room.floats.push({ x: Math.round(x), y: Math.round(y), text: String(text), color: color || '#fff' });
}
function refreshStats(player) {
  player.stats = calcStats(player.save);
  player.hp = clamp(player.hp, 0, player.stats.maxHp);
  player.mp = clamp(player.mp, 0, player.stats.maxMp);
}

/** 技能基础伤害（面板随机发挥 → 技能倍率/附加；未减防御）。
 *  base 为 null 的新技能（地狱火/大火球等）只用面板 × 倍率。 */
function skillRawDamage(player, skillId) {
  const sk = SKILLS[skillId];
  const lv = (player.save.learned[skillId] || { lv: 1 }).lv;
  const stats = player.stats;
  if (skillId === 'tao_huofu') return soulFireDmg(stats.mainStat);
  const panel = rollPanel(stats);
  let base = 0;
  if (typeof sk.base === 'number' && typeof sk.growth === 'number') {
    base = sk.base * Math.pow(sk.growth, lv - 1);
  }
  let mult = 1;
  if (Array.isArray(sk.mult)) mult = sk.mult[Math.min(lv - 1, sk.mult.length - 1)];
  else if (typeof sk.mult === 'number') mult = sk.mult;
  let add = 0;
  if (Array.isArray(sk.add)) add = sk.add[Math.min(lv - 1, sk.add.length - 1)];
  return (base + panel) * mult + add;
}

/** 玩家对怪物造成一次伤害：闪避判定 → 暴击 → 减防御 → 扣血 → 熟练度。 */
function damageMonster(room, player, monster, rawDmg, skillId, opts = {}) {
  if (!monster || monster.hp <= 0) return 0;
  const stats = player.stats;
  const dodgeBase = monster.boss ? DODGE.boss : DODGE.normal;
  const dodgeCh = Math.max(DODGE_MIN, dodgeBase - stats.acc * DODGE_PER_ACC);
  if (!opts.noDodge && Math.random() < dodgeCh) {
    addFloat(room, monster.x, monster.y - 20, '闪避', '#9aa');
    return 0; // 闪开：不掉血、不计命中与熟练度
  }
  let dmg = rawDmg;
  let critMul = 1;
  const sc = skillId ? OLD_SKILL_CRIT[skillId] : null;
  const critCh = sc ? sc.ch : 0.08 + (stats.crit || 0);
  if (Math.random() < critCh) critMul = sc ? sc.mul : 1.6;
  dmg *= critMul;
  if (monster.markT > 0) dmg *= 1.25; // 心灵启示：标记目标伤害提升
  let def = monster.def || 0;
  if (monster.poisonT > 0) def *= 0.7; // 施毒术：降低防御
  if (opts.pierce) def *= (1 - opts.pierce); // 刺杀剑法破防
  dmg = Math.max(1, Math.round(dmg - def));
  monster.hp -= dmg;
  addFloat(room, monster.x, monster.y - 20, dmg, critMul > 1 ? '#ffd23e' : '#fff');
  if (skillId) addSkillProf(player, skillId, 1);
  if (player && monster.targetId !== player.deviceId) monster.targetId = player.deviceId;
  if (monster.hp <= 0) killMonster(room, monster, player);
  return dmg;
}

function addSkillProf(player, skillId, n) {
  const sk = player.save.learned[skillId];
  if (!sk) return;
  sk.casts = (sk.casts || 0) + n;
  while (sk.casts >= SKILL_PROF_PER_LV && sk.lv < SKILL_MAX_LV) {
    sk.casts -= SKILL_PROF_PER_LV;
    sk.lv += 1;
    player.toasts.push(SKILLS[skillId].name + '升到 ' + sk.lv + ' 级');
    if (skillId === 'mage_shield' || skillId === 'war_basic' || skillId === 'tao_jingshen') refreshStats(player);
  }
  player.meDirty = true;
}

function gainXp(player, amount) {
  amount = Math.round(amount);
  if (amount <= 0) return;
  player.save.xp += amount;
  let need = expNeed(player.save.level);
  while (player.save.xp >= need) {
    player.save.xp -= need;
    player.save.level += 1;
    refreshStats(player);
    player.hp = Math.min(player.stats.maxHp, player.hp + Math.round(player.stats.maxHp * 0.3));
    player.events = player.events || [];
    player.events.push({ t: 'levelup', level: player.save.level });
    player.toasts.push('升级！当前 ' + player.save.level + ' 级');
    need = expNeed(player.save.level);
  }
  player.meDirty = true;
}

/** 击杀结算：经验（击杀者全额、同房队友一半）、金币、掉落、传送门。 */
function killMonster(room, monster, killer) {
  const idx = room.monsters.indexOf(monster);
  if (idx >= 0) room.monsters.splice(idx, 1);
  room.kills += 1;
  const xp = Math.round(monster.xp * MONSTER_XP_MUL);
  if (killer) gainXp(killer, xp);
  for (const p of room.players.values()) {
    if (killer && p.deviceId !== killer.deviceId && !p.dead) gainXp(p, xp / 2);
  }
  // 金币：Boss 直接进击杀者钱包；普通怪掉金币堆在地上
  if (monster.boss) {
    if (killer) {
      const g = (monster.gold || 0) + randInt(0, 8);
      killer.save.gold += g;
      addFloat(room, monster.x, monster.y, '+' + g + '金', '#ffd23e');
      killer.meDirty = true;
    }
  } else {
    const g = Math.round(rand(2, 6) + monster.lv * rand(0.4, 1.1));
    dropToGround(room, { kind: 'gold', name: '金币', amount: g }, monster.x, monster.y, killer);
  }
  rollDrops(room, monster, killer);
  if (monster.isStageBoss) onStageBossKilled(room, monster, killer);
  if (monster.guardian) onHoleGuardianKilled(room, monster, killer);
}

function dropToGround(room, drop, x, y, killer) {
  const d = {
    id: room.dropSeq++, kind: drop.kind, name: drop.name,
    x: Math.round(x + rand(-14, 14)), y: Math.round(y + rand(-14, 14)),
    createdAt: Date.now(),
    lockedBy: killer ? killer.deviceId : null,
    lockedUntil: Date.now() + DROP_LOCK_MS,
  };
  if (drop.kind === 'equip') d.item = drop.item;
  if (drop.kind === 'gold') d.amount = drop.amount;
  if (drop.kind === 'potion') { d.potionKind = drop.potionKind; d.tier = drop.tier; }
  if (drop.kind === 'skillbook') { d.bookId = drop.bookId; d.bookCls = drop.bookCls; d.bookReq = drop.bookReq; }
  room.drops.push(d);
  return d;
}

/** 掉落 roll：装备 / 大爆 / 药水 / 技能书。 */
function rollDrops(room, monster, killer) {
  const isBoss = !!monster.boss;
  const inShiwang = room.stageId === 'shiwang';
  // 装备：Boss 必掉 1 件 + 50% 再掉 1 件；普通 8%
  const equipRolls = isBoss ? (Math.random() < DROP_RULES.equip.chance.bossSecond ? 2 : 1) : (Math.random() < DROP_RULES.equip.chance.normal ? 1 : 0);
  for (let i = 0; i < equipRolls; i++) {
    const tpl = rollEquipDrop(monster.lv, isBoss ? 4 : 2);
    if (!tpl) continue;
    const jp = (isBoss && Math.random() < DROP_RULES.jp.chance.boss) ? rollJpBonus() : 0;
    dropToGround(room, { kind: 'equip', name: tpl.name, item: makeEquipInstance(tpl, jp) }, monster.x, monster.y, killer);
  }
  // 大爆：Boss 3% / 普通 0.3%：6–9 件装备 + 8–12 瓶药水 + 金币直接进钱包
  const jackpotCh = isBoss ? DROP_RULES.jackpot.chance.boss : DROP_RULES.jackpot.chance.normal;
  if (Math.random() < jackpotCh) {
    const nEq = randInt(6, 9);
    for (let i = 0; i < nEq; i++) {
      const tpl = rollEquipDrop(monster.lv, isBoss ? 4 : 2);
      if (!tpl) continue;
      const jp = (isBoss && Math.random() < DROP_RULES.jp.chance.boss) ? rollJpBonus() : 0;
      dropToGround(room, { kind: 'equip', name: tpl.name, item: makeEquipInstance(tpl, jp) }, monster.x, monster.y, killer);
    }
    const nPot = randInt(8, 12);
    for (let i = 0; i < nPot; i++) {
      const kind = Math.random() < 0.5 ? 'hp' : 'mp';
      dropToGround(room, { kind: 'potion', name: kind === 'hp' ? '血瓶' : '魔法瓶', potionKind: kind, tier: rollPotionTier() }, monster.x, monster.y, killer);
    }
    if (killer) {
      const g = randInt(80, 200) + monster.lv * 10;
      killer.save.gold += g;
      killer.toasts.push('大爆！+' + g + ' 金币');
      killer.meDirty = true;
    }
  }
  // 药水：血瓶 5.5% / 魔法瓶 5%（小 15% / 中 70% / 大 15%）
  if (Math.random() < DROP_RULES.potion.hp) {
    dropToGround(room, { kind: 'potion', name: '血瓶', potionKind: 'hp', tier: rollPotionTier() }, monster.x, monster.y, killer);
  }
  if (Math.random() < DROP_RULES.potion.mp) {
    dropToGround(room, { kind: 'potion', name: '魔法瓶', potionKind: 'mp', tier: rollPotionTier() }, monster.x, monster.y, killer);
  }
  // 技能书：全职业书池，本职业已学或已有的不重复掉
  rollSkillBook(room, monster, killer, isBoss, inShiwang);
}

function skillBookPool(killer, filter) {
  const known = new Set([
    ...Object.keys(killer ? killer.save.learned || {} : {}),
    ...(killer ? killer.save.books || [] : []),
  ]);
  return Object.keys(SKILLS).filter((id) => !known.has(id) && (!filter || filter(id)));
}
function dropSkillBook(room, monster, killer, bookId) {
  const sk = SKILLS[bookId];
  dropToGround(room, {
    kind: 'skillbook', name: '技能书·' + sk.name,
    bookId, bookCls: sk.cls, bookReq: sk.req,
  }, monster.x, monster.y, killer);
}
function rollSkillBook(room, monster, killer, isBoss, inShiwang) {
  if (!killer) return;
  if (inShiwang) {
    // 尸王殿：25 级以下（req≤25）38%，25 级以上（req>25）高级书单独 0.3%
    if (Math.random() < 0.38) {
      const pool = skillBookPool(killer, (id) => (SKILL_REQ[id] || 99) <= 25);
      if (pool.length) dropSkillBook(room, monster, killer, pick(pool));
    }
    if (Math.random() < 0.003) {
      const pool = skillBookPool(killer, (id) => (SKILL_REQ[id] || 0) > 25);
      if (pool.length) dropSkillBook(room, monster, killer, pick(pool));
    }
    return;
  }
  const rate = isBoss ? DROP_RULES.skillBook.boss : DROP_RULES.skillBook.normal;
  if (Math.random() >= rate) return;
  const pool = skillBookPool(killer);
  if (pool.length) dropSkillBook(room, monster, killer, pick(pool));
}

/** 层主/Boss 被击败：在 Boss 倒下处开传送门（赤月恶魔除外）。 */
function onStageBossKilled(room, monster, killer) {
  const stage = stageById(room.stageId);
  const isFinalLayer = !stage.layers || stage.layers <= 1 || room.floor >= stage.layers;
  if (room.stageId === 'chiyue') {
    // 赤月峡谷最后一层打完赤月恶魔：不弹结算、不开回城门，留在图里继续打
    for (const p of room.players.values()) p.toasts.push('赤月恶魔已被击败，继续留在图里刷怪吧');
    return;
  }
  room.portal = { open: true, x: Math.round(monster.x), y: Math.round(monster.y) };
  if (isFinalLayer) {
    // 打通本图：僵尸洞穴→点亮沃玛寺庙；沃玛寺庙→点亮蜈蚣洞
    const toLight = [];
    if (room.stageId === 'jiangshi') toLight.push('woma');
    if (room.stageId === 'woma') toLight.push('wugong');
    if (toLight.length) lightBonus(room, toLight);
    for (const p of room.players.values()) {
      if (!p.save.cleared.includes(room.stageId)) p.save.cleared.push(room.stageId);
      p.meDirty = true;
    }
  }
}

/** 点亮传送点（只提示新点亮的部分），写进各角色 bonusLit 并立即存档。 */
function lightBonus(room, stageIds) {
  for (const p of room.players.values()) {
    const newly = stageIds.filter((id) => !(p.save.bonusLit || []).includes(id));
    if (newly.length) {
      p.save.bonusLit.push(...newly);
      const names = newly.map((id) => { const s = stageById(id); return s ? s.name : id; });
      p.toasts.push('传送点已点亮：' + names.join('、'));
      p.meDirty = true;
      savePlayer(p, { force: true });
    }
  }
}

/** 打掉洞口爬出的黄衣僵尸：本房所有人同时点亮蜈蚣洞与沃玛寺庙。 */
function onHoleGuardianKilled(room, monster, killer) {
  if (room.hole) room.hole.zombieState = 'dead';
  lightBonus(room, ['wugong', 'woma']);
}

// ---------------------------------------------------------------- 死亡
function killPlayer(room, player) {
  if (player.dead) return;
  player.dead = true;
  player.respawnAt = Date.now() + RESPAWN_SEC * 1000;
  player.moveX = 0; player.moveY = 0;
  let dropped = false;
  // 死亡 35% 概率掉 1 件已穿装备（掉在地上）
  if (Math.random() < DEATH_DROP_CHANCE) {
    const slots = Object.keys(player.save.worn || {}).filter((s) => player.save.worn[s]);
    if (slots.length) {
      const slot = pick(slots);
      const item = player.save.worn[slot];
      delete player.save.worn[slot];
      refreshStats(player);
      dropToGround(room, { kind: 'equip', name: item.name, item }, player.x, player.y, player);
      dropped = true;
    }
  }
  player.events = player.events || [];
  player.events.push({ t: 'died', dropped });
  player.toasts.push(dropped ? '你死了，掉了一件装备，5 秒后原地复活' : '你死了，5 秒后原地复活');
  player.meDirty = true;
}
function respawnPlayer(player) {
  player.dead = false;
  player.hp = player.stats.maxHp;
  player.mp = player.stats.maxMp;
  player.toasts.push('已原地复活');
  player.meDirty = true;
}

// ---------------------------------------------------------------- 药水
/** 药水库存：数组 [小,中,大] 或数字（旧单档 = 中瓶数）。返回 [小,中,大] 视图。 */
function potionCounts(save, kind) {
  const v = kind === 'hp' ? save.hpPots : save.mpPots;
  if (Array.isArray(v)) return [v[0] || 0, v[1] || 0, v[2] || 0];
  return [0, typeof v === 'number' ? v : 0, 0];
}
function addPotion(save, kind, tier, n) {
  const key = kind === 'hp' ? 'hpPots' : 'mpPots';
  const v = save[key];
  if (Array.isArray(v)) {
    while (v.length < 3) v.push(0);
    v[tier] = (v[tier] || 0) + n;
  } else if (tier === 1) {
    save[key] = (typeof v === 'number' ? v : 0) + n;
  } else {
    // 数字格式买/捡了小瓶或大瓶：转成数组格式再记（格式变化仅在此时发生）
    const cur = typeof v === 'number' ? v : 0;
    save[key] = [0, cur, 0];
    save[key][tier] = (save[key][tier] || 0) + n;
  }
}
function takePotion(save, kind, tier) {
  const key = kind === 'hp' ? 'hpPots' : 'mpPots';
  const v = save[key];
  if (Array.isArray(v)) {
    if ((v[tier] || 0) <= 0) return false;
    v[tier] -= 1;
    return true;
  }
  if (tier !== 1) return false;
  if ((typeof v === 'number' ? v : 0) <= 0) return false;
  save[key] = v - 1;
  return true;
}
/** 喝药：自动选刚好够补满的最小瓶。 */
function drinkPotion(player, kind) {
  const stats = player.stats;
  const cur = kind === 'hp' ? player.hp : player.mp;
  const max = kind === 'hp' ? stats.maxHp : stats.maxMp;
  if (cur >= max) return { ok: false, error: kind === 'hp' ? '血已满' : '蓝已满' };
  const missing = (max - cur) / max;
  const counts = potionCounts(player.save, kind);
  const tiers = POTIONS.tiers;
  let tier = -1;
  for (let i = 0; i < 3; i++) {
    if (counts[i] > 0 && tiers[i][kind === 'hp' ? 'hpPct' : 'mpPct'] >= missing) { tier = i; break; }
  }
  if (tier < 0) {
    for (let i = 2; i >= 0; i--) { if (counts[i] > 0) { tier = i; break; } }
  }
  if (tier < 0 || !takePotion(player.save, kind, tier)) return { ok: false, error: '没有药水了' };
  const pct = tiers[tier][kind === 'hp' ? 'hpPct' : 'mpPct'];
  if (kind === 'hp') player.hp = Math.min(max, player.hp + Math.round(max * pct));
  else player.mp = Math.min(max, player.mp + Math.round(max * pct));
  player.meDirty = true;
  return { ok: true, tier };
}
/** 蓝不够放技能时自动喝一瓶魔法瓶（回 60% 魔法，即中瓶；没有中瓶则用其他档）。 */
function autoDrinkMp(player) {
  const counts = potionCounts(player.save, 'mp');
  const order = counts[1] > 0 ? [1, 2, 0] : counts[2] > 0 ? [2, 0] : [0];
  for (const tier of order) {
    if (counts[tier] <= 0) continue;
    if (!takePotion(player.save, 'mp', tier)) continue;
    player.mp = Math.min(player.stats.maxMp, player.mp + Math.round(player.stats.maxMp * POTIONS.tiers[tier].mpPct));
    player.meDirty = true;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- 技能释放
function nearestMonster(room, x, y, maxDist, opts = {}) {
  let best = null, bestD = Infinity;
  for (const m of room.monsters) {
    if (opts.excludeBoss && m.boss) continue;
    const d = dist(x, y, m.x, m.y);
    if (d <= maxDist && d < bestD) { best = m; bestD = d; }
  }
  return best;
}
function monstersInRadius(room, x, y, r) {
  return room.monsters.filter((m) => dist(x, y, m.x, m.y) <= r);
}
const MANUAL_ONLY_SKILLS = new Set(['mage_kangju', 'mage_shunxi', 'tao_yinshen', 'tao_jiti', 'tao_xinling']);

/** 放技能：先校验目标（无目标不空放、不耗魔、不进冷却），再扣魔、进冷却、结算。 */
function castSkill(room, player, skillId, opts = {}) {
  const sk = SKILLS[skillId];
  if (!sk) return { ok: false, error: '技能不存在' };
  const learned = player.save.learned[skillId];
  if (!learned) return { ok: false, error: '还没学会' + sk.name };
  if (sk.passive) return { ok: false, error: sk.name + '是被动技能' };
  if ((player.cds[skillId] || 0) > 0) return { ok: false, error: sk.name + '冷却中' };
  const lv = learned.lv;
  const range = sk.range || 300;

  // ---- 目标校验（不满足则不耗魔、不进冷却） ----
  let target = null;
  const needsTarget = !['tao_zhiyu', 'tao_qunti', 'tao_kulou', 'tao_shenshou', 'tao_yinshen', 'tao_jiti'].includes(skillId);
  if (needsTarget) {
    const r = skillId === 'mage_firewall' ? 560 : range;
    target = nearestMonster(room, player.x, player.y, r);
    if (!target) {
      if (skillId === 'mage_firewall') return { ok: false, error: '附近没有怪物，火墙不空放' };
      if (['mage_fireball', 'mage_bigfire', 'tao_huofu'].includes(skillId) && !opts.auto) {
        // 手动放弹道技能：没怪就朝面朝方向打
        target = null;
      } else {
        return { ok: false, error: '附近没有怪物' };
      }
    }
  }
  if ((skillId === 'war_banyue') && !monstersInRadius(room, player.x, player.y, sk.radius || 105).length) {
    return { ok: false, error: '周围没有怪物' };
  }
  if (skillId === 'mage_kangju' && !monstersInRadius(room, player.x, player.y, sk.radius || 120).length) {
    return { ok: false, error: '周围没有怪物' };
  }
  if ((skillId === 'tao_zhiyu' || skillId === 'tao_qunti') && opts.auto) {
    const hurt = [player, ...room.players.values()].some((p) => !p.dead && p.hp < p.stats.maxHp * 0.9);
    if (!hurt) return { ok: false, error: '没人需要治疗' };
  }
  if ((skillId === 'tao_kulou' || skillId === 'tao_shenshou')) {
    const max = sk.summonCountByLv[Math.min(lv - 1, sk.summonCountByLv.length - 1)];
    const cur = room.pets.filter((pt) => pt.ownerId === player.deviceId && pt.skillId === skillId).length;
    if (cur >= max) return { ok: false, error: '召唤物已满' };
  }
  if (skillId === 'mage_youhuo') {
    const max = sk.maxCharm[Math.min(lv - 1, sk.maxCharm.length - 1)];
    const cur = room.pets.filter((pt) => pt.ownerId === player.deviceId && pt.kind === 'charm').length;
    if (cur >= max) return { ok: false, error: '诱惑数量已满' };
    if (target && target.boss) return { ok: false, error: 'Boss 不能被诱惑' };
  }

  // ---- 扣魔（不够先自动喝一瓶魔法瓶）与冷却 ----
  const cost = sk.mp || 0;
  if (player.mp < cost) {
    if (!autoDrinkMp(player) || player.mp < cost) return { ok: false, error: '蓝不够' };
  }
  if (cost > 0) player.mp -= cost;
  if (sk.cd) player.cds[skillId] = sk.cd;
  player.meDirty = true;
  if (player.save.worn && player.save.worn.weapon) wearWeaponTick(player);

  // ---- 结算 ----
  const raw = () => skillRawDamage(player, skillId);
  switch (skillId) {
    case 'war_gongsha': {
      damageMonster(room, player, target, raw(), skillId);
      break;
    }
    case 'war_cisha': {
      const pierce = sk.pierce[Math.min(lv - 1, sk.pierce.length - 1)];
      damageMonster(room, player, target, raw(), skillId, { pierce });
      break;
    }
    case 'war_banyue': {
      const side = sk.side[Math.min(lv - 1, sk.side.length - 1)];
      const inRange = monstersInRadius(room, player.x, player.y, sk.radius || 105);
      for (const m of [...inRange]) {
        damageMonster(room, player, m, raw() * (m === target || m === inRange[0] ? 1 : side), skillId);
      }
      break;
    }
    case 'war_yeman': {
      const maxN = sk.maxTargetsByLv[Math.min(lv - 1, sk.maxTargetsByLv.length - 1)];
      const near = room.monsters
        .filter((m) => dist(player.x, player.y, m.x, m.y) <= (sk.range || 150))
        .sort((a, b) => dist(player.x, player.y, a.x, a.y) - dist(player.x, player.y, b.x, b.y))
        .slice(0, maxN);
      for (const m of [...near]) {
        damageMonster(room, player, m, raw(), skillId);
        const dx = m.x - player.x, dy = m.y - player.y, d = Math.hypot(dx, dy) || 1;
        m.x += (dx / d) * 120; m.y += (dy / d) * 120;
      }
      break;
    }
    case 'war_liehuo': {
      damageMonster(room, player, target, raw(), skillId);
      break;
    }
    case 'mage_fireball':
    case 'mage_bigfire':
    case 'tao_huofu': {
      const dx = target ? target.x - player.x : (player.faceX || 1);
      const dy = target ? target.y - player.y : (player.faceY || 0);
      const d = Math.hypot(dx, dy) || 1;
      room.projectiles.push({
        kind: skillId === 'tao_huofu' ? 'huofu' : skillId === 'mage_bigfire' ? 'bigfire' : 'fireball',
        skillId, ownerId: player.deviceId,
        x: player.x, y: player.y, dx: dx / d, dy: dy / d,
        speed: 520, rangeLeft: sk.range || 330, dmg: raw(),
      });
      break;
    }
    case 'mage_kangju': {
      for (const m of [...monstersInRadius(room, player.x, player.y, sk.radius || 120)]) {
        damageMonster(room, player, m, raw(), skillId);
        const dx = m.x - player.x, dy = m.y - player.y, dd = Math.hypot(dx, dy) || 1;
        m.x += (dx / dd) * 120; m.y += (dy / dd) * 120;
      }
      break;
    }
    case 'mage_youhuo': {
      if (target) {
        const idx = room.monsters.indexOf(target);
        if (idx >= 0) room.monsters.splice(idx, 1);
        room.pets.push({
          id: room.petSeq++, ownerId: player.deviceId, skillId, kind: 'charm',
          name: target.name, x: target.x, y: target.y,
          hp: target.hp, maxHp: target.maxHp, atk: target.atk,
          spd: target.spd || MONSTER_DEFAULT_SPD, biteCd: 0,
        });
        addSkillProf(player, skillId, 1);
        player.toasts.push('诱惑了' + target.name);
      }
      break;
    }
    case 'mage_diyuhuo': {
      for (const m of [...monstersInRadius(room, target.x, target.y, sk.radius || 70)]) {
        damageMonster(room, player, m, raw(), skillId);
      }
      break;
    }
    case 'mage_leidian':
    case 'mage_shengyan': {
      let dmg = raw();
      if (skillId === 'mage_shengyan' && /僵尸|骷髅|尸王/.test(target.name)) dmg *= sk.undeadMul || 1.6;
      damageMonster(room, player, target, dmg, skillId);
      break;
    }
    case 'mage_shunxi': {
      if (target) {
        const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy) || 1;
        player.x = target.x - (dx / d) * 60;
        player.y = target.y - (dy / d) * 60;
      }
      break;
    }
    case 'mage_baolie': {
      for (const m of [...monstersInRadius(room, target.x, target.y, sk.radius || 95)]) {
        damageMonster(room, player, m, raw(), skillId);
      }
      break;
    }
    case 'mage_firewall': {
      room.walls.push({
        x: Math.round(target.x), y: Math.round(target.y), r: sk.radius || 59.4,
        until: Date.now() + (sk.durationSec || 8) * 1000,
        nextTick: Date.now(), tickSec: sk.tickSec || 0.5,
        tickMul: sk.tickMul || 0.5, ownerId: player.deviceId, skillId,
      });
      break;
    }
    case 'mage_jiguang': {
      const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy) || 1;
      const cx = player.x + (dx / d) * 150, cy = player.y + (dy / d) * 150;
      for (const m of [...monstersInRadius(room, cx, cy, sk.radius || 60)]) {
        damageMonster(room, player, m, raw(), skillId);
      }
      break;
    }
    case 'mage_leiguang': {
      for (const m of [...monstersInRadius(room, player.x, player.y, sk.radius || 150)]) {
        damageMonster(room, player, m, raw(), skillId);
      }
      break;
    }
    case 'mage_bingpao': {
      for (const m of [...monstersInRadius(room, target.x, target.y, sk.radius || 59.4)]) {
        damageMonster(room, player, m, raw(), skillId);
        m.slowT = sk.slowSec || 1.2;
      }
      room.projectiles.push({
        kind: 'tornado', skillId, ownerId: player.deviceId,
        x: player.x, y: player.y, until: Date.now() + 1600,
      });
      break;
    }
    case 'tao_zhiyu': {
      const heal = (sk.healFormula.base || 30)
        + (sk.healFormula.perCharLv || 0) * player.save.level
        + (sk.healFormula.perSkillLv || 0) * lv;
      healPlayers(room, player, heal, 105);
      addSkillProf(player, skillId, 1);
      break;
    }
    case 'tao_qunti': {
      for (const p of room.players.values()) {
        if (p.dead) continue;
        if (p === player || dist(player.x, player.y, p.x, p.y) <= 200) {
          const amount = Math.round(p.stats.maxHp * (sk.bigHealPct || 0.45));
          p.hp = Math.min(p.stats.maxHp, p.hp + amount);
          addFloat(room, p.x, p.y - 20, '+' + amount, '#7ee787');
          p.meDirty = true;
        }
      }
      addSkillProf(player, skillId, 1);
      break;
    }
    case 'tao_shidu': {
      if (target) {
        target.poisonT = sk.poisonSec || 6;
        target.poisonTick = 0;
        target.poisonDmg = (typeof sk.base === 'number' ? sk.base * Math.pow(sk.growth || 1.35, lv - 1) : 0) + rollPanel(player.stats);
        target.poisonOwner = player;
      }
      break;
    }
    case 'tao_kulou':
    case 'tao_shenshou': {
      const max = sk.summonCountByLv[Math.min(lv - 1, sk.summonCountByLv.length - 1)];
      const cur = room.pets.filter((pt) => pt.ownerId === player.deviceId && pt.skillId === skillId).length;
      const hp = sk.summonHp.base + sk.summonHp.perLv * lv;
      const atk = sk.summonAtk.base + sk.summonAtk.perLv * lv;
      for (let i = cur; i < max; i++) {
        room.pets.push({
          id: room.petSeq++, ownerId: player.deviceId, skillId, kind: 'summon',
          name: sk.summon, x: player.x + rand(-40, 40), y: player.y + rand(-40, 40),
          hp, maxHp: hp, atk, spd: 265, biteCd: 0,
        });
      }
      break;
    }
    case 'tao_yinshen': {
      player.invisT = sk.invisSec || 8;
      break;
    }
    case 'tao_jiti': {
      player.invisT = sk.invisSec || 12;
      for (const p of room.players.values()) {
        if (p !== player && dist(player.x, player.y, p.x, p.y) <= 200) p.invisT = sk.invisSec || 12;
      }
      break;
    }
    case 'tao_xinling': {
      if (target) target.markT = sk.markSec || 6;
      break;
    }
    case 'tao_kunmo': {
      for (const m of [...monstersInRadius(room, target.x, target.y, sk.radius || 110)]) {
        damageMonster(room, player, m, raw(), skillId);
        m.stunT = sk.stunSec || 3;
      }
      break;
    }
    default:
      return { ok: false, error: '技能未实现：' + skillId };
  }
  return { ok: true };
}

function healPlayers(room, player, amount, radius) {
  for (const p of room.players.values()) {
    if (p.dead) continue;
    if (p === player || dist(player.x, player.y, p.x, p.y) <= radius) {
      p.hp = Math.min(p.stats.maxHp, p.hp + amount);
      addFloat(room, p.x, p.y - 20, '+' + amount, '#7ee787');
      p.meDirty = true;
    }
  }
}

/** 普攻：战士/道士为基本剑术/精神力战法单体劈砍（0.9 秒一刀，不耗魔）；
 *  法师为弱化火球弹道（不耗魔、不练熟练度）。 */
function basicAttack(room, player) {
  if (player.basicCd > 0 || player.dead) return;
  const cls = player.save.classId;
  if (cls === 'mage') {
    const target = nearestMonster(room, player.x, player.y, MAGE_BASIC_RANGE);
    if (!target) return;
    const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy) || 1;
    room.projectiles.push({
      kind: 'basic', skillId: null, ownerId: player.deviceId,
      x: player.x, y: player.y, dx: dx / d, dy: dy / d,
      speed: 520, rangeLeft: MAGE_BASIC_RANGE, dmg: rollPanel(player.stats),
    });
    player.basicCd = BASIC_ATK_INTERVAL;
    return;
  }
  const basicId = cls === 'war' ? 'war_basic' : 'tao_jingshen';
  if (!player.save.learned[basicId]) return;
  const target = nearestMonster(room, player.x, player.y, BASIC_RANGE);
  if (!target) return;
  damageMonster(room, player, target, skillRawDamage(player, basicId), basicId);
  if (player.save.worn && player.save.worn.weapon) wearWeaponTick(player);
  player.basicCd = BASIC_ATK_INTERVAL;
}

// ---------------------------------------------------------------- 耐久磨损
// 来源：单机版源码 sp-internals §7.5（服务器版维修存在即默认磨损存在）。
// 武器每释放 10 次磨 1 点；被怪打中衣服优先磨 1 点、无衣服磨头盔；
// 每击杀 20 只怪，项链/手镯/戒指/鞋靴随机一件磨 1 点。磨光装备消失。
function wearItem(player, slot) {
  const it = player.save.worn && player.save.worn[slot];
  if (!it) return;
  it.dur = (it.dur === undefined ? DUR_MAX : it.dur) - 1;
  if (it.dur <= 0) {
    delete player.save.worn[slot];
    refreshStats(player);
    player.toasts.push(it.name + '耐久耗尽损坏了');
  }
  player.meDirty = true;
}
function wearWeaponTick(player) {
  player.weaponHits = (player.weaponHits || 0) + 1;
  if (player.weaponHits % 10 === 0) wearItem(player, 'weapon');
}
function wearDefenseOnHit(player) {
  if (player.save.worn && player.save.worn.armor) wearItem(player, 'armor');
  else wearItem(player, 'helmet');
}
function wearAccessoryOnKill(player) {
  player.killCount = (player.killCount || 0) + 1;
  if (player.killCount % 20 !== 0) return;
  const slots = ['necklace', 'braceL', 'braceR', 'ringL', 'ringR', 'boots']
    .filter((s) => player.save.worn && player.save.worn[s]);
  if (slots.length) wearItem(player, pick(slots));
}

// ---------------------------------------------------------------- 拾取与穿戴
function equipSlotsFor(slot) {
  if (slot === 'bracelet') return ['braceL', 'braceR'];
  if (slot === 'ring') return ['ringL', 'ringR'];
  return [slot];
}
/** 穿装备：有空位直接穿上；两位都满才替换较弱一件（被换下的回背包）。
 *  返回 'equipped'（已穿上）/ 'bag'（放背包）/ 'full'（背包满、换不下来）。 */
function equipItem(player, item) {
  const save = player.save;
  if (item.cls === save.classId) {
    const chk = canWear(save, player.stats, item);
    if (chk.ok) {
      const slots = equipSlotsFor(item.slot);
      const free = slots.find((s) => !save.worn[s]);
      if (free) {
        save.worn[free] = item;
        refreshStats(player);
        player.meDirty = true;
        return 'equipped';
      }
      const wornItems = slots.map((s) => ({ slot: s, it: save.worn[s] }));
      const weakest = wornItems.reduce((a, b) =>
        (equipScore(a.it, save.classId) <= equipScore(b.it, save.classId) ? a : b));
      if (equipScore(item, save.classId) > equipScore(weakest.it, save.classId)) {
        if (save.bag.length >= BAG_CAP) return 'full';
        save.bag.push(weakest.it);
        save.worn[weakest.slot] = item;
        refreshStats(player);
        player.meDirty = true;
        return 'equipped';
      }
    }
  }
  return 'bag';
}
function tryAutoEquip(player, item) {
  const r = equipItem(player, item);
  if (r === 'bag') {
    if (player.save.bag.length >= BAG_CAP) return 'full';
    player.save.bag.push(item);
    player.meDirty = true;
    return 'bag';
  }
  return r;
}

function pickupDrop(room, player, drop) {
  if (drop.lockedBy && drop.lockedBy !== player.deviceId && Date.now() < drop.lockedUntil) {
    return { ok: false, error: '这是别人的掉落（归属保护中）' };
  }
  const idx = room.drops.indexOf(drop);
  const save = player.save;
  if (drop.kind === 'gold') {
    save.gold += drop.amount;
    addFloat(room, player.x, player.y - 20, '+' + drop.amount + '金', '#ffd23e');
  } else if (drop.kind === 'potion') {
    addPotion(save, drop.potionKind, drop.tier, 1);
    player.toasts.push('拾取' + drop.name + '×1');
  } else if (drop.kind === 'equip') {
    const r = tryAutoEquip(player, drop.item);
    if (r === 'full') return { ok: false, error: '背包满了' };
    if (r === 'equipped') player.toasts.push('穿上了' + drop.item.name);
  } else if (drop.kind === 'skillbook') {
    const bookId = normSkillId(drop.bookId);
    if (save.learned[bookId] || save.books.includes(bookId)) {
      save.gold += 30; // 已学/已有的技能书再拾取到，换金币 +30
      player.toasts.push('重复技能书换金币 +30');
    } else {
      save.books.push(bookId);
      player.toasts.push('拾取技能书：' + SKILLS[bookId].name);
    }
  }
  if (idx >= 0) room.drops.splice(idx, 1);
  player.meDirty = true;
  return { ok: true };
}

// ---------------------------------------------------------------- 商店与修理
function shopStock(cls) {
  const items = [];
  const seen = new Set();
  const add = (it) => {
    if (!it || seen.has(it.id)) return;
    seen.add(it.id);
    items.push({
      idx: items.length, id: it.id, name: it.name, icon: it.icon, slot: it.slot,
      tier: it.tier, reqLv: it.reqLv, price: shopBuyPrice(it),
      stats: { atk: it.atk, mag: it.mag, dao: it.dao, def: it.def, mdef: it.mdef, acc: it.acc, hp: it.hp, spd: it.spd },
    });
  };
  for (const slot of ['weapon', 'armor', 'helmet', 'necklace', 'bracelet', 'ring', 'boots']) {
    add(EQUIPS.find((e) => e.cls === cls && e.slot === slot && (e.tier || 0) <= 1));
  }
  // 武器再补 2 件
  const weapons = EQUIPS.filter((e) => e.cls === cls && e.slot === 'weapon' && (e.tier || 0) <= 1);
  for (const w of weapons.slice(0, 3)) add(w);
  return {
    items,
    potions: POTIONS.tiers.map((t, i) => ({ tier: ['s', 'm', 'l'][i], name: t.name, price: t.price })),
  };
}
function buyShopItem(player, equipId) {
  const stock = shopStock(player.save.classId);
  const entry = stock.items.find((i) => i.id === equipId);
  if (!entry) return { ok: false, error: '商店没有这件装备' };
  if (player.save.gold < entry.price) return { ok: false, error: '金币不够' };
  const tpl = equipById(equipId);
  const inst = makeEquipInstance(tpl); // 商店装备无极品，满耐久
  player.save.gold -= entry.price;
  const r = equipItem(player, inst);
  if (r === 'bag') {
    if (player.save.bag.length >= BAG_CAP) {
      player.save.gold += entry.price; // 背包满了，退款
      return { ok: false, error: '背包满了' };
    }
    player.save.bag.push(inst);
  } else if (r === 'full') {
    player.save.gold += entry.price;
    return { ok: false, error: '背包满了，换不下来' };
  }
  player.meDirty = true;
  player.toasts.push('购买' + inst.name + '（-' + entry.price + ' 金币）');
  return { ok: true };
}
function sellBagItem(player, uid) {
  const save = player.save;
  let idx = save.bag.findIndex((it) => it && String(it.uid) === String(uid));
  let from = 'bag';
  if (idx < 0) {
    idx = save.trade.findIndex((it) => it && String(it.uid) === String(uid));
    from = 'trade';
  }
  if (idx < 0) return { ok: false, error: '背包里没有这件装备' };
  const item = (from === 'bag' ? save.bag : save.trade).splice(idx, 1)[0];
  const price = tradePrice(item);
  save.gold += price;
  player.meDirty = true;
  player.toasts.push('出售' + item.name + '（+' + price + ' 金币）');
  return { ok: true };
}
/** 维修：缺失耐久 × 2 × (1 + tier) 金币/件（旧版公式；见 protocol.md 待确认）。 */
function repairCost(it) {
  const max = it.maxDur || DUR_MAX;
  return Math.max(0, (max - (it.dur || 0)) * 2 * (1 + (it.tier || 0)));
}
function repairWorn(player, uid) {
  const it = Object.values(player.save.worn || {}).find((x) => x && String(x.uid) === String(uid));
  if (!it) return { ok: false, error: '没穿着这件装备' };
  const cost = repairCost(it);
  if (cost <= 0) return { ok: false, error: '耐久已满' };
  if (player.save.gold < cost) return { ok: false, error: '金币不够' };
  player.save.gold -= cost;
  it.dur = it.maxDur || DUR_MAX;
  player.meDirty = true;
  player.toasts.push('修理' + it.name + '（-' + cost + ' 金币）');
  return { ok: true };
}
function repairAllWorn(player) {
  const items = Object.values(player.save.worn || {}).filter(Boolean);
  const cost = items.reduce((s, it) => s + repairCost(it), 0);
  if (cost <= 0) return { ok: false, error: '装备耐久都满着' };
  if (player.save.gold < cost) return { ok: false, error: '金币不够' };
  player.save.gold -= cost;
  for (const it of items) it.dur = it.maxDur || DUR_MAX;
  player.meDirty = true;
  player.toasts.push('修理全部已穿装备（-' + cost + ' 金币）');
  return { ok: true };
}
function buyPotion(player, kind, tierStr) {
  const tier = { s: 0, m: 1, l: 2 }[tierStr];
  if (tier === undefined || (kind !== 'hp' && kind !== 'mp')) {
    return { ok: false, error: '药水种类不对' };
  }
  const price = POTIONS.tiers[tier].price;
  if (player.save.gold < price) return { ok: false, error: '金币不够' };
  player.save.gold -= price;
  addPotion(player.save, kind, tier, 1);
  player.meDirty = true;
  player.toasts.push('购买' + POTIONS.tiers[tier].name + (kind === 'hp' ? '血瓶' : '魔法瓶') + '（-' + price + ' 金币）');
  return { ok: true };
}

/** 背包中使用技能书习得（等级够了才能学）。 */
function useBook(player, bookId) {
  const id = normSkillId(bookId);
  const sk = SKILLS[id];
  if (!sk) return { ok: false, error: '这不是技能书' };
  const books = player.save.books || [];
  const idx = books.indexOf(id);
  if (idx < 0) return { ok: false, error: '背包里没有这本技能书' };
  if (player.save.learned[id]) return { ok: false, error: '已经学会' + sk.name };
  if ((player.save.level || 1) < (SKILL_REQ[id] || sk.req || 1)) {
    return { ok: false, error: '等级不够（' + sk.name + '需 ' + (SKILL_REQ[id] || sk.req) + ' 级）' };
  }
  books.splice(idx, 1);
  player.save.learned[id] = { lv: 1, casts: 0 };
  if (!sk.passive && player.save.active.length < MAX_ACTIVE_SKILLS && id !== 'mage_shield') {
    player.save.active.push(id);
  }
  refreshStats(player);
  player.meDirty = true;
  player.toasts.push('学会了' + sk.name);
  return { ok: true };
}
function equipFromBag(player, uid) {
  const save = player.save;
  const idx = save.bag.findIndex((it) => it && String(it.uid) === String(uid));
  if (idx < 0) return { ok: false, error: '背包里没有这件装备' };
  const item = save.bag[idx];
  const chk = canWear(save, player.stats, item);
  if (!chk.ok) return { ok: false, error: chk.error };
  save.bag.splice(idx, 1);
  const r = equipItem(player, item);
  if (r === 'bag') save.bag.push(item);
  else if (r === 'full') {
    save.bag.push(item);
    return { ok: false, error: '背包满了，换不下来' };
  }
  player.meDirty = true;
  return { ok: true };
}
function unequipSlot(player, slot) {
  const save = player.save;
  const it = save.worn && save.worn[slot];
  if (!it) return { ok: false, error: '这个部位没穿装备' };
  if (save.bag.length >= BAG_CAP) return { ok: false, error: '背包满了' };
  delete save.worn[slot];
  save.bag.push(it);
  refreshStats(player);
  player.meDirty = true;
  return { ok: true };
}

// ---------------------------------------------------------------- 自动战斗
function autoCastSkills(room, player) {
  if (!player.save.skillsOn) return;
  const ids = new Set([...(player.save.active || [])]);
  for (const id of Object.keys(Data.TOGGLE_SKILLS || {})) {
    if (player.save.learned[id]) ids.add(id);
  }
  for (const id of ids) {
    if (MANUAL_ONLY_SKILLS.has(id)) continue;
    if ((player.cds[id] || 0) > 0) continue;
    castSkill(room, player, id, { auto: true });
  }
}
function autoCombat(room, player) {
  if (player.hp < player.stats.maxHp * 0.35) drinkPotion(player, 'hp');
  const target = nearestMonster(room, player.x, player.y, 600);
  if (!target) { player.moveX = 0; player.moveY = 0; return; }
  const d = dist(player.x, player.y, target.x, target.y);
  const cls = player.save.classId;
  let mx = 0, my = 0;
  if (cls === 'war') {
    if (d > 40) { mx = (target.x - player.x) / d; my = (target.y - player.y) / d; }
  } else {
    // 法师、道士风筝：贴身 100 内拉开距离，远了再靠近
    if (d < 100) { mx = (player.x - target.x) / d; my = (player.y - target.y) / d; }
    else if (d > 260) { mx = (target.x - player.x) / d; my = (target.y - player.y) / d; }
  }
  player.moveX = mx; player.moveY = my;
  if (mx || my) { player.faceX = mx; player.faceY = my; }
  basicAttack(room, player);
  for (const drop of [...room.drops]) {
    if (dist(player.x, player.y, drop.x, drop.y) <= PICKUP_RADIUS) pickupDrop(room, player, drop);
  }
}

// ---------------------------------------------------------------- 主循环
function monsterHitPlayer(room, m, p) {
  let dmg = m.atk * rand(0.85, 1.15) * MONSTER_DMG_TO_PLAYER_MUL;
  dmg *= (1 - (p.stats.shieldPct || 0)); // 魔法盾先抵挡百分比
  dmg -= p.stats.def; // 再减防御
  dmg = Math.max(1, Math.round(dmg));
  p.hp -= dmg;
  addFloat(room, p.x, p.y - 20, '-' + dmg, '#ff6b6b');
  wearDefenseOnHit(p);
  p.meDirty = true;
  if (p.hp <= 0) {
    p.hp = 0;
    killPlayer(room, p);
  }
}

function tickRoom(room) {
  const dt = TICK_MS / 1000;
  const now = Date.now();
  room.tick += 1;
  const stage = stageById(room.stageId);

  // ---- 玩家 ----
  for (const p of [...room.players.values()]) {
    for (const k of Object.keys(p.cds)) {
      p.cds[k] -= dt;
      if (p.cds[k] <= 0) delete p.cds[k];
    }
    if (p.basicCd > 0) p.basicCd -= dt;
    if (p.invisT > 0) p.invisT -= dt;
    if (p.dead) {
      if (now >= p.respawnAt) respawnPlayer(p);
      continue;
    }
    if (p.auto) autoCombat(room, p);
    else autoCastSkills(room, p);
    if (p.moveX || p.moveY) {
      const len = Math.hypot(p.moveX, p.moveY) || 1;
      const nx = p.x + (p.moveX / len) * PLAYER_SPEED * dt;
      const ny = p.y + (p.moveY / len) * PLAYER_SPEED * dt;
      p.faceX = p.moveX / len; p.faceY = p.moveY / len;
      p.x = clamp(nx, -stage.w / 2 + 20, stage.w / 2 - 20);
      p.y = clamp(ny, -stage.h / 2 + 20, stage.h / 2 - 20);
    }
    if (now - p.lastSaveAt > AUTOSAVE_SEC * 1000) savePlayer(p);
  }

  // ---- 弹道 ----
  for (const pr of [...room.projectiles]) {
    if (pr.kind === 'tornado') {
      if (now > pr.until) room.projectiles.splice(room.projectiles.indexOf(pr), 1);
      continue;
    }
    const step = pr.speed * dt;
    pr.x += pr.dx * step;
    pr.y += pr.dy * step;
    pr.rangeLeft -= step;
    let dead = pr.rangeLeft <= 0
      || Math.abs(pr.x) > stage.w / 2 || Math.abs(pr.y) > stage.h / 2;
    if (!dead) {
      const owner = room.players.get(pr.ownerId);
      for (const m of [...room.monsters]) {
        if (dist(pr.x, pr.y, m.x, m.y) <= 34) {
          if (owner) damageMonster(room, owner, m, pr.dmg, pr.skillId);
          dead = true;
          break;
        }
      }
    }
    if (dead) room.projectiles.splice(room.projectiles.indexOf(pr), 1);
  }

  // ---- 火墙 ----
  for (const w of [...room.walls]) {
    if (now > w.until) { room.walls.splice(room.walls.indexOf(w), 1); continue; }
    if (now >= w.nextTick) {
      w.nextTick += (w.tickSec * 1000);
      const owner = room.players.get(w.ownerId);
      if (owner) {
        for (const m of [...monstersInRadius(room, w.x, w.y, w.r)]) {
          damageMonster(room, owner, m, skillRawDamage(owner, w.skillId) * w.tickMul, w.skillId);
        }
      }
    }
  }

  // ---- 召唤物 / 诱惑怪 ----
  for (const pet of [...room.pets]) {
    const owner = room.players.get(pet.ownerId);
    if (!owner) { room.pets.splice(room.pets.indexOf(pet), 1); continue; }
    if (pet.biteCd > 0) pet.biteCd -= dt;
    const target = nearestMonster(room, pet.x, pet.y, 300);
    if (target) {
      const d = dist(pet.x, pet.y, target.x, target.y);
      if (d <= 40) {
        if (pet.biteCd <= 0) {
          pet.biteCd = 1.1;
          target.hp -= pet.atk;
          addFloat(room, target.x, target.y - 20, pet.atk, '#fff');
          if (pet.skillId) addSkillProf(owner, pet.skillId, 1);
          if (target.hp <= 0) killMonster(room, target, owner);
        }
      } else {
        pet.x += ((target.x - pet.x) / d) * pet.spd * dt;
        pet.y += ((target.y - pet.y) / d) * pet.spd * dt;
      }
    } else if (dist(pet.x, pet.y, owner.x, owner.y) > 100) {
      const d = dist(pet.x, pet.y, owner.x, owner.y) || 1;
      pet.x += ((owner.x - pet.x) / d) * pet.spd * dt;
      pet.y += ((owner.y - pet.y) / d) * pet.spd * dt;
    }
  }

  // ---- 怪物 AI ----
  for (const m of [...room.monsters]) {
    if (m.stunT > 0) { m.stunT -= dt; continue; }
    if (m.slowT > 0) m.slowT -= dt;
    if (m.markT > 0) m.markT -= dt;
    if (m.touchCd > 0) m.touchCd -= dt;
    if (m.poisonT > 0) {
      m.poisonT -= dt;
      m.poisonTick += dt;
      if (m.poisonTick >= 1) {
        m.poisonTick -= 1;
        m.hp -= m.poisonDmg;
        addFloat(room, m.x, m.y - 20, m.poisonDmg, '#7ee787');
        if (m.poisonOwner) addSkillProf(m.poisonOwner, 'tao_shidu', 1);
        if (m.hp <= 0) { killMonster(room, m, m.poisonOwner || null); continue; }
      }
    }
    // 索敌：贴身 120 内，或先挨打
    let target = null;
    if (m.targetId) {
      const tp = room.players.get(m.targetId);
      if (tp && !tp.dead && tp.invisT <= 0) target = tp;
      else m.targetId = null;
    }
    if (!target) {
      let bestD = 120;
      for (const p of room.players.values()) {
        if (p.dead || p.invisT > 0) continue;
        const d = dist(m.x, m.y, p.x, p.y);
        if (d < bestD) { bestD = d; target = p; }
      }
      if (target) m.targetId = target.deviceId;
    }
    const spd = m.spd * (m.slowT > 0 ? 0.45 : 1);
    if (target) {
      const d = dist(m.x, m.y, target.x, target.y);
      const nestD = dist(m.x, m.y, m.nestX, m.nestY);
      if (m.boss && nestD > 600) {
        // Boss 追出巢穴 600 就回头
        const nd = nestD || 1;
        m.x += ((m.nestX - m.x) / nd) * spd * dt;
        m.y += ((m.nestY - m.y) / nd) * spd * dt;
      } else if (d > 44) {
        let nx = m.x + ((target.x - m.x) / d) * spd * dt;
        let ny = m.y + ((target.y - m.y) / d) * spd * dt;
        if (stage.safeZone && Math.hypot(nx, ny) < SAFE_ZONE_RADIUS) {
          // 白日门：怪物进不了城
        } else { m.x = nx; m.y = ny; }
      } else if (m.touchCd <= 0) {
        m.touchCd = 0.95;
        monsterHitPlayer(room, m, target);
      }
    } else {
      // 被动游荡（只在刷新点附近）
      if (now > (m.wanderT || 0)) {
        m.wanderT = now + rand(2000, 4000);
        const r = m.boss ? 150 : 120;
        m.wx = m.nestX + rand(-r, r);
        m.wy = m.nestY + rand(-r, r);
      }
      const d = dist(m.x, m.y, m.wx, m.wy);
      if (d > 10) {
        m.x += ((m.wx - m.x) / d) * spd * 0.4 * dt;
        m.y += ((m.wy - m.y) / d) * spd * 0.4 * dt;
      }
    }
  }

  // ---- 洞口黄衣僵尸 ----
  if (room.hole) {
    const hole = room.hole;
    if (hole.zombieState === 'in') {
      for (const p of room.players.values()) {
        if (!p.dead && dist(p.x, p.y, hole.x, hole.y) <= HOLE_TRIGGER_DIST) {
          hole.zombieState = 'crawling';
          hole.climbT = HOLE_CLIMB_SEC;
          break;
        }
      }
    } else if (hole.zombieState === 'crawling') {
      hole.climbT -= dt;
      if (hole.climbT <= 0) {
        const base = monsterById('huangyi') || { lv: 20, hp: 430, xp: 350, atk: 33, def: 11, spd: null };
        const g = {
          id: room.monsterSeq++, key: 'huangyi', name: '黄衣僵尸',
          lv: base.lv, x: hole.x + 30, y: hole.y,
          hp: base.hp, maxHp: base.hp, atk: base.atk,
          def: base.def !== undefined ? base.def : 11, spd: base.spd || MONSTER_DEFAULT_SPD,
          xp: base.xp, boss: false, isStageBoss: false, guardian: true,
          nestX: hole.x, nestY: hole.y,
          state: 'chase', targetId: null, touchCd: 0,
          slowT: 0, stunT: 0, poisonT: 0, poisonTick: 0, poisonDmg: 0,
          markT: 0, wanderT: 0, wx: hole.x, wy: hole.y,
        };
        room.monsters.push(g);
        hole.zombieState = 'out';
        hole.guardianId = g.id;
      }
    }
  }

  // ---- 尸王殿每小时整波补满 ----
  if (room.stageId === 'shiwang' && now - room.waveAt >= 3600 * 1000) {
    spawnShiwangWave(room, stage);
    for (const p of room.players.values()) p.toasts.push('尸王殿又刷满了');
  }

  // ---- 地上掉落 45 秒消失 ----
  if (room.drops.length) {
    room.drops = room.drops.filter((d) => now - d.createdAt < DROP_LINGER_MS);
  }

  // ---- 走进传送门全队一起下潜 ----
  if (room.portal) {
    for (const p of [...room.players.values()]) {
      if (!p.dead && dist(p.x, p.y, room.portal.x, room.portal.y) <= PORTAL_RADIUS) {
        const r = enterPortal(room, p);
        if (r.ok) {
          for (const q of room.players.values()) {
            q.events = q.events || [];
            q.events.push({ t: 'floor', stage: r.stage.id, floor: r.floor });
          }
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- 存档写回
function savePlayer(player, opts = {}) {
  const room = roomOf(player);
  player.save.run = {
    stageId: room ? room.stageId : (player.save.run && player.save.run.stageId) || 'city',
    layer: room ? room.floor - 1 : 0,
    kills: room ? room.kills : 0,
    hp: Math.max(0, Math.ceil(player.hp)),
    mp: Math.max(0, Math.ceil(player.mp)),
  };
  player.save.savedAt = Date.now();
  store.saveCharacter(player.deviceId, player.slot, player.save);
  player.lastSaveAt = Date.now();
  try { backup.writeBackup(store, { force: !!opts.force }); } catch (_) { /* 备份失败不影响存档 */ }
}

// ---------------------------------------------------------------- 快照与个人状态
function snapshotFor(room) {
  const stage = stageById(room.stageId);
  const now = Date.now();
  const players = [...room.players.values()].map((p) => ({
    id: p.deviceId, name: p.save.name, cls: p.save.classId, level: p.save.level,
    x: Math.round(p.x), y: Math.round(p.y),
    hp: Math.ceil(p.hp), maxHp: p.stats.maxHp,
    mp: Math.ceil(p.mp), maxMp: p.stats.maxMp, dead: p.dead,
  }));
  const monsters = room.monsters.map((m) => ({
    id: m.id, key: m.key, name: m.name,
    x: Math.round(m.x), y: Math.round(m.y),
    hp: Math.max(0, Math.ceil(m.hp)), maxHp: m.maxHp, boss: !!m.boss,
  }));
  const drops = room.drops.map((d) => ({
    id: d.id, kind: d.kind, name: d.name,
    x: d.x, y: d.y,
    locked: !!(d.lockedBy && now < d.lockedUntil),
  }));
  const bonusLit = [...new Set(room.players.size
    ? [...room.players.values()].flatMap((p) => p.save.bonusLit || [])
    : [])];
  const snap = {
    t: 'snapshot', tick: room.tick,
    stage: room.stageId, floor: room.floor,
    stageName: stage.name, floorName: stageFloorName(stage, room.floor),
    players, monsters, drops,
    portal: room.portal ? { open: true, x: room.portal.x, y: room.portal.y } : null,
    hole: room.hole ? { x: Math.round(room.hole.x), y: Math.round(room.hole.y), zombieState: room.hole.zombieState } : null,
    walls: room.walls.map((w) => ({ x: w.x, y: w.y, r: w.r })),
    projectiles: room.projectiles.map((pr) => ({ x: Math.round(pr.x), y: Math.round(pr.y), kind: pr.kind })),
    floats: room.floats,
    bonusLit,
    pets: room.pets.map((pt) => ({
      id: pt.id, owner: pt.ownerId, name: pt.name,
      x: Math.round(pt.x), y: Math.round(pt.y),
      hp: Math.ceil(pt.hp), maxHp: pt.maxHp,
    })),
  };
  room.floats = [];
  return snap;
}

function meFor(player, room) {
  const save = player.save;
  const cds = {};
  for (const [k, v] of Object.entries(player.cds)) cds[k] = Math.round(v * 10) / 10;
  return {
    t: 'me', slot: player.slot, name: save.name, cls: save.classId,
    level: save.level, xp: save.xp, xpNext: expNeed(save.level), gold: save.gold,
    hp: Math.ceil(player.hp), maxHp: player.stats.maxHp,
    mp: Math.ceil(player.mp), maxMp: player.stats.maxMp,
    atkLo: Math.round(player.stats.atkLo * 10) / 10,
    atkHi: Math.round(player.stats.atkHi * 10) / 10,
    def: player.stats.def, mdef: player.stats.mdef, acc: player.stats.acc,
    worn: save.worn, bag: save.bag, books: save.books,
    learned: save.learned, activeSkills: save.active,
    cds, shield: player.stats.shieldPct,
    hpPots: save.hpPots, mpPots: save.mpPots,
    auto: player.auto, bonusLit: save.bonusLit, cleared: save.cleared,
    stage: room ? room.stageId : null, floor: room ? room.floor : null,
    ores: save.ores, trade: save.trade || [],
  };
}

function flushPlayerMessages(player) {
  const toasts = player.toasts || [];
  const events = player.events || [];
  player.toasts = [];
  player.events = [];
  return { toasts, events };
}

// ---------------------------------------------------------------- 消息处理
function handleAction(room, player, msg) {
  const fail = (error) => { player.toasts.push(error); return null; };
  switch (msg.t) {
    case 'move': {
      if (player.dead) return null;
      player.moveX = clamp(Number(msg.x) || 0, -1, 1);
      player.moveY = clamp(Number(msg.y) || 0, -1, 1);
      if (player.moveX || player.moveY) {
        player.faceX = player.moveX; player.faceY = player.moveY;
      }
      return null;
    }
    case 'attack':
      basicAttack(room, player);
      return null;
    case 'skill': {
      const r = castSkill(room, player, msg.id);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'pickup': {
      let best = null, bestD = PICKUP_RADIUS;
      for (const d of room.drops) {
        const dd = dist(player.x, player.y, d.x, d.y);
        if (dd <= bestD) { best = d; bestD = dd; }
      }
      if (!best) return fail('附近没有可捡的东西');
      const r = pickupDrop(room, player, best);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'auto':
      player.auto = !!msg.on;
      player.toasts.push(player.auto ? '自动战斗已开启' : '自动战斗已关闭');
      player.meDirty = true;
      return null;
    case 'use_potion': {
      const r = drinkPotion(player, msg.kind === 'mp' ? 'mp' : 'hp');
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'equip': {
      const r = equipFromBag(player, msg.uid);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'unequip': {
      const r = unequipSlot(player, msg.slot);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'buy': {
      const r = buyShopItem(player, msg.equipId);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'sell': {
      const r = sellBagItem(player, msg.uid);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'enter_portal': {
      const r = enterPortal(room, player);
      if (!r.ok) return fail(r.error);
      for (const q of room.players.values()) {
        q.events = q.events || [];
        q.events.push({ t: 'floor', stage: r.stage.id, floor: r.floor });
      }
      return null;
    }
    case 'set_active_skills': {
      const ids = (Array.isArray(msg.ids) ? msg.ids : []).map(normSkillId)
        .filter((id) => player.save.learned[id] && id !== 'mage_shield');
      if (ids.length > MAX_ACTIVE_SKILLS) return fail('上场技能最多 ' + MAX_ACTIVE_SKILLS + ' 门');
      player.save.active = ids;
      player.meDirty = true;
      return null;
    }
    case 'shop': {
      const stock = shopStock(player.save.classId);
      return { t: 'shop', items: stock.items, potions: stock.potions };
    }
    case 'buy_potion': {
      const r = buyPotion(player, msg.kind, msg.tier);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'use_item':
    case 'use_book': {
      const r = useBook(player, msg.uid || msg.bookId);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'repair': {
      const r = repairWorn(player, msg.uid);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'repair_all': {
      const r = repairAllWorn(player);
      if (!r.ok) return fail(r.error);
      return null;
    }
    case 'teleport': {
      const r = teleportRoom(room, msg.stageId, player);
      if (!r.ok) return fail(r.error);
      for (const q of room.players.values()) {
        q.events = q.events || [];
        q.events.push({ t: 'floor', stage: r.stage.id, floor: r.floor });
      }
      return null;
    }
    case 'enter_hole': {
      const r = enterHole(room, player);
      if (!r.ok) return fail(r.error);
      for (const q of room.players.values()) {
        q.events = q.events || [];
        q.events.push({ t: 'floor', stage: r.stage.id, floor: r.floor });
      }
      return null;
    }
    case 'enter_passage': {
      const r = enterPassage(room, player);
      if (!r.ok) return fail(r.error);
      for (const q of room.players.values()) {
        q.events = q.events || [];
        q.events.push({ t: 'floor', stage: r.stage.id, floor: r.floor });
      }
      return null;
    }
    case 'ping':
      return { t: 'pong' };
    default:
      return null;
  }
}

function listStages() {
  const targets = teleportTargets();
  return STAGES.map((s) => ({
    id: s.id, name: s.name, floors: s.layers, safe: !!s.safe,
    hidden: !!s.hidden, desc: s.desc || '',
    teleport: targets.includes(s.id),
  }));
}

module.exports = {
  Data, rooms, playersByDevice,
  newPlayer, createRoom, joinRoom, leaveRoom, dissolveRoom, roomOf,
  enterStage, teleportRoom, enterHole, enterPassage, enterPortal, teleportTargets,
  handleAction, tickRoom, snapshotFor, meFor, flushPlayerMessages,
  savePlayer, newCharacterSave, normalizeSave, calcStats, listStages,
  stageById, normSkillId, normClsId,
  TICK_MS, MAX_SLOTS, ROOM_MAX,
};
