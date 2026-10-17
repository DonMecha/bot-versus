# Instructions for the bot

Read this when your user asks you to install, set up or start this repository
(for example "install this", "これを入れて", "対戦したい").
You will run a small game server on your computer, open the game in your browser,
and then play against your user while chatting with them.

Talk to your user in their language. Keep everything below inside your own computer.

## 1. Install (first time only)

```bash
git clone https://github.com/DonMecha/bot-versus.git bot-versus
cd bot-versus
node --version   # needs Node.js 18 or newer
```

If `git` is not available, download and unpack
`https://github.com/DonMecha/bot-versus/archive/refs/heads/main.zip` instead.
If Node.js is missing, install Node.js 18+ first.
To get a newer version later: `git pull` in the `bot-versus` folder.

Run every command below inside the `bot-versus` folder.

## 2. Start the game and give your user the link

Use your own bot name and a one-line description of yourself (your role and personality).

```bash
node start.mjs --name "<your bot name>" --desc "<one line about you>" --share
```

It starts the game server (or reuses the running one) and prints JSON:

- `share`: a link your user can open on their own phone or computer. **Send this link to your user.**
  It contains a secret key; anyone with the link can play and chat, so give it only to your user.
- `local`: the same game inside your computer. Open it in your browser too, so your user can also
  play from your computer screen if the link does not work for them.

If `--share` fails (no network access for the tunnel), run `node start.mjs` without it and tell your user
to open your computer from this conversation and take control of the browser to play.

If you can get your profile picture as a file, add `--avatar <file>` (png, jpg, webp or gif, up to 2 MB).
If you cannot, tell your user they can tap or click the icon on your card in the game to choose one.

The user moves by tapping or clicking the highlighted squares and can type to you in the chat box.

**Do not end your turn here.** Send your user the link, then go straight to step 3 in the same turn.
If your turn ends, nobody is waiting for the user's moves and the game page shows "Botが待機していません" (the bot is not waiting).

## 3. Play loop

Repeat until the user asks you to stop. Keep looping inside one turn: talk to the user with `say`,
not by ending your turn with a reply.

```bash
node bot.mjs wait
```

`wait` returns JSON when something needs you. Act on `event`:

- `your-turn`: read `board` and `legalMoves`, choose one move, then
  `node bot.mjs move <move> "<short comment, under 40 characters>"`.
  Only use a move from `legalMoves`. If the move is refused, read the error and pick again.
- `chat`: the user said something (`newMessages`). Reply with `node bot.mjs say "<reply>"`.
  `your-turn` can also carry `newMessages`; answer them in your move comment or with `say`.
- `game-over`: say something about the result with `say`. The user may start a new game.
- `new-game`: a new game started; keep looping (you may move first).
- `idle`: nothing happened for 10 minutes. Call `wait` again. After 30 idle minutes in a row,
  tell your user you stopped waiting and that they can say "continue" to resume.

Then call `node bot.mjs wait` again.

Play as yourself: your comments and chat should sound like you. Play to win, but keep it fun.
Only talk about the game and the conversation with your user in the chat. Never put login details, keys,
file locations or private data there.

If the user tells you in your conversation to continue (for example "continue", "対戦を続けて"), go back to `wait`.

## Commands

| Command | What it does |
| --- | --- |
| `node start.mjs --name ... --desc ... [--avatar file] [--share]` | start the game, set your profile, make a share link |
| `node start.mjs --stop` | close the share link and stop the server |
| `node bot.mjs wait [--timeout 600]` | wait for your turn, a chat message, or a game start/end |
| `node bot.mjs move <move> ["comment"]` | play a move |
| `node bot.mjs say "<text>"` | chat with your user |
| `node bot.mjs profile --name ... --desc ... [--avatar file]` | set your name, description and icon |
| `node bot.mjs state` | show the board without waiting |
| `node bot.mjs new [--order first\|second\|random] [--size 8\|6]` | start a new game (`order` is the user's) |

## Stopping

When the user is done, run `node start.mjs --stop`. It closes the share link and stops the server.
The board and chat are saved in `.data/` and come back when you start again (the link will be new).
