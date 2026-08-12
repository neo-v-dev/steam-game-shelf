# Steam Game Shelf 🎮

[English README is here → docs/README.en.md](docs/README.en.md)

Steam の所有ゲーム一覧を取得して、GitHub Pages で公開できるサイトを自動生成するテンプレートです。配信者が「持っているゲーム」を視聴者に公開する用途を想定しています。

- **無料で動作**: GitHub の無料枠(Actions + Pages)だけで完結。サーバー不要。
- **自動更新**: 毎日自動でゲームリストを更新。手動更新も1クリック。
- **非表示設定**: 見せたくないゲームをサイトから除外可能。
- **日本語 / 英語**: 閲覧者がサイト上で切り替え可能。

## 必要なもの

- GitHub アカウント
- Steam アカウント(プロフィールの「ゲームの詳細」が**公開**設定であること)
- Steam Web API キー(無料。下記手順で取得)

## セットアップ手順

### 1. リポジトリを作成

このリポジトリの上部にある **「Use this template」→「Create a new repository」** をクリックし、自分のリポジトリを作成します(Public を選択してください。無料プランでは Public リポジトリのみ GitHub Pages が使えます)。

### 2. Steam API キーと SteamID を用意

- **APIキー**: https://steamcommunity.com/dev/apikey で取得(ドメイン名は `localhost` などでOK)
- **SteamID64**: 17桁の数字。自分のプロフィールURLが `steamcommunity.com/profiles/7656...` ならその数字。カスタムURLの場合は https://steamid.io で調べられます。
- **プライバシー設定**: Steam の「プロフィールの編集 → プライバシー設定」で「ゲームの詳細」を**公開**にしてください。非公開だと API が一覧を返しません。

### 3. Secrets を登録

作成したリポジトリの **Settings → Secrets and variables → Actions → New repository secret** で以下の2つを登録します。

| Name | 値 |
|---|---|
| `STEAM_API_KEY` | 手順2で取得した API キー |
| `STEAM_ID` | あなたの SteamID64(17桁の数字) |

### 4. GitHub Pages を有効化

**Settings → Pages → Build and deployment → Source** を **「GitHub Actions」** に設定します。

### 5. 初回のリスト取得

**Actions タブ → 「Update game list」→「Run workflow」** を実行します。完了すると `data/catalog.json` に全所有ゲームの一覧がコミットされます。

この時点ではまだ `published: false` のため、サイトには「準備中」画面のみが表示されます。

### 6. 非表示設定(公開前の確認)

`data/catalog.json` を GitHub 上で開いて(鉛筆アイコンで編集)、見せたくないゲームの `"visible": true` を `"visible": false` に変更してコミットします。

```json
{
  "appid": 123456,
  "name": "見せたくないゲーム",
  "visible": false
}
```

### 7. 公開

`config/settings.jsonc` を編集して `"published": true` に変更しコミットすると、サイトが公開されます。URL は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。

以降は毎日自動でリストが更新されます。新しく買ったゲームは `default_visibility` の設定に従って表示/非表示されます(買ってすぐ見せたくない場合は `default_visibility: false` にしておき、手動で `visible: true` にする運用がおすすめです)。

## 設定項目

`config/settings.jsonc` で以下を変更できます(ファイル内コメント参照)。

- `published` — サイトの公開/準備中
- `site_title` / `site_description` — サイトのタイトルと説明
- `default_lang` — 初期表示言語(`ja` / `en`)
- `show_playtime` / `show_last_played` — プレイ時間・最終プレイ日の表示
- `default_visibility` — 新規取得ゲームをデフォルトで表示するか

## ⚠️ 非表示機能について(重要)

非表示設定は「このサイトに表示しない」機能であり、**完全な秘匿ではありません**。

- Steam API の仕様上、プロフィールの「ゲームの詳細」を公開にする必要があるため、Steam プロフィールを直接見れば所有ゲームは分かります。
- また、このリポジトリは Public のため、`data/catalog.json`(非表示フラグ含む)は閲覧可能です。

「配信で見せるゲーム棚を整理する」用途としてお使いください。所有自体を知られたくないゲームがある場合はご注意ください。

## ローカルでの実行(開発者向け)

```bash
# リスト取得
STEAM_API_KEY=xxx STEAM_ID=7656... node scripts/update.mjs

# サイトデータ生成
node scripts/build.mjs

# プレビュー
npx serve site   # または python3 -m http.server -d site 8000
```

Node.js 20 以上が必要です。依存パッケージはありません。

## ライセンス

MIT License — 自由に利用・改変・再配布できます。
