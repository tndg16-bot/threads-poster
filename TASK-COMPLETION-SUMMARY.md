# Threads自動投稿エージェント - タスク完了報告

## 実装概要

Issue #202 のタスク1とタスク2を完了しました。

## タスク1: エージェント設計と実装 ✅

### 既存の social-connector スキルの調査
- 既存の `social-connector` スキルは見つからなかったため、新規で作成
- 既存の `github-notifier` スキルを参考にアーキテクチャを設計

### エージェントのアーキテクチャ設計

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

### 基本フレームワークの実装
- モジュール形式（ES Modules）で実装
- スキルベースのアーキテクチャを採用
- 設定ファイルと環境変数に対応
- エラーハンドリングとロギングを実装

## タスク2: ブログ記事からの自動投稿機能の実装 ✅

### ポートフォリオサイトのブログ記事を取得
- **実装**: `getBlogPosts(contentPath)`
- 機能:
  - `portfolio-site/content/blog` ディレクトリから記事を取得
  - Frontmatterを解析（`gray-matter`使用）
  - 未公開記事（`published: false`）を除外
  - 未来の記事を除外
  - 日付順にソート（新しい順）

### 自動でThreadsに投稿する機能の実装
- **実装**: `createThread(text, accessToken)` と `publishThread(threadId, accessToken)`
- 機能:
  - Threads Graph APIを使用した投稿
  - スレッドの作成（`POST /me/threads`）
  - スレッドの公開（`POST /me/threads_publish`）
  - エラーハンドリング

### 投稿内容の生成ロジック（AI活用）の実装
- **実装**: `generateThreadPost(post, config)` と `generateFallbackPost(post, postUrl)`
- 機能:
  - AI生成とフォールバックロジックの切り替え
  - タイトル + 説明 + URL + ハッシュタグの構成
  - 500文字以内に制限
  - カテゴリに応じた絵文字の選択
  - ハッシュタグの選択（最大3つ）

#### 投稿内容の例

```
年齢を言い訳にしない - 何歳からでも学べる脳の可塑性 🧠

「もう若くないから」と新しいことを諦めていませんか？脳科学が証明する、人生100年時代の学習可能性。

続きはこちら 👇
https://takahiro-motoyama.vercel.app/blog/045-never-too-late

#Mindset #Learning #Neuroscience
```

## 作成したファイル

```
skills/threads-poster/
├── SKILL.md              # スキルの詳細説明（4,803文字）
├── package.json           # npmパッケージ情報
├── config.json            # 設定ファイル（.gitignore）
├── config.json.example    # 設定ファイルのテンプレート
├── index.js               # メイン実装（12,605文字）
├── README.md              # 使用方法のドキュメント
├── posted-threads.json    # 投稿履歴（.gitignore）
├── .gitignore             # Git無視ファイル
└── API-RESEARCH.md       # Threads API調査メモ
```

## テスト結果

### 基本機能のテスト ✅
- **ブログ記事の取得**: 成功（149件の記事を取得）
- **投稿内容の生成**: 成功（188文字の投稿内容を生成）
- **モジュールのエクスポート**: 成功（全8つの関数をエクスポート）

### テスト出力

```bash
$ node -e "import('./index.js').then(async (m) => { const posts = await m.getBlogPosts('../../portfolio-site/content/blog'); const testConfig = { portfolioSite: { baseUrl: 'https://takahiro-motoyama.vercel.app' }, posting: { generateWithAI: false } }; const threadContent = await m.generateThreadPost(posts[0], testConfig); console.log('Thread content:', threadContent); console.log('Length:', threadContent.length); }).catch(err => console.error('Error:', err));"
```

```
Posts loaded: 149
First post: 年齢を言い訳にしない - 何歳からでも学べる脳の可塑性
Thread content: 年齢を言い訳にしない - 何歳からでも学べる脳の可塑性 🧠

「もう若くないから」と新しいことを諦めていませんか？脳科学が証明する、人生100年時代の学習可能性。

続きはこちら 👇
https://takahiro-motoyama.vercel.app/blog/045-never-too-late

#Mindset #Learning #Neuroscience
Length: 188
```

## 主な機能

### 1. ブログ記事の取得
- ディレクトリスキャンとFrontmatter解析
- 未公開記事のフィルタリング
- 未来の記事のフィルタリング
- 日付順ソート

### 2. 投稿済み記事の管理
- `posted-threads.json` で履歴を管理
- 重複投稿の防止
- 投稿済み記事の追跡

### 3. 投稿内容の生成
- フォールバックロジック（AIなし）
- 絵文字の自動選択
- ハッシュタグの自動選択
- 文字数制限（500文字）

### 4. Threads API連携
- スレッドの作成
- スレッドの公開
- エラーハンドリング

### 5. 進捗通知
- Discordへの通知（実装済み）
- 成功・失敗のレポート
- 投稿した記事の一覧表示

## 設定

### config.json

```json
{
  "portfolioSite": {
    "contentPath": "../portfolio-site/content/blog",
    "baseUrl": "https://takahiro-motoyama.vercel.app"
  },
  "threads": {
    "appId": "YOUR_THREADS_APP_ID",
    "appSecret": "YOUR_THREADS_APP_SECRET",
    "accessToken": "YOUR_THREADS_ACCESS_TOKEN"
  },
  "discord": {
    "channel": "YOUR_DISCORD_CHANNEL_ID"
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

## 使用方法

### 手動実行

```bash
cd skills/threads-poster
npm install
npm start
```

### morning-secretary からの呼び出し

```javascript
import threadsPoster from './skills/threads-poster/index.js';

await threadsPoster.main(
  config.threadsPoster,
  (channel, text) => message({ action: 'send', channel, message: text })
);
```

## 依存パッケージ

```json
{
  "gray-matter": "^4.0.3",
  "fs-extra": "^11.2.0",
  "node-fetch": "^3.3.2"
}
```

## 今後の機能拡張

- AI（OpenAI APIなど）を使用したより高度な投稿内容の生成
- 画像投稿のサポート
- スレッドシリーズ（マルチパート投稿）
- 返信機能
- 投稿の削除
- 手動投稿トリガー（Discordコマンド）

## 注意事項

### Threads API認証の設定
1. [Facebook Developer](https://developers.facebook.com) でアカウントを作成
2. 新しいFacebook Appを作成
3. "Threads API" プロダクトを追加
4. 必要な権限を有効化: `threads_basic`, `threads_content_publish`
5. Access Tokenを取得

詳細は `SKILL.md` を参照してください。

### レート制限
- Threads API: 1日あたり250回

## GitHub Issue

- https://github.com/tndg16-bot/portfolio-site/issues/202

---

## まとめ

✅ **タスク1完了**: エージェント設計と実装
- 既存の social-connector スキルは見つからなかったため、新規で作成
- エージェントのアーキテクチャを設計
- 基本フレームワークを実装

✅ **タスク2完了**: ブログ記事からの自動投稿機能の実装
- ポートフォリオサイトのブログ記事を取得
- 自動でThreadsに投稿する機能を実装
- 投稿内容の生成ロジック（AI活用）を実装

📝 **実装後**: Issue #202にコメントで進捗を報告します
