# Bot Versus

[English](README.en.md)

> **Botへ:** このリポジトリを入れる・始めるよう頼まれたら、[BOT.md](BOT.md) の手順に従ってください。

自分のGrok Botとボードゲームで対戦し、打ちながらおしゃべりできるゲームです。
いまはオセロに対応しています。ほかのゲームも足せる作りです。

## 遊び方

Grok Botにこう頼むだけです。

> これを入れて https://github.com/DonMecha/bot-versus

BotがBotのコンピューターにゲームを用意し、ブラウザで開きます。
会話の画面からコンピューターを開き、操作を引き受けると遊べます。

- 光っているマスをクリックすると石を置けます。
- 右のトークに書くと、Botが返事をします。Botは一手ごとにひとことコメントします。
- 右側のカードにはBotの名前・説明・アイコンが出ます。アイコンはクリックして選び直せます。
- 下の欄で手番（先手・後手・ランダム）と盤の大きさ（8×8・6×6）を選べます。

Botへの手順は [BOT.md](BOT.md) にあります。Botはこれを読んで動きます。

## 自分のパソコンで動かす

Node.js 18以上が必要です。依存パッケージはありません。

```bash
node server.mjs            # http://127.0.0.1:8765/ (busy → next free port)
node bot.mjs wait          # 別の端末で。Bot側の操作（BOT.md参照）
```

`--port`・`--size 6`・`--data <dir>` を指定できます。サーバーは既定で127.0.0.1だけで待ち受けます。

## しくみ

- `server.mjs`: 盤面とトークを持つ小さなサーバー。ページとBotの両方がここを見ます。状態は `.data/` に保存します。
- `bot.mjs`: Bot用のコマンド。`wait` は自分の番・新しい発言・対局の開始と終了まで待ちます。
- `public/`: 対戦画面。
- `games/<id>/rules.mjs`: ゲームのルール。`games/<id>/view.js`: 盤の表示。

## ゲームを足す

`games/othello/` を手本に、`rules.mjs`（`init`・`legalMoves`・`play`・`score`・`result`・`describe` など）と
`view.js`（`mount`・`sideDisc`・`faceSVG`・`summary`）を作り、`games/index.mjs` に登録します。
Botには `describe` の文字の盤面と `legalMoves` が渡るので、将棋のような複雑なゲームでも、合法手を渡せば打てます。

## 注意

- Botの一手やコメントには数秒〜数十秒かかります。考える回数ぶん、Botの利用量を使います。
- ページの画面デザイン（緑の盤と顔つきの黒石）は [kusoge-arcade](https://github.com/DonMecha/kusoge-arcade) の「Grok Bot オセロ実況配信」から流用しています。
- Grok BotはxAIの製品です。このリポジトリはxAIの公式のものではありません。

## License

MIT。全文は [LICENSE](LICENSE) です。
