/* ============================================================
   热血传奇 · 国服服务器版独立联机版 — 客户端
   数据口径：~/workspace/guo-fu-lian-ji-ban/shared/data.js
   （国服服务器版 v89，2026-11-23）。以下展示数据为 data.js
   的抄录子集；一切实时状态（怪物/血蓝/金币/拍卖行）只从
   服务端接口与 WebSocket 快照取，不在本地编数值。
   服务端约定见任务书；docs/protocol.md 若已存在以它为准。
   零外部请求：无 CDN、无外部字体、无外部图片。
   ============================================================ */
'use strict';

/* ---------- 展示数据（抄自 shared/data.js） ---------- */
var VERSION = 'guo-fu-v89-2026-11-23';
var CLASSES = {
  war:  { id:'war',  name:'战士', face:'🗡️', mainStatName:'攻击', desc:'血厚攻高，近身劈砍。', initialSkill:'war_basic' },
  mage: { id:'mage', name:'法师', face:'🔮', mainStatName:'魔法', desc:'魔法爆发，血少，魔法盾习得后自动开盾。', initialSkill:'mage_fireball' },
  tao:  { id:'tao',  name:'道士', face:'📿', mainStatName:'道术', desc:'治愈、火符、召唤，续航最强。', initialSkill:'tao_jingshen' }
};
var SLOT_ORDER = ['weapon','armor','helmet','necklace','braceL','braceR','ringL','ringR','boots'];
var SLOT_LABEL = { weapon:'武器', armor:'衣服', helmet:'头盔', necklace:'项链', braceL:'左手镯', braceR:'右手镯', ringL:'左戒指', ringR:'右戒指', boots:'鞋靴' };
var POTIONS = [
  { id:'small', name:'小瓶', hpPct:0.30, mpPct:0.30, price:20 },
  { id:'mid',   name:'中瓶', hpPct:0.55, mpPct:0.60, price:40 },
  { id:'big',   name:'大瓶', hpPct:0.90, mpPct:0.95, price:80 }
];
/* 技能 33 门：战 6 / 法 14 / 道 13（data.js SKILLS 全表抄录：名/职业/学习等级/耗魔/冷却） */
var SKILLS = {
  war_basic:{name:'基本剑术',cls:'war',req:1,mp:0,cd:null,passive:true,desc:'被动：每级 +3 准确，并带单体劈砍。建号即会。'},
  war_gongsha:{name:'攻杀剑术',cls:'war',req:19,mp:0,cd:1.6,desc:'附加伤害 +5/+6/+7/+8（随技能等级），每级 +1 准确。'},
  war_cisha:{name:'刺杀剑法',cls:'war',req:25,mp:0,cd:2.2,desc:'破防：无视目标 40/60/80/100% 防御。'},
  war_banyue:{name:'半月弯刀',cls:'war',req:28,mp:6,cd:2.6,desc:'横扫周围敌人，侧面目标承受部分伤害。耗魔 6。'},
  war_yeman:{name:'野蛮冲撞',cls:'war',req:30,mp:0,cd:5,desc:'冲向最近的怪并撞退它，3 级可连撞 2 只。'},
  war_liehuo:{name:'烈火剑法',cls:'war',req:35,mp:13,cd:4.5,desc:'倍率 1.4/1.8/2.2/2.6（随技能等级）。耗魔 13。'},
  mage_fireball:{name:'火球术',cls:'mage',req:1,mp:3,cd:1.1,proj:true,desc:'直线飞行的小火球，命中第一个敌人，不追踪、不穿透。建号即会。耗魔 3。'},
  mage_kangju:{name:'抗拒火环',cls:'mage',req:12,mp:8,cd:6,desc:'推开围住自己的怪并造成少量伤害。'},
  mage_youhuo:{name:'诱惑之光',cls:'mage',req:13,mp:12,cd:8,desc:'诱惑怪物为己所用，可召 2/3/4/5 只。'},
  mage_diyuhuo:{name:'地狱火',cls:'mage',req:16,mp:10,cd:2.6,desc:'向前喷出地狱火。'},
  mage_leidian:{name:'雷电术',cls:'mage',req:17,mp:9,cd:1.5,desc:'召唤雷电劈向目标。'},
  mage_shunxi:{name:'瞬息移动',cls:'mage',req:19,mp:10,cd:7,desc:'随机传送到附近位置。'},
  mage_bigfire:{name:'大火球',cls:'mage',req:19,mp:6,cd:1.8,desc:'威力更大的火球。'},
  mage_baolie:{name:'爆裂火焰',cls:'mage',req:22,mp:12,cd:2.8,desc:'范围爆炸火焰。'},
  mage_firewall:{name:'火墙',cls:'mage',req:24,mp:16,cd:1.5,desc:'在最近的怪脚下放火墙，持续 8 秒，附近没怪不空放。'},
  mage_jiguang:{name:'疾光电影',cls:'mage',req:26,mp:14,cd:2.4,desc:'直线穿透的疾光电影。'},
  mage_leiguang:{name:'地狱雷光',cls:'mage',req:30,mp:22,cd:4,desc:'周身雷光，范围伤害。'},
  mage_shield:{name:'魔法盾',cls:'mage',req:31,mp:0,cd:null,passive:true,auto:true,desc:'被动：习得后自动开盾，抵挡 15/30/45/60% 伤害，不占上场位。'},
  mage_shengyan:{name:'圣言术',cls:'mage',req:32,mp:18,cd:3,desc:'对不死系怪物有奇效。'},
  mage_bingpao:{name:'冰咆哮',cls:'mage',req:35,mp:20,cd:3.2,desc:'大范围冰咆哮，附带减速，释放时升起旋转冰圈龙卷风（纯视觉，1.6 秒）。'},
  tao_jingshen:{name:'精神力战法',cls:'tao',req:1,mp:0,cd:null,passive:true,desc:'被动：每级 +3 准确，并带单体劈砍。建号即会。'},
  tao_zhiyu:{name:'治愈术',cls:'tao',req:1,mp:6,cd:3,desc:'只回血、不打怪。建号即会。'},
  tao_shidu:{name:'施毒术',cls:'tao',req:14,mp:8,cd:2.5,desc:'使目标中毒持续掉血。'},
  tao_huofu:{name:'灵魂火符',cls:'tao',req:18,mp:5,cd:1.4,desc:'甩出灵魂火符，耗魔 5（每级 +2）。'},
  tao_kulou:{name:'召唤骷髅',cls:'tao',req:19,mp:15,cd:10,desc:'召唤骷髅战士助战。'},
  tao_yinshen:{name:'隐身术',cls:'tao',req:20,mp:10,cd:12,desc:'自己隐身，怪物看不见你。'},
  tao_jiti:{name:'集体隐身术',cls:'tao',req:21,mp:14,cd:16,desc:'队友一起隐身。'},
  tao_youling:{name:'幽灵盾',cls:'tao',req:22,mp:0,cd:null,passive:true,desc:'被动：提升魔御。'},
  tao_shensheng:{name:'神圣战甲术',cls:'tao',req:25,mp:0,cd:null,passive:true,desc:'被动：提升防御。'},
  tao_xinling:{name:'心灵启示',cls:'tao',req:26,mp:8,cd:6,desc:'看穿目标血量。'},
  tao_kunmo:{name:'困魔咒',cls:'tao',req:28,mp:16,cd:8,desc:'困住怪物使其无法行动。'},
  tao_qunti:{name:'群体治愈术',cls:'tao',req:33,mp:14,cd:6,desc:'治疗自己与附近队友。'},
  tao_shenshou:{name:'召唤神兽',cls:'tao',req:35,mp:25,cd:14,desc:'召唤神兽助战。'}
};
var CLASS_SKILLS = {
  war:['war_basic','war_gongsha','war_cisha','war_banyue','war_yeman','war_liehuo'],
  mage:['mage_fireball','mage_kangju','mage_youhuo','mage_diyuhuo','mage_leidian','mage_shunxi','mage_bigfire','mage_baolie','mage_firewall','mage_jiguang','mage_leiguang','mage_shield','mage_shengyan','mage_bingpao'],
  tao:['tao_jingshen','tao_zhiyu','tao_shidu','tao_huofu','tao_kulou','tao_yinshen','tao_jiti','tao_youling','tao_shensheng','tao_xinling','tao_kunmo','tao_qunti','tao_shenshou']
};
var SKILL_ICON = { war:'⚔️', mage:'🔮', tao:'📿' };
/* 地图 15 张（data.js STAGES 抄录：名/层数/尺寸/地面色/怪物/出口/特性） */
var STAGES = [
  {id:'city',name:'比奇城',kind:'city',safe:true,hidden:false,layers:1,w:2600,h:2000,ground:'#3d4a26',monsters:[],boss:null,from:['*'],to:['biqi_field','dushe','woma_forest','kulou','jiangshi','woma','wugong','shimu','zuma','mengzhong','bairimen','chiyue'],features:['teleport','shop','repair','auction'],desc:'安全区 · 传送员 / 商店 / 维修 / 拍卖行'},
  {id:'biqi_field',name:'比奇野外',kind:'field',safe:false,hidden:false,layers:1,w:2400,h:1800,ground:'#44512a',monsters:['鸡','鹿','稻草人','多钩猫','钉耙猫'],boss:'钉耙猫王',from:['city'],to:['dushe'],desc:'鸡、鹿和钉耙猫出没的草地'},
  {id:'dushe',name:'毒蛇山谷',kind:'field',safe:false,hidden:false,layers:1,w:2400,h:1800,ground:'#4a4423',monsters:['红蛇','虎蛇','多钩猫'],boss:'虎蛇王',from:['biqi_field'],to:['woma_forest'],desc:'红蛇与虎蛇盘踞的山谷'},
  {id:'woma_forest',name:'沃玛森林',kind:'field',safe:false,hidden:false,layers:1,w:2300,h:1700,ground:'#37482a',monsters:['半兽人','半兽战士','森林雪人'],boss:'半兽勇士',from:['dushe'],to:['kulou'],desc:'半兽人与雪人的森林'},
  {id:'kulou',name:'骷髅洞穴',kind:'dungeon',safe:false,hidden:false,layers:3,w:2300,h:1700,ground:'#33302c',monsters:['骷髅','洞蛆','蝙蝠','骷髅战士','骷髅战将'],boss:'骷髅精灵',from:['woma_forest'],to:['jiangshi'],desc:'骷髅与洞蛆的阴暗洞穴'},
  {id:'jiangshi',name:'僵尸洞穴',kind:'dungeon',safe:false,hidden:false,layers:3,w:2300,h:1700,ground:'#2e2a33',monsters:['爬地僵尸','僵尸','矿洞僵尸','黄衣僵尸'],boss:'矿洞尸王',from:['kulou'],to:['shiwang'],hole:{to:'shiwang',layer:3,guardian:'黄衣僵尸',triggerDist:240,climbSec:2.2,unlocksOnKill:['wugong','woma']},desc:'矿洞深处，僵尸横行；三层有通往尸王殿的洞口'},
  {id:'shiwang',name:'尸王殿',kind:'dungeon',safe:false,hidden:false,layers:1,w:600,h:600,ground:'#2a2430',monsters:['尸王','铁链尸王'],boss:'通关尸王',from:['jiangshi'],to:['woma'],desc:'满殿尸王，技能书的主要产地（每小时整波 32 只）'},
  {id:'woma',name:'沃玛寺庙',kind:'dungeon',safe:false,hidden:false,layers:1,w:2200,h:1700,ground:'#3a2f28',monsters:['沃玛战士','火焰沃玛','沃玛战将','沃玛卫士'],boss:'沃玛教主',from:['shiwang'],to:['wugong'],desc:'沃玛教主盘踞的大殿'},
  {id:'wugong',name:'蜈蚣洞',kind:'dungeon',safe:false,hidden:false,layers:1,w:2300,h:1700,ground:'#2f3324',monsters:['蜈蚣','黑色恶蛆','跳跳蜂','钳虫','巨型蠕虫'],boss:'邪恶钳虫',from:['woma'],to:['shimu'],darkPassage:{to:'andian',label:'🕯️ 连接通道 → 未知暗殿',where:'地牢一层东'},desc:'地牢深处，钳虫与蜈蚣成群；东侧有连接通道'},
  {id:'shimu',name:'石墓',kind:'dungeon',safe:false,hidden:false,layers:7,w:2300,h:1700,ground:'#38322b',monsters:['红野猪','黑野猪','蝎蛇','楔蛾'],boss:'白野猪',from:['wugong'],to:['zuma'],desc:'野猪与蝎蛇的石墓，七层有尸王'},
  {id:'zuma',name:'祖玛寺庙',kind:'dungeon',safe:false,hidden:false,layers:1,w:2300,h:1700,ground:'#332e38',monsters:['祖玛卫士','祖玛雕像','祖玛弓箭手','楔蛾'],boss:'祖玛教主',from:['shimu'],to:['mengzhong'],desc:'祖玛卫士守卫的神殿'},
  {id:'mengzhong',name:'盟重野外',kind:'field',safe:false,hidden:false,layers:1,w:2400,h:1800,ground:'#57492c',monsters:['狼','盔甲虫','多角虫','巨型多角虫'],boss:'巨型多角虫王',from:['zuma'],to:['bairimen'],desc:'土城外的荒漠与虫群；白日门从此直接进'},
  {id:'bairimen',name:'白日门',kind:'field',safe:false,hidden:false,layers:1,w:2500,h:1900,ground:'#3d4f2e',monsters:['半兽勇士','雪人','天狼蜘蛛','花吻蜘蛛'],boss:'钢牙蜘蛛',from:['mengzhong'],to:['chiyue'],desc:'东临大海，城在正中央，城里是安全区'},
  {id:'chiyue',name:'赤月峡谷',kind:'dungeon',safe:false,hidden:false,layers:1,w:2400,h:1800,ground:'#40262a',monsters:['月魔蜘蛛','血僵尸','血巨人','双头金刚','双头血魔'],boss:'赤月恶魔',from:['bairimen'],to:[],desc:'最终之地，赤月恶魔在此'},
  {id:'andian',name:'未知暗殿',kind:'hidden',safe:false,hidden:true,layers:1,w:2100,h:1600,ground:'#241f2e',monsters:['鹿（暗殿）','稻草人（暗殿）','钉耙猫（暗殿）','鸡（暗殿）'],boss:'真·沃玛教主',from:['wugong'],to:['wugong'],desc:'隐藏地图：看似弱小的怪，个个不好惹'}
];
var BOSSES = [
  {id:'boss_dingpa',name:'钉耙猫王',map:'biqi_field'},{id:'boss_hushe',name:'虎蛇王',map:'dushe'},
  {id:'boss_banshou',name:'半兽勇士',map:'woma_forest'},{id:'boss_kulou',name:'骷髅精灵',map:'kulou'},
  {id:'boss_kuangdong',name:'矿洞尸王',map:'jiangshi'},{id:'boss_shiwang',name:'通关尸王',map:'shiwang'},
  {id:'boss_woma',name:'沃玛教主',map:'woma'},{id:'boss_qianchong',name:'邪恶钳虫',map:'wugong'},
  {id:'boss_baiye',name:'白野猪',map:'shimu'},{id:'boss_zuma',name:'祖玛教主',map:'zuma'},
  {id:'boss_duojiao',name:'巨型多角虫王',map:'mengzhong'},{id:'boss_gangya',name:'钢牙蜘蛛',map:'bairimen'},
  {id:'boss_chiyue',name:'赤月恶魔',map:'chiyue'},{id:'boss_zhenwoma',name:'真·沃玛教主',map:'andian'}
];
/* 商店基础装备（data.js EQUIPS tier 0–1，25 件；price 为 tradePrice，买价 = tradePrice*2+10） */
var SHOP_EQUIPS = [
  {id:'mujian',name:'木剑',icon:'🗡️',slot:'weapon',cls:'war',tier:0,reqLv:1,stats:'攻击 2-5',price:81},
  {id:'bshou',name:'匕首',icon:'🔪',slot:'weapon',cls:'war',tier:0,reqLv:1,stats:'攻击 4-5',price:81},
  {id:'qingtongjian',name:'青铜剑',icon:'⚔️',slot:'weapon',cls:'war',tier:0,reqLv:3,stats:'攻击 3-7',price:111},
  {id:'tiejian',name:'铁剑',icon:'⚔️',slot:'weapon',cls:'war',tier:1,reqLv:9,stats:'攻击 5-9',price:225},
  {id:'duanjian',name:'短剑',icon:'🗡️',slot:'weapon',cls:'war',tier:1,reqLv:10,stats:'攻击 3-11',price:249},
  {id:'qingtongfu',name:'青铜斧',icon:'🪓',slot:'weapon',cls:'war',tier:1,reqLv:13,stats:'攻击 0-15',price:303},
  {id:'haihun',name:'海魂',icon:'🔱',slot:'weapon',cls:'mage',tier:1,reqLv:13,stats:'魔法 3-10',price:276},
  {id:'banyue_w',name:'半月',icon:'🌙',slot:'weapon',cls:'war',tier:1,reqLv:15,stats:'攻击 5-10',price:288},
  {id:'buyi',name:'布衣',icon:'👕',slot:'armor',cls:'war',tier:0,reqLv:1,stats:'防御 2-2',price:81},
  {id:'qingxingkai',name:'轻型盔甲',icon:'🥋',slot:'armor',cls:'mage',tier:1,reqLv:11,stats:'防御 3-3',price:219},
  {id:'qingtongtoukui',name:'青铜头盔',icon:'⛑️',slot:'helmet',cls:'war',tier:1,reqLv:10,stats:'防御 0-1',price:159},
  {id:'mofatoukui',name:'魔法头盔',icon:'🎩',slot:'helmet',cls:'mage',tier:1,reqLv:14,stats:'防御 1-2',price:201},
  {id:'jinxianglian',name:'金项链',icon:'📿',slot:'necklace',cls:'war',tier:0,reqLv:2,stats:'攻击 0-1',price:51},
  {id:'chuantong',name:'传统项链',icon:'📿',slot:'necklace',cls:'mage',tier:0,reqLv:2,stats:'魔法 0-1',price:51},
  {id:'tieshouzhuo',name:'铁手镯',icon:'⭕',slot:'bracelet',cls:'war',tier:0,reqLv:3,stats:'准确 +1',price:48},
  {id:'xiaoshouzhuo',name:'小手镯',icon:'✨',slot:'bracelet',cls:'mage',tier:0,reqLv:3,stats:'敏捷 +1',price:48},
  {id:'gangshouzhuo',name:'钢手镯',icon:'⭕',slot:'bracelet',cls:'war',tier:1,reqLv:8,stats:'防御 0-1',price:156},
  {id:'mofashouzhuo',name:'魔法手镯',icon:'✨',slot:'bracelet',cls:'mage',tier:1,reqLv:12,stats:'魔法 0-2',price:198},
  {id:'daoshishouzhuo',name:'道士手镯',icon:'📿',slot:'bracelet',cls:'tao',tier:1,reqLv:15,stats:'道术 0-1',price:189},
  {id:'gutong',name:'古铜戒指',icon:'💍',slot:'ring',cls:'war',tier:0,reqLv:3,stats:'攻击 0-1',price:57},
  {id:'tiejiezhi',name:'铁戒指',icon:'💍',slot:'ring',cls:'war',tier:0,reqLv:7,stats:'攻击 0-2',price:90},
  {id:'buxie',name:'布鞋',icon:'👟',slot:'boots',cls:'war',tier:0,reqLv:1,stats:'防御 0-1',price:45},
  {id:'lupixue',name:'鹿皮靴',icon:'👢',slot:'boots',cls:'tao',tier:1,reqLv:8,stats:'防御 0-1',price:147},
  {id:'shoupiyaodai',name:'兽皮腰带',icon:'🎗️',slot:'boots',cls:'war',tier:1,reqLv:12,stats:'防御 0-1',price:180},
  {id:'zichouxue',name:'紫绸靴',icon:'👢',slot:'boots',cls:'mage',tier:1,reqLv:14,stats:'魔法 0-2',price:201}
];
var WEAR_REQ = { liliang:{atk:46}, qishijiezhi:{atk:37}, longzhijiezhi:{atk:37}, lvse:{atk:39}, heitietoukui:{atk:46}, zhanshenkui:{atk:46}, kuloujie:{atk:30}, shanhu:{mag:24}, sanyanshouzhuo:{dao:22}, linghunxianglian:{dao:23}, longzhishouzhuo:{mag:28}, emochangpao:{mag:28}, longya:{mag:28}, xueyin:{mag:27} };

