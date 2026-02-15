# Threads自動投稿スキル

ポートフォリオサイトのブログ記事を自動でThreadsに投稿するスキル。

## 機能

- ✅ ポートフォリオサイトのブログ記事を自動取得
- ✅ 投稿済みの記事を除外して重複投稿を防止
- ✅ AI（またはフォールバックロジック）でThreads用の投稿内容を生成
- ✅ Threads Graph APIを使用して自動投稿
- ✅ 投稿履歴の管理
- ✅ Discord通知による進捗報告
- 🆕 配信予約機能（投稿のタイミングを指定可能）

## インストール

```bash
cd skills/threads-poster
npm install
```

## 設定

1. `config.json.example` を `config.json` にコピー
2. Threads API認証情報を設定
3. DiscordチャンネルIDを設定
4. ポートフォリオサイトのパスを確認

### Threads API認証の設定

詳細は `SKILL.md` を参照してください。

1. [Facebook Developer](https://developers.facebook.com) でアカウントを作成
2. 新しいFacebook Appを作成
3. "Threads API" プロダクトを追加
4. 必要な権限を有効化: `threads_basic`, `threads_content_publish`
5. Access Tokenを取得

## 使用方法

### 手動実行

```bash
npm start
```

### テスト実行

```bash
npm test
```

### morning-secretary からの呼び出し

```javascript
import threadsPoster from './skills/threads-poster/index.js';

await threadsPoster.main(
  config.threadsPoster,
  (channel, text) => message({ action: 'send', channel, message: text })
);
```

## 配信予約機能

Threads APIにはInstagramのような`scheduled_publish_time`パラメータがないため、自前のスケジュール管理機能を実装しています。

### 特徴

- 投稿の配信日時を指定して予約可能
- 予約済み投稿の一覧・キャンセルが可能
- 失敗した投稿の自動再試行（最大3回）
- 古い予約投稿の自動クリーンアップ
- Discordによる実行結果の通知

### 使用方法

#### 1. スケジューラーの開始

```bash
node scheduler-integration.js --start
```

スケジューラーを開始すると、以下の処理が行われます：
- 予約済み投稿を定期的にチェック（デフォルト：1分ごと）
- 時刻が来た投稿を自動でThreadsに投稿
- 投稿結果をDiscordに通知

#### 2. ブログ記事の配信予約

```bash
node scheduler-integration.js --schedule <postId> <scheduledAt>
```

例：
```bash
node scheduler-integration.js --schedule 045-never-too-late "2026-02-16T10:00:00"
```

#### 3. テキスト投稿の配信予約

```bash
node scheduler-integration.js --schedule-text <text> <scheduledAt>
```

例：
```bash
node scheduler-integration.js --schedule-text "Hello, Threads!" "2026-02-16T10:00:00"
```

#### 4. 予約済み投稿の一覧表示

```bash
# 全ての予約
node scheduler-integration.js --list

# 特定のステータスでフィルタリング
node scheduler-integration.js --list pending
node scheduler-integration.js --list published
node scheduler-integration.js --list failed
```

#### 5. 配信予約のキャンセル

```bash
node scheduler-integration.js --cancel <scheduledPostId>
```

例：
```bash
node scheduler-integration.js --cancel scheduled_1739600000_abc123
```

#### 6. 統計情報の表示

```bash
node scheduler-integration.js --stats
```

### 日時フォーマット

配信日時はISO 8601形式で指定します：

```
2026-02-16T10:00:00
```

### プログラムからの使用例

```javascript
import { SchedulerIntegration } from './scheduler-integration.js';

// 設定とDiscord送信関数の準備
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const sendMessage = async (channel, text) => {
  await message({ action: 'send', channel, message: text });
};

// スケジューラー統合を初期化
const integration = new SchedulerIntegration(config, sendMessage);

// スケジューラーを開始
await integration.start();

// ブログ記事の配信予約
const post = { id: '045', title: '記事タイトル', slug: '045-slug' };
await integration.schedulePost(post, new Date('2026-02-16T10:00:00'));

// テキスト投稿の配信予約
await integration.scheduleTextPost('Hello, Threads!', new Date('2026-02-16T10:00:00'));

// 予約済み投稿の一覧
const scheduledPosts = integration.listScheduledPosts('pending');

// 統計情報
const stats = integration.getStats();
console.log(`待機中: ${stats.pending}, 完了: ${stats.published}`);

// スケジューラーを停止
await integration.stop();
```

### スケジュールデータファイル

予約済みの投稿は `scheduled-posts.json` で管理されます：

```json
{
  "scheduledPosts": [
    {
      "id": "scheduled_1739600000_abc123",
      "post": {
        "id": "045",
        "title": "記事タイトル",
        "slug": "045-slug"
      },
      "scheduledAt": "2026-02-16T01:00:00.000Z",
      "status": "pending",
      "createdAt": "2026-02-15T20:00:00.000Z",
      "threadId": null,
      "publishedAt": null,
      "retryCount": 0
    }
  ],
  "lastUpdated": "2026-02-15T20:00:00.000Z"
}
```

### ステータス

- `pending`: 待機中（まだ投稿されていない）
- `published`: 完了（投稿成功）
- `failed`: 失敗（投稿失敗、最大再試行回数到達）
- `cancelled`: キャンセル済み

### タイムゾーンについて

- スケジュールデータはUTCで保存されます
- 表示時にはローカルタイムに変換されます
- 日時を指定する際は、ローカルタイムで入力しても自動的に解釈されます

### OpenClaw cronとの統合

OpenClawのcron機能と組み合わせて使用することもできます：

```json
{
  "cron": {
    "name": "threads-scheduler",
    "schedule": "0 * * * *",
    "command": "node skills/threads-poster/scheduler-integration.js --start"
  }
}
```

ただし、スケジューラー自体が定期チェックを行うため、通常は手動で起動するだけで十分です。

## 投稿フロー

1. **ブログ記事の取得**: `portfolio-site/content/blog` から最新記事を取得
2. **投稿済みチェック**: `posted-threads.json` で重複を確認
3. **除外カテゴリのチェック**: 設定されたカテゴリを除外
4. **投稿内容の生成**: AIまたはフォールバックロジックで生成
5. **Threadsに投稿**: Threads Graph APIを使用
6. **履歴の記録**: 投稿済み記事を `posted-threads.json` に保存
7. **通知**: Discordに結果を通知

## 投稿内容の生成ルール

- タイトル + 説明 + URL + ハッシュタグの基本構成
- 全体で500文字以内
- ハッシュタグは最大3つ
- カテゴリに応じた絵文字を使用

### 例

```
年齢を言い訳にしない - 何歳からでも学べる脳の可塑性 🧠

「もう若くないから」と新しいことを諦めていませんか？脳科学が証明する、人生100年時代の学習可能性について書きました。

続きはこちら 👇
https://takahiro-motoyama.vercel.app/blog/never-too-late

#Mindset #Learning #Neuroscience
```

## ファイル構成

```
threads-poster/
├── index.js           # メイン実装
├── test.js            # テストスクリプト
├── package.json       # npmパッケージ情報
├── config.json        # 設定ファイル（.gitignore）
├── config.json.example  # 設定ファイルのテンプレート
├── posted-threads.json  # 投稿履歴（.gitignore）
├── SKILL.md          # スキルの詳細説明
├── README.md         # このファイル
├── .gitignore        # Git無視ファイル
└── API-RESEARCH.md   # Threads API調査メモ
```

## 環境変数

```
THREADS_APP_ID=your_app_id
THREADS_APP_SECRET=your_app_secret
THREADS_ACCESS_TOKEN=your_access_token
```

## トラブルシューティング

### 投稿されない

1. `posted-threads.json` を確認し、既に投稿済みでないか確認
2. ブログ記事の `published` フィールドが `true` であるか確認
3. ブログ記事の日付が未来ではないか確認
4. 除外カテゴリに含まれていないか確認

### Threads APIエラー

1. Access Tokenが有効であるか確認（60日で期限切れ）
2. 必要な権限が付与されているか確認（`threads_basic`, `threads_content_publish`）
3. APIのレート制限（1日あたり250回）を超えていないか確認

### Discord通知が来ない

1. DiscordチャンネルIDが正しいか確認
2. OpenClawのmessageツールが動作しているか確認

## 今後の機能拡張

- 画像投稿のサポート
- スレッドシリーズ（マルチパート投稿）
- 返信機能
- 投稿の削除
- AIによるより高度な投稿内容の生成
- 手動投稿トリガー（Discordコマンド）

## ライセンス

MIT

## 貢献

Issue #202: https://github.com/tndg16-bot/portfolio-site/issues/202

---

## 手順

### 🚀 セットアップ手順

#### Step 1: クローン

```bash
git clone https://github.com/tndg16-bot/threads-poster.git
cd threads-poster
```

#### Step 2: 依存関係のインストール

```bash
npm install
```

#### Step 3: 設定ファイルの作成

```bash
cp config.json.example config.json
cp .env.example .env
```

#### Step 4: Threads API認証

1. [Facebook Developer](https://developers.facebook.com) でアカウントを作成
2. 新しいFacebook Appを作成
3. "Threads API" プロダクトを追加
4. 必要な権限を有効化: `threads_basic`, `threads_content_publish`
5. Access Tokenを取得（Long-lived access token推奨）
6. `.env` にトークンを設定

```
THREADS_APP_ID=your_app_id
THREADS_APP_SECRET=your_app_secret
THREADS_ACCESS_TOKEN=your_access_token
```

#### Step 5: 設定ファイルの編集

`config.json` を編集して、以下を設定：

```json
{
  "portfolioSite": {
    "contentPath": "path/to/your/blog/content",
    "baseUrl": "https://your-site.com"
  },
  "discord": {
    "channel": "YOUR_DISCORD_CHANNEL_ID"
  }
}
```

#### Step 6: テスト

```bash
npm test
```

---

### 🔧 開発手順

#### 新しい機能を追加する場合

1. **ブランチの作成**

```bash
git checkout -b feature/your-feature-name
```

2. **機能の実装**

- 必要なファイルを追加・編集
- テストを追加
- ドキュメントを更新

3. **テスト**

```bash
npm test
```

4. **コミット**

```bash
git add .
git commit -m "Add: your feature description"
```

5. **プッシュ**

```bash
git push origin feature/your-feature-name
```

6. **プルリクエストの作成**

```bash
gh pr create --title "Add: your feature name" --body "Description of changes"
```

---

#### テストを追加する場合

1. **テストファイルの作成**

```javascript
// test/test-your-feature.js
import assert from 'assert';

async function testYourFeature() {
  // テストコード
}

testYourFeature().catch(console.error);
```

2. **テストの実行**

```bash
npm test
```

---

#### ドキュメントを更新する場合

1. **README.mdの更新**

- 新しい機能の説明を追加
- 使用例を追加
- 変更点を記載

2. **実装レポートの更新**

- `IMPLEMENTATION_REPORT.md` に変更点を追加
- 新しい機能のアーキテクチャを記述

---

### 🤝 貢献手順

#### バグ報告

1. [GitHub Issues](https://github.com/tndg16-bot/threads-poster/issues) にアクセス
2. "New Issue" をクリック
3. バグの詳細を記述

#### 機能提案

1. [GitHub Issues](https://github.com/tndg16-bot/threads-poster/issues) にアクセス
2. "New Issue" をクリック
3. 機能提案の詳細を記述
4. 使用シナリオを追加

#### プルリクエスト

1. フォークを作成
2. ブランチを作成して変更を加える
3. テストを実行してパスすることを確認
4. プルリクエストを作成
5. レビュー待ち

---

### 📦 リリース手順

#### バージョンの更新

1. `package.json` のバージョンを更新
2. `CHANGELOG.md` に変更点を記述
3. Gitタグを作成

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

---

### 🚀 クイックスタート

### 最短で始める手順

```bash
# 1. クローン
git clone https://github.com/tndg16-bot/threads-poster.git
cd threads-poster

# 2. インストール
npm install

# 3. 設定
cp config.json.example config.json
# config.jsonを編集

# 4. テスト投稿
npm start
```

---

## 📊 アーキテクチャ

### ディレクトリ構造

```
threads-poster/
├── index.js                    # メイン実装
├── scheduler-integration.js     # スケジューラー統合
├── lib/                        # ライブラリ
│   ├── config.js              # 設定ローダー
│   ├── logger.js              # ロガー
│   ├── scheduler.js           # スケジュール管理
│   ├── skill.js               # スキルラッパー
│   └── threads-client.js      # Threads APIクライアント
├── test/                       # テスト
│   ├── test-basic.js          # 基本機能テスト
│   └── test-scheduler.js      # スケジューラーテスト
├── config.json                 # 設定ファイル
├── .env                        # 環境変数（.gitignore）
├── scheduled-posts.json        # スケジュールデータ（.gitignore）
├── posted-threads.json        # 投稿履歴（.gitignore）
├── README.md                   # 使用方法
├── IMPLEMENTATION_REPORT.md    # 実装レポート
└── FINAL-REPORT.md            # 最終報告書
```

### データフロー

```
┌─────────────────┐
│  ブログ記事      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Scheduler      │ (スケジュール管理)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Job Queue      │ (待ち行列)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Poster Worker  │ (投稿実行)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Threads API    │ (API呼び出し)
└─────────────────┘
```

---

## 🔒 セキュリティ

### シークレットの管理

- `.env` は `.gitignore` に含まれているため、コミットされません
- 本番環境では環境変数またはシークレットマネージャーを使用してください

### Threads APIのレート制限

- 1ユーザーあたり1日250回のリクエスト制限
- スケジューラーはこの制限を超えないように設計されています

---

## 📞 サポート

- [GitHub Issues](https://github.com/tndg16-bot/threads-poster/issues)
- [Discord](https://discord.com/invite/clawd)

---

**作成者**: OpenClaw Subagent
**リポジトリ**: https://github.com/tndg16-bot/threads-poster
