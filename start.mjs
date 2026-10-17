#!/usr/bin/env node
// One command for the bot: start the game server (if needed), set the bot's profile,
// and optionally open a share link the user can open on their own phone or computer.
//
//   node start.mjs [--name "<bot name>"] [--desc "<one line>"] [--avatar <file>] [--share]
//   node start.mjs --stop          stop the share link and the server
//
// --share runs a Cloudflare quick tunnel (no account needed). cloudflared is used from PATH,
// or downloaded once into .data/bin/. The link contains a random key; only people with the
// link can play or chat. Bot commands are never reachable through the link.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, '.data');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parse(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    if (['share', 'stop'].includes(m[1])) opt[m[1]] = true;
    else opt[m[1]] = m[2] ?? argv[++i];
  }
  return opt;
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function serverUrl() {
  const info = readJson(path.join(DATA, 'server.json'));
  if (!info?.url) return null;
  try {
    const r = await fetch(info.url + '/api/state', { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    return j?.game?.id ? info.url : null;
  } catch { return null; }
}

async function ensureServer(port) {
  const up = await serverUrl();
  if (up) return up;
  fs.mkdirSync(DATA, { recursive: true });
  try { fs.unlinkSync(path.join(DATA, 'server.json')); } catch { /* first run */ }
  const log = fs.openSync(path.join(ROOT, 'server.log'), 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs'), ...(port ? ['--port', String(port)] : [])], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  for (let i = 0; i < 40; i++) { await sleep(250); const u = await serverUrl(); if (u) return u; }
  throw new Error('the game server did not start. See server.log');
}

function cloudflaredAsset() {
  const arch = { x64: 'amd64', arm64: 'arm64', arm: 'arm' }[process.arch];
  if (process.platform === 'linux' && arch) return { name: `cloudflared-linux-${arch}`, kind: 'bin' };
  if (process.platform === 'darwin') return { name: `cloudflared-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`, kind: 'tgz' };
  if (process.platform === 'win32') return { name: `cloudflared-windows-${arch === 'arm64' ? 'arm64' : 'amd64'}.exe`, kind: 'bin' };
  throw new Error(`no cloudflared download for ${process.platform}/${process.arch}; install cloudflared yourself`);
}

async function ensureCloudflared() {
  try { execFileSync('cloudflared', ['--version'], { stdio: 'ignore' }); return 'cloudflared'; } catch { /* not on PATH */ }
  const dir = path.join(DATA, 'bin');
  const exe = path.join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(exe)) return exe;
  fs.mkdirSync(dir, { recursive: true });
  const a = cloudflaredAsset();
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${a.name}`);
  if (!r.ok) throw new Error(`could not download cloudflared (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (a.kind === 'tgz') {
    const tgz = path.join(dir, a.name);
    fs.writeFileSync(tgz, buf);
    execFileSync('tar', ['-xzf', tgz, '-C', dir]);
    fs.unlinkSync(tgz);
  } else fs.writeFileSync(exe, buf);
  fs.chmodSync(exe, 0o755);
  return exe;
}

async function ensureShare(localUrl) {
  const f = path.join(DATA, 'share.json');
  const old = readJson(f);
  if (old?.pid && alive(old.pid) && old.local === localUrl) return old.url;
  const exe = await ensureCloudflared();
  const logFile = path.join(DATA, 'tunnel.log');
  fs.writeFileSync(logFile, '');
  const log = fs.openSync(logFile, 'a');
  const child = spawn(exe, ['tunnel', '--no-autoupdate', '--url', localUrl], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(fs.readFileSync(logFile, 'utf8'));
    if (m) {
      // The address is printed before the edge is ready; wait until the page answers.
      for (let k = 0; k < 40; k++) {
        try { const r = await fetch(m[0] + '/', { signal: AbortSignal.timeout(4000) }); if (r.ok) break; } catch { /* not yet */ }
        await sleep(1000);
      }
      fs.writeFileSync(f, JSON.stringify({ url: m[0], pid: child.pid, local: localUrl }));
      return m[0];
    }
    if (!alive(child.pid)) break;
  }
  throw new Error('the share link did not come up. See .data/tunnel.log');
}

async function stop() {
  const share = readJson(path.join(DATA, 'share.json'));
  if (share?.pid && alive(share.pid)) process.kill(share.pid);
  const server = readJson(path.join(DATA, 'server.json'));
  if (server?.pid && alive(server.pid)) process.kill(server.pid);
  for (const f of ['share.json', 'server.json']) { try { fs.unlinkSync(path.join(DATA, f)); } catch { /* gone */ } }
  return { stopped: true };
}

async function main() {
  const opt = parse(process.argv.slice(2));
  if (opt.stop) return console.log(JSON.stringify(await stop(), null, 1));
  const local = await ensureServer(opt.port);
  const body = {};
  if (opt.name !== undefined) body.name = opt.name;
  if (opt.desc !== undefined) body.description = opt.desc;
  if (Object.keys(body).length) await fetch(local + '/api/bot/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (opt.avatar) {
    const r = await fetch(local + '/api/bot/avatar', { method: 'PUT', body: fs.readFileSync(opt.avatar) });
    if (!r.ok) throw new Error('avatar: ' + ((await r.json().catch(() => ({}))).error || r.status));
  }
  const out = { local: local + '/' };
  if (opt.share) {
    const key = fs.readFileSync(path.join(DATA, 'key'), 'utf8').trim();
    out.share = (await ensureShare(local)) + '/?key=' + key;
    out.note = 'Send the share link to your user. Anyone with this link can play and chat, so share it only with them.';
  }
  out.next = 'node bot.mjs wait';
  console.log(JSON.stringify(out, null, 1));
}

main().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exitCode = 1; });
