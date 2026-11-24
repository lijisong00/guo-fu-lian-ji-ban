'use strict';
// ---------------------------------------------------------------------------
// 世界制后从旧 lib/game.js 抽出的非房间 helper（2026-11-24）：
// lib/game.js（旧 WS 房间引擎）已删除，server.js 只保留这三个仍需要的函数：
// 新角色存档、技能 id 归一、地图列表。战斗/怪物/房间逻辑全部在 artifact
// 客户端 + 世界引擎（lib/world.js）里，不在这里。
// ---------------------------------------------------------------------------
const Data = require('../shared/data.js');

const {
  CLASSES, hpAt, SKILLS, STAGES, EQUIPS, POTIONS, DUR_MAX,
  tradePrice, MAX_ACTIVE_SKILLS, START_GOLD,
} = Data;

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

function normSkillId(id) {
  if (!id) return id;
  if (SKILLS[id]) return id;
  return OLD_SKILL_MAP[id] || id;
}
function normClsId(id) { return OLD_CLASS_MAP[id] || id; }
function classById(id) { return CLASSES.find((c) => c.id === id) || null; }
function stageById(id) { return STAGES.find((s) => s.id === id) || null; }

let uidSeq = 1;
function nextUid() { return Date.now() * 1000 + (uidSeq++ % 1000); }

/** 装备实例（开局武器）：克隆库原件，满耐久 100。 */
function makeEquipInstance(tpl, jpBonus = 0) {
  const it = { ...tpl };
  delete it.source; delete it.note; delete it.verified;
  it.uid = nextUid();
  it.dur = DUR_MAX; it.maxDur = DUR_MAX;
  it.enh = 0;
  it.jp = jpBonus > 0 ? jpBonus : null;
  if (jpBonus > 0) {
    const main = it.cls === 'war' ? 'atk' : it.cls === 'mage' ? 'mag' : 'dao';
    if (Array.isArray(it[main])) it[main] = [it[main][0], it[main][1] + jpBonus];
    else if (Array.isArray(it.def)) it.def = [it.def[0], it.def[1] + jpBonus];
  }
  it.price = tradePrice(it);
  return it;
}

/** 新角色（按现版本：金币 200，中瓶血瓶×100、中瓶魔法瓶×100，
 *  开局学会本职业 1 级技能，开局一把本职业 tier 0 武器）。 */
function newCharacterSave(name, cls) {
  const c = classById(cls);
  if (!c) throw new Error('职业不对：' + cls);
  const initial = c.initialSkill;
  const maxHp = hpAt(cls, 1);
  const maxMp = c.mp;
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

/** 传送目的地：比奇城传送员列表 = STAGES[0].to（尸王殿与未知暗殿不在内）。 */
function teleportTargets() {
  const city = stageById('city');
  return (city && city.to) || [];
}

function listStages() {
  const targets = teleportTargets();
  return STAGES.map((s) => ({
    id: s.id, name: s.name, floors: s.layers, safe: !!s.safe,
    hidden: !!s.hidden, desc: s.desc || '',
    teleport: targets.includes(s.id),
  }));
}

module.exports = { Data, newCharacterSave, normSkillId, normClsId, listStages, stageById, classById };
