import test from 'node:test';
import assert from 'node:assert/strict';
import * as o from '../games/othello/rules.mjs';

test('opening position has four legal moves for black', () => {
  const s = o.init({ size: 8 });
  assert.deepEqual(o.legalMoves(s).sort(), ['c4', 'd3', 'e6', 'f5']);
  assert.deepEqual(o.score(s), { black: 2, white: 2 });
});

test('a move flips discs and passes the turn', () => {
  const s = o.play(o.init({ size: 8 }), 'd3');
  assert.equal(s.turn, 'white');
  assert.deepEqual(o.score(s), { black: 4, white: 1 });
  assert.deepEqual(s.history.at(-1), { side: 'black', move: 'd3', flipped: ['d4'] });
});

test('illegal moves are refused with the legal list', () => {
  assert.throws(() => o.play(o.init({ size: 8 }), 'a1'), /illegal move "a1". legal: /);
  assert.throws(() => o.play(o.init({ size: 8 }), 'zz'), /illegal/);
});

test('random games end with a result and keep disc counts consistent', () => {
  for (const size of [6, 8]) {
    for (let g = 0; g < 30; g++) {
      let s = o.init({ size });
      while (!s.over) {
        const legal = o.legalMoves(s);
        assert.ok(legal.length, 'side to move must have a move unless the game is over');
        s = o.play(s, legal[Math.floor(Math.random() * legal.length)]);
      }
      const r = o.result(s);
      const sc = o.score(s);
      assert.ok(sc.black + sc.white <= size * size);
      assert.equal(r.winner, sc.black === sc.white ? null : sc.black > sc.white ? 'black' : 'white');
    }
  }
});

test('describe shows coordinates and the bot side', () => {
  const t = o.describe(o.init({ size: 6 }), 'white');
  assert.match(t, /^ {3}a b c d e f$/m);
  assert.match(t, /You are white \(O\)/);
});
