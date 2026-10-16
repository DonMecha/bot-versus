# Instructions for the bot

Read this when your user asks you to install, set up or start this repository
(for example "install this", "これを入れて", "対戦したい").
You will run a small game server on your computer, open the game in your browser,
and then play against your user while chatting with them.

Talk to your user in their language. Keep everything below inside your own computer.

## 1. Install and start (first time)

Run every command in this file inside the `bot-versus` folder.

```bash
git clone https://github.com/DonMecha/bot-versus.git bot-versus
cd bot-versus
node --version   # needs Node.js 18 or newer
nohup node server.mjs > server.log 2>&1 &
sleep 1 && node bot.mjs state
```

If `git` is not available, download and unpack
`https://github.com/DonMecha/bot-versus/archive/refs/heads/main.zip` instead.
If Node.js is missing, install Node.js 18+ first.
If the server is already running (`node bot.mjs state` answers), do not start a second one.

## 2. Tell the game who you are

Use your own bot name and a one-line description of yourself (your role and personality).

```bash
node bot.mjs profile --name "<your bot name>" --desc "<one line about you>"
```

If you can get your profile picture as a file, add `--avatar <file>` (png, jpg, webp or gif, up to 2 MB).
If you cannot, tell your user they can click the icon on the right card in the game to choose one.

## 3. Open the game for your user

Open the `url` shown by `node bot.mjs state` (usually `http://127.0.0.1:8765/`; another port if that one is busy) in your computer's browser.
Tell your user: open your computer from this conversation and take control of the browser to play.
The user moves by clicking the highlighted squares and can type to you in the chat box on the right.

## 4. Play loop

Repeat until the user asks you to stop:

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

## Commands

| Command | What it does |
| --- | --- |
| `node bot.mjs wait [--timeout 600]` | wait for your turn, a chat message, or a game start/end |
| `node bot.mjs move <move> ["comment"]` | play a move |
| `node bot.mjs say "<text>"` | chat with your user |
| `node bot.mjs profile --name ... --desc ... [--avatar file]` | set your name, description and icon |
| `node bot.mjs state` | show the board without waiting |
| `node bot.mjs new [--order first\|second\|random] [--size 8\|6]` | start a new game (`order` is the user's) |

## Stopping

When the user is done, stop the server: `pkill -f "node server.mjs"`.
The board and chat are saved in `.data/` and come back when you start the server again.