/* ---------- 工具 ---------- */
function $(id){ return document.getElementById(id); }
function el(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function uuid(){ if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r=Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }); }
function stageById(id){ for(var i=0;i<STAGES.length;i++) if(STAGES[i].id===id) return STAGES[i]; return STAGES[0]; }
function bossNameFor(stageId){ for(var i=0;i<BOSSES.length;i++) if(BOSSES[i].map===stageId) return BOSSES[i].name; return null; }
function shopBuyPrice(tp){ return tp*2+10; }

/* ---------- 设备 ID（持久，不用注册） ---------- */
var DEVICE_KEY='lg_device_id';
var deviceId=localStorage.getItem(DEVICE_KEY);
if(!deviceId){ deviceId=uuid(); try{ localStorage.setItem(DEVICE_KEY, deviceId); }catch(e){} }

/* API 基地址：同源（Render 上前后端同一域名）。本地联调可用 localStorage lg_api_base 覆盖。 */
var API_BASE=(localStorage.getItem('lg_api_base')||'').replace(/\/$/,'');
function apiUrl(p){ return API_BASE+p; }
function wsUrl(){
  if(API_BASE){ return API_BASE.replace(/^http/,'ws')+'/ws'; }
  return (location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
}

/* ---------- 带 Render 休眠唤醒的请求 ---------- */
var WAKE_TIMEOUT_MS=65000, WAKE_MAX_TRIES=3;
var wakeState={ tries:0 };
function showWake(msg, tip, showRetry){
  $('wake').classList.remove('hidden');
  $('wakeMsg').textContent=msg||'服务器唤醒中，请稍等……';
  if(tip!=null) $('wakeTip').textContent=tip;
  $('wakeSpin').style.display=showRetry?'none':'block';
  $('wakeRetry').classList.toggle('hidden', !showRetry);
}
function hideWake(){ $('wake').classList.add('hidden'); }
function fetchWake(path, opts){
  opts=opts||{};
  var tries=0;
  function attempt(){
    tries++; wakeState.tries=tries;
    showWake('服务器唤醒中，请稍等……（第 '+tries+' 次尝试）',
      '免费服务器 15 分钟没人玩会休眠，第一次打开需要 30–60 秒唤醒，请不要关闭页面。');
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ ctrl.abort(); }, WAKE_TIMEOUT_MS);
    var o={ method:opts.method||'GET', headers:{'Content-Type':'application/json'}, signal:ctrl.signal };
    if(opts.body) o.body=JSON.stringify(opts.body);
    return fetch(apiUrl(path), o).then(function(r){
      clearTimeout(timer);
      if(!r.ok) return r.text().then(function(t){ throw new Error('HTTP '+r.status+' '+t); });
      return r.json().catch(function(){ return {}; });
    }).catch(function(err){
      clearTimeout(timer);
      if(tries<WAKE_MAX_TRIES){
        return new Promise(function(res){ setTimeout(res, 1500); }).then(attempt);
      }
      throw err;
    });
  }
  return attempt();
}
/* 不走唤醒重试的轻量请求（游戏内高频刷新用） */
function fetchJson(path, opts){
  opts=opts||{};
  var o={ method:opts.method||'GET', headers:{'Content-Type':'application/json'} };
  if(opts.body) o.body=JSON.stringify(opts.body);
  return fetch(apiUrl(path), o).then(function(r){
    if(!r.ok) return r.text().then(function(t){ throw new Error('HTTP '+r.status+' '+t); });
    return r.json().catch(function(){ return {}; });
  });
}

/* ---------- 全局状态 ---------- */
var S={
  slots:[null,null,null,null,null], selSlot:1, myChar:null,
  room:null, roomCode:null, roomMembers:[],
  ws:null, wsOk:false, inGame:false,
  snap:null, stage:'city', layer:1, hole:null, bonusLit:[],
  gold:0, xp:0, xpNeed:100, kills:0, level:1,
  bag:[], worn:{}, potions:{hp:[0,0,0],mp:[0,0,0]}, books:[],
  learned:{}, activeSkills:[], skillLv:{},
  autoFight:false, autoPot:false,
  auction:[], claims:[],
  shopTab:'equip', aucTab:'list', selBagUid:null,
  me:{x:1300,y:1000}, cam:{x:0,y:0}, moveVec:{x:0,y:0},
  keys:{}, lastSkillAt:{}, effects:[], floaters:[],
  holePos:null, guardianPos:null, guardianAlive:false
};
var CHAR_KEY='lg_last_slot';
try{ var ls=parseInt(localStorage.getItem(CHAR_KEY)||'1',10); if(ls>=1&&ls<=5) S.selSlot=ls; }catch(e){}
function saveSelSlot(){ try{ localStorage.setItem(CHAR_KEY, String(S.selSlot)); }catch(e){} }

