// Othello rules. Pure functions over plain JSON state, shared by the server and tests.
// Coordinates: column letter a.. + row number 1.. (a1 = top-left), e.g. "d3".

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const other = side => (side === 'black' ? 'white' : 'black');

export const id = 'othello';
export const title = 'オセロ';
export const sides = ['black', 'white']; // first entry moves first
export const sideNames = { black: '黒', white: '白' };
export const options = { size: { choices: [8, 6], default: 8 } };

export function init({ size = 8 } = {}) {
  if (![6, 8].includes(size)) throw new Error('size must be 6 or 8');
  const cells = Array(size * size).fill(null);
  const m = size / 2;
  cells[(m - 1) * size + (m - 1)] = 'white';
  cells[(m - 1) * size + m] = 'black';
  cells[m * size + (m - 1)] = 'black';
  cells[m * size + m] = 'white';
  return { size, cells, turn: 'black', history: [], over: false };
}

export function toCoord(size, i) {
  return String.fromCharCode(97 + (i % size)) + (Math.floor(i / size) + 1);
}

export function fromCoord(size, coord) {
  const m = /^([a-z])([0-9]{1,2})$/.exec(String(coord).trim().toLowerCase());
  if (!m) return -1;
  const c = m[1].charCodeAt(0) - 97, r = Number(m[2]) - 1;
  return c >= 0 && c < size && r >= 0 && r < size ? r * size + c : -1;
}

function flips(state, i, side) {
  const { size, cells } = state;
  if (cells[i]) return [];
  const r0 = Math.floor(i / size), c0 = i % size, out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] === other(side)) {
      line.push(r * size + c); r += dr; c += dc;
    }
    if (line.length && r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] === side) out.push(...line);
  }
  return out;
}

function movesFor(state, side) {
  const out = [];
  for (let i = 0; i < state.cells.length; i++) if (flips(state, i, side).length) out.push(i);
  return out;
}

export function legalMoves(state) {
  if (state.over) return [];
  return movesFor(state, state.turn).map(i => toCoord(state.size, i));
}

export function score(state) {
  const s = { black: 0, white: 0 };
  for (const v of state.cells) if (v) s[v]++;
  return s;
}

// Returns a new state. Passes are applied automatically and recorded in history.
export function play(state, coord) {
  if (state.over) throw new Error('the game is over');
  const i = fromCoord(state.size, coord);
  const flipped = i < 0 ? [] : flips(state, i, state.turn);
  if (!flipped.length) throw new Error(`illegal move "${coord}". legal: ${legalMoves(state).join(' ') || '(none)'}`);
  const side = state.turn;
  const cells = state.cells.slice();
  cells[i] = side;
  for (const f of flipped) cells[f] = side;
  const history = [...state.history, { side, move: toCoord(state.size, i), flipped: flipped.map(f => toCoord(state.size, f)) }];
  const next = { ...state, cells, history, turn: other(side) };
  if (!movesFor(next, next.turn).length) {
    if (movesFor(next, side).length) {
      history.push({ side: next.turn, move: 'pass', flipped: [] });
      next.turn = side;
    } else {
      next.over = true;
    }
  }
  return next;
}

export function result(state) {
  if (!state.over) return null;
  const s = score(state);
  const winner = s.black === s.white ? null : s.black > s.white ? 'black' : 'white';
  return { winner, score: s };
}

// Plain-text view for a chat bot. Columns are letters, rows are numbers.
export function describe(state, you) {
  const { size, cells } = state;
  const mark = { black: 'X', white: 'O' };
  const header = '   ' + Array.from({ length: size }, (_, c) => String.fromCharCode(97 + c)).join(' ');
  const rows = [];
  for (let r = 0; r < size; r++) {
    rows.push(String(r + 1).padStart(2) + ' ' + cells.slice(r * size, (r + 1) * size).map(v => (v ? mark[v] : '.')).join(' '));
  }
  const s = score(state);
  return [
    `${header}`, ...rows,
    `X = black(${sideNames.black}) ${s.black}, O = white(${sideNames.white}) ${s.white}. You are ${you} (${mark[you]}).`,
  ].join('\n');
}
