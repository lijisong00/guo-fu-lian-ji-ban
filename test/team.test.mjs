'use strict';
// 组队功能测试：引擎单元级（lib/world.js 直调）+ HTTP 级（/actions）。
// 全程隔离库 + 测试认领码 TEST123；不碰真实库与真实认领码。
// 覆盖：
//   - 邀请/同意建队（队长=邀请人）、拒绝、30 秒过期、重复邀请返回同一 id
//   - 对方已有队伍 / 不在同一地图 / 队伍已满（4 人）时拒绝
//   - 队长离队顺延、最后一人离队解散、踢人（仅队长、不能踢自己）
//   - 经验平分：同世界 2 人队 death.team={members, xp:floor(xp/2)}；
//     未组队 death.team=null；队友在异图时不分（team=null）；
//     3 人队 floor(xp/3)，至少 1 点
//   - worldSync 带 team（队长排第一、成员含 worldKey）与 invites（带邀请人名字）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  sleep, makeTmpDir, seedIsolated, startServer, stopServer,
} from './support/helpers.mjs';

const require = createRequire(import.meta.url);
const worldData = require('../shared/world-data.js');
const { createWorlds } = require('../lib/world.js');

const PORT = 18736;

function joinAt(eng, w, pid, name, x, y, now, cls = 'war') {
  eng.join(w, {
    playerId: pid, name, classId: cls, level: 5, x, y, hp: 100, maxHp: 100,
  }, now);
}

// ---- 引擎单元级（不经过 HTTP，直接调 lib/world.js，时间用显式 now 控制）----

test('引擎：邀请→同意建队，队长=邀请人；拒绝不建队；重复邀请返回同一 id', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  joinAt(eng, w, 't1', '甲', 0, 0, now);
  joinAt(eng, w, 't2', '乙', 10, 0, now);
  joinAt(eng, w, 't3', '丙', 20, 0, now);

  const inv = eng.inviteTeam('t1', 't2', now);
  assert.equal(inv.ok, true, '邀请应成功：' + JSON.stringify(inv));
  assert.ok(inv.inviteId > 0);
  // 重复邀请返回同一 id，不重复建
  const dup = eng.inviteTeam('t1', 't2', now);
  assert.equal(dup.ok, true);
  assert.equal(dup.inviteId, inv.inviteId, '重复邀请应返回同一 inviteId');

  // 被邀方在 sync 里应看到邀请（带邀请人名字）
  const invs = eng.invitesFor('t2', now);
  assert.equal(invs.length, 1);
  assert.equal(invs[0].id, inv.inviteId);
  assert.equal(invs[0].fromId, 't1');
  assert.equal(invs[0].fromName, '甲');
  assert.equal(invs[0].expiresAt, now + 30000);

  // 丙拒绝：邀请消失，不建队
  const inv3 = eng.inviteTeam('t1', 't3', now);
  assert.equal(inv3.ok, true);
  const dec = eng.respondInvite(inv3.inviteId, 't3', false, now);
  assert.equal(dec.ok, true);
  assert.equal(dec.declined, true);
  assert.equal(eng.getTeamOf('t3'), null, '拒绝后不应有队伍');
  assert.equal(eng.invitesFor('t3', now).length, 0, '拒绝后邀请应消失');

  // 乙同意：建队，队长=甲，成员[甲，乙]
  const acc = eng.respondInvite(inv.inviteId, 't2', true, now);
  assert.equal(acc.ok, true, '同意应成功：' + JSON.stringify(acc));
  assert.equal(acc.team.leaderId, 't1');
  assert.deepEqual(acc.team.members.map((m) => m.playerId), ['t1', 't2']);
  assert.equal(acc.team.members[0].worldKey, '19:0');
  assert.equal(eng.getTeamOf('t1').leaderId, 't1');
  assert.equal(eng.getTeamOf('t2').id, eng.getTeamOf('t1').id, '两人应在同一队');
  console.log('邀请/同意/拒绝/重复邀请通过：队长=甲，成员=[甲，乙]');
});

