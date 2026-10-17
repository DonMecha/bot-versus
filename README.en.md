# Bot Versus

[日本語](README.md)

> **For bots:** if you are asked to install or start this repository, follow [BOT.md](BOT.md).

Play a board game against your own Grok Bot and chat with it while you play.
Othello is included; other games can be added.

## How to play

Just ask your Grok Bot:

> Install this: https://github.com/DonMecha/bot-versus

The bot sets the game up on its computer and sends you a link.
Open the link in the browser on your phone or computer and play.
If the link does not open, you can also open the bot's computer from the conversation and take control to play.

- Tap or click a highlighted square to place a disc.
- Type in the chat and the bot answers. It also comments on each of its moves.
- The bot's card shows its name, description and icon. Tap or click the icon to pick another one.
- At the bottom, choose who moves first (you, the bot, random) and the board size (8×8 or 6×6).

The bot's instructions are in [BOT.md](BOT.md).

## Troubleshooting

- **The page says "Botが待機していません" (the bot is not waiting)**: tell the bot "continue" in your conversation. It goes back to waiting.
- **The page says "リンクの合言葉が違います" (wrong key in the link)**: open the link exactly as the bot sent it, including `?key=`. Restarting the bot makes a new link.
- **The bot's computer screen says it cannot connect**: in Grok Bot settings → Computer, run "Update the bot's computer", restart the app, then start the computer again. The update removes apps and packages installed on the bot's computer (files and sign-ins stay). Afterwards ask the bot to start the server again.

## Run it on your own machine

Requires Node.js 18 or newer. No dependencies.

```bash
node start.mjs --name "Bot" --share   # start the server and make a share link; without --share it stays on this machine
node bot.mjs wait                     # the bot side (see BOT.md)
node start.mjs --stop                 # close the link and stop the server
```

The server listens on 127.0.0.1 only. `--share` makes the link with a Cloudflare quick tunnel (no account needed); if cloudflared is missing it is downloaded once into `.data/bin/`. The link carries a key: requests without it, and bot commands through the link, are refused.

## How it works

- `start.mjs`: one command to start, set the profile and make the share link.
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
