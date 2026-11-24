'use strict';
// Bug 1 回归测试：玩家不动/只发最小同步时，名字、职业、等级、外观不能丢。
// 根因：upsertMember 曾把缺失字段写成 undefined/''/1/0 覆盖好值，别人屏幕
// 上看到 "undefined" 与默认红甲战士。修复后：缺失字段保留旧值（像 gear 一样）。
// 全程隔离库 + 测试认领码 TEST123；不碰真实库与真实认领码。
// 覆盖（HTTP /actions，两玩家同世界）：
//   - 最小同步（只发 playerId、x、y、hp，不带 name/classId/level/maxHp）后，
//     另一人看到的名字、职业、等级、血上限始终不变，血量按新值更新
//   - 不带 hp 的最小同步后，血量也保留旧值
//   - hp:0（真死亡）仍正常显示 0；复活全量同步后血量恢复，身份始终不变
//   - 反复发最小同步（模拟站着不动），身份始终不丢、不出现 "undefined"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  makeTmpDir, seedIsolated, startServer, stopServer,
} from './support/helpers.mjs';

const PORT = 18737;
const ME_A = { playerId: 'presDevA01', name: '站桩甲', classId: 'mage', level: 11, maxHp: 300 };
const ME_B = { playerId: 'presDevB01', name: '观察乙', classId: 'warrior', level: 5, maxHp: 500 };

let dir;
let srv;

async function actions(base, pid, action, args = {}) {
  const r = await fetch(base + '/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pid ? { Cookie: `lg_device_id=${pid}` } : {}),
    },
    body: JSON.stringify({ action, args, actionCallId: `pres-${Math.random()}` }),
  });
  assert.equal(r.status, 200, `POST /actions ${action} 应返回 200`);
  const j = await r.json();
  if (j.error) throw new Error(`动作 ${action} 报错：${j.error}`);
  return j.data;
}

async function seeA(base) {
  const s = await actions(base, ME_B.playerId, 'worldSync', {
    playerId: ME_B.playerId, worldKey: '19:0', x: 0, y: 0, knownRev: -1,
  });
  return s.players.find((p) => p.playerId === ME_A.playerId);
}

test.before(async () => {
  dir = makeTmpDir('presence');
  await seedIsolated(dir);
  srv = await startServer(dir, PORT, 'TEST123');
});

test.after(async () => {
  await stopServer(srv);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('HTTP：最小同步不丢身份——名字/职业/等级/血上限始终不变', async () => {
  await actions(srv.base, ME_A.playerId, 'joinWorld', { ...ME_A, worldKey: '19:0', x: 0, y: 0, hp: 300 });
  await actions(srv.base, ME_B.playerId, 'joinWorld', { ...ME_B, worldKey: '19:0', x: 0, y: 0, hp: 500 });

  // 初始：乙看到甲的完整身份
  let a = await seeA(srv.base);
  assert.ok(a, '乙应看到甲');
  assert.equal(a.name, '站桩甲');
  assert.equal(a.classId, 'mage');
  assert.equal(a.level, 11);
  assert.equal(a.hp, 300);
  assert.equal(a.maxHp, 300);

  // 甲发最小同步（只 playerId、x、y、hp，不带 name/classId/level/maxHp），模拟站着不动
  for (let i = 0; i < 6; i++) {
    await actions(srv.base, ME_A.playerId, 'worldSync', {
      playerId: ME_A.playerId, worldKey: '19:0', x: 10 + i, y: 0, hp: 250,
    });
  }
  a = await seeA(srv.base);
  assert.equal(a.name, '站桩甲', '最小同步后名字不应丢');
  assert.equal(a.classId, 'mage', '最小同步后职业不应丢');
  assert.equal(a.level, 11, '最小同步后等级不应丢');
  assert.equal(a.maxHp, 300, '最小同步后血上限不应丢');
  assert.equal(a.hp, 250, '血量应按新值更新');
  assert.notEqual(a.name, 'undefined', '名字绝不能是 "undefined"');

  // 不带 hp 的最小同步：血量也保留旧值
  await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 20, y: 0,
  });
  a = await seeA(srv.base);
  assert.equal(a.hp, 250, '不带 hp 时血量应保留旧值');
  assert.equal(a.name, '站桩甲');
  assert.equal(a.classId, 'mage');

  // hp:0（真死亡）仍正常显示 0，身份不变
  await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, worldKey: '19:0', x: 20, y: 0, hp: 0,
  });
  a = await seeA(srv.base);
  assert.equal(a.hp, 0, '真死亡时血量应显示 0');
  assert.equal(a.name, '站桩甲', '死亡时名字也不应丢');
  assert.equal(a.classId, 'mage');

  // 复活：全量同步带满血，身份始终不变
  await actions(srv.base, ME_A.playerId, 'worldSync', {
    playerId: ME_A.playerId, name: ME_A.name, classId: ME_A.classId, level: 11,
    worldKey: '19:0', x: 20, y: 0, hp: 300, maxHp: 300,
  });
  a = await seeA(srv.base);
  assert.equal(a.hp, 300);
  assert.equal(a.name, '站桩甲');
  assert.equal(a.classId, 'mage');
  assert.equal(a.level, 11);
  assert.equal(a.maxHp, 300);
  console.log('最小同步身份保持通过：名字/职业/等级/血上限始终不变，真死亡 hp:0 正常显示');
  await actions(srv.base, ME_A.playerId, 'leaveWorld', { playerId: ME_A.playerId, worldKey: '19:0' });
  await actions(srv.base, ME_B.playerId, 'leaveWorld', { playerId: ME_B.playerId, worldKey: '19:0' });
});
