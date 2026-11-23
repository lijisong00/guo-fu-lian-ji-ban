'use strict';
/* ============================================================
   热血传奇 · 国服联机版客户端 v2（2026-11-23 移植版）
   底子：国服服务器版 v89 公开版导出（2026-11-21，单文件客户端）
   改动：删掉本地模拟，全部状态走服务端（REST + WebSocket，
   个人状态 {t:'me'} + 世界快照 {t:'snapshot'}，服务端权威）；
   房间 + 拍卖行按 lib/game.js / server.js 实测口径接；
   怪物造型取自单机版旧导出的 Q 版矢量精灵库。
   数据表直接用 public/data.js（= shared/data.js），不手抄。
   零外部请求：无 CDN、无外部字体、无外部图片、无外部音频。
   ============================================================ */

var $ = function(id){ return document.getElementById(id); };
/* 存储安全封装：个别内置浏览器禁用 localStorage 时也不让启动中断 */
var __memStore = {};
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return (k in __memStore) ? __memStore[k] : null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){ __memStore[k] = String(v); } }
var D = window.LegendData || {};
var CLASSES_BY_ID = {};
(D.CLASSES || []).forEach(function(c){ CLASSES_BY_ID[c.id] = c; });
var SKILLS_BY_ID = D.SKILLS || {};
var CLASS_SKILLS_BY_ID = D.CLASS_SKILLS || {};
var STAGES_BY_ID = {};
(D.STAGES || []).forEach(function(s){ STAGES_BY_ID[s.id] = s; });
var STAGE_LIST = D.STAGES || [];
var MONSTERS_BY_ID = {};
(D.MONSTERS || []).forEach(function(m){ MONSTERS_BY_ID[m.id] = m; });
var BOSSES_BY_ID = {};
(D.BOSSES || []).forEach(function(b){ BOSSES_BY_ID[b.id] = b; });
var EQUIPS_BY_ID = {};
(D.EQUIPS || []).forEach(function(e){ EQUIPS_BY_ID[e.id] = e; });
var SLOT_ORDER_LIST = D.SLOT_ORDER || ['weapon','armor','helmet','necklace','braceL','braceR','ringL','ringR','boots'];
var SLOT_LABEL_MAP = D.SLOT_LABEL || { weapon:'武器', armor:'衣服', helmet:'头盔', necklace:'项链', braceL:'左手镯', braceR:'右手镯', ringL:'左戒指', ringR:'右戒指', boots:'鞋靴' };
var POTION_TIERS = (D.POTIONS && D.POTIONS.tiers) || [
  { id:'small', name:'小瓶', hpPct:0.30, mpPct:0.30, price:20 },
  { id:'mid', name:'中瓶', hpPct:0.55, mpPct:0.60, price:40 },
  { id:'big', name:'大瓶', hpPct:0.90, mpPct:0.95, price:80 }
];
var TIER_SHORT = { small:'s', mid:'m', big:'l' };
var TAU = Math.PI * 2;
var CLIENT_VERSION = 'v2-ported-2026-11-23';

/* ---------------- 设备 ID：沿用旧客户端的存储 key，绝不能改 ---------------- */
var DEVICE_KEY = 'lg_device_id';
function getDeviceId(){
  var id = lsGet(DEVICE_KEY);
  if(!id){
    id = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    lsSet(DEVICE_KEY, id);
  }
  return id;
}
var deviceId = getDeviceId();
var API_BASE = (lsGet('lg_api_base') || '').replace(/\/$/, '');
var CHAR_KEY = 'lg_last_slot';
var SKILLBAR_KEY = 'lg_skillbar_pos';

/* ---------------- 工具 ---------------- */
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dist(x1, y1, x2, y2){ var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function fmt(n){ return Number(n || 0).toLocaleString('en-US'); }
function statRange(v){
  if(v == null) return null;
  if(typeof v === 'number') return v ? String(v) : null;
  if(Array.isArray(v)) return (v[0] === v[1]) ? String(v[0]) : (v[0] + '~' + v[1]);
  return null;
}
function statSum(v){
  if(typeof v === 'number') return v;
  if(Array.isArray(v)) return v[1] || 0;
  return 0;
}
function itemStatsText(it){
  if(!it) return '';
  var parts = [];
  var a = statRange(it.atk); if(a) parts.push('攻击' + a);
  var m = statRange(it.mag); if(m) parts.push('魔法' + m);
  var t = statRange(it.dao); if(t) parts.push('道术' + t);
  var d = statRange(it.def); if(d) parts.push('防御' + d);
  var md = statRange(it.mdef); if(md) parts.push('魔御' + md);
  if(it.acc) parts.push('准确+' + it.acc);
  if(it.hp) parts.push('生命+' + it.hp);
  if(it.spd) parts.push('移速+' + it.spd);
  var s = parts.join(' ');
  if(it.jp) s += ' · 极品+' + it.jp;
  if(it.enh) s += ' · 强化+' + it.enh;
  if(it.dur != null) s += ' · 耐久 ' + Math.round(it.dur) + '/' + (it.maxDur || 100);
  return s;
}
function slotLabel(k){
  if(k === 'bracelet') return '手镯';
  if(k === 'ring') return '戒指';
  return SLOT_LABEL_MAP[k] || k;
}
function clsName(k){ return k === 'all' ? '通用' : (CLASSES_BY_ID[k] ? CLASSES_BY_ID[k].name : k); }
function potionTotal(v){
  if(typeof v === 'number') return v;
  if(Array.isArray(v)) return v.reduce(function(a, b){ return a + (b || 0); }, 0);
  return 0;
}

/* ---------------- 音效：极简 WebAudio 合成，无外部音频 ---------------- */
var AC = null;
var soundOn = lsGet('lg_sound') !== 'off';
function tone(f0, f1, dur, type, vol){
  if(!soundOn) return;
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if(AC.state === 'suspended') AC.resume();
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, AC.currentTime);
    if(f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), AC.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur + 0.02);
  }catch(e){ /* 音频不可用时静默 */ }
}
function sfx(name){
  if(!soundOn) return;
  if(name === 'hit') tone(170, 90, 0.07, 'square', 0.05);
  else if(name === 'cast') tone(300, 900, 0.16, 'sine', 0.06);
  else if(name === 'pickup'){ tone(880, 880, 0.07, 'sine', 0.07); setTimeout(function(){ tone(1318, 1318, 0.09, 'sine', 0.07); }, 70); }
  else if(name === 'coin') tone(1320, 1560, 0.08, 'sine', 0.06);
  else if(name === 'levelup'){ tone(523, 523, 0.1, 'sine', 0.08); setTimeout(function(){ tone(659, 659, 0.1, 'sine', 0.08); }, 100); setTimeout(function(){ tone(784, 784, 0.16, 'sine', 0.08); }, 200); }
  else if(name === 'death') tone(400, 70, 0.5, 'sawtooth', 0.07);
  else if(name === 'click') tone(600, 600, 0.03, 'sine', 0.04);
  else if(name === 'error') tone(200, 160, 0.12, 'square', 0.05);
}

/* ---------------- Q 版矢量精灵库（取自单机版旧导出，逐个手绘） ---------------- */
function sprC(c,x,y,r,col){ c.fillStyle=col; c.beginPath(); c.arc(x,y,r,0,TAU); c.fill(); }
function sprE(c,x,y,rx,ry,col,rot){ c.fillStyle=col; c.beginPath(); c.ellipse(x,y,rx,ry,rot||0,0,TAU); c.fill(); }
function sprL(c,x1,y1,x2,y2,col,w){ c.strokeStyle=col; c.lineWidth=w; c.lineCap='round'; c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke(); }
function sprP(c,pts,col){ c.fillStyle=col; c.beginPath(); c.moveTo(pts[0],pts[1]); for(let i=2;i<pts.length;i+=2) c.lineTo(pts[i],pts[i+1]); c.closePath(); c.fill(); }
function sprCatBody(c, fur, dark){
  sprL(c,-.3,.58,-.3,.98,fur,.17); sprL(c,.28,.58,.28,.98,fur,.17);
  sprL(c,-.46,.42,-.84,.02,fur,.13); sprL(c,-.84,.02,-.94,.22,fur,.13);
  sprE(c,0,.26,.5,.52,fur);
  sprC(c,0,-.45,.42,fur);
  sprP(c,[-.4,-.6,-.35,-.95,-.12,-.68],fur); sprP(c,[.4,-.6,.35,-.95,.12,-.68],fur);
  sprP(c,[-.32,-.66,-.3,-.83,-.19,-.69],dark); sprP(c,[.32,-.66,.3,-.83,.19,-.69],dark);
  sprC(c,-.15,-.48,.05,'#20301c'); sprC(c,.15,-.48,.05,'#20301c');
  sprP(c,[-.05,-.35,.05,-.35,0,-.27],'#d4697a');
  sprL(c,-.44,-.3,-.7,-.35,dark,.03); sprL(c,-.44,-.21,-.68,-.16,dark,.03);
  sprL(c,.44,-.3,.7,-.35,dark,.03); sprL(c,.44,-.21,.68,-.16,dark,.03);
}
function sprRakeCat(c, crown){
  if(crown) sprP(c,[-.52,-.15,-.95,.92,-.6,.98,-.4,.25],'#a02c22');
  sprCatBody(c,'#b08954','#8a6a3e');
  sprL(c,-.25,.05,-.05,.08,'#8a6a3e',.06); sprL(c,-.2,.3,0,.33,'#8a6a3e',.06); sprL(c,-.22,.55,-.02,.58,'#8a6a3e',.06);
  sprL(c,.48,.32,.95,-.55,'#7a5c33',.085);
  sprL(c,.76,-.63,1.13,-.47,'#7a5c33',.07);
  sprL(c,.82,-.6,.79,-.4,'#9a9da2',.055); sprL(c,.92,-.57,.9,-.37,'#9a9da2',.055); sprL(c,1.02,-.53,1.01,-.33,'#9a9da2',.055);
  if(crown){
    sprP(c,[-.24,-.76,-.24,-1.02,-.11,-.85,0,-1.06,.11,-.85,.24,-1.02,.24,-.76],'#f2c230');
    sprC(c,0,-.86,.05,'#c0272d');
  }
}
function sprOrc(c, skin, armor){
  sprL(c,-.28,.52,-.3,1,skin,.19); sprL(c,.28,.52,.3,1,skin,.19);
  sprE(c,0,.02,.52,.55,skin);
  sprP(c,[-.32,.3,.32,.3,.4,.72,-.4,.72],'#6e5136');
  if(armor){ sprP(c,[-.5,-.22,.5,-.22,.42,.32,-.42,.32],'#8f8f96'); sprL(c,-.5,-.02,.5,-.02,'#6f6f76',.06); sprL(c,0,-.22,0,.3,'#6f6f76',.05); }
  sprL(c,-.5,.02,-.8,.48,skin,.17);
  sprL(c,.5,-.02,.84,-.28,skin,.17);
  sprC(c,0,-.54,.43,skin);
  sprP(c,[-.36,-.62,-.56,-.8,-.27,-.76],skin); sprP(c,[.36,-.62,.56,-.8,.27,-.76],skin);
  sprL(c,-.21,-.74,.21,-.74,'#55663f',.07);
  sprC(c,-.13,-.57,.05,'#a1121a'); sprC(c,.13,-.57,.05,'#a1121a');
  sprP(c,[-.15,-.31,-.06,-.31,-.105,-.46],'#f3ecd8'); sprP(c,[.15,-.31,.06,-.31,.105,-.46],'#f3ecd8');
}
/* 毒蛇山谷的蛇类共用造型：盘起的蛇身 + 竖起的蛇头 + 分叉信子，
   靠体色 / 花纹区分——红蛇通体赤红、虎蛇黄身黑纹、毒蛇王戴金冠红眼 */
function sprSnake(c, main, dark, stripe, crown){
  sprE(c,0,.68,.62,.22,dark); sprE(c,0,.47,.48,.19,main); sprE(c,0,.27,.34,.16,dark);
  if(stripe){ sprL(c,-.38,.62,.38,.62,stripe,.06); sprL(c,-.28,.42,.28,.42,stripe,.06); sprL(c,-.2,.24,.2,.24,stripe,.05); }
  sprL(c,.08,.24,.42,-.3,main,.21);
  sprE(c,.5,-.42,.31,.23,main); sprC(c,.56,-.48,.04,'#c0272d');
  sprL(c,.72,-.4,.92,-.44,'#d43a2f',.04); sprL(c,.92,-.44,1.03,-.53,'#d43a2f',.035); sprL(c,.92,-.44,1.04,-.37,'#d43a2f',.035);
  if(crown){
    sprP(c,[.3,-.58,.33,-.82,.42,-.66,.5,-.86,.58,-.66,.68,-.82,.7,-.56],'#f2c230');
    sprC(c,.5,-.66,.05,'#c0272d'); sprC(c,.42,-.44,.055,'#ffd23e'); sprC(c,.62,-.44,.055,'#ffd23e');
  }
}
/* 僵尸洞穴（比奇矿区）的僵尸共用造型：青灰尸身 + 破烂矿工衣 + 双臂前伸，
   靠衣色 / 铁链 / 体型 / 姿态区分——普通僵尸直立、爬行僵尸伏地、
   矿洞僵尸戴矿帽、铁链僵尸缠锁链、尸卫披残甲、尸王高大戴冠缠金链 */
function sprZombie(c, skin, cloth, opts){
  opts = opts || {};
  if(opts.crawl){
    sprE(c,-.1,.55,.72,.3,cloth); sprE(c,.1,.42,.5,.24,skin);
    sprL(c,-.62,.5,-.95,.75,skin,.12); sprL(c,-.55,.72,-.8,.95,skin,.12);
    sprC(c,.68,.32,.33,skin);
    sprC(c,.6,.26,.04,'#c0272d'); sprC(c,.78,.28,.04,'#c0272d');
    sprP(c,[.55,.5,.68,.5,.61,.64],'#e8e0cc');
    sprL(c,.35,.62,.75,.85,skin,.11); sprL(c,.2,.72,.5,.98,skin,.11);
    return;
  }
  sprL(c,-.24,.5,-.26,.98,skin,.15); sprL(c,.24,.5,.26,.98,skin,.15);
  sprE(c,0,.12,.5,.5,cloth);
  sprL(c,-.15,-.1,.15,-.1,'#3a332a',.05); sprL(c,-.12,.18,.12,.18,'#3a332a',.05);
  sprL(c,-.48,.02,-.9,.14,skin,.14); sprL(c,.48,.02,.9,.14,skin,.14);
  sprL(c,-.9,.14,-.98,.3,skin,.11); sprL(c,.9,.14,.98,.3,skin,.11);
  if(opts.chain){
    c.strokeStyle = '#9a9da2'; c.lineWidth = .07;
    c.beginPath(); c.moveTo(-.42,-.18); c.lineTo(.4,.42); c.stroke();
    c.beginPath(); c.moveTo(.42,-.18); c.lineTo(-.4,.42); c.stroke();
    sprC(c,0,.12,.06,'#c8ccd2');
  }
  if(opts.armor){
    sprP(c,[-.48,-.2,.48,-.2,.4,.3,-.4,.3],'#6f6f76');
    sprL(c,-.48,0,.48,0,'#55555c',.05);
    sprC(c,-.5,-.24,.11,'#8f8f96'); sprC(c,.5,-.24,.11,'#8f8f96');
  }
  sprC(c,0,-.52,.4,skin);
  sprC(c,-.12,-.55,.045, opts.king ? '#ffd23e' : '#c0272d'); sprC(c,.12,-.55,.045, opts.king ? '#ffd23e' : '#c0272d');
  sprP(c,[-.13,-.32,-.05,-.32,-.09,-.18],'#e8e0cc'); sprP(c,[.13,-.32,.05,-.32,.09,-.18],'#e8e0cc');
  if(opts.hat){
    sprE(c,0,-.78,.34,.12,'#c79a35'); sprC(c,0,-.86,.09,'#8a6a2a'); sprC(c,0,-.88,.04,'#ffd977');
  }
  if(opts.king){
    sprP(c,[-.26,-.78,-.26,-1.04,-.12,-.88,0,-1.08,.12,-.88,.26,-1.04,.26,-.78],'#f2c230');
    sprC(c,0,-.9,.05,'#c0272d');
    c.strokeStyle = '#e3b94e'; c.lineWidth = .08;
    c.beginPath(); c.moveTo(-.44,-.2); c.lineTo(.42,.44); c.stroke();
  }
}
/* 石墓野猪共用造型：粗壮猪身 + 獠牙猪头 + 鬃毛，靠体色区分——
   红野猪赤红、黑野猪玄黑、白野猪雪白（王带金环 / 金冠） */