test('引擎：邀请 30 秒过期；对方已有队伍 / 不在同一地图时拒绝', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  const w2 = eng.getOrCreate(2, 0);
  joinAt(eng, w, 't1', '甲', 0, 0, now);
  joinAt(eng, w, 't2', '乙', 10, 0, now);
  joinAt(eng, w2, 't3', '丙', 0, 0, now); // 丙在另一张图

  // 异图邀请拒绝
  const cross = eng.inviteTeam('t1', 't3', now);
  assert.equal(cross.ok, false);
  assert.match(cross.reason, /不在同一张地图/);

  // 30 秒过期：31 秒后回应应失败
  const inv = eng.inviteTeam('t1', 't2', now);
  assert.equal(inv.ok, true);
  const late = eng.respondInvite(inv.inviteId, 't2', true, now + 31000);
  assert.equal(late.ok, false);
  assert.match(late.reason, /过期/);
  assert.equal(eng.invitesFor('t2', now + 31000).length, 0, '过期邀请应被清理');
  assert.equal(eng.getTeamOf('t2'), null, '过期未同意不应建队');

  // 对方已有队伍时拒绝：先让甲乙组队，再让别人邀乙
  const inv2 = eng.inviteTeam('t1', 't2', now + 32000);
  assert.equal(inv2.ok, true);
  const acc = eng.respondInvite(inv2.inviteId, 't2', true, now + 32000);
  assert.equal(acc.ok, true);
  joinAt(eng, w, 't4', '丁', 30, 0, now + 32000);
  const busy = eng.inviteTeam('t4', 't2', now + 32000);
  assert.equal(busy.ok, false);
  assert.match(busy.reason, /已有队伍/);
  console.log('过期/异图/已有队伍拒绝通过');
});

test('引擎：队伍上限 4 人；队长离队顺延；最后一人离队解散；踢人规则', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  for (let i = 1; i <= 5; i++) joinAt(eng, w, `u${i}`, `玩家${i}`, i * 10, 0, now);
  // 甲邀乙丙丁组队（4 人）
  for (const pid of ['u2', 'u3', 'u4']) {
    const inv = eng.inviteTeam('u1', pid, now);
    assert.equal(inv.ok, true);
    const acc = eng.respondInvite(inv.inviteId, pid, true, now);
    assert.equal(acc.ok, true);
  }
  let team = eng.getTeamOf('u1');
  assert.equal(team.members.length, 4);
  assert.deepEqual(team.members.map((m) => m.playerId), ['u1', 'u2', 'u3', 'u4']);
  // 满员再邀 u5 拒绝
  const full = eng.inviteTeam('u1', 'u5', now);
  assert.equal(full.ok, false);
  assert.match(full.reason, /已满/);

  // 非队长踢人拒绝；队长踢自己拒绝
  const notLeader = eng.kickFromTeam('u2', 'u3');
  assert.equal(notLeader.ok, false);
  assert.match(notLeader.reason, /只有队长/);
  const kickSelf = eng.kickFromTeam('u1', 'u1');
  assert.equal(kickSelf.ok, false);
  assert.match(kickSelf.reason, /不能踢自己/);
  // 队长踢 u4 成功
  const kicked = eng.kickFromTeam('u1', 'u4');
  assert.equal(kicked.ok, true);
  assert.equal(eng.getTeamOf('u4'), null, '被踢者应离队');
  team = eng.getTeamOf('u1');
  assert.deepEqual(team.members.map((m) => m.playerId), ['u1', 'u2', 'u3']);

  // 队长 u1 离队 → 队长顺延给 u2（最早加入的下一位）
  eng.leaveTeam('u1');
  team = eng.getTeamOf('u2');
  assert.equal(team.leaderId, 'u2', '队长应顺延给 u2');
  assert.deepEqual(team.members.map((m) => m.playerId), ['u2', 'u3']);
  // u2 离队 → 队长顺延给 u3；u3 离队 → 队伍解散
  eng.leaveTeam('u2');
  assert.equal(eng.getTeamOf('u3').leaderId, 'u3');
  eng.leaveTeam('u3');
  assert.equal(eng.getTeamOf('u3'), null, '最后一人离队队伍应解散');
  assert.equal(eng.getTeamOf('u1'), null);
  console.log('满员/踢人/队长顺延/解散通过');
});

