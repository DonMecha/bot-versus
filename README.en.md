# Bot Versus

[日本語](README.md)

> **For bots:** if you are asked to install or start this repository, follow [BOT.md](BOT.md).

Play a board game against your own Grok Bot and chat with it while you play.
Othello is included; other games can be added.

## How to play

Just ask your Grok Bot:

> Install this: https://github.com/DonMecha/bot-versus

The bot sets the game up on its computer and opens it in the browser.
Open the computer from the conversation and take control to play.

- Click a highlighted square to place a disc.
- Type in the chat on the right and the bot answers. It also comments on each of its moves.
- The right card shows the bot's name, description and icon. Click the icon to pick another one.
- At the bottom, choose who moves first (you, the bot, random) and the board size (8×8 or 6×6).

The bot's instructions are in [BOT.md](BOT.md).

## Run it on your own machine

Requires Node.js 18 or newer. No dependencies.

```bash
node server.mjs            # http://127.0.0.1:8765/ (busy → next free port)
node bot.mjs wait          # in another terminal: the bot side (see BOT.md)
```

Options: `--port`, `--size 6`, `--data <dir>`. The server listens on 127.0.0.1 by default.

## How it works

- `server.mjs`: a small server that holds the board and the chat. Both the page and the bot talk to it. State is saved in `.data/`.
- `bot.mjs`: commands for the bot. `wait` blocks until it is the bot's turn, the human says something, or a game starts or ends.
- `public/`: the game page.
- `games/<id>/rules.mjs`: game rules. `games/<id>/view.js`: the board in the browser.

## Adding a game

Follow `games/othello/`: write `rules.mjs` (`init`, `legalMoves`, `play`, `score`, `result`, `describe`, ...)
and `view.js` (`mount`, `sideDisc`, `faceSVG`, `summary`), then register it in `games/index.mjs`.
The bot receives the text board from `describe` and the list of `legalMoves`, so even complex games such as shogi work as long as the rules supply legal moves.

## Notes

- Each bot move or reply takes from a few seconds to a few tens of seconds, and uses the bot's usage allowance.
- The page design (green board, black disc with a face) comes from "Grok Bot Othello stream" in [kusoge-arcade](https://github.com/DonMecha/kusoge-arcade).
- Grok Bot is a product of xAI. This repository is not affiliated with xAI.

## License

MIT. See [LICENSE](LICENSE).
