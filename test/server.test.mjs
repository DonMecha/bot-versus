import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-'));
  const { server } = createApp({ dataDir, gameId: 'othello', size: 6 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { server, base, call, dataDir };
}

test('human and bot play a full game; the bot is told about turns, chat and the end', async () => {
  const { server, call } = await start();
  try {
    let st = (await call('GET', '/api/state')).body;
    assert.equal(st.match.human, 'black');
    assert.equal(st.botOnline, false);
    // Not the bot's turn yet: wait times out as idle.
    let w = (await call('GET', '/api/bot/wait?timeout=1')).body;
    assert.equal(w.event, 'idle');
    // Human chats: the bot gets it once.
    await call('POST', '/api/human/chat', { text: 'よろしく！' });
    w = (await call('GET', '/api/bot/wait?timeout=1')).body;
    assert.equal(w.event, 'chat');
    assert.deepEqual(w.newMessages, ['よろしく！']);
    w = (await call('GET', '/api/bot/wait?timeout=1')).body;
    assert.equal(w.event, 'idle');
    assert.equal((await call('POST', '/api/bot/say', { text: 'こちらこそ' })).status, 200);
    // Bot cannot move on the human's turn.
    assert.equal((await call('POST', '/api/bot/move', { move: 'c2' })).status, 409);
    let moves = 0;
    for (;;) {
      st = (await call('GET', '/api/state')).body;
      if (st.match.state.over) break;
      if (st.match.state.turn === st.match.human) {
        assert.ok(st.legal.length);
        assert.equal((await call('POST', '/api/human/move', { move: st.legal[0] })).status, 200);
      } else {
        w = (await call('GET', '/api/bot/wait?timeout=2')).body;
        assert.equal(w.event, 'your-turn');
        assert.ok(w.legalMoves.length);
        assert.match(w.board, /You are white/);
        // A wrong move is refused and does not change the turn.
        assert.equal((await call('POST', '/api/bot/move', { move: 'z9' })).status, 400);
        assert.equal((await call('POST', '/api/bot/move', { move: w.legalMoves.at(-1), comment: '次はここ' })).status, 200);
      }
      assert.ok(++moves < 100);
    }
    assert.ok(st.result);
    assert.equal(st.botOnline, true);
    w = (await call('GET', '/api/bot/wait?timeout=1')).body;
    assert.equal(w.event, 'game-over');
    assert.ok(w.result);
    assert.ok(st.chat.some(c => c.from === 'bot' && c.text === '次はここ'));
    // New game, bot moves first.
    await call('POST', '/api/new', { order: 'second', options: { size: 8 } });
    w = (await call('GET', '/api/bot/wait?timeout=1')).body;
    assert.equal(w.event, 'new-game');
    assert.equal(w.legalMoves.length, 4);
    assert.match(w.you, /^black/);
  } finally { server.close(); }
});

test('profile and avatar are shown to the page; non-images are refused', async () => {
  const { server, call, base } = await start();
  try {
    await call('POST', '/api/bot/profile', { name: 'テストBot', description: '説明' });
    assert.equal((await call('PUT', '/api/bot/avatar', Buffer.from('not an image'))).status, 400);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4480000000049454e44ae426082', 'hex');
    assert.equal((await call('PUT', '/api/bot/avatar', png)).status, 200);
    const st = (await call('GET', '/api/state')).body;
    assert.equal(st.profile.name, 'テストBot');
    const r = await fetch(base + st.profile.avatar);
    assert.equal(r.headers.get('content-type'), 'image/png');
  } finally { server.close(); }
});

test('writes from another site are refused and state survives a restart', async () => {
  const { server, call, dataDir } = await start();
  try {
    assert.equal((await call('POST', '/api/human/chat', { text: 'x' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await call('POST', '/api/human/move', { move: 'b3' })).status, 200);
  } finally { server.close(); }
  const again = createApp({ dataDir });
  assert.equal(again.session().match.state.history.length, 1);
});

test('only page files and game views are served', async () => {
  const { server, base } = await start();
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/games/othello/view.js')).status, 200);
    assert.equal((await fetch(base + '/games/othello/rules.mjs')).status, 404);
    assert.equal((await fetch(base + '/../server.mjs')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/server.mjs')).status, 404);
  } finally { server.close(); }
});

test('through a share link: the key is required and bot commands are refused', async () => {
  const { server, call, dataDir } = await start();
  try {
    const key = fs.readFileSync(path.join(dataDir, 'key'), 'utf8');
    const fwd = { 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '203.0.113.5' };
    assert.equal((await call('GET', '/api/state', undefined, fwd)).status, 401);
    assert.equal((await call('GET', '/api/state?key=wrong', undefined, fwd)).status, 401);
    const st = await call('GET', '/api/state', undefined, { ...fwd, 'x-bv-key': key });
    assert.equal(st.status, 200);
    assert.ok(!JSON.stringify(st.body).includes(key), 'the key must not leak in the state');
    assert.equal((await call('POST', '/api/human/move', { move: 'b3' }, { ...fwd, 'x-bv-key': key, origin: 'https://example.trycloudflare.com' })).status, 200);
    assert.equal((await call('POST', '/api/bot/say', { text: 'x' }, { ...fwd, 'x-bv-key': key })).status, 403);
    assert.equal((await call('GET', '/api/bot/wait?timeout=1', undefined, { ...fwd, 'x-bv-key': key })).status, 403);
    // Local requests (the bot, the bot's own browser) need no key.
    assert.equal((await call('POST', '/api/bot/say', { text: 'local ok' })).status, 200);
    assert.equal(fs.statSync(path.join(dataDir, 'key')).mode & 0o077, 0);
  } finally { server.close(); }
});
