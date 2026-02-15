# Threads自動投稿スキル

## 概要

ポートフォリオサイトのブログ記事を自動でThreadsに投稿するスキル。ブログ記事を取得し、AIを活用してThreads用の投稿内容を生成し、Threads Graph APIを使用して投稿する。

## 機能

- ポートフォリオサイトのブログ記事を取得
- AIを活用して投稿内容を生成（要約、ハッシュタグ追加）
- Threads Graph APIを使用して自動投稿
- 投稿履歴の管理
- Discord通知による進捗報告

## アーキテクチャ

```
┌─────────────────┐
│  Blog Posts     │ (portfolio-site/content/blog)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post Fetcher   │ (getLatestPosts, getPostContent)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Content Gen    │ (generateThreadPost with AI)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Threads API    │ (createThread, publishThread)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Post History   │ (trackPostedPosts)
└─────────────────┘
```

## 投稿フロー

1. **ブログ記事の取得**: 最新のブログ記事を取得
2. **投稿済みチェック**: 既に投稿済みの記事を除外
3. **投稿内容の生成**: AIを使用してThreads用の投稿内容を生成
4. **Threadsに投稿**: Threads Graph APIを使用して投稿
5. **履歴の記録**: 投稿済みの記事を記録
6. **通知**: Discordに投稿結果を通知

## 投稿内容の生成ロジック

### 入力

- ブログ記事のタイトル
- ブログ記事の要約（description）
- ブログ記事のカテゴリ
- ブログ記事のタグ
- ブログ記事のURL

### 出力

- Threads用のテキスト（500文字以内）
- ハッシュタグ（最大3つ）

### ルール

1. タイトル + URL + ハッシュタグを基本構成とする
2. 読みやすさを重視し、絵文字を適度に使用
3. ハッシュタグはカテゴリとタグから選択
4. 全体で500文字以内に収める

### 例

```
年齢を言い訳にしない - 何歳からでも学べる脳の可塑性 🧠

「もう若くないから」と新しいことを諦めていませんか？脳科学が証明する、人生100年時代の学習可能性について書きました。

続きはこちら 👇
https://takahiro-motoyama.vercel.app/blog/never-too-late

#Mindset #Learning #Neuroscience
```

## 設定

### config.json

```json
{
  "portfolioSite": {
    "contentPath": "../portfolio-site/content/blog",
    "baseUrl": "https://takahiro-motoyama.vercel.app"
  },
  "threads": {
    "appId": "THREADS_APP_ID",
    "appSecret": "THREADS_APP_SECRET",
    "accessToken": "THREADS_ACCESS_TOKEN"
  },
  "discord": {
    "channel": "DISCORD_CHANNEL_ID"
  },
  "posting": {
    "maxPostsPerRun": 3,
    "excludeCategories": [],
    "generateWithAI": true
  },
  "history": {
    "filePath": "./posted-threads.json"
  }
}
```

### 設定項目

- `portfolioSite.contentPath`: ブログ記事のディレクトリパス
- `portfolioSite.baseUrl`: ポートフォリオサイトのベースURL
- `threads.appId`: Threads App ID
- `threads.appSecret`: Threads App Secret
- `threads.accessToken`: Threads Access Token
- `discord.channel`: 通知を送信するDiscordチャンネルID
- `posting.maxPostsPerRun`: 1回の実行で最大投稿数（デフォルト: 3）
- `posting.excludeCategories`: 除外するカテゴリのリスト
- `posting.generateWithAI`: AIで投稿内容を生成するか（デフォルト: true）
- `history.filePath`: 投稿履歴の保存先

## 使用方法

### morning-secretary からの呼び出し

```javascript
const threadsPoster = require('./skills/threads-poster/index.js');

await threadsPoster.main(
  config.threadsPoster,
  (channel, text) => message({ action: 'send', channel, message: text })
);
```

### 直接実行

```bash
cd skills/threads-poster
node index.js
```

## 依存パッケージ

```json
{
  "gray-matter": "^4.0.3",
  "fs-extra": "^11.0.0",
  "node-fetch": "^3.3.0"
}
```

インストール：

```bash
npm install gray-matter fs-extra node-fetch
```

## 環境変数

```
THREADS_APP_ID=your_app_id
THREADS_APP_SECRET=your_app_secret
THREADS_ACCESS_TOKEN=your_access_token
```

## エラーハンドリング

- ブログ記事の読み込みエラー: ログ出力し、エラーメッセージをDiscordに送信
- Threads APIエラー: ログ出力し、エラーメッセージをDiscordに送信
- AI生成エラー: フォールバックとして基本的な投稿内容を使用

## テスト

```javascript
const { generateThreadPost, createThread, publishThread } = require('./index.js');

// テストデータ
const post = {
  id: '045-never-too-late',
  title: '年齢を言い訳にしない - 何歳からでも学べる脳の可塑性',
  description: '「もう若くないから」と新しいことを諦めていませんか？脳科学が証明する、人生100年時代の学習可能性。',
  category: 'マインドセット',
  tags: ['Mindset', 'Learning', 'Neuroscience'],
  url: 'https://takahiro-motoyama.vercel.app/blog/never-too-late'
};

// 投稿内容の生成
const threadContent = await generateThreadPost(post);
console.log(threadContent);

// Threadsに投稿
// const result = await createThread(threadContent, config.threads.accessToken);
// console.log(result);
```

## Threads API認証の設定

1. **Facebook Developerアカウントの作成**
   - https://developers.facebook.com でアカウントを作成
   - 電話番号で認証

2. **Facebook Appの作成**
   - https://developers.facebook.com/apps で新しいアプリを作成
   - App Type: "Consumer" または "Business"
   - "Threads API" プロダクトを追加

3. **App設定の構成**
   - App Domainsを設定
   - OAuth Redirect URIsを追加
   - 必要な権限を有効化:
     - `threads_basic`
     - `threads_content_publish`

4. **Access Tokenの取得**
   - OAuthフローまたはFacebook Access Token Toolを使用
   - Long-lived Tokenを生成（60日有効）
   - 安全に保存

## 制限事項

- **テキストのみ**: 初期実装ではテキスト投稿のみ対応
- **メディア**: 画像/動画投稿は追加のAPIエンドポイントが必要
- **スレッド返信**: `reply_to_id` で既存スレッドに返信可能
- **スレッドシリーズ**: 複数のスレッドを作成するには複数のAPI呼び出しが必要
- **トークン更新**: Long-lived Tokenは定期的に更新が必要

## 今後の機能拡張

- 画像投稿のサポート
- スレッドシリーズ（マルチパート投稿）
- 返信機能
- 投稿の削除
- ユーザー情報の取得
- アナリティクスインサイト
- 手動投稿トリガー（Discordコマンド）

## メモ

- ブログ記事は `published: true` のみ対象
- 未来の日付の記事は除外
- 投稿履歴により重複投稿を防止
- Threads APIのレート制限: 1日あたり250回

## GitHub Issue

- https://github.com/tndg16-bot/portfolio-site/issues/202
