'use strict';
// 测试共用 helper：只做隔离环境的搭建与 HTTP 封装，不含任何断言。
// 世界制后 WS 与旧房间引擎已删除（Phase 6），测试只走 HTTP（/api/* 与 /actions）。
// 隔离铁律：所有服务器一律用 mkdtemp 的 DATA_DIR + 测试认领码启动，
// 绝不碰 ~/workspace/guo-fu-lian-ji-ban/data/ 与真实认领码。
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 10000, interval = 50, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('超时未满足：' + label);
    await sleep(interval);
  }
}

export function makeTmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gf-test-${tag}-${process.pid}-`));
}

// 在隔离 DATA_DIR 里跑一次 migrate，预置三个未认领角色（不碰真实库）。
export function seedIsolated(dataDir) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['scripts/migrate.mjs'], {
      cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error('migrate 失败：' + (stdout || '') + (stderr || '') + err.message));
      resolve(stdout);
    });
  });
}

export async function startServer(dataDir, port, claimCode) {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, CLAIM_CODE: claimCode },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { err += d; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      try { const r = await fetch(base + '/api/health'); return r.ok; } catch { return false; }
    }, { timeout: 20000, label: `服务器启动 :${port}` });
  } catch (e) {
    try { proc.kill('SIGKILL'); } catch {}
    throw new Error(e.message + '\nstdout:\n' + out + '\nstderr:\n' + err);
  }
  return { proc, base, logs: () => out + '\n[stderr]\n' + err };
}

export async function stopServer(srv) {
  if (!srv || !srv.proc || srv.proc.exitCode !== null) return;
  srv.proc.kill('SIGTERM');
  await Promise.race([
    new Promise((r) => srv.proc.once('exit', r)),
    sleep(5000).then(() => { try { srv.proc.kill('SIGKILL'); } catch {} }),
  ]);
}

export async function api(base, method, p, body) {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch {}
  return { status: r.status, ...j };
}

export async function getText(base, p) {
  const r = await fetch(base + p);
  return { status: r.status, text: await r.text() };
}

export async function createChar(base, deviceId, slot, name, cls) {
  const r = await api(base, 'POST', '/api/character', { deviceId, slot, name, cls });
  if (!r.ok) throw new Error(`建角色失败 ${name} slot${slot}: ${JSON.stringify(r)}`);
  return r.character;
}

export async function listChars(base, deviceId) {
  const r = await api(base, 'GET', `/api/characters?deviceId=${deviceId}`);
  if (!r.ok) throw new Error('取角色列表失败：' + JSON.stringify(r));
  return r.characters;
}