/* ---------- 日志 / 系统提示 ---------- */
function log(msg, cls){
  var box=$('log'); if(!box) return;
  var d=el('div', cls||'', msg);
  box.appendChild(d);
  while(box.children.length>24) box.removeChild(box.firstChild);
}
function toast(msg){ log(msg,'sys'); }

/* ---------- 主菜单 ---------- */
function normSlot(raw, i){
  if(!raw) return null;
  if(raw.empty) return null;
  return {
    slot: raw.slot||(i+1),
    name: raw.name||raw.charName||'',
    cls: raw.cls||raw.classId||raw.class||'war',
    level: raw.level||raw.lv||1,
    gold: raw.gold||0
  };
}
function loadCharacters(){
  return fetchWake('/api/characters?deviceId='+encodeURIComponent(deviceId)).then(function(data){
    var arr=data.slots||data.characters||data||[];
    var slots=[null,null,null,null,null];
    if(Array.isArray(arr)){
      arr.forEach(function(raw,i){
        var s=normSlot(raw, i);
        if(s) slots[s.slot-1]=s;
      });
    } else if(data && typeof data==='object'){
      Object.keys(data).forEach(function(k){
        var n=parseInt(k,10);
        if(n>=1&&n<=5){ var s=normSlot(data[k], n-1); if(s) slots[n-1]=s; }
      });
    }
    S.slots=slots;
    renderSlots();
    hideWake();
    $('menu').classList.remove('hidden');
    return slots;
  }).catch(function(err){
    showWake('服务器暂时连不上', '已重试 '+WAKE_MAX_TRIES+' 次仍无响应：'+err.message+'。可能是服务器正在部署或休眠唤醒失败，稍后再试一次。', true);
    throw err;
  });
}
function renderSlots(){
  var bar=$('slotBar'); bar.innerHTML='';
  var claimed=[false,false,false,false,false];
  S.slots.forEach(function(s,i){
    var d=el('div','slot'+(S.selSlot===i+1?' sel':''));
    d.appendChild(el('div','snum',(i+1)+' 号位'));
    if(s){
      var c=CLASSES[s.cls]||CLASSES.war;
      d.appendChild(el('div','sname',c.face+' '+s.name));
      d.appendChild(el('div','smeta',c.name+' · Lv'+s.level));
      if(s.gold) d.appendChild(el('div','smeta','💰 '+s.gold));
    } else {
      d.appendChild(el('div','sempty','（空位）'));
      d.appendChild(el('div','smeta','点此新建'));
    }
    d.onclick=function(){ selectSlot(i+1); };
    bar.appendChild(d);
  });
  var cur=S.slots[S.selSlot-1];
  if(cur){
    var c=CLASSES[cur.cls]||CLASSES.war;
    $('slotInfo').textContent='当前：'+(S.selSlot)+' 号位 '+c.face+' '+cur.name+'（'+c.name+' Lv'+cur.level+'，金币 '+(cur.gold||0)+'）';
    $('btnNewChar').textContent='＋ 在此位新建（会覆盖）';
  } else {
    $('slotInfo').textContent='当前：'+S.selSlot+' 号位（空位），可以新建角色。';
    $('btnNewChar').textContent='＋ 新建角色';
  }
  $('btnDelChar').disabled=!cur;
  $('claimState').textContent = (S.slots[0]&&S.slots[1]&&S.slots[2])
    ? '✅ 三个角色已认领到这台设备。' : '还没认领？输入一次性认领码，把三个老角色绑定到这台设备。';
  renderStageList();
}
function selectSlot(n){
  S.selSlot=n; saveSelSlot(); renderSlots();
  if(S.wsOk) sendWs({t:'select_character', slot:n});
}
function renderStageList(){
  var box=$('stageList'); if(!box) return;
  box.innerHTML='';
  var done=0;
  STAGES.forEach(function(st){
    var c=el('div','stage-chip'+(st.hidden?' hidden-map':''));
    c.innerHTML='<b>'+esc(st.name)+(st.layers>1?' · '+st.layers+' 层':'')+'</b><span>'+esc(st.desc)+'</span>'+
      '<span>'+(st.boss?'👹 Boss：'+esc(st.boss):'🛡️ 安全区')+'</span>';
    box.appendChild(c);
  });
  $('menuFoot').textContent='主线通关计数 14 张（未知暗殿不计）· 数据版本 '+VERSION;
}
/* 认领 / 建角 / 删角 */
function doClaim(){
  var code=$('claimCode').value.trim();
  $('claimErr').textContent=''; $('claimOk').textContent='';
  if(!/^\d{6}$/.test(code)){ $('claimErr').textContent='请输入 6 位数字认领码。'; return; }
  $('btnDoClaim').disabled=true;
  fetchWake('/api/claim',{method:'POST',body:{code:code,deviceId:deviceId}}).then(function(r){
    hideWake();
    if(r && r.ok===false) throw new Error(r.message||r.error||'认领失败');
    $('claimOk').textContent='认领成功！1–3 号位已出现三个角色。';
    setTimeout(function(){ $('modalClaim').classList.add('hidden'); loadCharacters(); }, 900);
  }).catch(function(err){
    hideWake();
    $('claimErr').textContent='认领失败：'+err.message+'（认领码只能用一次，用过即失效）';
  }).finally(function(){ $('btnDoClaim').disabled=false; });
}
var newCls='mage';
function openNewChar(){
  $('newSlotNo').textContent=String(S.selSlot);
  $('newName').value='';
  $('newErr').textContent='';
  document.querySelectorAll('#clsPick button').forEach(function(b){
    b.classList.toggle('sel', b.getAttribute('data-cls')===newCls);
  });
  $('modalNew').classList.remove('hidden');
  $('newName').focus();
}
function doCreateChar(){
  var name=$('newName').value.trim();
  if(!name){ $('newErr').textContent='请先输入角色名。'; return; }
  $('btnDoCreate').disabled=true;
  fetchWake('/api/character',{method:'POST',body:{deviceId:deviceId,slot:S.selSlot,name:name,cls:newCls}}).then(function(){
    hideWake();
    $('modalNew').classList.add('hidden');
    toast('角色「'+name+'」已创建（'+S.selSlot+' 号位）。');
    return loadCharacters();
  }).catch(function(err){
    hideWake();
    $('newErr').textContent='创建失败：'+err.message;
  }).finally(function(){ $('btnDoCreate').disabled=false; });
}
function doDeleteChar(){
  var cur=S.slots[S.selSlot-1];
  if(!cur) return;
  if(!confirm('确定删除 '+S.selSlot+' 号位「'+cur.name+'」吗？删了找不回来。')) return;
  fetchWake('/api/character/'+S.selSlot,{method:'DELETE',body:{deviceId:deviceId}}).then(function(){
    hideWake(); toast('已删除 '+S.selSlot+' 号位角色。'); return loadCharacters();
  }).catch(function(err){ hideWake(); alert('删除失败：'+err.message); });
}
/* 房间 */
function doCreateRoom(){
  if(!S.wsOk){ alert('还没连上游戏服务器，请先进入游戏。'); return; }
  sendWs({t:'create_room'});
  toast('正在创建房间……');
}
function doJoinRoom(){
  var code=$('joinCode').value.trim().toUpperCase();
  $('joinErr').textContent='';
  if(!/^[A-Z0-9]{5}$/.test(code)){ $('joinErr').textContent='请输入 5 位房间码。'; return; }
  if(!S.wsOk){ $('joinErr').textContent='还没连上游戏服务器，请先进入游戏。'; return; }
  sendWs({t:'join_room', code:code});
  $('modalJoin').classList.add('hidden');
  toast('正在加入房间 '+code+'……');
}
function setRoom(code, members){
  S.roomCode=code||null; S.roomMembers=members||[];
  if(code){
    $('roomBox').classList.remove('hidden');
    $('roomCode').textContent=code;
    $('roomMembers').textContent='房内 '+Math.max(1,(members||[]).length)+' 人（最多 4 人）';
    $('btnCreateRoom').textContent='已在房间';
  } else {
    $('roomBox').classList.add('hidden');
    $('btnCreateRoom').textContent='创建房间';
  }
}

/* ---------- WebSocket ---------- */
function connectWs(){
  return new Promise(function(resolve, reject){
    var url=wsUrl();
    var ws;
    try{ ws=new WebSocket(url); }catch(e){ reject(e); return; }
    S.ws=ws;
    var done=false;
    var timer=setTimeout(function(){ if(!done){ done=true; try{ws.close();}catch(e){} reject(new Error('WebSocket 连接超时')); } }, 20000);
    ws.onopen=function(){
      clearTimeout(timer); done=true;
      S.wsOk=true;
      sendWs({t:'auth', deviceId:deviceId, slot:S.selSlot});
      resolve(ws);
    };
    ws.onerror=function(){ if(!done){ clearTimeout(timer); done=true; reject(new Error('WebSocket 连接失败')); } };
    ws.onclose=function(){ S.wsOk=false; if(S.inGame){ toast('与服务器断开连接，正在重连……'); setTimeout(reconnectWs, 2000); } };
    ws.onmessage=function(ev){ onWsMessage(ev.data); };
  });
}
function reconnectWs(){
  if(!S.inGame) return;
  connectWs().then(function(){
    sendWs({t:'auth', deviceId:deviceId, slot:S.selSlot});
    if(S.roomCode) sendWs({t:'join_room', code:S.roomCode});
    toast('已重新连上服务器。');
  }).catch(function(){ setTimeout(reconnectWs, 5000); });
}
function sendWs(obj){
  if(S.ws && S.ws.readyState===1){ try{ S.ws.send(JSON.stringify(obj)); }catch(e){} }
}
function onWsMessage(raw){
  var m;
  try{ m=JSON.parse(raw); }catch(e){ return; }
  var t=m.t||m.type||'';
  if(t==='snapshot' || t==='state' || (!t && (m.players||m.monsters))){
    applySnapshot(m.snap||m.snapshot||m);
    return;
  }
  switch(t){
    case 'room_created': case 'room_joined': case 'room':
      setRoom(m.code||m.roomCode, m.members||m.players);
      toast(m.code?('已进入房间 '+m.code+'，把码发给朋友吧。'):'已在房间。');
      break;
    case 'room_left': setRoom(null); toast('已离开房间。'); break;
    case 'room_error': case 'error': toast('⚠️ '+(m.message||m.error||'操作失败')); break;
    case 'joined': toast('👋 '+(m.name||'队友')+' 加入了房间。'); break;
    case 'left': toast('👋 '+(m.name||'队友')+' 离开了房间。'); break;
    case 'chat': case 'msg': log((m.name?m.name+'：':'')+(m.text||m.message||'')); break;
    case 'notice': case 'system': toast(m.text||m.message||''); break;
    case 'levelup': toast('🎉 升级了！现在 Lv'+(m.level||'')); log('🎉 升级了！现在 Lv'+(m.level||''),'good'); break;
    case 'pickup': log('📦 拾取：'+(m.item||m.name||''),'gold'); break;
    case 'bonus_lit': case 'teleport_lit':
      toast('✨ 传送点已点亮：'+(m.stage||m.name||'')); log('✨ 传送点已点亮：'+(m.stage||m.name||''),'good'); break;
    case 'dodge': log('💨 闪避！','sys'); break;
    case 'auction': case 'auction_list': if(m.listings) S.auction=m.listings; if(m.claims) S.claims=m.claims; renderAuction(); break;
    case 'auction_created': case 'auction_bought': case 'auction_delisted': case 'auction_claimed': case 'auction_claims': if(m.listings) S.auction=m.listings; if(m.claims) S.claims=m.claims; refreshAuction(); refreshClaims(); break;
    case 'pong': break;
    default:
      if(m.message) toast(m.message);
      break;
  }
}

