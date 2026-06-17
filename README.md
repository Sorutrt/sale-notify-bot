# sale-notify-bot

Discord に投稿された商品 URL と商品名を登録し、基準価格から指定割合以上値下がりしたときに通知する bot です。MVP ではヨドバシカメラの商品ページを対象にします。

## 開発

```sh
nix develop
bun install
cp .env.example .env
```

`.env` に Discord bot token、client ID、通知先 channel ID を設定します。スラッシュコマンドを登録してから bot を起動します。

```sh
bun run register-commands
bun run dev
```

## 環境変数

- `DISCORD_TOKEN`: Discord bot token
- `DISCORD_CLIENT_ID`: Discord application client ID
- `DISCORD_GUILD_ID`: 設定すると guild command として即時登録します。未設定なら global command として登録します。
- `DISCORD_NOTIFY_CHANNEL_ID`: 値下げ通知を投稿するチャンネル ID
- `DATABASE_PATH`: SQLite DB の保存先。既定値は `./sale-notify.db`
- `PRICE_CHECK_CRON`: 価格チェック周期。既定値は `*/10 * * * *`
- `USER_AGENT`: 商品ページ取得時の User-Agent

## コマンド

- `/register url name threshold`
- `/list`
- `/list name`
- `/delete name url`
- `/set-base name url price`
- `/set-threshold name url percent`
- `/help`

通常メッセージで `<URL> <商品名>` または `<商品名> <URL>` と投稿する登録互換もあります。