test('引擎：经验平分——同世界 2 人队 floor(xp/2)，3 人队 floor(xp/3)；异图队友不分；未组队不分', () => {
  const eng = createWorlds(worldData);
  const now = Date.now();
  const w = eng.getOrCreate(19, 0);
  const w2 = eng.getOrCreate(2, 0);
  joinAt(eng, w, 'a1', '甲', 0, 0, now);
  joinAt(eng, w, 'a2', '乙', 10, 0, now);
  joinAt(eng, w, 'a3', '丙', 20, 0, now);
  joinAt(eng, w2, 'a4', '丁', 0, 0, now); // 丁在另一张图
  // 甲乙丙组队（丁随后也加入同一队，但人在异图）
  for (const pid of ['a2', 'a3']) {
    const inv = eng.inviteTeam('a1', pid, now);
    const acc = eng.respondInvite(inv.inviteId, pid, true, now);
    assert.equal(acc.ok, true);
  }
  // 丁先回 19:0 组队、再传送去 2:0（正式流程：先同图组队、再传送走）
  eng.leave(w2, 'a4');
  joinAt(eng, w, 'a4', '丁', 30, 0, now);
  const inv4 = eng.inviteTeam('a1', 'a4', now);
  assert.equal(inv4.ok, true);
  const acc4 = eng.respondInvite(inv4.inviteId, 'a4', true, now);
  assert.equal(acc4.ok, true);
  assert.equal(eng.getTeamOf('a1').members.length, 4);
  // 丁传送去 2:0（离队不退队）
  eng.leave(w, 'a4');
  joinAt(eng, w2, 'a4', '丁', 0, 0, now);
  assert.equal(eng.getTeamOf('a4').id, eng.getTeamOf('a1').id, '传送后队伍不散');

  // 甲在 19:0 杀一只怪：同世界队员为甲乙丙（3 人），丁在异图不分
  const target = [...w.monsters.values()].find((m) => !m.boss && !m.dead);
  assert.ok(target, '应有活怪');
  eng.join(w, { playerId: 'a1', name: '甲', classId: 'war', level: 5, x: target.x, y: target.y, hp: 100, maxHp: 100 }, now);
  const hit = eng.hitMonster(w, { playerId: 'a1', monsterId: target.id, dmg: target.hp }, now);
  assert.equal(hit.ok, true);
  assert.equal(hit.dead, true);
  assert.ok(hit.death.team, '组队击杀死亡事件应带 team');
  assert.deepEqual([...hit.death.team.members].sort(), ['a1', 'a2', 'a3'].sort(), '只分同世界 3 人，异图丁不分');
  assert.equal(hit.death.team.xp, Math.max(1, Math.floor(target.xp / 3)), '每人应得 floor(xp/3)');
  assert.equal(hit.death.xp, target.xp, '全额 xp 仍保留（供未组队者领）');

  // 未组队者杀怪：team 为 null
  joinAt(eng, w, 'solo', '独行', 0, 0, now);
  const t2 = [...w.monsters.values()].find((m) => !m.boss && !m.dead && m.id !== target.id);
  eng.join(w, { playerId: 'solo', name: '独行', classId: 'war', level: 5, x: t2.x, y: t2.y, hp: 100, maxHp: 100 }, now);
  const hit2 = eng.hitMonster(w, { playerId: 'solo', monsterId: t2.id, dmg: t2.hp }, now);
  assert.equal(hit2.dead, true);
  assert.equal(hit2.death.team, null, '未组队击杀不应带 team');

  // 独队（队友全在异图）杀怪：team 为 null
  // 丁在 2:0 杀怪：同队同世界只有丁一人
  const t3 = [...w2.monsters.values()].find((m) => !m.boss && !m.dead);
  eng.join(w2, { playerId: 'a4', name: '丁', classId: 'war', level: 5, x: t3.x, y: t3.y, hp: 100, maxHp: 100 }, now);
  const hit3 = eng.hitMonster(w2, { playerId: 'a4', monsterId: t3.id, dmg: t3.hp }, now);
  assert.equal(hit3.dead, true);
  assert.equal(hit3.death.team, null, '同世界队员只有 1 人时不应平分');

  // teamInfoFor：丁在异图，甲看到的丁 worldKey 应为 2:0；下线成员 worldKey 为 ''
  const info = eng.teamInfoFor('a1');
  assert.equal(info.members.length, 4);
  const ding = info.members.find((m) => m.playerId === 'a4');
  assert.equal(ding.worldKey, '2:0', '异图队员 worldKey 应为其所在世界');
  eng.leave(w2, 'a4');
  const info2 = eng.teamInfoFor('a1');
  const ding2 = info2.members.find((m) => m.playerId === 'a4');
  assert.equal(ding2.worldKey, '', '下线队员 worldKey 应为空串');
  assert.equal(ding2.hp, 0);
  console.log(`经验平分通过：3 人队每人 ${hit.death.team.xp}（怪 xp=${target.xp}），异图/未组队不分`);
});

