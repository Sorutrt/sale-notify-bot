# sale-notify-bot

Discord に投稿された商品 URL と商品名を登録し、基準価格から指定割合以上値下がりしたときに通知する bot です。MVP では Steam Store のアプリページを対象にします。

## Discord Developer Portal の準備

1. [Discord Developer Portal](https://discord.com/developers/applications) を開き、`New Application` でアプリケーションを作成します。
2. `General Information` の `Application ID` をコピーし、`.env` の `DISCORD_CLIENT_ID` に設定します。
3. 左メニューの `Bot` を開き、`Token` の `Reset Token` で bot token を発行して `.env` の `DISCORD_TOKEN` に設定します。token は再表示できないため、漏洩した場合は再発行してください。
4. 同じ `Bot` ページで `Privileged Gateway Intents` の `Message Content Intent` を有効にします。通常メッセージによる `<URL> <商品名>` 登録互換を使うために必要です。スラッシュコマンドだけで運用するなら、この互換機能を無効化して intent も外せます。
5. `Installation` を開き、`Install Link` は `Discord Provided Link` を選びます。
6. `Default Install Settings` で `Guild Install` に以下を追加します。
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`
7. `Install Link` の URL をブラウザで開き、通知を出したい Discord サーバーへ bot を追加します。
8. Discord 側で通知先チャンネルの ID をコピーし、`.env` の `DISCORD_NOTIFY_CHANNEL_ID` に設定します。ID コピーには Discord クライアントの `User Settings` -> `Advanced` -> `Developer Mode` を有効にしてから、チャンネルを右クリックして `Copy Channel ID` を使います。
9. 開発中はサーバー ID もコピーし、`.env` の `DISCORD_GUILD_ID` に設定するのがおすすめです。guild command として登録されるため、global command より反映が速くなります。

この bot は discord.js の Gateway 接続で interaction と message event を受け取るため、`General Information` の `Interactions Endpoint URL` は設定不要です。

## 開発

```sh
nix develop -f shell.nix
bun install
cp .env.example .env
```

`.env` に Discord bot token、client ID、通知先 channel ID などを設定します。スラッシュコマンドを登録してから bot を起動します。

```sh
bun run register-commands
bun run dev
```

flake を Git に追加した後は `nix develop` も使えます。未追跡の `flake.nix` は Nix から見えないことがあるため、作業中は `nix develop -f shell.nix` が確実です。

## 環境変数

- `DISCORD_TOKEN`: Discord bot token
- `DISCORD_CLIENT_ID`: Discord application client ID
- `DISCORD_GUILD_ID`: 設定すると guild command として即時登録します。未設定なら global command として登録します。
- `DISCORD_NOTIFY_CHANNEL_ID`: 値下げ通知を投稿するチャンネル ID
- `DATABASE_PATH`: SQLite DB の保存先。既定値は `./sale-notify.db`
- `PRICE_CHECK_CRON`: 価格チェック周期。既定値は `*/10 * * * *`
- `USER_AGENT`: 価格 API 取得時の User-Agent

## コマンド

- `/register url name threshold`
- `/list`
- `/list name`
- `/delete name url`
- `/delete name all`
- `/set-base name url price`
- `/set-threshold name url percent`
- `/help`

通常メッセージで `<URL> <商品名>` または `<商品名> <URL>` と投稿する登録互換もあります。

対応 URL は Steam Store のアプリページです。

```text
https://store.steampowered.com/app/570/Dota_2/
```

## 参考

- [Discord: Building your first Discord Bot](https://docs.discord.com/developers/quick-start/getting-started)
- [Discord: OAuth2 Bot Authorization Flow](https://docs.discord.com/developers/topics/oauth2#bot-authorization-flow)
- [Discord: Message Content Intent](https://docs.discord.com/developers/events/gateway#message-content-intent)