/* ---------- 快照 ---------- */
function applySnapshot(s){
  if(!s) return;
  S.snap=s;
  var me=null;
  var players=s.players||[];
  for(var i=0;i<players.length;i++){
    var p=players[i];
    if(p.deviceId===deviceId || p.me || p.self || (S.myChar && p.name===S.myChar.name)){ me=p; break; }
  }
  if(!me && players.length===1) me=players[0];
  if(!me && players.length) me=players[0];
  if(me){
    S.me.x=(me.x!=null?me.x:S.me.x); S.me.y=(me.y!=null?me.y:S.me.y);
    S.level=me.level||me.lv||S.level;
    S.gold=(me.gold!=null?me.gold:(s.gold!=null?s.gold:S.gold));
    S.xp=(me.xp!=null?me.xp:(s.xp!=null?s.xp:S.xp));
    S.xpNeed=(me.xpNeed!=null?me.xpNeed:(s.xpNeed!=null?s.xpNeed:S.xpNeed));
    if(me.hp!=null) S.me.hp=me.hp; if(me.maxHp!=null) S.me.maxHp=me.maxHp;
    if(me.mp!=null) S.me.mp=me.mp; if(me.maxMp!=null) S.me.maxMp=me.maxMp;
    if(me.name) S.me.name=me.name;
    if(me.cls) S.me.cls=me.cls;
    if(me.shield) S.me.shield=true;
  } else {
    S.gold=(s.gold!=null?s.gold:S.gold); S.xp=(s.xp!=null?s.xp:S.xp);
    S.xpNeed=(s.xpNeed!=null?s.xpNeed:S.xpNeed);
  }
  S.kills=(s.kills!=null?s.kills:S.kills);
  if(s.stage) S.stage=s.stage;
  if(s.layer!=null) S.layer=s.layer;
  if(s.hole) S.hole=s.hole;
  if(s.bonusLit) S.bonusLit=s.bonusLit;
  /* 背包 / 穿戴 / 药水 / 技能：快照里有就同步，没有就保留本地上次值 */
  if(s.bag) S.bag=s.bag;
  if(s.inventory) S.bag=s.inventory;
  if(s.worn) S.worn=s.worn;
  if(s.equipped) S.worn=s.equipped;
  if(s.potions) S.potions=normPotions(s.potions);
  if(s.hpPots||s.mpPots) S.potions={ hp:s.hpPots, mp:s.mpPots };
  if(s.books) S.books=s.books;
  if(s.learned) S.learned=s.learned;
  if(s.activeSkills) S.activeSkills=s.activeSkills;
  if(s.skills){ /* 服务端技能表：可能是已学列表或等级表 */
    if(Array.isArray(s.skills)){ s.skills.forEach(function(id){ S.learned[id]={lv:1}; }); }
    else if(typeof s.skills==='object'){ S.learned=s.skills; }
  }
  if(s.skillLv) S.skillLv=s.skillLv;
  if(s.drops) (s.drops||[]).forEach(function(d){ addFloater(d.x||S.me.x, d.y||S.me.y, d.text||d.name||'', '#ffd75e'); });
  if(s.events) (s.events||[]).forEach(function(ev){ if(typeof ev==='string') toast(ev); else if(ev.text) toast(ev.text); });
  if(s.effects) S.effects=S.effects.concat(s.effects.slice(0,20));
  updateHud();
  drawMinimap();
}
function normPotions(p){
  if(Array.isArray(p)) return {hp:p, mp:p};
  if(p.hp||p.mp) return {hp:p.hp||[0,0,0], mp:p.mp||[0,0,0]};
  return {hp:[0,0,0], mp:[0,0,0]};
}
function addFloater(x,y,text,color){
  S.floaters.push({x:x,y:y,text:text,color:color||'#fff',life:1.2});
  if(S.floaters.length>30) S.floaters.shift();
}

/* ---------- HUD ---------- */
function hpMax(){ return S.me.maxHp||100; }
function mpMax(){ return S.me.maxMp||50; }
function updateHud(){
  var hp=S.me.hp!=null?S.me.hp:hpMax(), mp=S.me.mp!=null?S.me.mp:mpMax();
  $('hpBar').firstElementChild.style.width=clamp(hp/hpMax()*100,0,100)+'%';
  $('hpNum').textContent=hp+'/'+hpMax();
  $('mpBar').firstElementChild.style.width=clamp(mp/mpMax()*100,0,100)+'%';
  $('mpNum').textContent=mp+'/'+mpMax();
  var xpPct=S.xpNeed?clamp(S.xp/S.xpNeed*100,0,100):0;
  $('xpBar').firstElementChild.style.width=xpPct+'%';
  $('xpNum').textContent='Lv '+S.level+'　'+S.xp+'/'+S.xpNeed;
  var c=S.myChar?CLASSES[S.myChar.cls]||{}:{};
  $('charInfo').textContent=(S.me.name||S.myChar&&S.myChar.name||'—')+'　'+(c.name||'')+' Lv'+S.level+(S.roomCode?'　🚪 房间 '+S.roomCode:'');
  $('goldLine').childNodes[0].textContent='💰 '+S.gold+'　⚔️ 击杀 '+S.kills+'　🗺️ ';
  $('stageName').textContent=stageById(S.stage).name;
  $('layerName').textContent=stageById(S.stage).layers>1?('第 '+S.layer+' 层'):'';
  var hpN=(S.potions.hp||[]).reduce(function(a,b){return a+(b||0);},0);
  var mpN=(S.potions.mp||[]).reduce(function(a,b){return a+(b||0);},0);
  $('hpPotN').textContent=hpN; $('mpPotN').textContent=mpN;
  $('shieldTag').style.display=(S.me.shield|| (S.myChar&&S.myChar.cls==='mage'&&S.learned['mage_shield']))?'block':'none';
  renderSkillBar();
}

/* ---------- 技能栏（2 门上场，长按 0.42s 拖动，位置存 localStorage） ---------- */
var SKILLBAR_KEY='lg_skillbar_pos';
function skillBarPos(){
  try{ var p=JSON.parse(localStorage.getItem(SKILLBAR_KEY)||'null'); if(p&&typeof p.x==='number') return p; }catch(e){}
  return null;
}
var _skillBarSig='';
function renderSkillBar(){
  /* 节流：只有上场技能、冷却整秒数、蓝量是否够放变化时才重建 DOM，避免快照 10 次/秒打断点按 */
  var sig=S.activeSkills.join(',')+'|'+S.activeSkills.map(function(id){ return Math.ceil(skillCdLeft(id)); }).join(',')+'|'+S.activeSkills.map(function(id){ var sk=SKILLS[id]; return sk?(S.me.mp!=null&&sk.mp>S.me.mp?1:0):0; }).join(',');
  if(sig===_skillBarSig) return;
  _skillBarSig=sig;
  var bar=$('skillBar');
  var pos=skillBarPos();
  if(pos){ bar.style.left=pos.x+'px'; bar.style.top=pos.y+'px'; bar.style.right='auto'; bar.style.bottom='auto'; }
  else { bar.style.left='50%'; bar.style.top='auto'; bar.style.right='auto'; bar.style.bottom='180px'; bar.style.transform='translateX(-50%)'; }
  bar.innerHTML='';
  for(var i=0;i<2;i++){
    var id=S.activeSkills[i];
    var sk=id?SKILLS[id]:null;
    var slot=el('div','skill-slot'+(sk?'':' empty'));
    slot.appendChild(el('span','ic', sk?SKILL_ICON[sk.cls]:'＋'));
    slot.appendChild(el('span','nm', sk?sk.name:'空技能栏'));
    if(sk){
      if(sk.mp) slot.appendChild(el('span','mp','-'+sk.mp+'蓝'));
      var cdLeft=skillCdLeft(id);
      if(cdLeft>0) slot.appendChild(el('div','cd', cdLeft.toFixed(1)));
      else if(S.me.mp!=null && sk.mp>S.me.mp) slot.classList.add('no-mp');
      (function(sid, idx){ slot.onclick=function(){ castSkill(sid, idx); }; })(id, i);
    } else {
      slot.onclick=function(){ openPanel('panelSkills'); };
    }
    var key=el('span','skill-key', String(i+1));
    slot.appendChild(key);
    bar.appendChild(slot);
  }
}
function skillCdLeft(id){
  var sk=SKILLS[id]; if(!sk||!sk.cd) return 0;
  var last=S.lastSkillAt[id]||0;
  return Math.max(0, sk.cd-(Date.now()-last)/1000);
}
function castSkill(id, idx){
  var sk=SKILLS[id]; if(!sk) return;
  if(sk.passive) return;
  if(skillCdLeft(id)>0) return;
  if(S.me.mp!=null && sk.mp>S.me.mp){ toast('蓝不够放「'+sk.name+'」，自动喝药中……'); sendWs({t:'use_potion', kind:'mp'}); return; }
  S.lastSkillAt[id]=Date.now();
  sendWs({t:'skill', skillId:id});
  addEffect('skill', S.me.x, S.me.y, id);
  renderSkillBar();
}
function setActiveSkills(ids){
  S.activeSkills=ids.slice(0,2);
  sendWs({t:'set_active_skills', skills:S.activeSkills});
  renderSkillBar();
}
/* 技能栏长按拖动 */
(function(){
  var bar=$('skillBar'); if(!bar) return;
  var pressTimer=null, dragging=false, offX=0, offY=0;
  function start(e){
    var p=pointOf(e);
    pressTimer=setTimeout(function(){
      dragging=true; bar.classList.add('dragging');
      var r=bar.getBoundingClientRect();
      offX=p.x-r.left; offY=p.y-r.top;
    }, 420);
  }
  function move(e){
    if(!dragging) return;
    e.preventDefault();
    var p=pointOf(e);
    var x=clamp(p.x-offX, 0, window.innerWidth-130);
    var y=clamp(p.y-offY, 60, window.innerHeight-80);
    bar.style.left=x+'px'; bar.style.top=y+'px'; bar.style.transform='none'; bar.style.bottom='auto';
    try{ localStorage.setItem(SKILLBAR_KEY, JSON.stringify({x:x,y:y})); }catch(err){}
  }
  function end(){ clearTimeout(pressTimer); dragging=false; bar.classList.remove('dragging'); }
  bar.addEventListener('pointerdown', start);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  function pointOf(e){ return {x:e.clientX, y:e.clientY}; }
})();

