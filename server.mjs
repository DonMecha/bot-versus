#!/usr/bin/env node
// Bot Versus server: one human plays a board game against one chat bot.
// The human uses the web page; the bot uses bot.mjs (wait / move / say).
//
//   node server.mjs [--port 8765] [--host 127.0.0.1] [--game othello] [--size 8] [--data .data]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getGame, games } from './games/index.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_CHAT = 500, MAX_TEXT = 500, MAX_AVATAR = 2 * 1024 * 1024;
const BOT_IDLE_MS = 90_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    o[m[1]] = m[2] ?? argv[++i];
  }
  return o;
}

function imageType(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

const cleanText = (v, max = MAX_TEXT) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

export function createApp({ dataDir, gameId = 'othello', size } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'session.json');
  let s;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { s = null; }
  if (!s || !games[s.match?.game]) {
    s = { seq: 0, profile: { name: 'Bot', description: '' }, chat: [], match: null, bot: { chatSeen: 0, eventSeen: 0, lastSeenAt: 0 }, events: [] };
    s.match = newMatch(gameId, size ? { size: Number(size) } : {}, 'first');
  }
  // Access key for the share link. Requests that arrive through a tunnel must carry it.
  if (!s.key) s.key = randomBytes(18).toString('base64url');
  fs.writeFileSync(path.join(dataDir, 'key'), s.key, { mode: 0o600 });
  const waiters = new Set();

  function newMatch(game, opts, humanOrder) {
    const g = getGame(game);
    const optsClean = {};
    for (const [k, spec] of Object.entries(g.options || {})) {
      const v = opts[k] ?? spec.default;
      optsClean[k] = spec.choices.includes(Number(v)) ? Number(v) : spec.default;
    }
    const humanFirst = humanOrder === 'second' ? false : humanOrder === 'random' ? Math.random() < 0.5 : true;
    return { id: Date.now().toString(36), game, options: optsClean, state: g.init(optsClean),
      human: humanFirst ? g.sides[0] : g.sides[1], bot: humanFirst ? g.sides[1] : g.sides[0], startedAt: new Date().toISOString() };
  }

  function save() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function changed(event) {
    s.seq++;
    if (event) { s.events.push({ n: s.seq, ...event }); s.events = s.events.slice(-50); }
    save();
    for (const w of [...waiters]) w();
  }

  function waitChange(check, timeoutMs) {
    return new Promise(resolve => {
      const done = () => { const r = check(); if (r !== undefined) { cleanup(); resolve(r); } };
      const timer = setTimeout(() => { cleanup(); resolve(check(true)); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); waiters.delete(done); };
      waiters.add(done);
      done();
    });
  }

  const game = () => getGame(s.match.game);
  const botTurn = () => !s.match.state.over && s.match.state.turn === s.match.bot;

  function addChat(from, text) {
    s.chatN = (s.chatN || 0) + 1;
    s.chat.push({ n: s.chatN, from, text, at: new Date().toISOString() });
    if (s.chat.length > MAX_CHAT) { const drop = s.chat.length - MAX_CHAT; s.chat.splice(0, drop); s.bot.chatSeen = Math.max(0, s.bot.chatSeen - drop); }
  }

  function publicState() {
    const g = game(), m = s.match;
    return {
      seq: s.seq,
      game: { id: g.id, title: g.title, sides: g.sides, sideNames: g.sideNames, options: g.options },
      match: { id: m.id, options: m.options, human: m.human, bot: m.bot, state: m.state, startedAt: m.startedAt },
      legal: !m.state.over && m.state.turn === m.human ? g.legalMoves(m.state) : [],
      score: g.score(m.state), result: g.result(m.state),
      profile: { ...s.profile, avatar: s.profile.avatarType ? `/api/avatar?v=${s.profile.avatarVersion}` : null },
      chat: s.chat.slice(-100),
      botOnline: Date.now() - s.bot.lastSeenAt < BOT_IDLE_MS,
      events: s.events.slice(-10),
    };
  }

  // What the bot sees. Its turn is level-triggered (always reported while it is the bot's turn);
  // chat, new games and game end are delivered once.
  function botView(timedOut) {
    const g = game(), m = s.match;
    const newMessages = s.chat.slice(s.bot.chatSeen).filter(c => c.from === 'human');
    const newEvents = s.events.filter(e => e.n > s.bot.eventSeen && (e.type === 'game-over' || e.type === 'new-game'));
    const turn = botTurn();
    if (!turn && !newMessages.length && !newEvents.length && !timedOut) return undefined;
    s.bot.chatSeen = s.chat.length;
    s.bot.eventSeen = s.seq;
    const last = m.state.history.at(-1);
    const event = newEvents.some(e => e.type === 'new-game') ? 'new-game' : m.state.over && newEvents.length ? 'game-over'
      : turn ? 'your-turn' : newMessages.length ? 'chat' : 'idle';
    const r = g.result(m.state);
    return {
      event,
      game: g.title,
      you: `${m.bot} (${g.sideNames[m.bot]})`,
      opponent: `human (${g.sideNames[m.human]})`,
      board: g.describe(m.state, m.bot),
      lastMove: last ? `${last.side === m.bot ? 'you' : 'human'}: ${last.move}` : null,
      legalMoves: turn ? g.legalMoves(m.state) : [],
      newMessages: newMessages.map(c => c.text),
      result: r ? (r.winner === null ? 'draw' : r.winner === m.bot ? 'you won' : 'human won') + ` ${JSON.stringify(r.score)}` : null,
      next: turn ? 'node bot.mjs move <one of legalMoves> "<short comment>"'
        : newMessages.length ? 'reply with node bot.mjs say "<text>", then node bot.mjs wait'
        : m.state.over ? 'say something about the game, then node bot.mjs wait (the human may start a new game)'
        : 'node bot.mjs wait',
    };
  }

  // A tunnel (cloudflared and the like) adds forwarding headers; direct local requests have none.
  const forwarded = req => Boolean(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['forwarded']);
  function keyOk(given) {
    const a = Buffer.from(String(given || '')), b = Buffer.from(s.key);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  function json(res, code, body) {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  async function readBody(req, limit) {
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('body too large'), { code: 413 }); chunks.push(c); }
    return Buffer.concat(chunks);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    if (forwarded(req)) {
      // Through the share link: only the human side, and only with the key.
      if (p.startsWith('/api/bot/')) return json(res, 403, { error: 'bot commands are local only' });
      if (!keyOk(req.headers['x-bv-key'] || url.searchParams.get('key'))) return json(res, 401, { error: 'missing or wrong key in the link' });
    } else {
      // Refuse cross-site writes from other pages open in the same browser.
      const origin = req.headers.origin;
      if (req.method !== 'GET' && origin) {
        let host = null; try { host = new URL(origin).host; } catch { /* "null" or malformed */ }
        if (host !== req.headers.host) return json(res, 403, { error: 'cross-origin request refused' });
      }
    }

    if (req.method === 'GET' && p === '/api/state') {
      const since = Number(url.searchParams.get('since') ?? -1);
      const wait = Math.min(Number(url.searchParams.get('wait') ?? 0), 25) * 1000;
      if (wait && since === s.seq) await waitChange(t => (t || s.seq !== since ? true : undefined), wait);
      return json(res, 200, publicState());
    }
    if (req.method === 'GET' && p === '/api/avatar') {
      if (!s.profile.avatarType) return json(res, 404, { error: 'no avatar' });
      res.writeHead(200, { 'content-type': s.profile.avatarType, 'cache-control': 'max-age=3600' });
      return res.end(fs.readFileSync(path.join(dataDir, 'avatar')));
    }
    if (req.method === 'GET' && p === '/api/bot/wait') {
      const ms = Math.min(Math.max(Number(url.searchParams.get('timeout') ?? 50), 1), 55) * 1000;
      s.bot.lastSeenAt = Date.now(); changed();
      const view = await waitChange(t => botView(t), ms);
      s.bot.lastSeenAt = Date.now(); save();
      return json(res, 200, view);
    }

    if (req.method === 'PUT' && (p === '/api/bot/avatar' || p === '/api/avatar')) {
      const buf = await readBody(req, MAX_AVATAR);
      const type = imageType(buf);
      if (!type) return json(res, 400, { error: 'avatar must be png, jpeg, webp or gif' });
      fs.writeFileSync(path.join(dataDir, 'avatar'), buf);
      s.profile.avatarType = type; s.profile.avatarVersion = Date.now();
      changed(); return json(res, 200, { ok: true });
    }

    if (req.method !== 'POST') return null;
    let body;
    try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}'); } catch (e) { return json(res, e.code || 400, { error: e.message }); }
    const g = game(), m = s.match;

    if (p === '/api/human/move' || p === '/api/bot/move') {
      const who = p.includes('/bot/') ? 'bot' : 'human';
      if (who === 'bot') s.bot.lastSeenAt = Date.now();
      if (m.state.over) return json(res, 409, { error: 'the game is over' });
      if (m.state.turn !== m[who]) return json(res, 409, { error: `not ${who}'s turn` });
      try { m.state = g.play(m.state, body.move); } catch (e) { return json(res, 400, { error: e.message }); }
      const comment = cleanText(body.comment);
      if (comment) addChat(who, comment);
      changed({ type: 'move', by: who, move: String(body.move).toLowerCase() });
      if (m.state.over) changed({ type: 'game-over' });
      return json(res, 200, { ok: true, ...(who === 'bot' ? { board: g.describe(m.state, m.bot), over: m.state.over } : {}) });
    }
    if (p === '/api/human/chat' || p === '/api/bot/say') {
      const who = p.includes('/bot/') ? 'bot' : 'human';
      if (who === 'bot') s.bot.lastSeenAt = Date.now();
      const text = cleanText(body.text);
      if (!text) return json(res, 400, { error: 'empty text' });
      addChat(who, text);
      changed(); return json(res, 200, { ok: true });
    }
    if (p === '/api/bot/profile') {
      if (body.name !== undefined) s.profile.name = cleanText(body.name, 40) || 'Bot';
      if (body.description !== undefined) s.profile.description = cleanText(body.description, 200);
      changed(); return json(res, 200, { ok: true, profile: s.profile });
    }
    if (p === '/api/new') {
      const gameNext = body.game && games[body.game] ? body.game : m.game;
      s.match = newMatch(gameNext, body.options || m.options, body.order || 'first');
      changed({ type: 'new-game' });
      return json(res, 200, { ok: true });
    }
    return null;
  }

  function serveStatic(req, res) {
    const url = new URL(req.url, 'http://local');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    // Browser files live in public/ and games/<id>/view.js. Nothing else is served.
    let full;
    const gm = /^\/games\/([a-z0-9-]+)\/view\.js$/.exec(rel);
    if (gm && games[gm[1]]) full = path.join(ROOT, 'games', gm[1], 'view.js');
    else full = path.join(ROOT, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(path.join(ROOT, 'public')) && !gm) { res.writeHead(404); return res.end(); }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(buf);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const r = await handle(req, res);
        if (r === null) json(res, 404, { error: 'not found' });
      } else if (req.method === 'GET') serveStatic(req, res);
      else json(res, 405, { error: 'method not allowed' });
    } catch (e) {
      if (!res.headersSent) json(res, e.code === 413 ? 413 : 500, { error: e.message });
    }
  });
  return { server, session: () => s };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const port = Number(a.port || process.env.PORT || 8765);
  const host = a.host || '127.0.0.1';
  const dataDir = path.resolve(a.data || path.join(ROOT, '.data'));
  const { server } = createApp({ dataDir, gameId: a.game || 'othello', size: a.size });
  // If the default port is busy, take the next free one. An explicit --port is used as is.
  const explicit = Boolean(a.port || process.env.PORT);
  let tries = 0;
  server.on('error', e => {
    if (e.code === 'EADDRINUSE' && !explicit && tries < 20) { tries++; server.listen(port + tries, host); return; }
    console.error(`cannot start: ${e.message}`); process.exit(1);
  });
  server.on('listening', () => {
    const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${server.address().port}`;
    fs.writeFileSync(path.join(dataDir, 'server.json'), JSON.stringify({ url, pid: process.pid }));
    console.log(`Bot Versus: ${url}/`);
  });
  server.listen(port, host);
}
