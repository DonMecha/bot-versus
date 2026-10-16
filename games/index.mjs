// Game registry. To add a game, create games/<id>/rules.mjs (same exports as othello)
// and games/<id>/view.js (browser renderer), then list it here.
import * as othello from './othello/rules.mjs';

export const games = { othello };

export function getGame(id) {
  const g = games[id];
  if (!g) throw new Error(`unknown game "${id}". available: ${Object.keys(games).join(', ')}`);
  return g;
}