/* ---------- Canvas 渲染（3D 立体方向：渐变、柔和阴影、发光眼睛） ---------- */
var cv=$('cv'), ctx=cv.getContext('2d');
var DPR=1;
function resizeCv(){
  DPR=Math.min(2, window.devicePixelRatio||1);
  cv.width=cv.clientWidth*DPR; cv.height=cv.clientHeight*DPR;
}
window.addEventListener('resize', function(){ resizeCv(); });
function stageGround(st){
  var g=ctx.createRadialGradient(cv.width/2, cv.height/2, 50, cv.width/2, cv.height/2, Math.max(cv.width,cv.height)*0.7);
  g.addColorStop(0, lighten(st.ground, 18));
  g.addColorStop(1, st.ground);
  return g;
}
function lighten(hex, amt){
  var n=parseInt(hex.slice(1),16);
  var r=clamp((n>>16)+amt,0,255), gg=clamp(((n>>8)&255)+amt,0,255), b=clamp((n&255)+amt,0,255);
  return 'rgb('+r+','+gg+','+b+')';
}
function drawShadow(x,y,r){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x,y+r*0.75,r*0.9,r*0.32,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawCreature(x,y,r,body,eye,opts){
  opts=opts||{};
  drawShadow(x,y,r);
  var g=ctx.createRadialGradient(x-r*0.3,y-r*0.4,r*0.1,x,y,r);
  g.addColorStop(0, lighten(body, 46));
  g.addColorStop(0.55, body);
  g.addColorStop(1, lighten(body,-34));
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
  /* 发光眼睛 */
  var ex=r*0.38, ey=-r*0.18, er=Math.max(1.6,r*0.16);
  ctx.save();
  ctx.shadowColor=eye; ctx.shadowBlur=8;
  ctx.fillStyle=eye;
  ctx.beginPath(); ctx.arc(x-ex,ey,er,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+ex,ey,er,0,Math.PI*2); ctx.fill();
  ctx.restore();
  if(opts.boss){ /* Boss 金色光环 */
    ctx.save(); ctx.strokeStyle='rgba(255,190,60,0.85)'; ctx.lineWidth=2.5;
    ctx.shadowColor='#ffb43c'; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(x,y,r+5,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
  if(opts.shield){ /* 魔法盾：淡蓝光罩 */
    ctx.save(); ctx.strokeStyle='rgba(130,190,255,0.8)'; ctx.lineWidth=2;
    ctx.shadowColor='#7ab8ff'; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(x,y,r+7,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
}
function drawHpBar(x,y,w,frac,color){
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.fillRect(x-w/2,y,w,5);
  ctx.fillStyle=color||'#e33';
  ctx.fillRect(x-w/2,y,w*clamp(frac,0,1),5);
}
var MON_COLORS={};
function monColor(m){
  if(m.color) return m.color;
  if(!MON_COLORS[m.id]){ var h=0; for(var i=0;i<m.id.length;i++) h=(h*31+m.id.charCodeAt(i))%360; MON_COLORS[m.id]='hsl('+h+',45%,42%)'; }
  return MON_COLORS[m.id];
}
function holePosition(){
  /* 洞口位置：快照给坐标就用快照的；否则按僵尸洞三层固定点（地图 72% 宽、30% 高） */
  if(S.hole && S.hole.x!=null && S.hole.y!=null) return {x:S.hole.x, y:S.hole.y};
  if(S.holePos) return S.holePos;
  var st=stageById('jiangshi');
  S.holePos={x:Math.round(st.w*0.72), y:Math.round(st.h*0.30)};
  return S.holePos;
}
var _renderRunning=false;
function render(){
  if(!S.inGame) { _renderRunning=false; return; }
  if(_renderRunning) return;
  _renderRunning=true;
  requestAnimationFrame(renderLoop);
}
function renderLoop(){
  if(!S.inGame){ _renderRunning=false; return; }
  requestAnimationFrame(renderLoop);
  var st=stageById(S.stage);
  var W=cv.clientWidth, H=cv.clientHeight;
  if(!W||!H) return;
  /* 相机跟随自己 */
  S.cam.x=clamp(S.me.x-W/2, 0, Math.max(0, st.w-W));
  S.cam.y=clamp(S.me.y-H/2, 0, Math.max(0, st.h-H));
  var ox=-S.cam.x, oy=-S.cam.y;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  /* 地面 */
  ctx.fillStyle=stageGround(st);
  ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
  var gs=120;
  for(var gx=Math.floor(S.cam.x/gs)*gs; gx<S.cam.x+W; gx+=gs){ ctx.beginPath(); ctx.moveTo(gx+ox,0); ctx.lineTo(gx+ox,H); ctx.stroke(); }
  for(var gy=Math.floor(S.cam.y/gs)*gs; gy<S.cam.y+H; gy+=gs){ ctx.beginPath(); ctx.moveTo(0,gy+oy); ctx.lineTo(W,gy+oy); ctx.stroke(); }
  /* 白日门：东边海 + 中央城 */
  if(st.id==='bairimen'){
    var sea=ctx.createLinearGradient(W-160,0,W,0);
    sea.addColorStop(0,'rgba(40,90,140,0)'); sea.addColorStop(1,'rgba(40,90,140,0.75)');
    ctx.fillStyle=sea; ctx.fillRect(W-160,0,160,H);
    ctx.fillStyle='rgba(0,0,0,0.25)';
    var cx=st.w/2+ox, cy=st.h/2+oy;
    ctx.strokeStyle='rgba(232,194,104,0.7)'; ctx.lineWidth=3;
    ctx.strokeRect(cx-130,cy-90,260,180);
    ctx.fillStyle='#ffe9b0'; ctx.font='bold 15px sans-serif'; ctx.textAlign='center';
    ctx.fillText('🏰 白日门 · 安全区', cx, cy-100);
  }
  /* 比奇城：中央安全区 + 传送站 */
  if(st.id==='city'){
    var ccx=st.w/2+ox, ccy=st.h/2+oy;
    ctx.fillStyle='rgba(232,194,104,0.10)';
    ctx.beginPath(); ctx.arc(ccx,ccy,190,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(232,194,104,0.7)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(ccx,ccy,190,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#ffe9b0'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
    ctx.fillText('🏰 比奇城 · 安全区', ccx, ccy-200);
    ctx.fillText('传送员 / 商店 / 拍卖行', ccx, ccy+220);
  }
  /* 僵尸洞三层洞口 */
  if(st.id==='jiangshi' && S.layer===3){
    var hp=holePosition();
    var hx=hp.x+ox, hy=hp.y+oy;
    var open=!(S.hole && S.hole.open===false);
    ctx.save();
    ctx.shadowColor='#ffd75e'; ctx.shadowBlur=18;
    ctx.strokeStyle='#ffd75e'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.ellipse(hx,hy,46,26,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
    var hg=ctx.createRadialGradient(hx,hy,4,hx,hy,44);
    hg.addColorStop(0,'#000'); hg.addColorStop(0.7,'#1a1206'); hg.addColorStop(1,'rgba(60,40,10,0.4)');
    ctx.fillStyle=hg;
    ctx.beginPath(); ctx.ellipse(hx,hy,44,24,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#8a6d3b';
    for(var ti=0;ti<8;ti++){ var a=ti/8*Math.PI*2; ctx.beginPath(); ctx.arc(hx+Math.cos(a)*46, hy+Math.sin(a)*26, 3, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#ffe9b0'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
    ctx.fillText('🕳️', hx, hy+8);
    ctx.font='bold 12px sans-serif'; ctx.fillStyle='#ffd75e';
    ctx.fillText(open?'尸王殿入口':'洞口（未开启）', hx, hy-34);
    /* 守洞黄衣僵尸：洞里只露头 / 爬出中 / 爬出后 */
    var gp=S.guardianPos;
    if(gp){
      drawCreature(gp.x+ox, gp.y+oy, 20, '#8a7a3a', '#ff5a3c', {});
      ctx.fillStyle='#ffe9b0'; ctx.font='11px sans-serif'; ctx.textAlign='center';
      ctx.fillText('黄衣僵尸', gp.x+ox, gp.y+oy-28);
    } else if(S.hole && S.hole.guardian==='in_hole'){
      drawCreature(hx, hy-6, 13, '#8a7a3a', '#ff5a3c', {});
      ctx.fillStyle='#ffe9b0'; ctx.font='11px sans-serif'; ctx.textAlign='center';
      ctx.fillText('🧟 往外爬……', hx, hy-26);
    }
    /* 走进洞口 → 显示进入按钮（距离 < 90） */
    var dHole=Math.hypot(S.me.x-hp.x, S.me.y-hp.y);
    $('enterHoleBtn').style.display=(open && dHole<90)?'block':'none';
  } else {
    $('enterHoleBtn').style.display='none';
  }
  /* 蜈蚣洞连接通道（东侧） */
  if(st.id==='wugong'){
    var px=st.w-90+ox, py=st.h*0.5+oy;
    ctx.save(); ctx.shadowColor='#ffd75e'; ctx.shadowBlur=12;
    ctx.fillStyle='#ffd75e'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
    ctx.fillText('🕯️', px, py); ctx.restore();
    ctx.fillStyle='#ffe9b0'; ctx.font='11px sans-serif';
    ctx.fillText('连接通道 → 未知暗殿', px-40, py+20);
    $('portalBtn').style.display=(Math.hypot(S.me.x-(st.w-90), S.me.y-st.h*0.5)<90)?'block':'none';
  } else {
    $('portalBtn').style.display='none';
  }
  /* 技能特效（火墙 / 冰圈 / 火球轨迹等，纯客户端视觉） */
  var now=Date.now();
  S.effects=S.effects.filter(function(e){ return now-e.born<1600; });
  S.effects.forEach(function(e){
    var age=(now-e.born)/1600, ex=e.x+ox, ey=e.y+oy;
    if(e.kind==='firewall'){
      ctx.save(); ctx.globalAlpha=1-age*0.6;
      var fg=ctx.createRadialGradient(ex,ey,4,ex,ey,60);
      fg.addColorStop(0,'rgba(255,160,40,0.85)'); fg.addColorStop(1,'rgba(255,60,0,0)');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(ex,ey,60,0,Math.PI*2); ctx.fill(); ctx.restore();
    } else if(e.kind==='ice'){
      ctx.save(); ctx.globalAlpha=1-age*0.5; ctx.strokeStyle='#9fd8ff'; ctx.lineWidth=3;
      ctx.shadowColor='#7ab8ff'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(ex,ey,20+age*70,0,Math.PI*2); ctx.stroke(); ctx.restore();
    } else if(e.kind==='skill'){
      ctx.save(); ctx.globalAlpha=1-age; ctx.strokeStyle='#ffd75e'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(ex,ey,14+age*50,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }
  });
  /* 怪物 */
  var mons=(S.snap&&S.snap.monsters)||[];
  mons.forEach(function(m){
    var mx=m.x+ox, my=m.y+oy;
    if(mx<-60||my<-60||mx>W+60||my>H+60) return;
    var isBoss=!!(m.boss||m.isBoss);
    var r=isBoss?30:18;
    drawCreature(mx,my,r, monColor(m), isBoss?'#ff3c2e':'#ffe27a', {boss:isBoss});
    if(m.name||m.id){
      ctx.fillStyle='#fff'; ctx.font=(isBoss?'bold 13px':'11px')+' sans-serif'; ctx.textAlign='center';
      ctx.fillText((isBoss?'👹 ':'')+(m.name||m.id), mx, my-r-16);
      if(m.lv) { ctx.fillStyle='#cbb98a'; ctx.font='10px sans-serif'; ctx.fillText('Lv'+m.lv, mx, my-r-5); }
    }
    if(m.hp!=null&&m.maxHp) drawHpBar(mx,my-r-4, isBoss?64:40, m.hp/m.maxHp, isBoss?'#ff9a3c':'#e33');
    if(m.guardian){ S.guardianPos={x:m.x,y:m.y}; S.guardianAlive=true; }
  });
  /* 其他玩家 */
  var players=(S.snap&&S.snap.players)||[];
  players.forEach(function(p){
    if(p.deviceId===deviceId || (S.myChar&&p.name===S.myChar.name)) return;
    var px2=p.x+ox, py2=p.y+oy;
    var col=p.cls==='mage'?'#7ab8ff':(p.cls==='tao'?'#9fe08a':'#ff9a6e');
    drawCreature(px2,py2,20,col,'#fff',{});
    ctx.fillStyle='#fff'; ctx.font='12px sans-serif'; ctx.textAlign='center';
    ctx.fillText(p.name||'队友', px2, py2-30);
    if(p.hp!=null&&p.maxHp) drawHpBar(px2,py2-24,44,p.hp/p.maxHp,'#7ab8ff');
  });
  /* 自己 */
  var meX=S.me.x+ox, meY=S.me.y+oy;
  var meCol=S.me.cls==='mage'?'#7ab8ff':(S.me.cls==='tao'?'#9fe08a':'#ff9a6e');
  drawCreature(meX,meY,22,meCol,'#fff',{shield:!!(S.me.shield||(S.myChar&&S.myChar.cls==='mage'&&S.learned['mage_shield']))});
  ctx.fillStyle='#ffe9b0'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
  ctx.fillText('我 · '+(S.me.name||''), meX, meY-32);
  if(S.me.hp!=null) drawHpBar(meX,meY-26,48,S.me.hp/hpMax(),'#4ade80');
  /* 飘字 */
  S.floaters=S.floaters.filter(function(f){ f.life-=0.016; return f.life>0; });
  S.floaters.forEach(function(f){
    ctx.save(); ctx.globalAlpha=clamp(f.life,0,1);
    ctx.fillStyle=f.color; ctx.font='bold 15px sans-serif'; ctx.textAlign='center';
    ctx.fillText(f.text, f.x+ox, f.y+oy-(1.2-f.life)*40); ctx.restore();
  });
  /* 屏幕外洞口方向箭头（僵尸洞三层） */
  if(st.id==='jiangshi' && S.layer===3){
    var hp2=holePosition();
    var sx=hp2.x+ox, sy=hp2.y+oy;
    if(sx<-20||sy<-20||sx>W+20||sy>H+20){
      var cx2=clamp(sx,30,W-30), cy2=clamp(sy,30,H-30);
      var ang=Math.atan2(sy-cy2, sx-cx2);
      var dist=Math.round(Math.hypot(S.me.x-hp2.x, S.me.y-hp2.y));
      ctx.save();
      ctx.translate(cx2,cy2); ctx.rotate(ang);
      ctx.fillStyle='#ffd75e'; ctx.shadowColor='#ffd75e'; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(-8,-9); ctx.lineTo(-8,9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle='#ffd75e'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
      ctx.fillText('🕳️ '+dist, cx2, cy2+26);
    }
  }
  ctx.restore();
}
function addEffect(kind,x,y,extra){
  S.effects.push({kind:kind,x:x,y:y,born:Date.now(),extra:extra});
  if(kind==='skill'){
    var id=extra;
    if(id==='mage_firewall') S.effects.push({kind:'firewall',x:x+60,y:y,born:Date.now()});
    if(id==='mage_bingpao') S.effects.push({kind:'ice',x:x,y:y,born:Date.now()});
  }
}

/* ---------- 移动输入：虚拟摇杆（死区 3px）+ WASD/方向键 ---------- */
var joy={active:false, id:null, cx:0, cy:0};
var joyEl=$('joy'), knob=$('joyKnob');
function joyCenter(){ var r=joyEl.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; }
joyEl.addEventListener('pointerdown', function(e){
  joy.active=true; joy.id=e.pointerId; joy.cx=e.clientX; joy.cy=e.clientY;
  joyEl.setPointerCapture(e.pointerId);
  joyMove(e);
});
joyEl.addEventListener('pointermove', function(e){ if(joy.active&&e.pointerId===joy.id) joyMove(e); });
function joyEnd(e){ if(e.pointerId!==joy.id) return; joy.active=false; S.moveVec={x:0,y:0}; knob.style.transform='translate(0,0)'; }
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);
function joyMove(e){
  var c=joyCenter();
  var dx=e.clientX-c.x, dy=e.clientY-c.y;
  var len=Math.hypot(dx,dy), max=44;
  if(len>max){ dx=dx/len*max; dy=dy/len*max; }
  knob.style.transform='translate('+dx+'px,'+dy+'px)';
  if(len<3){ S.moveVec={x:0,y:0}; return; } /* 死区 3px */
  S.moveVec={x:dx/max, y:dy/max};
}
window.addEventListener('keydown', function(e){
  if(!$('game').classList.contains('hidden')){
    var k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
    S.keys[k]=true;
    if(k==='1') castSkill(S.activeSkills[0],0);
    if(k==='2') castSkill(S.activeSkills[1],1);
    if(k==='q'||k==='Q') openPanel('panelSkills');
    if(k==='b') openPanel('panelBag');
    if(k===' ') doAttack();
    if(k==='m') toggleBigmap();
    if(k==='escape') closePanels();
  }
});
window.addEventListener('keyup', function(e){ S.keys[e.key.toLowerCase()]=false; });
function keyVec(){
  var x=0,y=0;
  if(S.keys['w']||S.keys['arrowup']) y-=1;
  if(S.keys['s']||S.keys['arrowdown']) y+=1;
  if(S.keys['a']||S.keys['arrowleft']) x-=1;
  if(S.keys['d']||S.keys['arrowright']) x+=1;
  return {x:x,y:y};
}
/* 移动主循环：每 100ms 发一次 move（与服务端快照节拍对齐） */
var lastMoveSent=0;
setInterval(function(){
  if(!S.inGame||!S.wsOk) return;
  var kv=keyVec();
  var v=(Math.abs(kv.x)+Math.abs(kv.y)>0)?kv:S.moveVec;
  if(!v.x&&!v.y) return;
  var len=Math.hypot(v.x,v.y)||1;
  var nx=S.me.x+v.x/len*14, ny=S.me.y+v.y/len*14;
  var st=stageById(S.stage);
  nx=clamp(nx,20,st.w-20); ny=clamp(ny,20,st.h-20);
  S.me.x=nx; S.me.y=ny;
  var now=Date.now();
  if(now-lastMoveSent>=100){ lastMoveSent=now; sendWs({t:'move', x:Math.round(nx), y:Math.round(ny)}); }
}, 50);
function doAttack(){
  sendWs({t:'attack'});
  addEffect('skill', S.me.x, S.me.y, S.activeSkills[0]);
}
setInterval(function(){ if(S.inGame&&S.wsOk) sendWs({t:'ping'}); }, 15000);

/* ---------- 小地图 / 大地图 ---------- */
function drawMinimap(){
  var c=$('minimap'); if(!c||!S.inGame) return;
  var m=c.getContext('2d');
  var st=stageById(S.stage);
  var W=c.width, H=c.height;
  m.clearRect(0,0,W,H);
  m.fillStyle=st.ground; m.fillRect(0,0,W,H);
  var sx=W/st.w, sy=H/st.h;
  /* 入口/出口（绿色点） */
  (st.to||[]).forEach(function(tid, i){
    var tx=W*0.15+i*W*0.12, ty=H-10;
    m.fillStyle='#4ade80'; m.beginPath(); m.arc(tx,ty,4,0,Math.PI*2); m.fill();
  });
  /* 怪物红点、Boss 橙点 */
  var mons=(S.snap&&S.snap.monsters)||[];
  mons.forEach(function(mo){
    var isBoss=!!(mo.boss||mo.isBoss);
    m.fillStyle=isBoss?'#ff9a3c':'#ff4d4d';
    m.beginPath(); m.arc(mo.x*sx, mo.y*sy, isBoss?5:3, 0, Math.PI*2); m.fill();
  });
  /* 僵尸洞三层洞口：黄色圆环 + 🧟 */
  if(st.id==='jiangshi' && S.layer===3){
    var hp=holePosition();
    var hx=hp.x*sx, hy=hp.y*sy;
    m.save();
    m.strokeStyle='#ffd75e'; m.lineWidth=2.5; m.shadowColor='#ffd75e'; m.shadowBlur=6;
    m.beginPath(); m.arc(hx,hy,9,0,Math.PI*2); m.stroke(); m.restore();
    m.font='13px sans-serif'; m.textAlign='center';
    var gp=S.guardianPos;
    if(gp){ m.fillText('🧟', gp.x*sx, gp.y*sy+5); }
    else { m.fillText('🧟', hx, hy+5); }
    if(S.hole && S.hole.guardian==='in_hole'){ m.fillStyle='#ffd75e'; m.font='9px sans-serif'; m.fillText('爬出中', hx, hy-12); }
  }
  /* 自己：金色脉冲圈 + “我” */
  var pulse=3+Math.sin(Date.now()/300)*1.5;
  m.save();
  m.strokeStyle='#ffd75e'; m.lineWidth=2; m.shadowColor='#ffd75e'; m.shadowBlur=8;
  m.beginPath(); m.arc(S.me.x*sx, S.me.y*sy, 7+pulse, 0, Math.PI*2); m.stroke(); m.restore();
  m.fillStyle='#ffd75e'; m.font='bold 11px sans-serif'; m.textAlign='center';
  m.fillText('我', S.me.x*sx, S.me.y*sy+4);
  /* 队友 */
  ((S.snap&&S.snap.players)||[]).forEach(function(p){
    if(p.deviceId===deviceId) return;
    m.fillStyle='#7ab8ff'; m.beginPath(); m.arc(p.x*sx, p.y*sy, 4, 0, Math.PI*2); m.fill();
  });
}
var bigmapOpen=false;
function toggleBigmap(){
  bigmapOpen=!bigmapOpen;
  $('bigmap').classList.toggle('hidden', !bigmapOpen);
  if(bigmapOpen) drawBigmap();
}
function drawBigmap(){
  var c=$('bigmapCv'); if(!c) return;
  var st=stageById(S.stage);
  $('bigmapTitle').textContent=st.name+(st.layers>1?' · 第 '+S.layer+' 层':'')+'（'+st.w+'×'+st.h+'）';
  var W=c.clientWidth||window.innerWidth-24, H=c.clientHeight||window.innerHeight-160;
  c.width=W; c.height=H;
  var m=c.getContext('2d');
  m.fillStyle=st.ground; m.fillRect(0,0,W,H);
  var sx=W/st.w, sy=H/st.h;
  var mons=(S.snap&&S.snap.monsters)||[];
  mons.forEach(function(mo){
    var isBoss=!!(mo.boss||mo.isBoss);
    m.fillStyle=isBoss?'#ff9a3c':'#ff4d4d';
    m.beginPath(); m.arc(mo.x*sx, mo.y*sy, isBoss?7:4, 0, Math.PI*2); m.fill();
    if(isBoss){ m.fillStyle='#fff'; m.font='bold 12px sans-serif'; m.textAlign='left'; m.fillText(mo.name||'Boss', mo.x*sx+9, mo.y*sy+4); }
  });
  (st.to||[]).forEach(function(tid, i){
    var t=stageById(tid);
    m.fillStyle='#4ade80'; m.font='12px sans-serif'; m.textAlign='left';
    m.fillText('🚪 '+t.name, 10, 20+i*18);
  });
  if(st.id==='jiangshi' && S.layer===3){
    var hp=holePosition();
    m.save(); m.strokeStyle='#ffd75e'; m.lineWidth=3; m.shadowColor='#ffd75e'; m.shadowBlur=10;
    m.beginPath(); m.arc(hp.x*sx, hp.y*sy, 12, 0, Math.PI*2); m.stroke(); m.restore();
    m.font='20px sans-serif'; m.fillText('🧟', hp.x*sx-10, hp.y*sy+7);
    m.fillStyle='#ffd75e'; m.font='12px sans-serif'; m.fillText('尸王殿洞口（走进去）', hp.x*sx+16, hp.y*sy+4);
  }
  if(st.id==='wugong'){
    m.fillStyle='#ffd75e'; m.font='12px sans-serif';
    m.fillText('🕯️ 连接通道 → 未知暗殿（东侧）', (st.w-90)*sx-140, st.h*0.5*sy+24);
  }
  var pulse=4+Math.sin(Date.now()/300)*2;
  m.save(); m.strokeStyle='#ffd75e'; m.lineWidth=2.5; m.shadowColor='#ffd75e'; m.shadowBlur=10;
  m.beginPath(); m.arc(S.me.x*sx, S.me.y*sy, 10+pulse, 0, Math.PI*2); m.stroke(); m.restore();
  m.fillStyle='#ffd75e'; m.font='bold 13px sans-serif'; m.textAlign='center';
  m.fillText('我', S.me.x*sx, S.me.y*sy+5);
  if(bigmapOpen) requestAnimationFrame(function(){ if(bigmapOpen) drawBigmap(); });
}

/* ---------- 面板开关 ---------- */
var PANELS=['panelBag','panelSkills','panelShop','panelAuction','panelTeleport'];
function openPanel(id){
  PANELS.forEach(function(p){ $(p).classList.toggle('hidden', p!==id); });
  if(id==='panelBag') renderBag();
  if(id==='panelSkills') renderSkills();
  if(id==='panelShop') renderShop();
  if(id==='panelAuction') renderAuction();
  if(id==='panelTeleport') renderTeleport();
}
function closePanels(){ PANELS.forEach(function(p){ $(p).classList.add('hidden'); }); }
document.querySelectorAll('[data-close]').forEach(function(b){ b.onclick=closePanels; });
function itemLabel(it){
  if(!it) return '—';
  var nm=it.name||it.id||'装备';
  var st=[];
  if(it.stats){ if(Array.isArray(it.stats)) st.push(it.stats.join('-')); else if(typeof it.stats==='object'){ Object.keys(it.stats).forEach(function(k){ var v=it.stats[k]; st.push(k+' '+(Array.isArray(v)?v.join('-'):v)); }); } else st.push(String(it.stats)); }
  if(it.atk) st.push('攻击 '+it.atk.join('-'));
  if(it.mag) st.push('魔法 '+it.mag.join('-'));
  if(it.tao) st.push('道术 '+it.tao.join('-'));
  if(it.def) st.push('防御 '+it.def.join('-'));
  if(it.acc) st.push('准确 +'+it.acc);
  return {name:nm, stats:st.join(' · '), icon:it.icon||'📦', tier:it.tier||0, reqLv:it.reqLv||1, slot:it.slot, uid:it.uid||it.id, book:!!(it.book||it.isBook||it.type==='book')};
}
function renderBag(){
  var g=$('equipGrid'); g.innerHTML='';
  SLOT_ORDER.forEach(function(slot){
    var it=S.worn[slot]||S.worn[slot==='braceL'?'bracelet':slot]||S.worn[slot==='ringL'?'ring':slot];
    var d=el('div','equip-slot');
    d.appendChild(el('div','elab',SLOT_LABEL[slot]));
    if(it){
      var L=itemLabel(it);
      d.appendChild(el('div','eic',L.icon));
      d.appendChild(el('div','enm',L.name));
      d.appendChild(el('div','estat',L.stats));
      d.onclick=function(){ sendWs({t:'unequip', slot:slot}); toast('卸下 '+L.name); };
    } else {
      d.appendChild(el('div','enm','（空）'));
      d.onclick=function(){ toast('该位置是空的，先在背包里点装备穿上。'); };
    }
    g.appendChild(d);
  });
  var bg=$('bagGrid'); bg.innerHTML='';
  var bag=S.bag||[];
  $('bagHint').textContent='背包 '+bag.length+'/40　💰 '+S.gold+'　药水：红 '+((S.potions.hp||[]).reduce(function(a,b){return a+(b||0);},0))+' / 蓝 '+((S.potions.mp||[]).reduce(function(a,b){return a+(b||0);},0));
  if(!bag.length) bg.appendChild(el('div','','（背包是空的，打怪会掉装备和技能书）'));
  bag.forEach(function(it){
    var L=itemLabel(it);
    var c=el('div','bag-cell'+(L.book?' book':'')+(it.epic||it.jp?' epic':'')+(S.selBagUid===L.uid?' sel':''));
    c.appendChild(el('div','eic',L.icon));
    c.appendChild(el('div','enm',L.name));
    if(it.count>1) c.appendChild(el('div','cnt','×'+it.count));
    c.onclick=function(){ S.selBagUid=L.uid; renderBag(); };
    c.ondblclick=function(){ useBagItem(it); };
    bg.appendChild(c);
  });
  /* 技能书背包（服务端 books 字段） */
  (S.books||[]).forEach(function(b){
    var sk=SKILLS[b]||SKILLS[b.id];
    var nm=sk?('《'+sk.name+'》'):('《'+(b.name||b)+'》');
    var c=el('div','bag-cell book');
    c.appendChild(el('div','eic','📖'));
    c.appendChild(el('div','enm',nm));
    c.onclick=function(){ useBook(b.id||b); };
    bg.appendChild(c);
  });
}
function selBagItem(){
  if(S.selBagUid==null) return null;
  var bag=S.bag||[];
  for(var i=0;i<bag.length;i++){ var it=bag[i]; if((it.uid||it.id)===S.selBagUid) return it; }
  return null;
}
function useBagItem(it){
  if(!it) return;
  var L=itemLabel(it);
  if(L.book){ useBook(it.uid||it.id||it.skillId); return; }
  sendWs({t:'equip', uid:L.uid});
  toast('穿上 '+L.name);
}
function useBook(uidOrId){
  sendWs({t:'use_book', uid:uidOrId});
  sendWs({t:'use_item', uid:uidOrId});
  toast('使用技能书……（等级够了才能学）');
}
function renderSkills(){
  var box=$('skillList'); box.innerHTML='';
  var cls=S.myChar?S.myChar.cls:(S.me.cls||'mage');
  CLASS_SKILLS[cls].forEach(function(id){
    var sk=SKILLS[id];
    var learned=S.learned[id];
    var lv=learned?(learned.lv||1):0;
    var row=el('div','skill-row'+(learned?'':' locked'));
    row.appendChild(el('div','sic',SKILL_ICON[cls]));
    var body=el('div','sbody');
    body.appendChild(el('div','sname',sk.name+(sk.passive?'（被动）':'')+(sk.auto?' · 自动释放':'')));
    body.appendChild(el('div','sdesc',sk.desc+'　学习等级 Lv'+sk.req+(sk.mp?' · 耗魔 '+sk.mp:'')+(sk.cd?' · 冷却 '+sk.cd+'s':'')));
    body.appendChild(el('div','slv',learned?('已学 Lv'+lv+'（熟练度每命中 +1，每级 1000 点）'):('未学 · 需 Lv'+sk.req+'，打怪掉技能书后在背包使用')));
    row.appendChild(body);
    if(learned && !sk.passive){
      var on=S.activeSkills.indexOf(id)>=0;
      var b=el('button', on?'':'primary', on?'✓ 已上场':'上场');
      b.onclick=function(){
        var cur=S.activeSkills.slice();
        var ix=cur.indexOf(id);
        if(ix>=0) cur.splice(ix,1);
        else { if(cur.length>=2) cur.shift(); cur.push(id); }
        setActiveSkills(cur); renderSkills();
      };
      row.appendChild(b);
    } else if(sk.passive && learned){
      row.appendChild(el('button','','被动生效中'));
    }
    box.appendChild(row);
  });
}
function renderShop(){
  var body=$('shopBody');
  document.querySelectorAll('#panelShop .shop-tabs button').forEach(function(b){
    b.classList.toggle('sel', b.getAttribute('data-tab')===S.shopTab);
    b.onclick=function(){ S.shopTab=b.getAttribute('data-tab'); renderShop(); };
  });
  body.innerHTML='';
  var cls=S.myChar?S.myChar.cls:(S.me.cls||'mage');
  if(S.shopTab==='equip'){
    body.appendChild(el('div','hint','只显示本职业基础装备（tier 0–1，无极品）。买价 = 卖价×2+10。'));
    var list=SHOP_EQUIPS.filter(function(e){ return e.cls===cls; });
    if(!list.length) body.appendChild(el('div','','本职业暂无基础装备在售。'));
    list.forEach(function(e){
      var row=el('div','shop-item');
      row.appendChild(el('div','sic',e.icon));
      var b=el('div','sbody');
      b.appendChild(el('div','sname',e.name+'　Lv'+e.reqLv+'可穿'));
      b.appendChild(el('div','sdesc',(SLOT_LABEL[e.slot]||e.slot)+' · '+e.stats+' · tier '+e.tier));
      row.appendChild(b);
      row.appendChild(el('div','sprice','💰 '+shopBuyPrice(e.price)));
      var btn=el('button','primary','购买');
      btn.onclick=function(){
        if(S.gold<shopBuyPrice(e.price)){ toast('金币不够。'); return; }
        sendWs({t:'buy', itemId:e.id});
        toast('购买 '+e.name+'……');
      };
      row.appendChild(btn);
      body.appendChild(row);
    });
  } else if(S.shopTab==='potion'){
    POTIONS.forEach(function(p){
      var row=el('div','shop-item');
      row.appendChild(el('div','sic','🧪'));
      var b=el('div','sbody');
      b.appendChild(el('div','sname',p.name+'药水'));
      b.appendChild(el('div','sdesc','红回 '+Math.round(p.hpPct*100)+'% / 蓝回 '+Math.round(p.mpPct*100)+'%'));
      row.appendChild(b);
      row.appendChild(el('div','sprice','💰 '+p.price+' / 瓶'));
      var btn=el('button','primary','买 10 瓶');
      btn.onclick=function(){ sendWs({t:'buy_potion', tier:p.id}); toast('购买'+p.name+'药水……'); };
      row.appendChild(btn);
      body.appendChild(row);
    });
    body.appendChild(el('div','hint','蓝不够放技能时会自动喝一瓶魔法瓶，回 60% 魔法。'));
  } else {
    body.appendChild(el('div','hint','点背包里的装备选「出售」可卖掉；维修按全部已穿装备每件 30 金币。'));
    var bag=S.bag||[];
    if(!bag.length) body.appendChild(el('div','','背包是空的，没有可卖的。'));
    bag.forEach(function(it){
      var L=itemLabel(it);
      var row=el('div','shop-item');
      row.appendChild(el('div','sic',L.icon));
      var b=el('div','sbody');
      b.appendChild(el('div','sname',L.name));
      b.appendChild(el('div','sdesc',L.stats));
      row.appendChild(b);
      row.appendChild(el('div','sprice','💰 '+(it.price||it.tradePrice||'--')));
      var btn=el('button','','出售');
      btn.onclick=function(){ sendWs({t:'sell', uid:L.uid}); toast('出售 '+L.name+'……'); };
      row.appendChild(btn);
      body.appendChild(row);
    });
    var rep=el('button','primary','🔧 维修全部已穿装备（每件 30 金币）');
    rep.style.width='100%'; rep.style.marginTop='8px';
    rep.onclick=function(){ sendWs({t:'repair'}); sendWs({t:'shop'}); toast('维修请求已发送……'); };
    body.appendChild(rep);
  }
}
function renderAuction(){
  var body=$('auctionBody'); if(!body) return;
  document.querySelectorAll('#panelAuction .shop-tabs button').forEach(function(b){
    b.classList.toggle('sel', b.getAttribute('data-tab')===S.aucTab);
    b.onclick=function(){ S.aucTab=b.getAttribute('data-tab'); renderAuction(); };
  });
  body.innerHTML='';
  if(S.aucTab==='list'){
    var ref=el('button','ghost','↻ 刷新在售列表'); ref.style.marginBottom='8px';
    ref.onclick=function(){ refreshAuction(); };
    body.appendChild(ref);
    if(!S.auction.length) body.appendChild(el('div','','拍卖行现在没有在售物品。'));
    S.auction.forEach(function(a){
      var d=el('div','auc-item');
      var nm=a.itemName||a.name||(a.item&&a.item.name)||'物品';
      var row=el('div','arow');
      row.appendChild(el('div','aname',(a.item&&a.item.icon?a.item.icon+' ':'')+nm));
      row.appendChild(el('div','aprice','💰 '+(a.price||a.gold||'?')));
      d.appendChild(row);
      d.appendChild(el('div','ameta','卖家：'+(a.seller||a.sellerName||'—')+'　剩余：'+(a.left||a.remain||'24 小时内')+(a.skillId?'　📖 技能书':'')));
      var mine=a.sellerId===deviceId||a.mine;
      var btn=el('button', mine?'':'primary', mine?'下架':'购买');
      btn.onclick=function(){
        if(mine) sendWs({t:'auction_delist', id:a.id});
        else sendWs({t:'auction_buy', id:a.id});
        fetchJson('/api/auction/'+a.id+'/'+(mine?'delist':'buy'),{method:'POST',body:{deviceId:deviceId,slot:S.selSlot}}).catch(function(){});
        setTimeout(refreshAuction, 800);
      };
      d.appendChild(btn);
      body.appendChild(d);
    });
  } else if(S.aucTab==='mine'){
    body.appendChild(el('div','hint','点一件背包里的装备或技能书上架，自标金币价，无手续费，24 小时到期自动退回。'));
    var bag=S.bag||[];
    if(!bag.length) body.appendChild(el('div','','背包是空的，没有可上架的。'));
    bag.forEach(function(it){
      var L=itemLabel(it);
      var row=el('div','shop-item');
      row.appendChild(el('div','sic',L.icon));
      var b=el('div','sbody');
      b.appendChild(el('div','sname',L.name));
      b.appendChild(el('div','sdesc',L.stats));
      row.appendChild(b);
      var btn=el('button','primary','上架');
      btn.onclick=function(){ openListModal(it); };
      row.appendChild(btn);
      body.appendChild(row);
    });
    (S.books||[]).forEach(function(bk){
      var sk=SKILLS[bk]||SKILLS[bk.id];
      var row=el('div','shop-item');
      row.appendChild(el('div','sic','📖'));
      var b=el('div','sbody');
      b.appendChild(el('div','sname','《'+(sk?sk.name:(bk.name||bk))+'》'));
      b.appendChild(el('div','sdesc','技能书 · '+(sk?CLASSES[sk.cls].name+' · 学习等级 Lv'+sk.req:'')));
      row.appendChild(b);
      var btn=el('button','primary','上架');
      btn.onclick=function(){ openListModal(bk, true); };
      row.appendChild(btn);
      body.appendChild(row);
    });
  } else {
    var ref2=el('button','ghost','↻ 刷新可领取'); ref2.style.marginBottom='8px';
    ref2.onclick=function(){ refreshClaims(); };
    body.appendChild(ref2);
    if(!S.claims.length) body.appendChild(el('div','','没有可领取的成交金币 / 下架 / 到期退回物品。'));
    S.claims.forEach(function(c){
      var d=el('div','auc-item');
      d.appendChild(el('div','aname',(c.itemName||c.name||'物品')));
      d.appendChild(el('div','ameta',(c.kind==='gold'?'成交金币：':'退回：')+(c.amount?('💰 '+c.amount):'')));
      var btn=el('button','primary','领取');
      btn.onclick=function(){
        sendWs({t:'auction_claim', claimId:c.id});
        fetchJson('/api/auction/claims/'+c.id+'/claim',{method:'POST',body:{deviceId:deviceId,slot:S.selSlot}}).catch(function(){});
        setTimeout(refreshClaims, 800);
      };
      d.appendChild(btn);
      body.appendChild(d);
    });
  }
}
var listTarget=null;
function openListModal(it, isBook){
  listTarget={item:it, book:!!isBook};
  var L=itemLabel(it);
  $('listItemName').textContent='上架：'+(isBook?'📖 《'+(SKILLS[it]&&SKILLS[it].name||it.name||it)+'》':L.icon+' '+L.name+'（'+L.stats+'）');
  $('listPrice').value='';
  $('listErr').textContent='';
  $('modalList').classList.remove('hidden');
}
function refreshAuction(){
  fetchJson('/api/auction').then(function(r){
    if(r && r.listings) S.auction=r.listings;
    else if(Array.isArray(r)) S.auction=r;
    renderAuction();
  }).catch(function(){ sendWs({t:'auction_list'}); });
}
function refreshClaims(){
  fetchJson('/api/auction/claims?deviceId='+encodeURIComponent(deviceId)).then(function(r){
    if(r && r.claims) S.claims=r.claims;
    else if(Array.isArray(r)) S.claims=r;
    renderAuction();
  }).catch(function(){ sendWs({t:'auction_claims'}); });
}
function renderTeleport(){
  var box=$('teleList'); box.innerHTML='';
  var lit={}; (S.bonusLit||[]).forEach(function(id){ lit[id]=true; });
  var st=stageById(S.stage);
  var dests=st.id==='city'?STAGES.filter(function(s){ return !s.hidden; }):(st.to||[]).map(stageById);
  dests.forEach(function(t){
    var b=el('button', lit[t.id]?'lit':'', t.name);
    var lab=el('span','tl', (t.boss?'👹 '+t.boss+' · ':'')+(lit[t.id]?'✦ 已点亮':'')+(t.layers>1?' · '+t.layers+' 层':''));
    b.appendChild(lab);
    b.onclick=function(){ sendWs({t:'teleport', stageId:t.id}); toast('传送到'+t.name+'……'); closePanels(); };
    box.appendChild(b);
  });
  if(st.id!=='city'){
    var back=el('button','','🏰 回比奇城');
    back.onclick=function(){ sendWs({t:'teleport', stageId:'city'}); closePanels(); };
    box.appendChild(back);
  }
}

/* ---------- 进入游戏 ---------- */
function enterGame(){
  var cur=S.slots[S.selSlot-1];
  if(!cur){ alert('请先选一个角色（空位可新建，或先认领三个老角色）。'); return; }
  S.myChar=cur;
  showWake('正在连接游戏服务器……', '正在建立联机连接，角色「'+cur.name+'」即将进入比奇城。');
  connectWs().then(function(){
    hideWake();
    $('menu').classList.add('hidden');
    $('game').classList.remove('hidden');
    S.inGame=true;
    resizeCv();
    /* 默认上场技能：已学的前两门（初始技能优先） */
    var cls=cur.cls;
    var learnedIds=CLASS_SKILLS[cls].filter(function(id){ return S.learned[id]; });
    if(!learnedIds.length) learnedIds=[CLASSES[cls].initialSkill];
    S.activeSkills=learnedIds.filter(function(id){ return !SKILLS[id].passive; }).slice(0,2);
    if(S.activeSkills.length<2){
      var extra=CLASS_SKILLS[cls].filter(function(id){ return !SKILLS[id].passive && S.activeSkills.indexOf(id)<0; });
      if(extra.length && S.activeSkills.length<2) S.activeSkills.push(extra[0]);
    }
    sendWs({t:'select_character', slot:S.selSlot});
    if(S.roomCode) sendWs({t:'join_room', code:S.roomCode});
    sendWs({t:'shop'});
    log('🎮 进入游戏：'+cur.name+'（'+CLASSES[cls].name+' Lv'+cur.level+'）','good');
    log('📍 比奇城安全区。传送员可去各地图；僵尸洞三层有通往尸王殿的洞口。','sys');
    if(!S.roomCode) log('💡 想联机：回主菜单「创建房间」，把 5 位房间码发给朋友。','sys');
    toast('欢迎来到比奇城！');
    render();
    refreshAuction();
    if(!S._miniTimer) S._miniTimer=setInterval(drawMinimap, 500);
  }).catch(function(err){
    showWake('连不上游戏服务器', 'WebSocket 连接失败：'+err.message+'。服务器可能还在休眠或未部署，请稍后再试。', true);
  });
}

/* ---------- 绑定与启动 ---------- */
function bindUI(){
  $('btnRefreshSlots').onclick=function(){ loadCharacters(); };
  $('btnClaim').onclick=function(){ $('claimCode').value=''; $('claimErr').textContent=''; $('claimOk').textContent=''; $('modalClaim').classList.remove('hidden'); };
  $('btnDoClaim').onclick=doClaim;
  $('btnCancelClaim').onclick=function(){ $('modalClaim').classList.add('hidden'); };
  $('btnNewChar').onclick=openNewChar;
  $('btnCancelCreate').onclick=function(){ $('modalNew').classList.add('hidden'); };
  $('btnDoCreate').onclick=doCreateChar;
  $('btnDelChar').onclick=doDeleteChar;
  document.querySelectorAll('#clsPick button').forEach(function(b){
    b.onclick=function(){
      newCls=b.getAttribute('data-cls');
      document.querySelectorAll('#clsPick button').forEach(function(x){ x.classList.toggle('sel', x===b); });
      $('clsDesc').textContent=CLASSES[newCls].desc;
    };
  });
  $('btnCreateRoom').onclick=function(){
    if(S.roomCode){ toast('已在房间 '+S.roomCode+'。'); return; }
    if(!S.wsOk){
      /* 未进游戏时先连一次 WS 再建房（房间归属当前设备） */
      showWake('正在连接游戏服务器……','正在建立连接以创建房间。');
      connectWs().then(function(){ hideWake(); sendWs({t:'create_room'}); toast('正在创建房间……'); })
        .catch(function(err){ showWake('连不上游戏服务器','WebSocket 连接失败：'+err.message+'。',true); });
      return;
    }
    doCreateRoom();
  };
  $('btnJoinRoom').onclick=function(){ $('joinCode').value=''; $('joinErr').textContent=''; $('modalJoin').classList.remove('hidden'); };
  $('btnDoJoin').onclick=function(){
    if(!S.wsOk){
      var code=$('joinCode').value.trim().toUpperCase();
      if(!/^[A-Z0-9]{5}$/.test(code)){ $('joinErr').textContent='请输入 5 位房间码。'; return; }
      showWake('正在连接游戏服务器……','正在建立连接以加入房间 '+code+'。');
      connectWs().then(function(){ hideWake(); $('modalJoin').classList.add('hidden'); sendWs({t:'join_room', code:code}); })
        .catch(function(err){ showWake('连不上游戏服务器','WebSocket 连接失败：'+err.message+'。',true); });
      return;
    }
    doJoinRoom();
  };
  $('btnCancelJoin').onclick=function(){ $('modalJoin').classList.add('hidden'); };
  $('btnLeaveRoom').onclick=function(){ sendWs({t:'leave_room'}); setRoom(null); };
  $('btnCopyCode').onclick=function(){
    if(!S.roomCode) return;
    if(navigator.clipboard) navigator.clipboard.writeText(S.roomCode).then(function(){ toast('房间码已复制：'+S.roomCode); });
    else toast('房间码：'+S.roomCode);
  };
  $('btnEnter').onclick=enterGame;
  $('wakeRetry').onclick=function(){ _booted=false; boot(); };
  /* 游戏内 */
  $('btnAttack').onclick=doAttack;
  $('btnPickup').onclick=function(){ sendWs({t:'pickup'}); };
  $('btnHpPot').onclick=function(){ sendWs({t:'use_potion', kind:'hp'}); };
  $('btnMpPot').onclick=function(){ sendWs({t:'use_potion', kind:'mp'}); };
  $('btnAutoFight').onclick=function(){
    S.autoFight=!S.autoFight;
    $('btnAutoFight').classList.toggle('on', S.autoFight);
    sendWs({t:'auto', on:S.autoFight});
    toast(S.autoFight?'⚔️ 自动战斗已开启':'⚔️ 自动战斗已关闭');
  };
  $('btnAutoPot').onclick=function(){
    S.autoPot=!S.autoPot;
    $('btnAutoPot').classList.toggle('on', S.autoPot);
    sendWs({t:'auto_pot', on:S.autoPot});
    toast(S.autoPot?'🧪 自动喝药已开启':'🧪 自动喝药已关闭');
  };
  $('btnBag').onclick=function(){ openPanel('panelBag'); };
  $('btnSkills').onclick=function(){ openPanel('panelSkills'); };
  $('btnShop').onclick=function(){ sendWs({t:'shop'}); openPanel('panelShop'); };
  $('btnAuction').onclick=function(){ refreshAuction(); openPanel('panelAuction'); };
  $('btnTeleport').onclick=function(){ openPanel('panelTeleport'); };
  $('btnMenu').onclick=function(){
    if(!confirm('回主菜单？游戏会保持连接，角色留在原地。')) return;
    S.inGame=false;
    $('game').classList.add('hidden');
    $('menu').classList.remove('hidden');
    loadCharacters();
  };
  $('minimap').onclick=toggleBigmap;
  $('btnCloseBigmap').onclick=toggleBigmap;
  $('enterHoleBtn').onclick=function(){ sendWs({t:'enter_hole'}); toast('钻进洞口，前往尸王殿……'); };
  $('portalBtn').onclick=function(){ sendWs({t:'enter_portal', stageId:'andian'}); sendWs({t:'teleport', stageId:'andian'}); toast('走进连接通道，前往未知暗殿……'); };
  $('btnUseItem').onclick=function(){ var it=selBagItem(); if(it) useBagItem(it); else toast('请先在背包里点一件物品。'); };
  $('btnSellItem').onclick=function(){ var it=selBagItem(); if(!it){ toast('请先在背包里点一件物品。'); return; } sendWs({t:'sell', uid:itemLabel(it).uid}); toast('出售 '+itemLabel(it).name+'……'); };
  $('btnUnequipItem').onclick=function(){ toast('卸下：请在穿戴区点已穿的装备。'); };
  $('btnDoList').onclick=function(){
    if(!listTarget) return;
    var price=parseInt($('listPrice').value,10);
    if(!price||price<1){ $('listErr').textContent='请输入大于 0 的金币价。'; return; }
    var it=listTarget.item;
    if(listTarget.book){
      var bookId=(typeof it==='string')?it:(it.id||it.bookId||it.skillId||it);
      sendWs({t:'auction_create', bookId:bookId, price:price});
      fetchJson('/api/auction',{method:'POST',body:{deviceId:deviceId,slot:S.selSlot,bookId:bookId,price:price}}).catch(function(){});
    } else {
      var uid=it.uid||it.id||it;
      sendWs({t:'auction_create', uid:uid, price:price});
      fetchJson('/api/auction',{method:'POST',body:{deviceId:deviceId,slot:S.selSlot,uid:uid,price:price}}).catch(function(){});
    }
    $('modalList').classList.add('hidden');
    toast('已上架，标价 '+price+' 金币。');
    setTimeout(refreshAuction, 800);
  };
  $('btnCancelList').onclick=function(){ $('modalList').classList.add('hidden'); };
  /* 画布点按：点怪物附近 = 攻击；点洞口 = 进洞 */
  cv.addEventListener('pointerdown', function(e){
    if(!S.inGame) return;
    var r=cv.getBoundingClientRect();
    var wx=e.clientX-r.left+S.cam.x, wy=e.clientY-r.top+S.cam.y;
    if(S.stage==='jiangshi' && S.layer===3){
      var hp=holePosition();
      if(Math.hypot(wx-hp.x, wy-hp.y)<70){ sendWs({t:'enter_hole'}); return; }
    }
    var mons=(S.snap&&S.snap.monsters)||[];
    for(var i=0;i<mons.length;i++){
      if(Math.hypot(wx-mons[i].x, wy-mons[i].y)<44){ doAttack(); return; }
    }
  });
}
var _booted=false;
function boot(){
  if(_booted) return; _booted=true;
  bindUI();
  showWake('服务器唤醒中，请稍等……','正在读取你的 5 个存档位。免费服务器休眠后首次唤醒约 30–60 秒。');
  /* 地图列表用短超时、不重试：拿不到就用本地 data.js 抄录，不阻塞读存档 */
  (function(){
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ ctrl.abort(); }, 8000);
    fetch(apiUrl('/api/stages'), {signal:ctrl.signal}).then(function(r){ clearTimeout(timer); return r.ok?r.json():null; }).then(function(d){
      if(d && Array.isArray(d.stages) && d.stages.length){
        d.stages.forEach(function(s){
          var local=stageById(s.id);
          if(local && s.name) local.name=s.name;
          if(local && s.layers) local.layers=s.layers;
        });
        renderStageList();
      }
    }).catch(function(){ clearTimeout(timer); /* 地图列表失败不阻塞，继续读存档 */ });
  })();
  loadCharacters();
}
document.addEventListener('DOMContentLoaded', boot);
if(document.readyState!=='loading') boot();