// ---- HTTP 级（走 /actions，与客户端同一入口）----

let dir;
let srv;
const ME_A = { playerId: 'teamDevA01', name: '组队甲', classId: 'mage', level: 11, maxHp: 300 };
const ME_B = { playerId: 'teamDevB01', name: '组队乙', classId: 'warrior', level: 5, maxHp: 500 };
const ME_C = { playerId: 'teamDevC01', name: '组队丙', classId: 'taoist', level: 3, maxHp: 200 };

async function actions(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `team-${Math.random()}` }),
  });
  assert.equal(r.status, 200, `POST /actions ${action} 应返回 200`);
  const j = await r.json();
  if (j.error) throw new Error(`动作 ${action} 报错：${j.error}`);
  return j.data;
}

test.before(async () => {
  dir = makeTmpDir('team');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, 'TEST123');
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('HTTP：邀请→同意→两边 worldSync 看到队伍；击杀平分经验；未组队者仍看全额', async () => {
  const jA = await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0 });
  assert.equal(jA.ok, true);
  assert.equal(jA.team, null, '未组队时 team 应为 null');
  assert.deepEqual(jA.invites, [], '未组队时 invites 应为空');
  await actions(srv.base, ME_B.playerId, 'joinWorld', { ...ME_B, worldKey: '19:0', x: 0, y: 0 });
  await actions(srv.base, ME_C.playerId, 'joinWorld', { ...ME_C, worldKey: '19:0', x: 0, y: 0 });

  // 甲邀乙
  const inv = await actions(srv.base, ME_A.playerId, 'teamInvite', {
    playerId: ME_A.playerId, targetPlayerId: ME_B.playerId,
  });
  assert.equal(inv.ok, true, '邀请应成功：' + JSON.stringify(inv));
  assert.ok(inv.inviteId > 0);
  // 乙的 worldSync 应看到邀请（带甲的名字）
  const syncB1 = await actions(srv.base, ME_B.playerId, 'worldSync', {
    playerId: ME_B.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(syncB1.invites.length, 1);
  assert.equal(syncB1.invites[0].fromId, ME_A.playerId);
  assert.equal(syncB1.invites[0].fromName, '组队甲');
  assert.ok(syncB1.invites[0].expiresAt > Date.now());
  // 甲的 worldSync 不应看到发给自己的邀请
  const syncA1 = await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(syncA1.invites.length, 0);

  // 乙同意
  const acc = await actions(srv.base, ME_B.playerId, 'teamRespond', {
    playerId: ME_B.playerId, inviteId: inv.inviteId, accept: true,
  });
  assert.equal(acc.ok, true, '同意应成功：' + JSON.stringify(acc));
  assert.equal(acc.team.leaderId, ME_A.playerId);
  // 两边 worldSync 都看到队伍（队长排第一）
  const syncA2 = await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  const syncB2 = await actions(srv.base, ME_B.playerId, 'worldSync', {
    playerId: ME_B.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  for (const s of [syncA2, syncB2]) {
    assert.equal(s.team.members.length, 2);
    assert.deepEqual(s.team.members.map((m) => m.playerId), [ME_A.playerId, ME_B.playerId]);
    assert.equal(s.team.leaderId, ME_A.playerId);
    assert.ok(s.team.members.every((m) => m.worldKey === '19:0'));
  }
  assert.equal(syncB2.invites.length, 0, '同意后邀请应消失');

  // 甲杀一只怪：死亡事件 team 应为 {members:[甲，乙], xp:floor(xp/2)}；丙（未组队）也看到同一事件
  const target = syncA2.monsters
    .map((m) => ({ m, d: Math.hypot(m.x, m.y) }))
    .sort((a, b) => a.d - b.d)[0].m;
  await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: target.x, y: target.y, knownRev: -1,
  });
  const hit = await actions(srv.base, ME_A.playerId, 'hitMonster', {
    playerId: ME_A.playerId, worldKey: '19:0', monsterId: target.id, dmg: target.hp,
  });
  assert.equal(hit.dead, true);
  assert.ok(hit.death.team, '组队击杀应带 team');
  assert.deepEqual([...hit.death.team.members].sort(), [ME_A.playerId, ME_B.playerId].sort());
  assert.equal(hit.death.team.xp, Math.max(1, Math.floor(hit.death.xp / 2)));
  const syncC = await actions(srv.base, ME_C.playerId, 'worldSync', {
    playerId: ME_C.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  const deathC = syncC.deaths.find((d) => d.monsterId === target.id);
  assert.ok(deathC, '未组队同图玩家也应看到死亡事件');
  assert.equal(deathC.xp, hit.death.xp, '未组队者看到的仍是全额 xp');
  assert.ok(!deathC.team.members.includes(ME_C.playerId), '未组队者不在 team.members 里');
  console.log(`HTTP 组队+平分通过：怪 xp=${hit.death.xp}，甲乙各分 ${hit.death.team.xp}，丙仍看全额`);

  // 乙离队 → 甲独队（1 人）；甲再离队 → 队伍解散
  const lv = await actions(srv.base, ME_B.playerId, 'teamLeave', { playerId: ME_B.playerId });
  assert.equal(lv.ok, true);
  const syncA3 = await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(syncA3.team.members.length, 1, '乙离队后甲独队剩 1 人');
  await actions(srv.base, ME_A.playerId, 'teamLeave', { playerId: ME_A.playerId });
  const syncA4 = await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(syncA4.team, null, '最后一人离队队伍应解散');
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_B.playerId, 'leaveWorld', { playerId: ME_B.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_C.playerId, 'leaveWorld', { playerId: ME_C.playerId, worldKey: '19:0' });
});

test('HTTP：拒绝 / 踢人 / 队长顺延 / 异图邀请拒绝', async () => {
  await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0 });
  await actions(srv.base, ME_B.playerId, 'joinWorld', { ...ME_B, worldKey: '19:0', x: 0, y: 0 });
  await actions(srv.base, ME_C.playerId, 'joinWorld', { ...ME_C, worldKey: '2:0', x: 0, y: 0 });
  // 异图邀请拒绝
  const cross = await actions(srv.base, ME_A.playerId, 'teamInvite', {
    playerId: ME_A.playerId, targetPlayerId: ME_C.playerId,
  });
  assert.equal(cross.ok, false);
  assert.match(cross.reason, /不在同一张地图/);
  // 甲邀乙，乙拒绝
  const inv = await actions(srv.base, ME_A.playerId, 'teamInvite', {
    playerId: ME_A.playerId, targetPlayerId: ME_B.playerId,
  });
  assert.equal(inv.ok, true);
  const dec = await actions(srv.base, ME_B.playerId, 'teamRespond', {
    playerId: ME_B.playerId, inviteId: inv.inviteId, accept: false,
  });
  assert.equal(dec.ok, true);
  assert.equal(dec.declined, true);
  const syncA = await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(syncA.team, null, '拒绝后不应建队');
  // 再邀并同意，随后队长踢人、队长离队顺延
  const inv2 = await actions(srv.base, ME_A.playerId, 'teamInvite', {
    playerId: ME_A.playerId, targetPlayerId: ME_B.playerId,
  });
  const acc2 = await actions(srv.base, ME_B.playerId, 'teamRespond', {
    playerId: ME_B.playerId, inviteId: inv2.inviteId, accept: true,
  });
  assert.equal(acc2.ok, true);
  // 乙（非队长）踢甲应失败
  const badKick = await actions(srv.base, ME_B.playerId, 'teamKick', {
    playerId: ME_B.playerId, targetPlayerId: ME_A.playerId,
  });
  assert.equal(badKick.ok, false);
  assert.match(badKick.reason, /只有队长/);
  // 甲踢乙成功
  const kick = await actions(srv.base, ME_A.playerId, 'teamKick', {
    playerId: ME_A.playerId, targetPlayerId: ME_B.playerId,
  });
  assert.equal(kick.ok, true);
  const syncB = await actions(srv.base, ME_B.playerId, 'worldSync', {
    playerId: ME_B.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  assert.equal(syncB.team, null, '被踢者应离队');
  console.log('HTTP 拒绝/踢人/异图拒绝通过');
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_B.playerId, 'leaveWorld', { playerId: ME_B.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_C.playerId, 'leaveWorld', { playerId: ME_C.playerId, worldKey: '2:0' });
});