function sprBoar(c, main, dark, belly, opts){
  opts = opts || {};
  sprL(c,-.42,.45,-.5,.95,dark,.15); sprL(c,-.16,.5,-.18,.98,dark,.15); sprL(c,.3,.5,.32,.98,dark,.15); sprL(c,.52,.42,.58,.95,dark,.15);
  sprE(c,0,.12,.68,.46,main); sprE(c,0,.34,.44,.3,belly);
  sprL(c,-.5,-.18,.5,-.3,dark,.09); sprL(c,-.34,-.26,.36,-.36,dark,.07);
  sprL(c,-.62,.1,-.86,-.14,main,.12);
  sprE(c,.72,-.08,.4,.32,main); sprE(c,.97,.02,.15,.11,belly);
  sprC(c,.95,-.04,.035,'#33231a'); sprC(c,.99,.04,.035,'#33231a');
  sprC(c,.66,-.16,.045, opts.king ? '#ffd23e' : '#7a1f1f');
  sprP(c,[.8,.14,.9,.3,.72,.28],'#f3ecd8'); sprP(c,[.58,.18,.62,.34,.5,.26],'#f3ecd8');
  sprP(c,[.52,-.3,.38,-.52,.6,-.44],'#e8e0cc'); sprP(c,[.78,-.28,.92,-.46,.94,-.22],'#e8e0cc');
  if(opts.king){
    sprL(c,-.4,-.05,.55,-.05,'#f2c230',.06);
    sprP(c,[.42,-.36,.46,-.6,.56,-.44,.66,-.62,.74,-.42,.84,-.56,.84,-.34],'#f2c230');
    sprC(c,.63,-.44,.05,'#c0272d');
  }
}
function drawMonsterSprite(c, key, s){
  if(!key) return false;
  c.save(); c.scale(s, s);
  c.scale(1.07, .93);   // Q 版：整体压扁拉宽，身子更圆更短，头身比更呆萌
  switch(key){
    case 'ji':
      sprL(c,-.52,-.02,-.95,-.52,'#ddd6c4',.15); sprL(c,-.55,.08,-1,-.22,'#cfc7b2',.15);
      sprE(c,-.05,.28,.62,.46,'#f6f3ec'); sprE(c,-.12,.32,.33,.23,'#e6e0d0');
      sprC(c,.52,-.27,.37,'#f6f3ec');
      sprC(c,.38,-.56,.1,'#d8402f'); sprC(c,.53,-.61,.11,'#d8402f'); sprC(c,.65,-.53,.09,'#d8402f');
      sprP(c,[.74,-.3,.99,-.2,.74,-.11],'#f0a51e');
      sprC(c,.6,-.32,.065,'#222');
      sprL(c,.05,.68,.05,.98,'#e08a1e',.09); sprL(c,.32,.68,.32,.98,'#e08a1e',.09);
      break;
    case 'lu':
      sprL(c,-.45,.42,-.45,.95,'#8a6a44',.13); sprL(c,-.18,.48,-.18,.95,'#8a6a44',.13); sprL(c,.3,.48,.3,.95,'#8a6a44',.13); sprL(c,.52,.42,.52,.95,'#8a6a44',.13);
      sprE(c,0,.1,.68,.4,'#a97c50');
      sprC(c,-.3,0,.06,'#f3e9d4'); sprC(c,.06,.2,.05,'#f3e9d4'); sprC(c,-.04,-.1,.05,'#f3e9d4');
      sprL(c,.55,-.02,.76,-.44,'#a97c50',.21);
      sprE(c,.83,-.52,.33,.24,'#bb8d5f'); sprE(c,.97,-.47,.12,.09,'#8a6242');
      sprC(c,.83,-.56,.04,'#222');
      sprL(c,.68,-.64,.54,-1,'#6e5136',.07); sprL(c,.6,-.82,.4,-.85,'#6e5136',.06);
      sprL(c,.9,-.66,1.03,-.97,'#6e5136',.07); sprL(c,.97,-.83,1.15,-.82,'#6e5136',.06);
      sprP(c,[.58,-.6,.46,-.8,.7,-.72],'#8a6242');
      sprL(c,-.64,.02,-.86,-.22,'#a97c50',.1);
      break;
    case 'daocao':
      sprL(c,0,-.95,0,1,'#7a5c33',.09); sprL(c,-.88,-.28,.88,-.28,'#7a5c33',.09);
      sprP(c,[-.34,-.28,.34,-.28,.52,.82,-.52,.82],'#d9b84a');
      sprL(c,-.2,-.05,-.28,.6,'#b8933a',.05); sprL(c,.05,0,0,.7,'#b8933a',.05); sprL(c,.28,-.02,.36,.55,'#b8933a',.05);
      sprC(c,0,-.58,.37,'#ecd27c');
      sprE(c,0,-.83,.56,.13,'#c49a3f'); sprE(c,0,-.92,.3,.12,'#c49a3f');
      sprC(c,-.11,-.6,.045,'#333'); sprC(c,.11,-.6,.045,'#333');
      sprL(c,-.12,-.42,.12,-.42,'#8a6a2a',.05);
      sprL(c,-.88,-.28,-1.03,-.08,'#e5c95e',.07); sprL(c,.88,-.28,1.03,-.08,'#e5c95e',.07);
      sprL(c,-.3,.82,-.38,1,'#e5c95e',.07); sprL(c,.3,.82,.38,1,'#e5c95e',.07);
      break;
    case 'hama':
      sprE(c,-.72,.74,.24,.13,'#4c8a3e'); sprE(c,.72,.74,.24,.13,'#4c8a3e');
      sprE(c,0,.32,.82,.52,'#5da24a'); sprE(c,0,.52,.5,.3,'#d3e5ab');
      sprC(c,-.36,-.14,.21,'#5da24a'); sprC(c,.36,-.14,.21,'#5da24a');
      sprC(c,-.36,-.18,.13,'#fff'); sprC(c,.36,-.18,.13,'#fff');
      sprC(c,-.36,-.16,.06,'#222'); sprC(c,.36,-.16,.06,'#222');
      sprC(c,-.15,.16,.05,'#4c8a3e'); sprC(c,.2,.08,.06,'#4c8a3e'); sprC(c,.02,.3,.04,'#4c8a3e');
      c.strokeStyle='#33582a'; c.lineWidth=.06; c.beginPath(); c.arc(0,.24,.42,.3,Math.PI-.3); c.stroke();
      break;
    case 'duogou':
      sprCatBody(c,'#8d8578','#6e675c');
      sprL(c,.46,.3,.78,.02,'#6e675c',.14);
      sprL(c,.78,.02,.93,-.3,'#5c564d',.08);
      c.strokeStyle='#c8ccd2'; c.lineWidth=.09; c.beginPath(); c.arc(.8,-.44,.17,Math.PI*.05,Math.PI*1.45); c.stroke();
      sprL(c,-.46,.35,-.68,.62,'#6e675c',.12);
      c.strokeStyle='#c8ccd2'; c.lineWidth=.07; c.beginPath(); c.arc(-.78,.5,.12,Math.PI*.6,Math.PI*1.9); c.stroke();
      break;
    case 'dingpa': sprRakeCat(c, false); break;
    case 'dingpawang': sprRakeCat(c, true); break;
    case 'duzhu':
      sprL(c,-.4,-.12,-.97,-.38,'#332838',.09); sprL(c,-.52,.14,-1.07,.08,'#332838',.09); sprL(c,-.5,.4,-1.02,.58,'#332838',.09); sprL(c,-.34,.62,-.8,.92,'#332838',.09);
      sprL(c,.4,-.12,.97,-.38,'#332838',.09); sprL(c,.52,.14,1.07,.08,'#332838',.09); sprL(c,.5,.4,1.02,.58,'#332838',.09); sprL(c,.34,.62,.8,.92,'#332838',.09);
      sprC(c,0,.28,.55,'#4a3550'); sprC(c,0,-.32,.38,'#3a2a40');
      sprC(c,-.11,-.38,.055,'#e8443a'); sprC(c,.11,-.38,.055,'#e8443a'); sprC(c,-.23,-.29,.035,'#e8443a'); sprC(c,.23,-.29,.035,'#e8443a');
      sprP(c,[-.13,-.13,-.05,-.13,-.09,.02],'#eee'); sprP(c,[.13,-.13,.05,-.13,.09,.02],'#eee');
      sprC(c,-.25,.18,.07,'#7fc94f'); sprC(c,.28,.42,.06,'#7fc94f'); sprC(c,.04,.52,.05,'#7fc94f');
      break;
    case 'shiren':
      sprL(c,0,1,0,.12,'#4c7d3a',.15);
      sprE(c,-.45,.78,.3,.13,'#55853f',-.5); sprE(c,.45,.84,.3,.13,'#55853f',.5);
      for(let i=0;i<5;i++){ const a=-Math.PI/2 + i*(TAU/5); sprE(c,Math.cos(a)*.52,-.35+Math.sin(a)*.52,.27,.17,'#e77a9b',a); }
      sprC(c,0,-.35,.5,'#c94f6d'); sprE(c,0,-.3,.3,.22,'#5e1220');
      for(let i=0;i<6;i++){ const tx=-.26+i*.105; sprP(c,[tx,-.44,tx+.085,-.44,tx+.042,-.31],'#fff'); sprP(c,[tx,-.17,tx+.085,-.17,tx+.042,-.3],'#fff'); }
      break;
    case 'banshou':
      sprOrc(c,'#7d8f5f',false);
      sprL(c,.84,-.28,1.06,-.72,'#7a5c33',.1); sprE(c,1.09,-.8,.13,.21,'#8a6a44',.4);
      break;
    case 'bsys':
      sprOrc(c,'#75855a',true);
      sprP(c,[-.38,-.8,.38,-.8,.3,-.62,-.3,-.62],'#6f6f76');
      sprP(c,[.3,-.78,.52,-.95,.4,-.66],'#d8d0c0');
      sprL(c,.84,-.28,1.12,-.82,'#7a5c33',.09);
      sprP(c,[.94,-.88,1.34,-.72,1.3,-.44,.97,-.6],'#c8ccd2');
      break;
    case 'banshoutongling':
      sprP(c,[-.55,-.2,-1,.95,-.62,1,-.42,.2],'#8f1d22');
      sprOrc(c,'#71855a',true);
      sprP(c,[-.4,-.82,.4,-.82,.31,-.63,-.31,-.63],'#5d5d64');
      sprP(c,[-.32,-.8,-.58,-1.02,-.42,-.66],'#e8e0cc'); sprP(c,[.32,-.8,.58,-1.02,.42,-.66],'#e8e0cc');
      sprL(c,.84,-.28,1.14,-.86,'#6e5136',.1);
      sprP(c,[.95,-.94,1.42,-.76,1.38,-.42,.98,-.62],'#d8dde2');
      sprC(c,0,-.72,.06,'#e3b94e');
      break;
    case 'xueren':
      sprL(c,-.52,-.05,-.8,.75,'#e6e8e2',.2); sprL(c,.52,-.05,.8,.75,'#e6e8e2',.2);
      sprL(c,-.26,.72,-.28,1,'#e6e8e2',.16); sprL(c,.26,.72,.28,1,'#e6e8e2',.16);
      sprE(c,0,.28,.6,.58,'#eef0ea'); sprE(c,0,.45,.37,.35,'#dde0d8');
      sprC(c,0,-.48,.44,'#eef0ea'); sprE(c,0,-.44,.24,.19,'#d8c9a8');
      sprC(c,-.09,-.48,.04,'#333'); sprC(c,.09,-.48,.04,'#333');
      sprE(c,0,-.35,.07,.04,'#8a6a4a');
      break;
    case 'dushe':
      sprE(c,0,.68,.62,.22,'#4f7d3a'); sprE(c,0,.47,.48,.19,'#5c8a42'); sprE(c,0,.27,.34,.16,'#4f7d3a');
      sprL(c,-.38,.62,.38,.62,'#d9c84a',.05); sprL(c,-.28,.42,.28,.42,'#d9c84a',.05);
      sprL(c,.08,.24,.42,-.3,'#5c8a42',.21);
      sprE(c,.5,-.42,.31,.23,'#679a4a'); sprC(c,.56,-.48,.04,'#c0272d');
      sprL(c,.72,-.4,.92,-.44,'#d43a2f',.04); sprL(c,.92,-.44,1.03,-.53,'#d43a2f',.035); sprL(c,.92,-.44,1.04,-.37,'#d43a2f',.035);
      break;
    case 'hongshe': sprSnake(c,'#b0402f','#93332a','#e08a5a',false); break;
    case 'hushe': sprSnake(c,'#c78f35','#a8762a','#33241a',false); break;
    case 'dushewang': sprSnake(c,'#4f7d3a','#3c632c','#d9c84a',true); break;
    case 'jiangshi': sprZombie(c,'#8fa393','#5c5648',{}); break;
    case 'paxing': sprZombie(c,'#93a89b','#54483a',{ crawl:true }); break;
    case 'kuangjiang': sprZombie(c,'#8fa393','#6e5136',{ hat:true }); break;
    case 'tiejiang': sprZombie(c,'#7d8f88','#463f35',{ chain:true }); break;
    case 'shiwei': sprZombie(c,'#8fa393','#5c5648',{ armor:true }); break;
    case 'shiweiwang': sprZombie(c,'#84998c','#4c4438',{ armor:true, chain:true }); break;
    case 'shiwang': sprZombie(c,'#9db3a4','#6e2a24',{ king:true }); break;
    case 'hongye': sprBoar(c,'#a03a2a','#7e2a1e','#c96a4a',{}); break;
    case 'hongyewang': sprBoar(c,'#a03a2a','#7e2a1e','#c96a4a',{ king:true }); break;
    case 'heiye': sprBoar(c,'#3a363e','#28242c','#5c5660',{}); break;
    case 'heiyewang': sprBoar(c,'#3a363e','#28242c','#5c5660',{ king:true }); break;
    case 'baiye': sprBoar(c,'#e8e2d4','#c9c0aa','#f6f1e2',{}); break;
    case 'baiyewang': sprBoar(c,'#e8e2d4','#c9c0aa','#f6f1e2',{ king:true }); break;
    case 'xieshe': sprSnake(c,'#6e5a8a','#52406a','#c9a227',false);
      sprL(c,.1,.6,.7,.95,'#52406a',.09); sprP(c,[.7,.95,.84,1.08,.6,1.06],'#8a2a2a'); break;
    case 'xieshewang': sprSnake(c,'#6e5a8a','#52406a','#c9a227',true);
      sprL(c,.1,.6,.7,.95,'#52406a',.09); sprP(c,[.7,.95,.84,1.08,.6,1.06],'#8a2a2a'); break;
    case 'xiedu': sprSnake(c,'#2f5d33','#224226','#8a9a3a',false); break;
    case 'jiaoying':
      sprE(c,-.55,-.3,.42,.2,'rgba(220,230,240,.75)',-.6); sprE(c,.55,-.3,.42,.2,'rgba(220,230,240,.75)',.6);
      sprE(c,0,.25,.3,.5,'#7a4a6e'); sprE(c,0,.5,.2,.26,'#96608a');
      sprC(c,0,-.28,.3,'#8a5a7e'); sprC(c,-.1,-.32,.07,'#e8443a'); sprC(c,.1,-.32,.07,'#e8443a');
      sprL(c,-.08,-.48,-.2,-.72,'#5c3a54',.04); sprL(c,.08,-.48,.2,-.72,'#5c3a54',.04);
      sprL(c,-.14,.68,-.34,.94,'#5c3a54',.05); sprL(c,.14,.68,.34,.94,'#5c3a54',.05);
      break;
    case 'shimushiwang': sprZombie(c,'#a8b8a2','#4a3a52',{ king:true, chain:true }); break;
    case 'dongqu':
      /* 洞蛆：粉灰分节蠕虫身 + 暗红口器 */
      sprE(c,-.45,.3,.34,.3,'#c9a294'); sprE(c,-.1,.22,.36,.34,'#d4aca0'); sprE(c,.28,.16,.34,.32,'#c9a294'); sprE(c,.62,.1,.3,.28,'#bd9587');
      sprL(c,-.42,.05,-.42,-.2,'#a87f70',.05); sprL(c,-.06,.0,-.06,-.26,'#a87f70',.05); sprL(c,.3,.02,.3,-.22,'#a87f70',.05);
      sprC(c,.86,.06,.21,'#a87a6c'); sprE(c,.95,.08,.08,.05,'#5e1220'); sprC(c,.8,-.06,.035,'#7a1f1f');
      break;
    case 'xiezi': case 'xieziwang': {
      /* 蝎子 / 蝎子王：褐甲身 + 双螯 + 高翘毒尾（王带金环与红毒针） */
      const king = key === 'xieziwang';
      sprL(c,-.5,-.1,-.95,-.35,'#7a4a28',.13); sprL(c,-.55,.3,-1,.25,'#7a4a28',.13);
      sprC(c,-1.02,-.42,.16,'#8a5a30'); sprC(c,-1.06,.3,.16,'#8a5a30');
      sprL(c,-.3,.55,-.6,.9,'#6e4426',.08); sprL(c,.05,.6,-.1,.95,'#6e4426',.08); sprL(c,.4,.55,.3,.9,'#6e4426',.08);
      sprE(c,0,.2,.58,.42,'#8a5a30'); sprE(c,0,.12,.4,.3,'#9c6a38');
      sprL(c,-.25,.05,.35,.05,'#6e4426',.05); sprL(c,-.22,.28,.32,.28,'#6e4426',.05);
      sprC(c,-.52,-.22,.045,'#c0272d'); sprC(c,-.34,-.26,.045,'#c0272d');
      sprL(c,.5,.05,.85,-.3,'#7a4a28',.11); sprL(c,.85,-.3,.8,-.75,'#7a4a28',.1);
      sprP(c,[.8,-.75,.95,-.95,.72,-.92],'#c0272d');
      if(king){ sprL(c,-.3,-.05,.3,-.05,'#f2c230',.06); sprC(c,0,-.32,.07,'#f2c230'); sprC(c,-.52,-.22,.06,'#ffd23e'); sprC(c,-.34,-.26,.06,'#ffd23e'); }
      break;
    }
    case 'kuloujiang': case 'kuloujingling': {
      /* 骷髅战将 / 骷髅精灵：白骨身 + 骷髅头 + 战斧（精灵披暗红披风、持镰、眼窝红光） */
      const boss = key === 'kuloujingling';
      if(boss) sprP(c,[-.5,-.2,-1.05,1,-.6,1,-.38,.2],'#7a1620');
      sprL(c,-.22,.32,-.56,.95,'#e8e4da',.1); sprL(c,-.04,.32,-.18,.95,'#e8e4da',.1); sprL(c,.24,.32,.14,.95,'#e8e4da',.1); sprL(c,.4,.32,.62,.95,'#e8e4da',.1);
      sprL(c,-.56,.08,.44,.08,'#e8e4da',.11);
      for(let i=0;i<4;i++){ c.strokeStyle='#e8e4da'; c.lineWidth=.075; c.beginPath(); c.arc(-.36+i*.23,.17,.155,.15,Math.PI-.15); c.stroke(); }
      sprL(c,-.56,.08,-.84,-.14,'#e8e4da',.08);
      sprC(c,-.72,-.2,.36,'#efe9dc'); sprC(c,-.66,-.24,.075,'#222'); sprE(c,-.52,-.1,.09,.05,'#222');
      if(boss){
        sprC(c,-.68,-.25,.05,'#e8443a'); sprC(c,-.8,-.28,.04,'#e8443a');
        sprL(c,.44,.1,.95,-.6,'#5c564d',.08);
        c.strokeStyle='#c8ccd2'; c.lineWidth=.11; c.beginPath(); c.arc(1.02,-.78,.3,Math.PI*.9,Math.PI*1.9); c.stroke();
        sprP(c,[-.35,-.72,-.3,-1.0,-.16,-.82,-.02,-1.04,.1,-.8,.3,-.98,.32,-.7],'#8f1d22');
      } else {
        sprL(c,.44,.05,.85,-.35,'#7a5c33',.09);
        sprP(c,[.72,-.52,1.08,-.34,1.02,-.05,.7,-.2],'#c8ccd2');
        sprP(c,[-.3,-.66,-.28,-.9,-.16,-.76,-.02,-.94,.1,-.74,.26,-.88,.28,-.64],'#b8933a');
      }
      break;
    }
    case 'kulou':
      sprL(c,-.22,.32,-.56,.9,'#e8e4da',.09); sprL(c,-.04,.32,-.18,.9,'#e8e4da',.09); sprL(c,.24,.32,.14,.9,'#e8e4da',.09); sprL(c,.4,.32,.62,.9,'#e8e4da',.09);
      sprL(c,-.56,.08,.44,.08,'#e8e4da',.1);
      for(let i=0;i<4;i++){ c.strokeStyle='#e8e4da'; c.lineWidth=.07; c.beginPath(); c.arc(-.36+i*.23,.16,.155,.15,Math.PI-.15); c.stroke(); }
      sprL(c,-.56,.08,-.86,-.18,'#e8e4da',.07);
      sprC(c,.68,-.06,.31,'#efe9dc'); sprC(c,.75,-.09,.07,'#222'); sprE(c,.87,.04,.09,.05,'#222');
      sprL(c,.52,.1,.36,.3,'#e8e4da',.06);
      break;
    case 'shenshou':
      sprL(c,-.4,.42,-.4,.9,'#c96a28',.15); sprL(c,-.14,.48,-.14,.9,'#c96a28',.15); sprL(c,.3,.48,.3,.9,'#c96a28',.15); sprL(c,.52,.42,.52,.9,'#c96a28',.15);
      sprE(c,0,.13,.66,.4,'#d97b2f');
      sprL(c,-.6,.02,-.9,-.3,'#d97b2f',.13); sprC(c,-.96,-.38,.1,'#e8443a'); sprC(c,-.93,-.33,.06,'#ffb03a');
      sprC(c,.72,-.28,.4,'#e08a3c'); sprE(c,.96,-.19,.16,.12,'#c96a28');
      sprP(c,[.54,-.54,.6,-.86,.76,-.58],'#f2e3c2');
      sprP(c,[.44,-.5,.32,-.72,.54,-.63],'#c96a28');
      sprC(c,.79,-.33,.045,'#40260f');
      sprL(c,.62,-.08,.88,-.12,'#a34d1c',.05);
      break;
    default:
      c.restore(); return false;
  }
  c.restore(); return true;
}
function drawHero(c, clsId, s){
  /* Q 版人物：身体纵向压缩成短身、大头放大到近半个身高、圆眼加腮红 */
  c.save(); c.scale(s, s);
  c.save(); c.translate(0, .07); c.scale(1.04, .78);
  sprL(c,-.22,.48,-.25,.95,'#3c3a44',.17); sprL(c,.22,.48,.25,.95,'#3c3a44',.17);
  if(clsId === 'mage'){
    sprP(c,[-.3,-.26,.3,-.26,.56,.95,-.56,.95],'#3a5f9e');
    sprL(c,-.34,.42,.36,.42,'#e3b94e',.06);
    sprL(c,.6,-.72,.6,.85,'#7a5c33',.07);
    sprC(c,.6,-.84,.2,'rgba(126,195,255,.35)'); sprC(c,.6,-.84,.12,'#7ec3ff');
  } else if(clsId === 'taoist'){
    sprP(c,[-.3,-.26,.3,-.26,.52,.95,-.52,.95],'#e6dfca');
    sprL(c,-.3,-.26,.52,.95,'#7a9a52',.05); sprL(c,.3,-.26,-.52,.95,'#7a9a52',.05);
    sprR2(c,-.68,-.18,.26,.38,'#f2d24b'); sprC(c,-.55,-.06,.045,'#c0272d'); sprL(c,-.55,.02,-.55,.12,'#c0272d',.03);
    sprL(c,.46,.02,.9,-.42,'#d8dde2',.085); sprL(c,.46,.02,.34,.16,'#6e5136',.07);
  } else {
    sprP(c,[-.34,-.26,.34,-.26,.42,.55,-.42,.55],'#b03a30');
    sprL(c,-.34,-.02,.42,-.02,'#d8dde2',.06); sprL(c,0,-.26,0,.55,'#8f1d22',.05);
    sprC(c,-.36,-.22,.13,'#d8dde2'); sprC(c,.36,-.22,.13,'#d8dde2');
    sprL(c,.48,.08,1.04,-.64,'#d8dde2',.115); sprL(c,.4,-.04,.64,.12,'#e3b94e',.07); sprL(c,.48,.08,.33,.24,'#6e5136',.08);
  }
  c.restore();
  sprC(c,0,-.5,.38,'#f0c8a0');
  if(clsId === 'mage'){
    sprP(c,[-.45,-.62,.45,-.62,.06,-1.28],'#2f4d84'); sprE(c,0,-.6,.5,.1,'#2f4d84');
  } else if(clsId === 'taoist'){
    c.fillStyle='#2b2320'; c.beginPath(); c.arc(0,-.56,.37,Math.PI,TAU); c.fill();
    sprC(c,0,-.93,.13,'#2b2320'); sprL(c,.07,-.98,.18,-1.14,'#c0272d',.05);
  } else {
    c.fillStyle='#2b2320'; c.beginPath(); c.arc(0,-.54,.37,Math.PI,TAU); c.fill();
    sprL(c,-.36,-.58,.36,-.58,'#e3b94e',.055);
  }
  sprC(c,-.11,-.48,.05,'#333'); sprC(c,.11,-.48,.05,'#333');
  sprC(c,-.21,-.37,.05,'rgba(232,120,90,.45)'); sprC(c,.21,-.37,.05,'rgba(232,120,90,.45)');
  c.restore(); return true;
}


