'use strict';
// 测试共用 helper：只做隔离环境的搭建与 WS/HTTP 封装，不含任何断言。
// 隔离铁律：所有服务器一律用 mkdtemp 的 DATA_DIR + 测试认领码启动，
// 绝不碰 ~/workspace/guo-fu-lian-ji-ban/data/ 与真实认领码。
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

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

// 轻量 WS 客户端：按 public/app.js 的协议发 auth / 动作，收 snapshot / me / toast / 事件。
export class WsClient {
  constructor(base, deviceId) {
    this.base = base;
    this.deviceId = deviceId;
    this.lastSnapshot = null;
    this.lastMe = null;
    this.toasts = [];
    this.events = [];
    this.errors = [];
    this.roomCode = null;
    this.authed = null;
    this.msgCount = 0;
    this.closed = false;
  }

  async connect(slot, expectError = false) {
    const url = this.base.replace(/^http/, 'ws') + '/ws';
    this.ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('WS 连接超时')), 10000);
      this.ws.once('open', () => { clearTimeout(to); resolve(); });
      this.ws.once('error', (e) => { clearTimeout(to); reject(e); });
    });
    this.ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      this.msgCount++;
      const at = Date.now();
      if (m.t === 'snapshot') this.lastSnapshot = { ...m, at };
      else if (m.t === 'me') this.lastMe = { ...m, at };
      else if (m.t === 'toast') this.toasts.push({ msg: m.msg, at });
      else if (m.t === 'error') this.errors.push({ msg: m.msg, at });
      else this.events.push({ ...m, at });
      if (m.t === 'room_joined') this.roomCode = m.code;
      if (m.t === 'authed') this.authed = m;
    });
    this.ws.on('close', () => { this.closed = true; });
    this.send({ t: 'auth', deviceId: this.deviceId, slot });
    if (expectError) {
      const e = await waitFor(() => this.errors[0] || (this.closed && { msg: '(连接已断开，无 error 文本)' }), {
        timeout: 10000, label: 'WS 鉴权应拒绝',
      });
      return e;
    }
    await waitFor(() => this.authed || this.errors[0], { timeout: 10000, label: 'WS 鉴权' });
    if (!this.authed) throw new Error('WS 鉴权失败：' + (this.errors[0] && this.errors[0].msg));
    return this.authed;
  }

  send(obj) { this.ws.send(JSON.stringify(obj)); }

  async waitEvent(pred, timeout = 10000, label = 'event') {
    return waitFor(() => this.events.find(pred), { timeout, label });
  }

  async waitToast(substr, since, timeout = 5000) {
    return waitFor(
      () => this.toasts.find((t) => t.at >= since && t.msg.includes(substr)),
      { timeout, label: `toast 含「${substr}」` },
    );
  }

  noToastSince(substr, since) {
    return !this.toasts.some((t) => t.at >= since && t.msg.includes(substr));
  }

  async waitSnapshot(pred, timeout = 10000, label = 'snapshot 条件') {
    return waitFor(() => {
      const s = this.lastSnapshot;
      return s && pred(s) ? s : null;
    }, { timeout, label });
  }

  async waitMe(pred, timeout = 10000, label = 'me 条件') {
    return waitFor(() => {
      const m = this.lastMe;
      return m && pred(m) ? m : null;
    }, { timeout, label });
  }

  close() { try { this.ws.close(); } catch {} }
}
