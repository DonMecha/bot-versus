#!/usr/bin/env node
// Commands for the bot side of Bot Versus. Every command prints JSON.
//
//   node bot.mjs wait [--timeout 600]     wait until it is your turn, the human chats, or a game starts/ends
//   node bot.mjs move <coord> ["comment"] play a move (comment is shown in the chat)
//   node bot.mjs say "<text>"             send a chat message to the human
//   node bot.mjs profile --name "<name>" [--desc "<one line>"] [--avatar <png|jpg|webp|gif file>]
//   node bot.mjs state                    show the current board without waiting
//   node bot.mjs new [--order first|second|random] [--size 8|6]   start a new game
//
// Server URL: --url, then $BOT_VERSUS_URL, then .data/server.json written by server.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (m) opt[m[1]] = m[2] ?? argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

function baseUrl(opt) {
  if (opt.url) return opt.url.replace(/\/$/, '');
  if (process.env.BOT_VERSUS_URL) return process.env.BOT_VERSUS_URL.replace(/\/$/, '');
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.data', 'server.json'), 'utf8')).url; } catch { return 'http://127.0.0.1:8765'; }
}

async function call(base, method, p, body, headers = {}) {
  let r;
  try {
    r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  } catch {
    throw new Error(`cannot reach the game server at ${base}. Start it with: node server.mjs`);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? j.error : `HTTP ${r.status} from ${base}: this does not look like the Bot Versus server. Check the URL in server.log`);
  return j;
}

function out(v) { console.log(JSON.stringify(v, null, 1)); }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parse(rest);
  const base = baseUrl(opt);
  switch (cmd) {
    case 'wait': {
      const until = Date.now() + Math.max(1, Number(opt.timeout || 600)) * 1000;
      for (;;) {
        const left = Math.ceil((until - Date.now()) / 1000);
        const v = await call(base, 'GET', `/api/bot/wait?timeout=${Math.min(50, Math.max(1, left))}`);
        if (v.event !== 'idle' || Date.now() >= until) return out(v);
      }
    }
    case 'move': {
      if (!pos[0]) throw new Error('usage: node bot.mjs move <coord> ["comment"]');
      return out(await call(base, 'POST', '/api/bot/move', { move: pos[0], comment: pos.slice(1).join(' ') }));
    }
    case 'say': {
      const text = pos.join(' ');
      if (!text) throw new Error('usage: node bot.mjs say "<text>"');
      return out(await call(base, 'POST', '/api/bot/say', { text }));
    }
    case 'profile': {
      const body = {};
      if (opt.name !== undefined) body.name = opt.name;
      if (opt.desc !== undefined) body.description = opt.desc;
      const r = await call(base, 'POST', '/api/bot/profile', body);
      if (opt.avatar) await call(base, 'PUT', '/api/bot/avatar', fs.readFileSync(opt.avatar), { 'content-type': 'application/octet-stream' });
      return out({ ...r, avatar: opt.avatar ? 'uploaded' : 'unchanged' });
    }
    case 'state': {
      const s = await call(base, 'GET', '/api/state');
      return out({ url: base + '/', game: s.game.title, you: s.match.bot, turn: s.match.state.turn, over: s.match.state.over, score: s.score, history: s.match.state.history.slice(-6) });
    }
    case 'new':
      return out(await call(base, 'POST', '/api/new', { order: opt.order, options: opt.size ? { size: Number(opt.size) } : undefined }));
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, a) => a.slice(0, i + 1).every(x => x.startsWith('//'))).join('\n'));
      process.exitCode = 2;
  }
}

main().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exitCode = 1; });