/* 精灵 key 映射：服务端怪物 id → 精灵库 key（没有的走通用体块） */
var MON_SPRITE = {
  ji:'ji', lu:'lu', daocaoren:'daocao', duogoumao:'duogou', dingpamao:'dingpa',
  hongshe:'hongshe', hushe:'hushe', banshouren:'banshou', banshouzhanshi:'bsys',
  senlinxueren:'xueren', xueren:'xueren', kulou:'kulou', dongqu:'dongqu',
  kulouzhanshi:'kuloujiang', kuloujiang:'kuloujiang', padi:'paxing',
  jiangshi:'jiangshi', kuangdong:'kuangjiang', huangyi:'jiangshi',
  shiwang:'shiwang', tielianshiwang:'tiejiang', heiseequ:'xiedu',
  hongyezhu:'hongye', heiyezhu:'heiye', xieshe:'xieshe', xiee:'jiaoying',
  banshouyongshi:'banshoutongling', tianlang:'duzhu', huawen:'duzhu', yuemo:'duzhu',
  xuejiangshi:'jiangshi', juxingru:'dongqu'
};
var BOSS_SPRITE = {
  boss_dingpa:'dingpawang', boss_hushe:'dushewang', boss_banshou:'banshoutongling',
  boss_kulou:'kuloujingling', boss_kuangdong:'shiweiwang', boss_shiwang:'shiwang',
  boss_qianchong:'xieziwang', boss_baiye:'baiyewang', boss_gangya:'duzhu',
  boss_zuma:'kuloujingling', boss_duojiao:'xieziwang'
};
function monsterSpriteKey(m){
  if(!m) return null;
  if(m.boss){
    if(BOSSES_BY_ID[m.key]) return BOSS_SPRITE[m.key] || null;
    if(m.key === 'shiwang') return 'shiwang';
    if(m.key === 'boss_woma' || m.key === 'boss_zhenwoma' || m.key === 'boss_chiyue') return null; // 自定义画
    return null;
  }
  return MON_SPRITE[m.key] || null;
}
/* 少量手写小精灵（精灵库里没有的怪）：蝙蝠 / 蜈蚣 / 蜜蜂 / 狼 / 双头怪 / 祖玛像 */
function sprMini(c, kind, s){
  if(kind === 'bat'){
    c.fillStyle = '#3a3a52';
    c.beginPath(); c.ellipse(-0.55, -0.25, 0.55, 0.28, -0.5, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0.55, -0.25, 0.55, 0.28, 0.5, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0, 0.25, 0.42, 0.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#4a4a66'; c.beginPath(); c.arc(0, -0.42, 0.34, 0, TAU); c.fill();
    c.fillStyle = '#e8443a'; c.beginPath(); c.arc(-0.12, -0.45, 0.05, 0, TAU); c.arc(0.12, -0.45, 0.05, 0, TAU); c.fill();
    c.fillStyle = '#3a3a52';
    c.beginPath(); c.moveTo(-0.28, -0.68); c.lineTo(-0.18, -0.95); c.lineTo(-0.05, -0.7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.28, -0.68); c.lineTo(0.18, -0.95); c.lineTo(0.05, -0.7); c.closePath(); c.fill();
  } else if(kind === 'centipede'){
    c.fillStyle = '#5a6a3a';
    for(var i = 0; i < 6; i++){ c.beginPath(); c.arc(-0.75 + i * 0.3, 0.15 + Math.sin(i * 1.2) * 0.12, 0.22, 0, TAU); c.fill(); }
    c.fillStyle = '#6a7a3a'; c.beginPath(); c.arc(0.85, 0.1, 0.28, 0, TAU); c.fill();
    c.fillStyle = '#c0272d'; c.beginPath(); c.arc(0.95, 0.02, 0.05, 0, TAU); c.fill();
    c.strokeStyle = '#3a4a22'; c.lineWidth = 0.06;
    for(var j = 0; j < 6; j++){ c.beginPath(); c.moveTo(-0.75 + j * 0.3, 0.3); c.lineTo(-0.8 + j * 0.3, 0.62); c.stroke(); c.beginPath(); c.moveTo(-0.75 + j * 0.3, 0.0); c.lineTo(-0.7 + j * 0.3, -0.3); c.stroke(); }
  } else if(kind === 'bee'){
    c.fillStyle = 'rgba(220,230,240,0.8)';
    c.beginPath(); c.ellipse(-0.3, -0.5, 0.34, 0.18, -0.5, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0.3, -0.5, 0.34, 0.18, 0.5, 0, TAU); c.fill();
    c.fillStyle = '#d9a62e'; c.beginPath(); c.ellipse(0, 0.1, 0.42, 0.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#33241a';
    c.fillRect(-0.42, -0.1, 0.84, 0.12); c.fillRect(-0.42, 0.22, 0.84, 0.12);
    c.fillStyle = '#222'; c.beginPath(); c.arc(0, -0.28, 0.3, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-0.1, -0.32, 0.06, 0, TAU); c.arc(0.1, -0.32, 0.06, 0, TAU); c.fill();
  } else if(kind === 'wolf'){
    c.fillStyle = '#8a8a8a';
    c.beginPath(); c.ellipse(0, 0.15, 0.62, 0.42, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(0.55, -0.35, 0.32, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(0.32, -0.55); c.lineTo(0.38, -0.88); c.lineTo(0.55, -0.6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.62, -0.6); c.lineTo(0.78, -0.88); c.lineTo(0.82, -0.52); c.closePath(); c.fill();
    c.fillStyle = '#6a6a6a'; c.beginPath(); c.ellipse(0.82, -0.28, 0.18, 0.12, 0, 0, TAU); c.fill();
    c.fillStyle = '#222'; c.beginPath(); c.arc(0.6, -0.4, 0.05, 0, TAU); c.fill();
    c.fillStyle = '#8a8a8a'; c.beginPath(); c.ellipse(-0.6, 0.05, 0.3, 0.12, 0.6, 0, TAU); c.fill();
    c.strokeStyle = '#6a6a6a'; c.lineWidth = 0.09;
    c.beginPath(); c.moveTo(-0.3, 0.5); c.lineTo(-0.32, 0.95); c.stroke();
    c.beginPath(); c.moveTo(0.3, 0.5); c.lineTo(0.32, 0.95); c.stroke();
  } else if(kind === 'twohead'){
    c.fillStyle = '#5a6a8a';
    c.beginPath(); c.ellipse(0, 0.2, 0.55, 0.5, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(-0.28, -0.45, 0.3, 0, TAU); c.fill();
    c.beginPath(); c.arc(0.28, -0.45, 0.3, 0, TAU); c.fill();
    c.fillStyle = '#e8443a';
    c.beginPath(); c.arc(-0.36, -0.48, 0.05, 0, TAU); c.arc(-0.2, -0.48, 0.05, 0, TAU); c.fill();
    c.beginPath(); c.arc(0.2, -0.48, 0.05, 0, TAU); c.arc(0.36, -0.48, 0.05, 0, TAU); c.fill();
    c.fillStyle = '#7a3a5a';
    c.beginPath(); c.moveTo(-0.5, -0.7); c.lineTo(-0.42, -0.98); c.lineTo(-0.28, -0.72); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.28, -0.72); c.lineTo(0.42, -0.98); c.lineTo(0.5, -0.7); c.closePath(); c.fill();
    c.strokeStyle = '#3a4a6a'; c.lineWidth = 0.1;
    c.beginPath(); c.moveTo(-0.3, 0.6); c.lineTo(-0.32, 0.95); c.stroke();
    c.beginPath(); c.moveTo(0.3, 0.6); c.lineTo(0.32, 0.95); c.stroke();
  } else if(kind === 'zuma'){
    c.fillStyle = '#6a6a8a';
    c.beginPath(); c.ellipse(0, 0.15, 0.5, 0.55, 0, 0, TAU); c.fill();
    c.fillStyle = '#7a7a94'; c.beginPath(); c.arc(0, -0.5, 0.38, 0, TAU); c.fill();
    c.fillStyle = '#8a8a9a';
    c.fillRect(-0.42, -0.82, 0.84, 0.12);
    c.fillStyle = '#3a3a4a';
    c.beginPath(); c.arc(-0.13, -0.52, 0.05, 0, TAU); c.arc(0.13, -0.52, 0.05, 0, TAU); c.fill();
    c.strokeStyle = '#4a4a5a'; c.lineWidth = 0.12;
    c.beginPath(); c.moveTo(-0.5, 0.1); c.lineTo(-0.85, 0.5); c.stroke();
    c.beginPath(); c.moveTo(0.5, 0.1); c.lineTo(0.85, -0.3); c.stroke();
    c.strokeStyle = '#c8ccd2'; c.lineWidth = 0.07;
    c.beginPath(); c.moveTo(0.85, -0.3); c.lineTo(0.85, 0.5); c.stroke();
  }
}
function miniSpriteKey(m){
  if(!m) return null;
  if(m.boss){
    if(m.key === 'boss_woma' || m.key === 'boss_zhenwoma') return 'womaLord';
    if(m.key === 'boss_chiyue') return 'twohead';
    if(m.key === 'boss_zuma') return 'zuma';
    return null;
  }
  switch(m.key){
    case 'bianfu': return 'bat';
    case 'wugong': case 'juxingru': return 'centipede';
    case 'tiaotiaofeng': return 'bee';
    case 'lang': return 'wolf';
    case 'shuangtoujingang': case 'shuangtouxuemo': return 'twohead';
    case 'zumashi': case 'zumadx': case 'zumagjs': return 'zuma';
    case 'kujiachong': case 'duojiaochong': case 'juxingduojiao': return 'zuma';
    case 'womazhanshi': case 'womazhanjiang': case 'womaweishi': return 'orcRed';
    case 'huoyanwoma': return 'orcFire';
    case 'xuejuren': return 'orcRed';
    default: return null;
  }
}

/* ============================================================
   状态
   ============================================================ */
var ME = null;             // 个人状态（{t:'me'}）
var SNAP = null;           // 世界快照（{t:'snapshot'}）
var ws = null, wsConnected = false, wsShouldBeOpen = false;
var mySlot = Number(lsGet(CHAR_KEY) || '1') || 1;
var chars = [null, null, null, null, null];
var claimUsed = false;
var roomCode = null, roomMembers = [];
var pendingRoom = null;    // null | 'create' | { join: 'XXXXX' }
var selectedClass = 'mage';
var shopData = null;
var auctionListings = [], auctionClaims = [];
var autoFight = false;
var autoPot = lsGet('lg_autopot') === 'on';
var moveVec = { x: 0, y: 0 };
var moveTarget = null;
var keys = {};
var cam = { x: 0, y: 0 };
var renderPos = { x: 0, y: 0 };
var floaters = [];         // 客户端飘字（世界坐标，左上角原点）
var lastSnapAt = 0;
var lastMoveSent = { x: 0, y: 0 }, lastMoveAt = 0, moveStopSent = true;
var lastAtkAt = 0, lastPickupAt = 0, lastPortalAt = 0, lastAutoPotAt = 0, lastHitSfxAt = 0;
var shopTab = 'equip', auctionTab = 'list';
var sellArmed = false;
var selBagIdx = -1;
var lastLevel = 0;
var wsRetry = 0;

/* 坐标换算：服务端中心原点 ↔ 客户端左上角原点 */
function stageOf(){ return (SNAP && SNAP.stage && STAGES_BY_ID[SNAP.stage]) || STAGES_BY_ID.city || { w: 2600, h: 2000, ground: '#3d4a26' }; }
function toClient(sx, sy){ var st = stageOf(); return { x: sx + st.w / 2, y: sy + st.h / 2 }; }
function toServer(cx, cy){ var st = stageOf(); return { x: cx - st.w / 2, y: cy - st.h / 2 }; }
function meSnap(){
  if(!SNAP || !SNAP.players) return null;
  for(var i = 0; i < SNAP.players.length; i++) if(SNAP.players[i].id === deviceId) return SNAP.players[i];
  return SNAP.players.length === 1 ? SNAP.players[0] : null;
}
function mePos(){
  var p = meSnap();
  if(p) return toClient(p.x, p.y);
  return { x: renderPos.x || 1300, y: renderPos.y || 1000 };
}

/* ============================================================
   REST
   ============================================================ */
function apiUrl(path){ return API_BASE + path; }
async function fetchJson(path, opts, timeoutMs){
  var ctrl = new AbortController();
  var t = setTimeout(function(){ ctrl.abort(); }, timeoutMs || 20000);
  try{
    var r = await fetch(apiUrl(path), Object.assign({ signal: ctrl.signal }, opts || {}));
    var j = await r.json().catch(function(){ return null; });
    if(!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  } finally { clearTimeout(t); }
}
async function apiHealth(){
  return fetchJson('/api/health', null, 20000);
}
async function apiCharacters(){
  return fetchJson('/api/characters?deviceId=' + encodeURIComponent(deviceId), null, 20000);
}
async function apiCreateChar(slot, name, cls){
  return fetchJson('/api/character', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId, slot: slot, name: name, cls: cls })
  });
}
async function apiDeleteChar(slot){
  return fetchJson('/api/character/' + slot, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId })
  });
}
async function apiClaim(code){
  return fetchJson('/api/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId, code: code })
  });
}

