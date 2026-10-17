const $ = id => document.getElementById(id);
const stage = $('stage');
function fit() {
  const portrait = innerWidth < 900 || innerWidth < innerHeight;
  document.body.classList.toggle('portrait', portrait);
  if (portrait) { stage.style.transform = ''; return; }
  const k = Math.min(innerWidth / 1280, innerHeight / 720);
  stage.style.transform = `translate(-50%,-50%) scale(${k})`;
}
addEventListener('resize', fit); fit();

const HUMAN_SVG = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#1d2b44"/><circle cx="50" cy="38" r="18" fill="#9fb4d8"/><path d="M18 92 Q50 52 82 92 Z" fill="#9fb4d8"/></svg>';

let view = null, viewGame = null, faceSVG = null, sideDisc = null, summary = null;
let pub = null, chatShown = 0;

// Share links carry ?key=...; send it with every request (the local page has none and needs none).
const KEY = (() => { const q = new URLSearchParams(location.search).get('key'); try { if (q) sessionStorage.setItem('bv-key', q); return q || sessionStorage.getItem('bv-key') || ''; } catch { return q || ''; } })();
const H = KEY ? { 'x-bv-key': KEY } : {};
const withKey = u => (KEY ? u + (u.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(KEY) : u);

async function post(p, body) {
  const r = await fetch(p, { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

function botAvatar() {
  return pub.profile.avatar ? Object.assign(document.createElement('img'), { src: withKey(pub.profile.avatar), alt: '' }) : null;
}
function setAvatar(el, who) {
  const key = who === 'bot' ? (pub.profile.avatar || 'face') : 'human';
  if (el.dataset.k === key) return;
  el.dataset.k = key; el.innerHTML = '';
  const img = who === 'bot' && botAvatar();
  if (img) el.appendChild(img); else el.innerHTML = who === 'bot' ? faceSVG() : HUMAN_SVG;
}

function renderChat() {
  const msgs = $('msgs');
  const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
  const fresh = pub.chat.filter(c => c.n > chatShown);
  for (const c of fresh) {
    const row = document.createElement('div');
    row.className = 'm ' + c.from;
    const av = document.createElement('div'); av.className = 'av'; setAvatar(av, c.from);
    const body = document.createElement('div'); body.className = 'body';
    const nm = document.createElement('span'); nm.className = 'nm';
    if (c.from === 'human') { const t = document.createElement('span'); t.className = 'htag'; t.textContent = 'あなた'; body.appendChild(t); }
    else nm.textContent = pub.profile.name;
    const tx = document.createElement('span'); tx.textContent = c.text;
    body.append(nm, tx);
    const tm = document.createElement('div'); tm.className = 'tm';
    tm.textContent = new Date(c.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    row.append(av, body, tm);
    msgs.appendChild(row);
    chatShown = c.n;
  }
  while (msgs.querySelectorAll('.m').length > 200) msgs.querySelector('.m').remove();
  if (fresh.length && (atBottom || fresh.at(-1).from === 'human')) msgs.scrollTop = msgs.scrollHeight;
}

function render() {
  const g = pub.game, m = pub.match, st = m.state;
  document.title = `${g.title} vs ${pub.profile.name}`;
  $('gtitle').textContent = g.title;
  $('remain').textContent = summary(pub);
  $('name-bot').textContent = pub.profile.name;
  $('tname-bot').textContent = pub.profile.name;
  $('desc-bot').textContent = pub.profile.description;
  $('chathead').textContent = `${pub.profile.name}とトーク`;
  for (const who of ['human', 'bot']) {
    setAvatar($('av-' + who), who); setAvatar($('tav-' + who), who);
    const side = m[who];
    $('ps-' + who).innerHTML = `<span class="sd">${sideDisc(side)}</span>${g.sideNames[side]}`;
    $('tsd-' + who).innerHTML = sideDisc(side);
    $('pn-' + who).textContent = pub.score[side];
    $('tc-' + who).textContent = pub.score[side];
    $('pc-' + who).classList.toggle('turn', !st.over && st.turn === side);
  }
  const pill = $('botpill');
  pill.className = pub.botOnline ? 'on' : 'off';
  pill.textContent = pub.botOnline ? `${pub.profile.name} 待機中` : 'Bot 未接続';

  const botTurn = !st.over && st.turn === m.bot;
  const wp = $('waitpill');
  wp.style.display = botTurn ? 'block' : 'none';
  wp.textContent = pub.botOnline ? `${pub.profile.name}が考えています…` : 'Botが待機していません。Botとの会話で「対戦を続けて」と伝えてください';
  const lastPass = st.history.at(-1)?.move === 'pass' ? `${st.history.at(-1).side === m.human ? 'あなた' : pub.profile.name}はパス。` : '';
  $('hint').textContent = st.over ? '対局終了' : st.turn === m.human ? `${lastPass}あなたの番です。光っているマスに置けます` : `${lastPass}${pub.profile.name}の番です`;

  const over = $('endov');
  if (pub.result) {
    over.style.display = 'flex';
    const w = pub.result.winner;
    $('endwin').textContent = w === null ? '引き分け' : w === m.human ? 'あなたの勝ち！' : `${pub.profile.name}の勝ち`;
    $('endscore').textContent = g.sides.map(s => `${g.sideNames[s]} ${pub.result.score[s]}`).join(' ー ');
  } else over.style.display = 'none';

  const sz = $('size');
  const choices = g.options.size?.choices || [];
  if (sz.dataset.k !== choices.join()) {
    sz.dataset.k = choices.join();
    sz.innerHTML = choices.map(c => `<option value="${c}">${c}×${c}</option>`).join('');
  }
  if (document.activeElement !== sz) sz.value = m.options.size;
  sz.style.display = choices.length ? '' : 'none';

  view.render(pub);
  renderChat();
}

async function ensureView() {
  if (viewGame === pub.game.id) return;
  const mod = await import(`/games/${pub.game.id}/view.js`);
  faceSVG = mod.faceSVG; sideDisc = mod.sideDisc; summary = mod.summary;
  view = mod.mount($('board'), { onMove: move => post('/api/human/move', { move }).catch(e => flash(e.message)) });
  viewGame = pub.game.id;
}

function flash(text) { $('hint').textContent = text; }

async function newGame() {
  await post('/api/new', { order: $('order').value, options: { size: Number($('size').value) } }).catch(e => flash(e.message));
}
$('newgame').addEventListener('click', newGame);
// The bot sets its own icon with bot.mjs profile --avatar; the human can also pick one here.
$('av-bot').addEventListener('click', () => $('avfile').click());
$('avfile').addEventListener('change', async () => {
  const f = $('avfile').files[0];
  if (!f) return;
  const r = await fetch('/api/avatar', { method: 'PUT', headers: H, body: f });
  if (!r.ok) flash((await r.json().catch(() => ({}))).error || 'アイコンを設定できません');
  $('avfile').value = '';
});
$('rematch').addEventListener('click', newGame);
$('inbox').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('inp').value.trim();
  if (!text) return;
  $('inp').value = '';
  post('/api/human/chat', { text }).catch(err => flash(err.message));
});

async function loop() {
  let since = -1;
  for (;;) {
    try {
      const r = await fetch(`/api/state?since=${since}&wait=25`, { cache: 'no-store', headers: H });
      if (r.status === 401) { $('botpill').className = 'off'; $('botpill').textContent = 'リンクの合言葉が違います'; await new Promise(res => setTimeout(res, 5000)); continue; }
      pub = await r.json();
      since = pub.seq;
      await ensureView();
      render();
    } catch {
      $('botpill').className = 'off'; $('botpill').textContent = 'サーバーに接続できません';
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
loop();