/* ============================================================
   提示 / 日志
   ============================================================ */
var toastTimer = null;
function toast(msg){
  var t = $('toast'); if(!t) return;
  t.textContent = msg; t.style.opacity = '1';
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.style.opacity = '0'; }, 2600);
}
function log(msg, cls){
  var box = $('logBox'); if(!box) return;
  var d = document.createElement('div');
  if(cls) d.className = cls;
  d.textContent = msg;
  box.appendChild(d);
  while(box.children.length > 7) box.removeChild(box.firstChild);
}
function addFloater(x, y, text, color){
  floaters.push({ x: x, y: y, text: text, color: color, t0: performance.now(), until: performance.now() + 900 });
  if(floaters.length > 40) floaters.shift();
}

/* ============================================================
   WebSocket
   ============================================================ */
function wsUrl(){
  if(API_BASE) return API_BASE.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
function wsSend(o){
  if(ws && ws.readyState === 1){ try{ ws.send(JSON.stringify(o)); }catch(e){} }
}
function connectWs(){
  if(ws && (ws.readyState === 1 || ws.readyState === 0)) return;
  wsShouldBeOpen = true;
  var url = wsUrl();
  try{ ws = new WebSocket(url); }catch(e){ toast('连不上服务器'); return; }
  ws.onopen = function(){
    wsConnected = true; wsRetry = 0;
    wsSend({ t: 'auth', deviceId: deviceId, slot: mySlot });
  };
  ws.onmessage = function(ev){
    var m = null;
    try{ m = JSON.parse(ev.data); }catch(e){ return; }
    onWsMessage(m);
  };
  ws.onclose = function(){
    wsConnected = false;
    if(wsShouldBeOpen && !$('gameScreen').classList.contains('hidden')){
      wsRetry++;
      if(wsRetry <= 3){
        log('与服务器断开，正在重连…', 'sys');
        setTimeout(connectWs, 1500 * wsRetry);
      } else {
        toast('与服务器断开了，点主菜单重进');
      }
    }
  };
  ws.onerror = function(){ /* 由 onclose 处理 */ };
}
function disconnectWs(){
  wsShouldBeOpen = false;
  if(ws){ try{ ws.close(); }catch(e){} ws = null; }
  wsConnected = false;
}

function onWsMessage(m){
  if(!m || !m.t) return;
  switch(m.t){
    case 'authed': {
      log('已进入：' + m.character.name + '（' + (CLASSES_BY_ID[m.character.cls] ? CLASSES_BY_ID[m.character.cls].name : m.character.cls) + ' Lv' + m.character.level + '）', 'good');
      if(pendingRoom && pendingRoom.join){
        wsSend({ t: 'join_room', code: pendingRoom.join });
        pendingRoom = null;
      } else {
        pendingRoom = null;
        wsSend({ t: 'create_room' });
      }
      break;
    }
    case 'room_joined': {
      roomCode = m.code;
      roomMembers = m.players || [];
      $('roomTag').classList.remove('hidden');
      $('roomTagCode').textContent = roomCode;
      $('roomTagMembers').textContent = roomMembers.length + ' 人';
      log('已在房间 ' + roomCode + '（' + roomMembers.length + ' 人）', 'good');
      break;
    }
    case 'room_update': {
      roomMembers = m.players || [];
      $('roomTagMembers').textContent = roomMembers.length + ' 人';
      break;
    }
    case 'room_left': {
      roomCode = null; roomMembers = [];
      $('roomTag').classList.add('hidden');
      break;
    }
    case 'me': {
      var prevLv = ME ? ME.level : 0;
      var prevHp = ME ? ME.hp : 0;
      ME = m;
      if(ME.level > prevLv && prevLv > 0){ toast('升级！现在 ' + ME.level + ' 级'); log('★ 升到 ' + ME.level + ' 级', 'good'); sfx('levelup'); }
      if(ME.hp < prevHp && prevHp > 0 && performance.now() - lastHitSfxAt > 150){ lastHitSfxAt = performance.now(); sfx('hit'); }
      lastLevel = ME.level;
      updateHUD();
      refreshOpenPanel();
      break;
    }
    case 'snapshot': {
      SNAP = m;
      lastSnapAt = performance.now();
      if(m.floats){
        for(var i = 0; i < m.floats.length; i++){
          var f = m.floats[i], p = toClient(f.x, f.y);
          addFloater(p.x, p.y, f.text, f.color || '#ffd76a');
          if(/^-/.test(f.text) && performance.now() - lastHitSfxAt > 150){ lastHitSfxAt = performance.now(); sfx('hit'); }
          if(/^\+.*金币/.test(f.text)) sfx('coin');
        }
      }
      if(m.stageName || m.stage){
        var st = stageOf();
        var label = (m.stageName || st.name) + (m.floorName ? ' · ' + m.floorName : '');
        $('mapNameTag').innerHTML = esc(label) + '<small>' + esc(st.desc || '') + '</small>';
      }
      $('darkBtn').classList.toggle('hidden', !(m.stage === 'wugong'));
      var me = meSnap();
      if(me && me.dead) $('deadTag').classList.remove('hidden');
      else $('deadTag').classList.add('hidden');
      break;
    }
    case 'toast': { if(m.msg){ toast(m.msg); log(m.msg); } break; }
    case 'notice':
    case 'system': { if(m.text || m.message) { toast(m.text || m.message); log(m.text || m.message, 'sys'); } break; }
    case 'error': {
      var msg = m.msg || m.message || m.error || '操作失败';
      toast('⚠️ ' + msg); sfx('error');
      if(msg === '房间码不对'){
        log('房间码不对，已为你建了单人房', 'bad');
        wsSend({ t: 'create_room' });
      }
      break;
    }
    case 'shop': {
      shopData = m;
      if(!$('panelRoot').innerHTML) break;
      renderShopBody();
      break;
    }
    case 'auction_list': {
      auctionListings = m.listings || [];
      if(auctionTab === 'list') renderAuctionBody();
      break;
    }
    case 'auction_created': { toast('已上架拍卖行'); sfx('pickup'); if(auctionTab === 'list'){ wsSend({ t: 'auction_list' }); } break; }
    case 'auction_bought': { toast('买下成功，去「领取」里取货'); sfx('pickup'); wsSend({ t: 'auction_claims' }); break; }
    case 'auction_delisted': { toast('已下架'); if(auctionTab === 'list') wsSend({ t: 'auction_list' }); break; }
    case 'auction_claimed': { toast('领取成功'); sfx('pickup'); wsSend({ t: 'auction_claims' }); break; }
    case 'auction_claims': {
      auctionClaims = m.claims || [];
      if(auctionTab === 'claims') renderAuctionBody();
      break;
    }
    case 'pong': break;
    default: break;
  }
}

/* ============================================================
   菜单
   ============================================================ */
function renderSlots(){
  var bar = $('slotBar');
  bar.innerHTML = '';
  for(var i = 0; i < 5; i++){
    (function(idx){
      var ch = chars[idx];
      var b = document.createElement('button');
      b.className = 'slot' + ((idx + 1) === mySlot ? ' sel' : '');
      if(ch){
        b.innerHTML = '<div class="snum">' + (idx + 1) + ' 号位</div><div class="sname">' + esc(ch.name) + '</div>' +
          '<div class="smeta">' + esc(CLASSES_BY_ID[ch.cls] ? CLASSES_BY_ID[ch.cls].name : ch.cls) + ' · Lv' + ch.level + '</div>';
      } else {
        b.innerHTML = '<div class="snum">' + (idx + 1) + ' 号位</div><div class="sempty">（空）</div>';
      }
      b.addEventListener('click', function(){
        mySlot = idx + 1;
        lsSet(CHAR_KEY, String(mySlot));
        renderSlots(); updateSlotInfo(); sfx('click');
      });
      bar.appendChild(b);
    })(i);
  }
}
function updateSlotInfo(){
  var ch = chars[mySlot - 1];
  $('slotInfo').innerHTML = ch
    ? '当前：<b>' + esc(ch.name) + '</b> · ' + esc(CLASSES_BY_ID[ch.cls] ? CLASSES_BY_ID[ch.cls].name : ch.cls) + ' Lv' + ch.level + ' · 金币 ' + fmt(ch.gold)
    : '当前：' + mySlot + ' 号位是空的，可以新建角色。';
}
function buildClassCards(){
  var grid = $('clsGrid');
  grid.innerHTML = '';
  ['war', 'mage', 'tao'].forEach(function(k){
    var c = CLASSES_BY_ID[k]; if(!c) return;
    var b = document.createElement('button');
    b.className = 'clsCard' + (k === selectedClass ? ' sel' : '');
    var count = (CLASS_SKILLS_BY_ID[k] || []).length;
    b.innerHTML = '<h3>' + c.face + ' ' + c.name + '</h3><p>' + esc(c.desc) + '</p>' +
      '<p class="stat">初始技能：' + esc(SKILLS_BY_ID[c.initialSkill] ? SKILLS_BY_ID[c.initialSkill].name : '') + ' · 技能共 ' + count + ' 门</p>';
    b.addEventListener('click', function(){
      selectedClass = k;
      var cards = grid.querySelectorAll('.clsCard');
      for(var j = 0; j < cards.length; j++) cards[j].classList.remove('sel');
      b.classList.add('sel'); sfx('click');
    });
    grid.appendChild(b);
  });
}
function buildStageList(){
  var el = $('stageList');
  el.innerHTML = '';
  STAGE_LIST.forEach(function(s){
    if(s.id === 'andian') return;
    var d = document.createElement('div');
    d.className = 'stage-chip' + (s.hidden ? ' hidden-map' : '');
    d.innerHTML = '<b>' + esc(s.name) + '</b><span>' + esc(s.desc || '') + '</span>';
    el.appendChild(d);
  });
  var d2 = document.createElement('div');
  d2.className = 'stage-chip hidden-map';
  d2.innerHTML = '<b>未知暗殿（隐藏）</b><span>只能从蜈蚣洞连接通道进</span>';
  el.appendChild(d2);
}
async function refreshSlots(){
  try{
    var r = await apiCharacters();
    chars = r.characters || [null, null, null, null, null];
    while(chars.length < 5) chars.push(null);
    renderSlots(); updateSlotInfo();
  }catch(e){
    toast('读取存档失败：' + e.message);
  }
}
async function loadMenu(){
  $('wake').classList.remove('hidden');
  $('wakeSpin').style.display = '';
  $('wakeRetry').classList.add('hidden');
  $('wakeMsg').textContent = '服务器唤醒中，请稍等……';
  var tries = 0;
  while(tries < 5){
    tries++;
    $('wakeMsg').textContent = '正在连接服务器（第 ' + tries + ' 次）……';
    try{
      var h = await apiHealth();
      claimUsed = !!h.claimUsed;
      $('wake').classList.add('hidden');
      $('claimCard').classList.toggle('hidden', claimUsed);
      $('menuFoot').textContent = '客户端 ' + CLIENT_VERSION + ' · 服务端 v1.0.0 · 在线 ' + (h.playersOnline || 0) + ' 人';
      await refreshSlots();
      return;
    }catch(e){
      $('wakeMsg').textContent = '还在唤醒（第 ' + tries + ' 次重试）……';
      await new Promise(function(res){ setTimeout(res, 4000); });
    }
  }
  $('wakeSpin').style.display = 'none';
  $('wakeMsg').textContent = '服务器唤醒失败，请检查网络后重试。';
  $('wakeRetry').classList.remove('hidden');
}

function enterGame(){
  var ch = chars[mySlot - 1];
  if(!ch){ toast('先选一个有角色的存档位（或新建角色）'); return; }
  pendingRoom = pendingRoom || 'create';
  ME = null; SNAP = null; floaters = [];
  $('menuScreen').classList.add('hidden');
  $('gameScreen').classList.remove('hidden');
  $('roomTag').classList.add('hidden');
  $('deadTag').classList.add('hidden');
  log('欢迎来到比奇城，点「传送」选图出发');
  resizeCanvas();
  connectWs();
  var rp = toClient(0, 0);
  renderPos.x = rp.x; renderPos.y = rp.y;
}
function backToMenu(){
  disconnectWs();
  wsRetry = 0;
  roomCode = null; roomMembers = []; pendingRoom = null;
  closePanel();
  $('gameScreen').classList.add('hidden');
  $('menuScreen').classList.remove('hidden');
  loadMenu();
}

/* ============================================================
   HUD（全部来自服务端 {t:'me'}）
   ============================================================ */
function updateHUD(){
  if(!ME) return;
  $('hudName').textContent = ME.name;
  var cleared = ME.cleared || {};
  var n = 0;
  for(var k in cleared) if(cleared[k] && k !== 'andian') n++;
  $('hudMeta').textContent = (CLASSES_BY_ID[ME.cls] ? CLASSES_BY_ID[ME.cls].name : ME.cls) + ' · ' + ME.level + ' 级 · 通关 ' + n + ' 图';
  updateBars();
}
function updateBars(){
  if(!ME) return;
  $('hpFill').style.width = clamp(ME.hp / Math.max(1, ME.maxHp) * 100, 0, 100) + '%';
  $('mpFill').style.width = clamp(ME.mp / Math.max(1, ME.maxMp) * 100, 0, 100) + '%';
  $('hpText').textContent = Math.ceil(ME.hp) + '/' + ME.maxHp;
  $('mpText').textContent = Math.floor(ME.mp) + '/' + ME.maxMp;
  $('expFill').style.width = clamp(ME.xp / Math.max(1, ME.xpNext) * 100, 0, 100) + '%';
  $('expText').textContent = fmt(ME.xp) + '/' + fmt(ME.xpNext);
  var mainLabel = ME.cls === 'mage' ? '魔法' : (ME.cls === 'tao' ? '道术' : '攻击');
  $('hudNums').innerHTML = '金币 <b>' + fmt(ME.gold) + '</b> · ' + mainLabel + ' <b>' + ME.atkLo + '~' + ME.atkHi + '</b> · 防御 <b>' + ME.def + '</b> · 魔御 <b>' + ME.mdef + '</b> · 准确 <b>' + ME.acc + '</b>';
  $('hpPotCnt').textContent = potionTotal(ME.hpPots);
  $('mpPotCnt').textContent = potionTotal(ME.mpPots);
  var now = performance.now();
  for(var i = 0; i < 2; i++){
    var slotEl = $('slot' + i), id = (ME.activeSkills || [])[i];
    if(!id){
      slotEl.querySelector('.sn').textContent = '（空）';
      slotEl.querySelector('.lv').textContent = '技能位 ' + (i + 1);
      slotEl.querySelector('.cdbar > div').style.width = '0%';
      slotEl.classList.remove('no-mp');
      continue;
    }
    var def = SKILLS_BY_ID[id];
    if(!def){ slotEl.querySelector('.sn').textContent = id; continue; }
    var sk = (ME.learned || {})[id];
    slotEl.querySelector('.sn').textContent = def.name;
    slotEl.querySelector('.lv').textContent = 'Lv' + (sk ? sk.lv : 1) + ' · 耗魔 ' + (def.mp || 0);
    var remain = Math.max(0, (ME.cds && ME.cds[id]) || 0);
    slotEl.querySelector('.cdbar > div').style.width = (def.cd ? (100 - remain / def.cd * 100) : 100) + '%';
    slotEl.classList.toggle('no-mp', ME.mp < (def.mp || 0));
  }
  $('btnAutoFight').classList.toggle('on', !!ME.auto);
  autoFight = !!ME.auto;
  $('btnAutoPot').classList.toggle('on', autoPot);
}
function useHpPot(){
  if(!ME) return;
  if(potionTotal(ME.hpPots) <= 0){ toast('红药用完了，回比奇城商店买'); return; }
  if(ME.hp >= ME.maxHp){ toast('血是满的'); return; }
  wsSend({ t: 'use_potion', kind: 'hp' });
}
function useMpPot(){
  if(!ME) return;
  if(potionTotal(ME.mpPots) <= 0){ toast('蓝药用完了，回比奇城商店买'); return; }
  if(ME.mp >= ME.maxMp){ toast('蓝是满的'); return; }
  wsSend({ t: 'use_potion', kind: 'mp' });
}
function castSlot(i){
  if(!ME) return;
  var id = (ME.activeSkills || [])[i];
  if(!id) return;
  wsSend({ t: 'skill', id: id });
  sfx('cast');
}

/* ============================================================
   主循环：输入 → 发移动/攻击/拾取 → 渲染
   ============================================================ */
var canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
var joyVec = { x: 0, y: 0 };
var lastTs = 0;
function resizeCanvas(){
  var w = $('stageWrap'); if(!w) return;
  canvas.width = w.clientWidth; canvas.height = w.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

function nearestMonster(maxR){
  if(!SNAP || !SNAP.monsters) return null;
  var p = mePos(), best = null, bd = maxR || 1e9;
  for(var i = 0; i < SNAP.monsters.length; i++){
    var m = SNAP.monsters[i];
    var q = toClient(m.x, m.y);
    var d = dist(p.x, p.y, q.x, q.y);
    if(d < bd){ bd = d; best = m; }
  }
  return best;
}
function nearestDrop(maxR){
  if(!SNAP || !SNAP.drops) return null;
  var p = mePos(), best = null, bd = maxR || 1e9;
  for(var i = 0; i < SNAP.drops.length; i++){
    var d = SNAP.drops[i];
    var q = toClient(d.x, d.y);
    var dd = dist(p.x, p.y, q.x, q.y);
    if(dd < bd){ bd = dd; best = d; }
  }
  return best;
}

function gameLoop(ts){
  requestAnimationFrame(gameLoop);
  if(!ME || !SNAP || $('gameScreen').classList.contains('hidden')) return;
  var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  var now = performance.now();
  var me = meSnap();
  if(!me) return;
  var p = mePos();
  /* 相机平滑跟随 */
  renderPos.x += (p.x - renderPos.x) * Math.min(1, dt * 10);
  renderPos.y += (p.y - renderPos.y) * Math.min(1, dt * 10);

  /* ---- 移动：摇杆 / 键盘 / 点按 ---- */
  var vx = 0, vy = 0;
  if(keys['w'] || keys['arrowup']) vy -= 1;
  if(keys['s'] || keys['arrowdown']) vy += 1;
  if(keys['a'] || keys['arrowleft']) vx -= 1;
  if(keys['d'] || keys['arrowright']) vx += 1;
  vx += joyVec.x; vy += joyVec.y;
  if((vx || vy) && moveTarget) moveTarget = null;
  if(moveTarget){
    var dx = moveTarget.x - p.x, dy = moveTarget.y - p.y, dd = Math.sqrt(dx * dx + dy * dy);
    if(dd < 10) moveTarget = null;
    else { vx = dx / dd; vy = dy / dd; }
  }
  var len = Math.sqrt(vx * vx + vy * vy);
  if(len > 1){ vx /= len; vy /= len; }
  if(now - lastMoveAt >= 100){
    lastMoveAt = now;
    if(vx || vy){
      wsSend({ t: 'move', x: +vx.toFixed(2), y: +vy.toFixed(2) });
      lastMoveSent = { x: vx, y: vy }; moveStopSent = false;
    } else if(!moveStopSent){
      wsSend({ t: 'move', x: 0, y: 0 });
      lastMoveSent = { x: 0, y: 0 }; moveStopSent = true;
    }
  }

  var inCity = SNAP.stage === 'city';
  if(!me.dead){
    /* ---- 走近自动普攻（还原原版手感；服务端只认 {t:'attack'}） ---- */
    if(!inCity && now - lastAtkAt > 900){
      var near = nearestMonster(95);
      if(near){ wsSend({ t: 'attack' }); lastAtkAt = now; }
    }
    /* ---- 走近自动拾取 ---- */
    if(now - lastPickupAt > 500){
      var drop = nearestDrop(60);
      if(drop){ wsSend({ t: 'pickup' }); lastPickupAt = now; sfx('pickup'); }
    }
    /* ---- 客户端自动喝药（服务端只在自动战斗/放技能时自动喝） ---- */
    if(autoPot && now - lastAutoPotAt > 1500){
      if(ME.hp < ME.maxHp * 0.35 && potionTotal(ME.hpPots) > 0){
        wsSend({ t: 'use_potion', kind: 'hp' }); lastAutoPotAt = now;
      } else if(ME.mp < ME.maxMp * 0.2 && potionTotal(ME.mpPots) > 0){
        wsSend({ t: 'use_potion', kind: 'mp' }); lastAutoPotAt = now;
      }
    }
    /* ---- 走进传送门自动下层 ---- */
    if(SNAP.portal && now - lastPortalAt > 1000){
      var pp = toClient(SNAP.portal.x, SNAP.portal.y);
      if(dist(p.x, p.y, pp.x, pp.y) < 80){ wsSend({ t: 'enter_portal' }); lastPortalAt = now; }
    }
  }

  /* ---- 洞口 / 下一层按钮 ---- */
  var holeBtn = $('enterHoleBtn'), portalBtn = $('portalBtn');
  if(SNAP.hole && SNAP.stage === 'jiangshi'){
    var hp2 = toClient(SNAP.hole.x, SNAP.hole.y);
    holeBtn.classList.toggle('hidden', dist(p.x, p.y, hp2.x, hp2.y) > 120 || !!me.dead);
  } else holeBtn.classList.add('hidden');
  if(SNAP.portal && SNAP.stage !== 'city'){
    var pp2 = toClient(SNAP.portal.x, SNAP.portal.y);
    portalBtn.classList.toggle('hidden', dist(p.x, p.y, pp2.x, pp2.y) > 80 || !!me.dead);
  } else portalBtn.classList.add('hidden');

  render(ts);
  updateBars();
  drawMinimap();
}

/* ============================================================
   输入
   ============================================================ */
window.addEventListener('keydown', function(e){
  var k = e.key.toLowerCase(); keys[k] = true;
  if(ME && !$('gameScreen').classList.contains('hidden')){
    if(k === '1') useHpPot();
    if(k === '2') useMpPot();
    if(k === ' ') { wsSend({ t: 'attack' }); e.preventDefault(); }
    if(['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
  }
});
window.addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('pointerdown', function(e){
  if(e.pointerType === 'touch') return;
  var rect = canvas.getBoundingClientRect();
  moveTarget = { x: cam.x + (e.clientX - rect.left), y: cam.y + (e.clientY - rect.top) };
});
(function(){
  var base = $('joyBase'), knob = $('joyKnob'), activeId = null;
  function setKnob(dx, dy){ knob.style.left = (32 + dx * 30) + 'px'; knob.style.top = (32 + dy * 30) + 'px'; }
  base.addEventListener('pointerdown', function(e){ activeId = e.pointerId; base.setPointerCapture(activeId); moveJoy(e); });
  base.addEventListener('pointermove', function(e){ if(e.pointerId === activeId) moveJoy(e); });
  function endJoy(e){ if(e.pointerId === activeId){ activeId = null; joyVec.x = 0; joyVec.y = 0; setKnob(0, 0); } }
  base.addEventListener('pointerup', endJoy);
  base.addEventListener('pointercancel', endJoy);
  function moveJoy(e){
    var r = base.getBoundingClientRect();
    var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    var l = Math.sqrt(dx * dx + dy * dy);
    if(l > 1){ dx /= l; dy /= l; }
    joyVec.x = dx; joyVec.y = dy; setKnob(dx, dy);
  }
})();
/* 技能栏左右拖动（位置记在 lg_skillbar_pos） */
(function(){
  var bar = $('bottomBar');
  var saved = null;
  try{ saved = JSON.parse(lsGet(SKILLBAR_KEY) || 'null'); }catch(e){}
  if(saved && typeof saved.dx === 'number') bar.style.transform = 'translateX(' + saved.dx + 'px)';
  var drag = null;
  bar.addEventListener('pointerdown', function(e){
    if(e.target !== bar) return;
    drag = { x0: e.clientX, dx0: 0 };
    var m = /translateX\((-?\d+)px\)/.exec(bar.style.transform || '');
    drag.dx0 = m ? Number(m[1]) : 0;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', function(e){
    if(!drag) return;
    var dx = clamp(drag.dx0 + (e.clientX - drag.x0), -160, 160);
    bar.style.transform = 'translateX(' + dx + 'px)';
    drag.dx = dx;
  });
  bar.addEventListener('pointerup', function(){
    if(drag){ lsSet(SKILLBAR_KEY, JSON.stringify({ dx: drag.dx || 0 })); drag = null; }
  });
})();

/* ============================================================
   渲染
   ============================================================ */
function hexRgb(hex){
  var n = parseInt(String(hex || '#888888').slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function lighten(hex, amt){ var c = hexRgb(hex); return 'rgb(' + Math.min(255, c[0] + amt) + ',' + Math.min(255, c[1] + amt) + ',' + Math.min(255, c[2] + amt) + ')'; }
function darken(hex, amt){ var c = hexRgb(hex); return 'rgb(' + Math.max(0, c[0] - amt) + ',' + Math.max(0, c[1] - amt) + ',' + Math.max(0, c[2] - amt) + ')'; }

function render(now){
  var W = canvas.width, H = canvas.height;
  var st = stageOf();
  cam.x = clamp(renderPos.x - W / 2, 0, Math.max(0, st.w - W));
  cam.y = clamp(renderPos.y - H / 2, 0, Math.max(0, st.h - H));
  if(st.w < W) cam.x = (st.w - W) / 2;
  if(st.h < H) cam.y = (st.h - H) / 2;
  ctx.fillStyle = st.ground || '#3d4a26'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1;
  var gs = 90;
  ctx.beginPath();
  for(var gx = -cam.x % gs; gx < W; gx += gs){ ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
  for(var gy = -cam.y % gs; gy < H; gy += gs){ ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
  ctx.stroke();

  if(SNAP.stage === 'city') drawCity(now);

  /* 火墙（服务端下发 walls） */
  if(SNAP.walls){
    for(var zi = 0; zi < SNAP.walls.length; zi++){
      var z = SNAP.walls[zi], zx = z.x + st.w / 2 - cam.x, zy = z.y + st.h / 2 - cam.y;
      var fl = 0.75 + Math.sin(now / 90 + zi) * 0.25;
      ctx.fillStyle = 'rgba(255,110,30,' + (0.30 * fl) + ')';
      ctx.beginPath(); ctx.ellipse(zx, zy, z.r, z.r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,60,' + (0.5 * fl) + ')';
      for(var f = 0; f < 7; f++){
        var fx = zx + Math.cos(f * 2.4 + zi) * z.r * 0.6, fy = zy + Math.sin(f * 2.4 + zi) * z.r * 0.3;
        ctx.beginPath(); ctx.ellipse(fx, fy - 8 * fl, 7, 14 * fl, 0, 0, TAU); ctx.fill();
      }
    }
  }
  /* 传送门 */
  if(SNAP.portal){
    var pp = toClient(SNAP.portal.x, SNAP.portal.y);
    var px = pp.x - cam.x, py = pp.y - cam.y;
    var pulse = 0.6 + Math.sin(now / 200) * 0.25;
    ctx.fillStyle = 'rgba(150,90,255,' + (0.35 * pulse) + ')';
    ctx.beginPath(); ctx.ellipse(px, py, 46, 30, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,255,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(px, py, 40, 24, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#d8c2ff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('传送门', px, py - 34);
  }
  /* 尸王殿洞口 */
  if(SNAP.hole){
    var hp = toClient(SNAP.hole.x, SNAP.hole.y);
    var hx = hp.x - cam.x, hy = hp.y - cam.y;
    ctx.fillStyle = '#2e2118';
    ctx.beginPath(); ctx.ellipse(hx, hy, 42, 26, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0605';
    ctx.beginPath(); ctx.ellipse(hx, hy, 32, 19, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f0d47a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(hx, hy, 44, 28, 0, 0, TAU); ctx.stroke();
    var zs = SNAP.hole.zombieState;
    if(zs === 'climbing'){
      ctx.save(); ctx.translate(hx, hy - 6); ctx.scale(20, 20);
      sprZombie(ctx, '#8fa393', '#c9a44a', {});
      ctx.restore();
    } else if(zs === 'out'){
      drawMonsterAt(hx + 48, hy + 10, { key: 'huangyi', name: '黄衣僵尸', boss: false }, 21, now);
    }
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🕳️', hx, hy - 34);
  }
  /* 掉落 */
  if(SNAP.drops){
    for(var di = 0; di < SNAP.drops.length; di++){
      var d = SNAP.drops[di], dp = toClient(d.x, d.y);
      var dx = dp.x - cam.x, dy = dp.y - cam.y;
      if(dx < -40 || dy < -40 || dx > W + 40 || dy > H + 40) continue;
      var glow = 0.7 + Math.sin(now / 240 + di) * 0.3;
      if(d.kind === 'gold'){
        ctx.fillStyle = 'rgba(240,212,122,' + glow + ')';
        ctx.beginPath(); ctx.arc(dx, dy, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8a6d1f'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('金', dx, dy + 4);
      } else if(d.kind === 'skillbook'){
        ctx.fillStyle = 'rgba(127,199,232,' + glow + ')';
        ctx.fillRect(dx - 10, dy - 13, 20, 26);
        ctx.fillStyle = '#0d2a3a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('书', dx, dy + 4);
      } else if(d.kind === 'potion'){
        ctx.fillStyle = d.name && /蓝/.test(d.name) ? 'rgba(122,184,232,' + glow + ')' : 'rgba(224,88,74,' + glow + ')';
        ctx.beginPath(); ctx.arc(dx, dy, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('药', dx, dy + 3.5);
      } else {
        ctx.fillStyle = 'rgba(192,122,255,' + glow + ')';
        ctx.beginPath(); ctx.moveTo(dx, dy - 12); ctx.lineTo(dx + 10, dy); ctx.lineTo(dx, dy + 12); ctx.lineTo(dx - 10, dy); ctx.closePath(); ctx.fill();
      }
      if(d.locked){
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🔒', dx + 14, dy - 8);
      }
    }
  }
  /* 怪物 */
  if(SNAP.monsters){
    for(var mi = 0; mi < SNAP.monsters.length; mi++){
      var m = SNAP.monsters[mi], mp = toClient(m.x, m.y);
      drawMonsterAt(mp.x - cam.x, mp.y - cam.y, m, m.boss ? 30 : 21, now);
    }
  }
  /* 召唤物 / 诱惑怪 */
  if(SNAP.pets){
    for(var si = 0; si < SNAP.pets.length; si++){
      var pet = SNAP.pets[si], pp2 = toClient(pet.x, pet.y);
      var isBeast = /神兽/.test(pet.name || '');
      drawMonsterAt(pp2.x - cam.x, pp2.y - cam.y, { key: isBeast ? 'shenshou' : 'kulou', name: pet.name, boss: false }, isBeast ? 27 : 20, now, true);
    }
  }
  /* 其他玩家 + 自己 */
  if(SNAP.players){
    for(var pi = 0; pi < SNAP.players.length; pi++){
      var pl = SNAP.players[pi], plp = toClient(pl.x, pl.y);
      drawOtherPlayer(pl, plp.x - cam.x, plp.y - cam.y, now);
    }
  }
  /* 弹道（服务端下发 projectiles） */
  if(SNAP.projectiles){
    for(var pj = 0; pj < SNAP.projectiles.length; pj++){
      var pr = SNAP.projectiles[pj], prp = toClient(pr.x, pr.y);
      var prx = prp.x - cam.x, pry = prp.y - cam.y;
      var col = pr.kind === 'huofu' ? '#ffb84a' : (pr.kind === 'bigfire' ? '#ff9a3a' : (pr.kind === 'tornado' ? '#96dcff' : (pr.kind === 'basic' ? '#e8e8e8' : '#ff7a3a')));
      if(pr.kind === 'tornado'){
        ctx.strokeStyle = 'rgba(150,220,255,0.85)'; ctx.lineWidth = 4;
        for(var ring = 0; ring < 3; ring++){
          ctx.beginPath();
          ctx.ellipse(prx, pry, 34 * (0.4 + ring * 0.3), 34 * (0.22 + ring * 0.16), (now / 300) + ring, 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(prx, pry, pr.kind === 'bigfire' ? 10 : 7, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
  /* 飘字 */
  floaters = floaters.filter(function(f){ return now < f.until; });
  ctx.textAlign = 'center';
  for(var fi = 0; fi < floaters.length; fi++){
    var fl2 = floaters[fi], age = (now - fl2.t0) / 900;
    ctx.globalAlpha = 1 - age;
    ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = fl2.color;
    ctx.fillText(fl2.text, fl2.x - cam.x, fl2.y - cam.y - age * 26);
  }
  ctx.globalAlpha = 1;
  /* 洞口在屏幕外时，边缘方向箭头 + 距离 */
  if(SNAP.hole && SNAP.stage === 'jiangshi'){
    var hp3 = toClient(SNAP.hole.x, SNAP.hole.y);
    var hx3 = hp3.x - cam.x, hy3 = hp3.y - cam.y;
    if(hx3 < -20 || hy3 < -20 || hx3 > W + 20 || hy3 > H + 20){
      var ex = clamp(hx3, 40, W - 40), ey = clamp(hy3, 40, H - 40);
      var ang = Math.atan2(hy3 - ey, hx3 - ex);
      var dd3 = Math.round(dist(mePos().x, mePos().y, hp3.x, hp3.y));
      ctx.save();
      ctx.translate(ex, ey); ctx.rotate(ang);
      ctx.fillStyle = '#f0d47a';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f0d47a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🕳️ ' + dd3, ex, ey - 16);
    }
  }
}

function drawMonsterAt(x, y, m, r, now, friendly){
  if(x < -70 || y < -90 || x > canvas.width + 70 || y > canvas.height + 90) return;
  var key = monsterSpriteKey(m);
  var mini = !key ? miniSpriteKey(m) : null;
  /* 贴地阴影 */
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.82, r * 0.95, r * 0.32, 0, 0, TAU); ctx.fill();
  if(key){
    ctx.save(); ctx.translate(x, y + r * 0.1); drawMonsterSprite(ctx, key, r); ctx.restore();
  } else if(mini === 'orcRed' || mini === 'orcFire'){
    ctx.save(); ctx.translate(x, y + r * 0.1);
    if(mini === 'orcFire') sprOrc(ctx, '#c25a2e', true);
    else sprOrc(ctx, '#8a3a3a', true);
    ctx.restore();
  } else if(mini === 'womaLord'){
    ctx.save(); ctx.translate(x, y + r * 0.1);
    sprOrc(ctx, '#3a8a5a', true);
    ctx.fillStyle = 'rgba(60,180,90,0.55)';
    var flap = Math.sin(now / 160) * 8;
    ctx.beginPath(); ctx.ellipse(-r - 8, -6 - flap, 16, 7, -0.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r + 8, -6 - flap, 16, 7, 0.6, 0, TAU); ctx.fill();
    ctx.restore();
  } else if(mini){
    ctx.save(); ctx.translate(x, y + r * 0.1); ctx.scale(r, r); sprMini(ctx, mini, r); ctx.restore();
  } else {
    drawCreatureFallback(x, y, (MONSTERS_BY_ID[m.key] && MONSTERS_BY_ID[m.key].color) || '#8a7f6a', r, m.boss, now);
  }
  if(m.boss){ ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('👑', x, y - r * 1.62); }
  ctx.font = (m.boss ? 'bold 14px' : '12px') + ' sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = m.boss ? '#ffb03a' : (friendly ? '#aef0a0' : '#e8e2cc');
  ctx.fillText(m.name, x, y - r * 1.32);
  var bw = m.boss ? 74 : 52;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, y - r * 1.26, bw, 6);
  ctx.fillStyle = m.boss ? '#e07830' : '#c0392b';
  ctx.fillRect(x - bw / 2 + 1, y - r * 1.26 + 1, (bw - 2) * clamp(m.hp / Math.max(1, m.maxHp), 0, 1), 4);
}
function drawCreatureFallback(x, y, color, r, isBoss, now){
  var g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, lighten(color, 38)); g.addColorStop(0.55, color); g.addColorStop(1, darken(color, 42));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.82, r, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = lighten(color, 18);
  ctx.beginPath(); ctx.arc(x, y - r * 0.78, r * 0.44, 0, TAU); ctx.fill();
  ctx.fillStyle = isBoss ? '#ffb03a' : '#ffe14a';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(x - r * 0.16, y - r * 0.8, 2.4, 0, TAU); ctx.arc(x + r * 0.16, y - r * 0.8, 2.4, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
}
function drawOtherPlayer(pl, x, y, now){
  if(x < -70 || y < -90 || x > canvas.width + 70 || y > canvas.height + 90) return;
  var isMe = pl.id === deviceId;
  var bodyColor = pl.cls === 'war' ? '#8a4a3a' : (pl.cls === 'mage' ? '#3a5a8a' : '#4a7a52');
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 24, 8, 0, 0, TAU); ctx.fill();
  if(isMe && ME && ME.shield > 0){
    ctx.strokeStyle = 'rgba(140,200,255,0.75)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y - 4, 34 + Math.sin(now / 240) * 2, 0, TAU); ctx.stroke();
  }
  if(pl.dead) ctx.globalAlpha = 0.45;
  var g = ctx.createLinearGradient(x, y - 30, x, y + 26);
  g.addColorStop(0, lighten(bodyColor, 40)); g.addColorStop(1, darken(bodyColor, 36));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 24, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  ctx.fillStyle = '#e8c39a'; ctx.beginPath(); ctx.arc(x, y - 28, 10, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(x, y - 31, 10, Math.PI, TAU); ctx.fill();
  ctx.strokeStyle = pl.cls === 'mage' ? '#b08ae8' : (pl.cls === 'tao' ? '#8ae08a' : '#d8d8e0'); ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(x + 14, y + 8); ctx.lineTo(x + 30, y - 14); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = isMe ? '#f0d47a' : '#ffffff';
  ctx.fillText(pl.name, x, y - 48);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 24, y - 44, 48, 5);
  ctx.fillStyle = pl.dead ? '#888888' : '#c0392b';
  ctx.fillRect(x - 23, y - 43, 46 * clamp(pl.hp / Math.max(1, pl.maxHp), 0, 1), 3);
}
function drawCity(now){
  var W = canvas.width, H = canvas.height;
  var st = STAGES_BY_ID.city;
  /* 护城河 */
  ctx.strokeStyle = '#2e5a6a'; ctx.lineWidth = 34;
  ctx.strokeRect(150 - cam.x, 120 - cam.y, st.w - 300, st.h - 240);
  ctx.strokeStyle = '#4a7a8a'; ctx.lineWidth = 3;
  ctx.strokeRect(132 - cam.x, 102 - cam.y, st.w - 264, st.h - 204);
  /* 城墙 */
  ctx.strokeStyle = '#6a5a44'; ctx.lineWidth = 26;
  ctx.strokeRect(180 - cam.x, 150 - cam.y, st.w - 360, st.h - 300);
  ctx.strokeStyle = '#857052'; ctx.lineWidth = 3;
  ctx.strokeRect(168 - cam.x, 138 - cam.y, st.w - 336, st.h - 276);
  /* 中央广场（石板） */
  ctx.fillStyle = 'rgba(190,175,140,0.25)';
  ctx.beginPath(); ctx.ellipse(1300 - cam.x, 1000 - cam.y, 260, 190, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(220,205,170,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(1300 - cam.x, 1000 - cam.y, 260, 190, 0, 0, TAU); ctx.stroke();
  /* 池塘 */
  ctx.fillStyle = 'rgba(70,130,170,0.75)';
  ctx.beginPath(); ctx.ellipse(2050 - cam.x, 1650 - cam.y, 130, 70, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#9ac8e0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(2050 - cam.x, 1650 - cam.y, 130, 70, 0, 0, TAU); ctx.stroke();
  /* 树 */
  var trees = [[420, 420], [2200, 420], [420, 1650], [900, 300], [1700, 300], [300, 1000], [2300, 1000], [900, 1750], [1500, 1750]];
  for(var ti = 0; ti < trees.length; ti++){
    var tx = trees[ti][0] - cam.x, ty = trees[ti][1] - cam.y;
    if(tx < -40 || ty < -40 || tx > W + 40 || ty > H + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(tx, ty + 16, 16, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2e5a2e';
    ctx.beginPath(); ctx.arc(tx, ty, 17, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a8a3a';
    ctx.beginPath(); ctx.arc(tx - 4, ty - 5, 11, 0, TAU); ctx.fill();
  }
  /* 建筑 */
  var shops = [['皇宫', 1300, 330, '#7a3a3a', 190, 110], ['药店', 640, 560, '#5a6a3a', 120, 84], ['武器店', 1880, 560, '#5a4a6a', 120, 84],
    ['服装店', 640, 1330, '#6a5a3a', 120, 84], ['首饰店', 1880, 1330, '#3a5a6a', 120, 84], ['书店', 1300, 1620, '#4a5a7a', 120, 84],
    ['拍卖行', 1300, 760, '#6a3a5a', 170, 96], ['仓库', 960, 1620, '#555038', 110, 80]];
  for(var i = 0; i < shops.length; i++){
    var s = shops[i], sx = s[1] - cam.x, sy = s[2] - cam.y;
    if(sx < -220 || sy < -160 || sx > W + 220 || sy > H + 160) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx, sy + s[5] * 0.6, s[4] * 0.6, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = s[3]; ctx.fillRect(sx - s[4] / 2, sy - s[5] / 2, s[4], s[5]);
    ctx.fillStyle = '#3a3230';
    ctx.beginPath(); ctx.moveTo(sx - s[4] / 2 - 12, sy - s[5] / 2); ctx.lineTo(sx, sy - s[5] / 2 - 30); ctx.lineTo(sx + s[4] / 2 + 12, sy - s[5] / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0d47a'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(s[0], sx, sy + 5);
  }
  /* 传送员 */
  var tx2 = 1300 - cam.x, ty2 = 1120 - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(tx2, ty2 + 20, 20, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d4af37';
  ctx.beginPath(); ctx.ellipse(tx2, ty2, 14, 20, 0, 0, TAU); ctx.fill();
  ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0d47a';
  ctx.fillText('传送员', tx2, ty2 - 30);
  /* 中央广场字 */
  ctx.font = '26px serif'; ctx.fillStyle = 'rgba(240,212,122,0.35)';
  ctx.fillText('比 奇 城', 1300 - cam.x, 1000 - cam.y);
}

/* ---------------- 小地图 / 大地图 ---------------- */
function drawMapDots(c2, w, h){
  var st = stageOf();
  var sx = w / st.w, sy = h / st.h;
  c2.fillStyle = SNAP.stage === 'city' ? '#2c331e' : '#1c1a14'; c2.fillRect(0, 0, w, h);
  if(SNAP.monsters){
    for(var i = 0; i < SNAP.monsters.length; i++){
      var m = SNAP.monsters[i];
      var mx = (m.x + st.w / 2) * sx, my = (m.y + st.h / 2) * sy;
      c2.fillStyle = m.boss ? '#ff8c2e' : '#e04838';
      c2.beginPath(); c2.arc(mx, my, m.boss ? 4 : 2.4, 0, TAU); c2.fill();
      if(m.boss){ c2.font = '10px sans-serif'; c2.fillStyle = '#ffb03a'; c2.fillText(m.name, mx + 6, my + 3); }
    }
  }
  if(SNAP.drops){
    c2.fillStyle = '#f0d47a';
    for(var di = 0; di < SNAP.drops.length; di++){
      var d = SNAP.drops[di];
      c2.beginPath(); c2.arc((d.x + st.w / 2) * sx, (d.y + st.h / 2) * sy, 2, 0, TAU); c2.fill();
    }
  }
  if(SNAP.portal){
    c2.fillStyle = '#b07aff';
    c2.beginPath(); c2.arc((SNAP.portal.x + st.w / 2) * sx, (SNAP.portal.y + st.h / 2) * sy, 4, 0, TAU); c2.fill();
  }
  if(SNAP.hole){
    var hx = (SNAP.hole.x + st.w / 2) * sx, hy = (SNAP.hole.y + st.h / 2) * sy;
    c2.strokeStyle = '#f0d47a'; c2.lineWidth = 2;
    c2.beginPath(); c2.arc(hx, hy, 8, 0, TAU); c2.stroke();
    c2.font = '12px sans-serif'; c2.fillText('🧟', hx + 8, hy + 4);
  }
  if(SNAP.players){
    for(var pi = 0; pi < SNAP.players.length; pi++){
      var pl = SNAP.players[pi];
      var px = (pl.x + st.w / 2) * sx, py = (pl.y + st.h / 2) * sy;
      if(pl.id === deviceId){
        c2.strokeStyle = '#f0d47a'; c2.lineWidth = 2;
        c2.beginPath(); c2.arc(px, py, 6 + Math.sin(performance.now() / 220) * 1.6, 0, TAU); c2.stroke();
        c2.fillStyle = '#f0d47a';
        c2.beginPath(); c2.arc(px, py, 2.6, 0, TAU); c2.fill();
        c2.font = 'bold 10px sans-serif'; c2.fillText('我', px + 8, py + 3);
      } else {
        c2.fillStyle = '#ffffff';
        c2.beginPath(); c2.arc(px, py, 2.6, 0, TAU); c2.fill();
      }
    }
  }
}
function drawMinimap(){
  var mm = $('minimap'); if(!mm || !SNAP) return;
  drawMapDots(mm.getContext('2d'), mm.width, mm.height);
}
$('minimap').addEventListener('click', function(){
  if(!SNAP) return;
  $('bigMapOverlay').classList.remove('hidden');
  drawMapDots($('bigMapCanvas').getContext('2d'), 860, 645);
});
$('bigMapOverlay').addEventListener('click', function(){ $('bigMapOverlay').classList.add('hidden'); });

/* ============================================================
面板
============================================================ */
var currentPanel = null;
function openPanel(html){
$('panelRoot').innerHTML = '<div class="overlay"><div class="panel">' + html +
'<div class="row" style="margin-top:1rem"><button onclick="closePanel()">关闭</button></div></div></div>';
}
function closePanel(){ $('panelRoot').innerHTML = ''; currentPanel = null;}
window.closePanel = closePanel;

function bagSignature(){
if(!ME) return '';
var w = [];
for(var i = 0; i < SLOT_ORDER_LIST.length; i++){ var it = (ME.worn || {})[SLOT_ORDER_LIST[i]]; w.push(it? it.uid: '');}
var b = (ME.bag || []).map(function(x){ return x.uid;}).join(',');
return w.join('|') + '#' + b + '#' + (ME.books || []).join(',') + '#' + ME.gold;
}
function skillsSignature(){
if(!ME) return '';
return (ME.activeSkills || []).join(',') + '#' + Object.keys(ME.learned || {}).sort().join(',');
}
var lastBagSig = '', lastSkillsSig = '';
function refreshOpenPanel(){
if(currentPanel === 'bag'){
var s = bagSignature();
if(s!== lastBagSig){ lastBagSig = s; renderBag();}
} else if(currentPanel === 'skills'){
var s2 = skillsSignature();
if(s2!== lastSkillsSig){ lastSkillsSig = s2; renderSkills();}
}
}

function openBag(){
if(!ME) return;
currentPanel = 'bag'; lastBagSig = bagSignature();
renderBag();
}
function renderBag(){
if(!ME) return;
var inCity = SNAP && SNAP.stage === 'city';
var h = '<h2>背包 · 人物</h2>';
h += '<p class="note">' + esc(ME.name) + ' · ' + esc(CLASSES_BY_ID[ME.cls]? CLASSES_BY_ID[ME.cls].name: ME.cls) + ' ' + ME.level + '级 · 金币 <b>' + fmt(ME.gold) + '</b> · 红药 ' + potionTotal(ME.hpPots) + ' / 蓝药 ' + potionTotal(ME.mpPots) + '<br/>' +
'生命 ' + ME.maxHp + ' · 魔法 ' + ME.maxMp + ' · 防御 ' + ME.def + ' · 魔御 ' + ME.mdef + ' · 准确 ' + ME.acc + '（异职业装备穿上不计属性）</p>';
h += '<h3>穿戴（9 个位置）— 点装备卸下</h3><div class="equipGrid">';
for(var i = 0; i < SLOT_ORDER_LIST.length; i++){
var k = SLOT_ORDER_LIST[i], it = (ME.worn || {})[k];
h += '<div class="equipSlot" onclick="unequipItem(\'' + k + '\')"><div class="sl">' + SLOT_LABEL_MAP[k] + '</div>' +
(it? '<div class="it">' + esc(it.name) + (it.jp? ' ·极品': '') + (it.enh? ' +' + it.enh: '') + '</div><div class="st">' + esc(itemStatsText(it)) + '<br/>' + esc(clsName(it.cls)) + '</div>': '<div class="st">（空）</div>') + '</div>';
}
h += '</div>';
if(inCity){
h += '<div class="row" style="margin:.6rem 0"><button onclick="repairAll()">维修全部已穿装备</button>' +
'<button onclick="toggleSellMode()">' + (sellArmed? '出售模式：已开启（点装备即卖）': '开启出售模式') + '</button></div>';
}
h += '<h3>背包（' + (ME.bag || []).length + '/40）— 点装备穿上 / 点书学习</h3><div class="bagGrid">';
var books = ME.books || [];
if(!(ME.bag || []).length &&!books.length) h += '<p class="note">背包是空的，去打怪爆装备和技能书吧。</p>';
for(var j = 0; j < (ME.bag || []).length; j++){
var b = ME.bag[j];
h += '<div class="bagItem' + (b.epic || b.jp? ' epic': '') + '" onclick="bagItemClick(' + j + ')"><div class="it">' + esc(b.name) + ((b.epic || b.jp)? ' ·极品': '') + (b.enh? ' +' + b.enh: '') + '</div><div class="st">' +
esc(slotLabel(b.slot)) + ' · ' + esc(clsName(b.cls)) + '<br/>' + esc(itemStatsText(b)) + '</div></div>';
}
for(var k2 = 0; k2 < books.length; k2++){
var sid = books[k2], sd = SKILLS_BY_ID[sid];
if(!sd) continue;
h += '<div class="bagItem book" onclick="useBook(\'' + sid + '\')"><div class="it">《' + esc(sd.name) + '》</div><div class="st">' +
esc(CLASSES_BY_ID[sd.cls]? CLASSES_BY_ID[sd.cls].name: sd.cls) + '技能 · ' + sd.req + ' 级可学<br/>' + esc(sd.desc) + '</div></div>';
}
h += '</div>';
if(inCity) h += '<p class="note" style="margin-top:.7rem">卖装备：先开启「出售模式」，再点装备即卖（按估价卖）；没开出售模式时点装备 = 穿上。手镯 / 戒指有两个位置，会先填空位，两边都满时替换属性较弱的那件。</p>';
openPanel(h);
}
function bagItemClick(idx){
var it = (ME.bag || [])[idx]; if(!it) return;
if(SNAP && SNAP.stage === 'city' && sellArmed){
wsSend({ t: 'sell', uid: it.uid});
return;
}
wsSend({ t: 'equip', uid: it.uid});
sfx('click');
}
function unequipItem(slot){
var it = (ME.worn || {})[slot]; if(!it) return;
wsSend({ t: 'unequip', slot: slot});
sfx('click');
}
function useBook(sid){
var sd = SKILLS_BY_ID[sid]; if(!sd) return;
if(sd.cls!== ME.cls){ toast('这是' + (CLASSES_BY_ID[sd.cls]? CLASSES_BY_ID[sd.cls].name: sd.cls) + '的技能书，你学不了，先留着吧'); return;}
if((ME.learned || {})[sid]){ toast('已经学会了'); return;}
if(ME.level < sd.req){ toast('等级不够：' + sd.req + ' 级才能学《' + sd.name + '》'); return;}
wsSend({ t: 'use_book', bookId: sid});
sfx('pickup');
}
function repairAll(){ wsSend({ t: 'repair_all'});}
function toggleSellMode(){ sellArmed =!sellArmed; toast(sellArmed? '出售模式已开启：点背包装备即卖': '出售模式已关闭'); renderBag();}
window.bagItemClick = bagItemClick; window.unequipItem = unequipItem; window.useBook = useBook;
window.repairAll = repairAll; window.toggleSellMode = toggleSellMode;

function openSkills(){
if(!ME) return;
currentPanel = 'skills'; lastSkillsSig = skillsSignature();
renderSkills();
}
function renderSkills(){
if(!ME) return;
var h = '<h2>技能</h2><p class="note">选 2 门主动技能上场，两门各自按冷却同时释放。被动技能习得即生效、不占位置。熟练度：每次命中 +1，满 1000 升一级（最高 4 级）。已学 ' +
Object.keys(ME.learned || {}).length + ' 门。</p>';
var ids = CLASS_SKILLS_BY_ID[ME.cls] || [];
for(var i = 0; i < ids.length; i++){
var id = ids[i], def = SKILLS_BY_ID[id]; if(!def) continue;
var learned = (ME.learned || {})[id];
var inSlot = (ME.activeSkills || []).indexOf(id);
h += '<div class="skillRow"><div class="si"><div class="sn2">' + esc(def.name) +
(learned? ' <span style="color:var(--gold)">Lv' + learned.lv + '</span> · 熟练 ' + (learned.casts || 0) + '/1000': ' <span style="color:var(--dim)">未学 · ' + def.req + '级技能书</span>') +
(def.passive? ' · 被动': '') + '</div><div class="sd">' + esc(def.desc) + '</div></div>';
if(learned &&!def.passive){
if(inSlot >= 0) h += '<button onclick="skillOff(\'' + id + '\')">下场</button>';
else h += '<button onclick="skillOn(\'' + id + '\')" ' + ((ME.activeSkills || []).length >= 2? 'disabled': '') + '>上场</button>';
}
h += '</div>';
}
h += '<p class="note">当前上场：' + ((ME.activeSkills || []).map(function(id){ return SKILLS_BY_ID[id]? SKILLS_BY_ID[id].name: id;}).join('、') || '无') + '</p>';
openPanel(h);
}
function skillOn(id){
var ids = (ME.activeSkills || []).slice();
if(ids.length < 2 && ids.indexOf(id) < 0) ids.push(id);
wsSend({ t: 'set_active_skills', ids: ids});
}
function skillOff(id){
var ids = (ME.activeSkills || []).filter(function(x){ return x!== id;});
wsSend({ t: 'set_active_skills', ids: ids});
}
window.skillOn = skillOn; window.skillOff = skillOff;

function openTeleport(){
if(!ME ||!SNAP) return;
currentPanel = 'teleport';
var inCity = SNAP.stage === 'city';
var h = '<h2>传送员 · 选地图</h2><p class="note">出城只能从比奇城出发；回城随时能回。未知暗殿不在列表里——入口在蜈蚣洞的「连接通道」。✦ = 已点亮的图。</p>';
h += '<div class="mapRow"><div><div class="mn">比奇城（安全区）' + (inCity ? '（当前）' : '') + '</div><div class="md">传送员 / 商店 / 维修 / 拍卖行</div></div>' +
  '<button onclick="goMap(\'city\')" ' + (inCity ? 'disabled' : '') + '>回城</button></div>';
var targets = (STAGES_BY_ID.city && STAGES_BY_ID.city.to) || [];
var lit = ME.bonusLit || [];
STAGE_LIST.forEach(function(m){
if(m.id === 'andian' || m.id === 'city') return;
var canTele = targets.indexOf(m.id) >= 0;
var locked = (m.id === 'wugong' || m.id === 'woma') && lit.indexOf(m.id) < 0;
var label = m.name + (lit.indexOf(m.id) >= 0? ' ✦': '') + (SNAP.stage === m.id? '（当前）': '');
var btn;
if(!inCity) btn = '<button disabled>需回城</button>';
else if(!canTele) btn = '<button disabled>走洞口</button>';
else if(locked) btn = '<button disabled>未点亮</button>';
else btn = '<button onclick="goMap(\'' + m.id + '\')" ' + (SNAP.stage === m.id? 'disabled': '') + '>前往</button>';
h += '<div class="mapRow"><div><div class="mn">' + esc(label) + '</div><div class="md">' + esc(m.desc || '') +
(!canTele? ' · 只能从僵尸洞穴三层洞口进': '') + (locked? ' · 打掉三层洞口爬出的黄衣僵尸点亮': '') + '</div></div>' + btn + '</div>';
});
h += '<p class="note">当前在' + (SNAP.floorName? ' · ' + esc(SNAP.floorName): '') + '。多层地图每次重进都从第一层开始。</p>';
openPanel(h);
}
function goMap(id){ closePanel(); wsSend({ t: 'teleport', stageId: id});}
window.goMap = goMap;

function openShop(){
if(!ME ||!SNAP) return;
if(SNAP.stage!== 'city'){ toast('商店在比奇城里'); return;}
currentPanel = 'shop';
openPanel('<h2>比奇城商店</h2><p class="note">正在问店家拿货架……</p>');
wsSend({ t: 'shop'});
}
function renderShopBody(){
if(currentPanel!== 'shop' ||!shopData) return;
var h = '<h2>比奇城商店</h2><p class="note">金币 <b>' + fmt(ME.gold) + '</b> · 商店装备无极品属性。维修把所有已穿装备耐久修满。</p>';
h += '<div class="shopTabs">' +
'<button data-tab="equip" class="' + (shopTab === 'equip'? 'sel': '') + '" onclick="setShopTab(\'equip\')">⚔️ 装备</button>' +
'<button data-tab="potion" class="' + (shopTab === 'potion'? 'sel': '') + '" onclick="setShopTab(\'potion\')">🧪 药水</button>' +
'<button data-tab="sell" class="' + (shopTab === 'sell'? 'sel': '') + '" onclick="setShopTab(\'sell\')">💰 出售 / 维修</button></div>';
if(shopTab === 'equip'){
h += '<h3>基础装备（本职业 tier 0–1）</h3>';
var items = (shopData.items || []).slice().sort(function(a, b){ return a.idx - b.idx;});
if(!items.length) h += '<p class="note">货架是空的。</p>';
for(var i = 0; i < items.length; i++){
var it = items[i];
var stxt = [];
[['atk', '攻击'], ['mag', '魔法'], ['dao', '道术'], ['def', '防御'], ['mdef', '魔御']].forEach(function(kv){
var r = statRange(it.stats[kv[0]]); if(r) stxt.push(kv[1] + r);
});
if(it.stats.acc) stxt.push('准确+' + it.stats.acc);
h += '<div class="shopRow"><span>' + esc(it.icon || '') + ' ' + esc(it.name) + '（' + esc(slotLabel(it.slot)) + ' · ' + esc(it.reqLv) + '级）<br/><span style="color:var(--dim);font-size:.82rem">' + esc(stxt.join(' ') || '无属性') + '</span></span>' +
'<button onclick="buyShopItem(\'' + it.id + '\')">' + fmt(it.price) + ' 金币 · 买</button></div>';
}
} else if(shopTab === 'potion'){
h += '<h3>药水</h3>';
var pots = shopData.potions || POTION_TIERS;
for(var j = 0; j < pots.length; j++){
var tp = pots[j];
var tid = TIER_SHORT[tp.tier] || tp.tier;
var tierInfo = null;
for(var k = 0; k < POTION_TIERS.length; k++) if(POTION_TIERS[k].id === tp.tier) tierInfo = POTION_TIERS[k];
var hpPct = tierInfo? Math.round(tierInfo.hpPct * 100): '', mpPct = tierInfo? Math.round(tierInfo.mpPct * 100): '';
h += '<div class="shopRow"><span>❤️ ' + esc(tp.name) + '红药（回 ' + hpPct + '% 血）</span><button onclick="buyPotion(\'hp\',\'' + tid + '\')">' + fmt(tp.price) + ' 金币 · 买</button></div>';
h += '<div class="shopRow"><span>💙 ' + esc(tp.name) + '蓝药（回 ' + mpPct + '% 蓝）</span><button onclick="buyPotion(\'mp\',\'' + tid + '\')">' + fmt(tp.price) + ' 金币 · 买</button></div>';
}
} else {
h += '<h3>维修与出售</h3>';
h += '<div class="shopRow"><span>维修全部已穿装备（耐久修满）</span><button onclick="repairAll()">维修</button></div>';
h += '<div class="shopRow"><span>出售模式：点开后，去背包点装备即卖</span><button onclick="armSellFromShop()">' + (sellArmed? '已开启': '开启出售') + '</button></div>';
h += '<p class="note">卖价按装备估价算；维修按缺失耐久与品阶计价，金币不够会提示。</p>';
}
openPanel(h);
}
function setShopTab(t){ shopTab = t; renderShopBody();}
function buyShopItem(id){ wsSend({ t: 'buy', equipId: id});}
function buyPotion(kind, tier){ wsSend({ t: 'buy_potion', kind: kind, tier: tier});}
function armSellFromShop(){ sellArmed = true; toast('出售模式已开启：打开背包点装备即卖'); renderShopBody();}
window.setShopTab = setShopTab; window.buyShopItem = buyShopItem; window.buyPotion = buyPotion;
window.armSellFromShop = armSellFromShop;

function openAuction(){
if(!ME) return;
currentPanel = 'auction';
openPanel('<h2>拍卖行（全服共享）</h2><p class="note">正在取在售列表……</p>');
if(auctionTab === 'claims') wsSend({ t: 'auction_claims'});
else wsSend({ t: 'auction_list'});
renderAuctionBody();
}
function renderAuctionBody(){
if(currentPanel!== 'auction') return;
var h = '<h2>拍卖行（全服共享）</h2><p class="note">金币 <b>' + fmt(ME.gold) + '</b> · 自标价、无手续费、24 小时到期自动退回；成交金币全额归卖家。</p>';
h += '<div class="shopTabs">' +
'<button class="' + (auctionTab === 'list'? 'sel': '') + '" onclick="setAuctionTab(\'list\')">在售列表</button>' +
'<button class="' + (auctionTab === 'mine'? 'sel': '') + '" onclick="setAuctionTab(\'mine\')">我要上架</button>' +
'<button class="' + (auctionTab === 'claims'? 'sel': '') + '" onclick="setAuctionTab(\'claims\')">领取' + (auctionClaims.length? '（' + auctionClaims.length + '）': '') + '</button></div>';
if(auctionTab === 'list'){
if(!auctionListings.length) h += '<p class="note">现在没有在售物品，你可以把背包里的装备或技能书上架。</p>';
for(var i = 0; i < auctionListings.length; i++){
var l = auctionListings[i];
var leftMin = Math.max(0, Math.round((l.expiresAt - Date.now()) / 60000));
var leftTxt = leftMin >= 60? Math.floor(leftMin / 60) + '小时' + (leftMin % 60) + '分': leftMin + '分钟';
var desc = '';
if(l.kind === 'skillbook'){
desc = '📖 《' + esc(l.item.name) + '》（' + esc(clsName(l.item.cls)) + ' · ' + l.item.req + '级可学）';
} else {
desc = esc((l.item.icon || '') + ' ' + l.item.name) + (l.item.jp? ' ·极品': '') + (l.item.enh? ' +' + l.item.enh: '') +
'<br/><span style="color:var(--dim);font-size:.8rem">' + esc(itemStatsText(l.item)) + '</span>';
}
var mine = l.sellerName === ME.name;
h += '<div class="aucItem"><div class="an">' + desc + '</div><div class="am">卖家 ' + esc(l.sellerName) + ' · 剩余 ' + leftTxt + '</div>' +
'<div class="arow" style="display:flex;justify-content:space-between;align-items:center;margin-top:.3rem"><span class="ap">' + fmt(l.price) + ' 金币</span>' +
(mine? '<button onclick="delistAuction(' + l.id + ')">下架</button>': '<button onclick="buyAuction(' + l.id + ')">买下</button>') + '</div></div>';
}
h += '<div class="row"><button onclick="refreshAuctionList()">↻ 刷新列表</button></div>';
} else if(auctionTab === 'mine'){
h += '<h3>背包装备 — 输价上架</h3>';
if(!(ME.bag || []).length) h += '<p class="note">背包没有装备。</p>';
for(var j = 0; j < (ME.bag || []).length; j++){
var b = ME.bag[j];
h += '<div class="aucItem"><div class="an">' + esc(b.name) + (b.jp? ' ·极品': '') + '</div><div class="am">' + esc(itemStatsText(b)) + '</div>' +
'<div class="row" style="margin-top:.4rem"><input type="number" min="1" id="price_e_' + b.uid + '" placeholder="标价（金币）" style="flex:1">' +
'<button onclick="listEquip(' + j + ')">上架</button></div></div>';
}
h += '<h3>技能书 — 输价上架</h3>';
if(!(ME.books || []).length) h += '<p class="note">没有多余的技能书。</p>';
for(var k2 = 0; k2 < (ME.books || []).length; k2++){
var sid = ME.books[k2], sd = SKILLS_BY_ID[sid]; if(!sd) continue;
h += '<div class="aucItem"><div class="an">📖 《' + esc(sd.name) + '》</div><div class="am">' + esc(clsName(sd.cls)) + ' · ' + sd.req + '级可学</div>' +
'<div class="row" style="margin-top:.4rem"><input type="number" min="1" id="price_b_' + sid + '" placeholder="标价（金币）" style="flex:1">' +
'<button onclick="listBook(\'' + sid + '\')">上架</button></div></div>';
}
} else {
if(!auctionClaims.length) h += '<p class="note">没有待领取的东西。卖出装备的金币、买到的装备、到期退回的物品都会出现在这里。</p>';
for(var c = 0; c < auctionClaims.length; c++){
var cl = auctionClaims[c];
var cdesc = '';
if(cl.kind === 'gold') cdesc = '💰 出售所得金币 <b>+' + fmt(cl.payload) + '</b>';
else if(cl.payload && cl.payload.bookId) cdesc = '📖 《' + esc(SKILLS_BY_ID[cl.payload.bookId]? SKILLS_BY_ID[cl.payload.bookId].name: cl.payload.bookId) + '》';
else if(cl.payload && cl.payload.name) cdesc = esc(cl.payload.name) + ' · ' + esc(itemStatsText(cl.payload));
else cdesc = '物品';
h += '<div class="aucItem"><div class="an">' + cdesc + '</div>' +
'<div class="row" style="margin-top:.4rem"><button onclick="claimAuction(' + cl.id + ')">领取</button></div></div>';
}
}
openPanel(h);
}
function setAuctionTab(t){
auctionTab = t;
if(t === 'list') wsSend({ t: 'auction_list'});
else if(t === 'claims') wsSend({ t: 'auction_claims'});
renderAuctionBody();
}
function refreshAuctionList(){ wsSend({ t: 'auction_list'});}
function buyAuction(id){ wsSend({ t: 'auction_buy', id: id});}
function delistAuction(id){ wsSend({ t: 'auction_delist', id: id});}
function listEquip(j){
var b = (ME.bag || [])[j]; if(!b) return;
var price = Number(($('price_e_' + b.uid) || {}).value);
if(!price || price <= 0){ toast('先输一个标价'); return;}
wsSend({ t: 'auction_create', uid: b.uid, price: price});
}
function listBook(sid){
var price = Number(($('price_b_' + sid) || {}).value);
if(!price || price <= 0){ toast('先输一个标价'); return;}
wsSend({ t: 'auction_create', bookId: sid, price: price});
}
function claimAuction(id){ wsSend({ t: 'auction_claim', claimId: id, slot: mySlot});}
window.setAuctionTab = setAuctionTab; window.refreshAuctionList = refreshAuctionList;
window.buyAuction = buyAuction; window.delistAuction = delistAuction;
window.listEquip = listEquip; window.listBook = listBook; window.claimAuction = claimAuction;

/* ============================================================
事件绑定与启动
============================================================ */
$('bagBtn').addEventListener('click', openBag);
$('skillBtn').addEventListener('click', openSkills);
$('shopBtn').addEventListener('click', openShop);
$('auctionBtn').addEventListener('click', openAuction);
$('teleBtn').addEventListener('click', openTeleport);
$('darkBtn').addEventListener('click', function(){ wsSend({ t: 'enter_passage'});});
$('menuBtn').addEventListener('click', function(){
if(confirm('回主菜单吗？（会离开房间）')) backToMenu();
});
$('hpPotBtn').addEventListener('click', useHpPot);
$('mpPotBtn').addEventListener('click', useMpPot);
$('slot0').addEventListener('click', function(){ castSlot(0);});
$('slot1').addEventListener('click', function(){ castSlot(1);});
$('btnAttack').addEventListener('click', function(){ wsSend({ t: 'attack'}); sfx('hit');});
$('btnPickup').addEventListener('click', function(){ wsSend({ t: 'pickup'});});
$('btnAutoFight').addEventListener('click', function(){
if(!ME) return;
wsSend({ t: 'auto', on:!ME.auto});
});
$('btnAutoPot').addEventListener('click', function(){
autoPot =!autoPot;
lsSet('lg_autopot', autoPot? 'on': 'off');
$('btnAutoPot').classList.toggle('on', autoPot);
toast(autoPot? '自动喝药已开启': '自动喝药已关闭');
});
$('btnSound').addEventListener('click', function(){
soundOn =!soundOn;
lsSet('lg_sound', soundOn? 'on': 'off');
$('btnSound').textContent = soundOn? '🔊 音效开': '🔇 音效关';
if(soundOn) sfx('click');
});
$('enterHoleBtn').addEventListener('click', function(){ wsSend({ t: 'enter_hole'});});
$('portalBtn').addEventListener('click', function(){ wsSend({ t: 'enter_portal'});});
$('btnEnter').addEventListener('click', enterGame);
$('btnNewChar').addEventListener('click', async function(){
var name = $('charName').value.trim();
if(!name){ toast('先输入角色名'); return;}
if(chars[mySlot - 1]){ toast(mySlot + ' 号位已有角色，换个空位'); return;}
try{
await apiCreateChar(mySlot, name, selectedClass);
toast('角色创建成功');
$('charName').value = '';
await refreshSlots();
}catch(e){ toast('创建失败：' + e.message);}
});
$('btnDelChar').addEventListener('click', async function(){
var ch = chars[mySlot - 1];
if(!ch){ toast('这个位置是空的'); return;}
if(!confirm('确定删除 ' + mySlot + ' 号位「' + ch.name + '」吗？删了找不回来。')) return;
try{
await apiDeleteChar(mySlot);
toast('已删除');
await refreshSlots();
}catch(e){ toast('删除失败：' + e.message);}
});
$('btnRefreshSlots').addEventListener('click', refreshSlots);
$('btnClaim').addEventListener('click', async function(){
var code = $('claimCode').value.trim();
if(!code){ toast('先输入认领码'); return;}
try{
var r = await apiClaim(code);
$('claimState').textContent = '认领成功！三个角色已绑到这台设备。';
claimUsed = true;
$('claimCard').classList.add('hidden');
await refreshSlots();
}catch(e){ $('claimState').textContent = '认领失败：' + e.message;}
});
$('btnCreateRoom').addEventListener('click', function(){
pendingRoom = 'create';
$('roomState').textContent = '已选：创建房间。点「进入游戏」后自动建房，房间码会显示在游戏里。';
sfx('click');
});
$('btnJoinRoom').addEventListener('click', function(){
var code = $('joinCode').value.trim().toUpperCase();
if(!/^[A-Z0-9]{5}$/.test(code)){ toast('房间码是 5 位字母/数字'); return;}
pendingRoom = { join: code};
$('roomState').textContent = '已选：加入房间 ' + code + '。点「进入游戏」后自动进房。';
sfx('click');
});
/* wakeRetry 的点击处理在 index.html 内联脚本里（启动失败时刷新页面，否则重试连接），此处不再重复绑定 */
if(!soundOn) $('btnSound').textContent = '🔇 音效关';
$('btnAutoPot').classList.toggle('on', autoPot);

try{
  buildClassCards();
  buildStageList();
}catch(e){
  if(window.__showBootErr) window.__showBootErr('菜单初始化失败：' + e.message + '，请截图发给红球。');
  else { var _m = $('wakeMsg'); if(_m) _m.textContent = '菜单初始化失败：' + e.message; }
  var _s = $('wakeSpin'); if(_s) _s.style.display = 'none';
  var _r = $('wakeRetry'); if(_r) _r.classList.remove('hidden');
  throw e;
}
loadMenu();
requestAnimationFrame(gameLoop);
