# Threads API Integration - Implementation Report

## 概要

Threads自動投稿エージェントの開発タスク（Issue #202）の実装完了レポートです。

## タスク完了状況

### ✅ タスク1: Threads APIの調査・実装

#### Threads Graph APIのドキュメント調査
- **APIエンドポイント**: Graph APIを通じてThreadsにアクセス
- **認証方式**: OAuth 2.0（Long-lived access token）
- **主なエンドポイント**:
  - `POST /me/threads`: 投稿コンテナ作成
  - `POST /me/threads_publish`: コンテナ公開
  - `GET /me`: ユーザー情報取得
  - `GET /me/threads`: ユーザーの投稿一覧取得
  - `GET /{thread_id}`: スレッド詳細取得
  - `DELETE /{thread_id}`: スレッド削除

#### APIの正式リリース状況
- **ステータス**: 正式リリース済み（2024年）
- **バージョン**: Graph API v1.0 以降
- **権限要件**:
  - `threads_basic`: 基本的なアクセス
  - `threads_content_publish`: 投稿作成と公開
- **レート制限**: 1ユーザーあたり1日250回

#### APIキーの取得・設定方法
**手順**:
1. Facebook Developerアカウント作成
2. Facebook App作成（ConsumerまたはBusinessタイプ）
3. Threads API プロダクトの有効化
4. アクセストークン取得（Graph API Explorerまたはアクセストークンツール）
5. 長期トークンへの変換（60日有効）

**設定方法**:
- 方法1: `.env` ファイルを使用（推奨）
- 方法2: `config.json` ファイルを使用
- 優先順位: 環境変数 > config.json > デフォルト値

### ✅ タスク2: 基本的な投稿機能の実装

#### Threads APIでテキスト投稿を行う実装
**実装ファイル**: `lib/threads-client.js`

**主な機能**:
```javascript
// 投稿コンテナ作成
await client.createPostContainer(text, options);

// 投稿公開
await client.publishPost(containerId);

// 一連の操作（作成→公開）
await client.createAndPublishPost(text, options);
```

**対応機能**:
- ✅ テキスト投稿
- ✅ 投稿コンテナの作成と公開の分離
- ✅ 返信機能（`reply_to_id`）
- ✅ パーマリンク取得
- ✅ ユーザー情報取得
- ✅ 投稿一覧取得
- ✅ スレッド削除

#### 認証フローの実装
**実装ファイル**: `lib/threads-client.js`, `lib/config.js`

**認証チェック**:
```javascript
// 認証チェック
await client.checkAuth();

// ユーザー情報取得
await client.getUserInfo();
```

**設定**:
```json
{
  "appId": "your_app_id",
  "appSecret": "your_app_secret",
  "accessToken": "your_access_token",
  "redirectUri": "https://localhost:3000/callback"
}
```

#### テスト投稿の実行
**実装ファイル**: `index.js`, `test/test-basic.js`

**CLIコマンド**:
```bash
# 認証チェック
node index.js --check-auth

# 投稿作成と公開
node index.js --post "Hello, Threads!"

# ドライランモード（テスト用）
THREADS_DRY_RUN=true node index.js --post "Test post"

# テストスイート実行
npm test
```

## プロジェクト構造

```
skills/threads-poster/
├── lib/
│   ├── skill.js              # OpenClawスキルエントリーポイント
│   ├── threads-client.js     # Threads APIクライアント
│   ├── config.js             # 設定ローダー
│   └── logger.js             # ロガー
├── test/
│   └── test-basic.js         # 基本テストスイート
├── index.js                  # CLIエントリーポイント
├── package.json              # npm設定
├── .env.example              # 環境変数例
├── .gitignore                # Git除外設定
├── config.json               # 設定ファイル（gitignore済み）
├── README.md                 # ユーザードキュメント
├── API-RESEARCH.md           # API調査メモ
└── IMPLEMENTATION_REPORT.md  # 本ファイル
```

## 依存関係

```json
{
  "dependencies": {
    "dotenv": "^16.4.0",      // 環境変数管理
    "node-fetch": "^3.3.2"    // HTTPリクエスト
  }
}
```

## 使用方法

### 1. インストール
```bash
cd skills/threads-poster
npm install
```

### 2. 設定
```bash
# .env.example を .env にコピー
cp .env.example .env

# .env を編集
# THREADS_APP_ID=...
# THREADS_APP_SECRET=...
# THREADS_ACCESS_TOKEN=...
```

### 3. 認証チェック
```bash
npm run check-auth
```

### 4. 投稿テスト
```bash
# ドライランモードでテスト
THREADS_DRY_RUN=true node index.js --post "Test post"

# 実際に投稿
node index.js --post "Hello, Threads!"
```

## 技術仕様

### APIエンドポイント

| エンドポイント | メソッド | 説明 |
|--------------|---------|------|
| `/me` | GET | ユーザー情報取得 |
| `/me/threads` | GET | ユーザーの投稿一覧取得 |
| `/me/threads` | POST | 投稿コンテナ作成 |
| `/me/threads_publish` | POST | コンテナ公開 |
| `/{thread_id}` | GET | スレッド詳細取得 |
| `/{thread_id}` | DELETE | スレッド削除 |

### 設定オプション

| 設定 | 説明 | デフォルト |
|------|------|----------|
| `appId` | Facebook App ID | - |
| `appSecret` | Facebook App Secret | - |
| `accessToken` | Threads Access Token | - |
| `redirectUri` | OAuth Redirect URI | `https://localhost:3000/callback` |
| `apiVersion` | Graph APIバージョン | `v1.0` |
| `dryRun` | テストモード | `false` |
| `logLevel` | ログレベル | `info` |

### エラーハンドリング

**認証エラー**:
```
Threads API Error: Invalid OAuth access token
```
→ アクセストークンを確認・更新

**権限エラー**:
```
Threads API Error: Requires permission
```
→ 必要な権限（`threads_basic`, `threads_content_publish`）を確認

**レート制限**:
```
Threads API Error: Rate limit exceeded
```
→ 一時的にリクエストを減らす

## テスト実績

### 基本テスト (`test/test-basic.js`)
- ✅ 設定ロード
- ✅ Threadsクライアント作成
- ✅ 認証チェック（アクセストークンありの場合）
- ✅ 投稿コンテナ作成（ドライランモード）
- ✅ 完全投稿フロー（作成→公開）
- ✅ ユーザー投稿一覧取得

### CLIコマンド
- ✅ `--check-auth`: 認証チェック
- ✅ `--post`: 投稿作成と公開
- ✅ `--create`: コンテナ作成のみ
- ✅ `--publish`: コンテナ公開
- ✅ `--help`: ヘルプ表示

## トライアル設定

### ドライランモード
```bash
# .env で設定
THREADS_DRY_RUN=true

# または config.json で設定
{
  "dryRun": true
}
```

### ログレベル
```bash
# .env で設定
THREADS_LOG_LEVEL=debug  # debug, info, warn, error
```

## セキュリティ考慮事項

1. **トークン管理**:
   - `.env` ファイルを `.gitignore` に追加
   - トークンをログに出力しない
   - トークンを定期的に更新（60日ごと）

2. **機密情報**:
   - `config.json` を `.gitignore` に追加
   - 環境変数を使用することを推奨

3. **エラーハンドリング**:
   - トークンを含む詳細なエラー情報を表示しない

## 今後の拡張可能性

### 短期的な改善
- [ ] 画像投稿のサポート
- [ ] 動画投稿のサポート
- [ ] スレッド（複数投稿）のサポート

### 長期的な改善
- [x] 自動投稿スケジュール機能 ✅ 実装完了（2026-02-15）
- [ ] アナリティクスの取得
- [ ] 投稿履歴の管理
- [ ] Webhook通知の受信
- [ ] バッチ投稿機能

---

## 配信予約機能の実装（2026-02-15 追加）

### 背景

Threads APIにはInstagram APIのような`scheduled_publish_time`パラメータが存在しないため、自前のスケジュール管理機能を実装しました。

### 実装内容

#### ファイル構成

```
skills/threads-poster/
├── lib/
│   └── scheduler.js             # スケジュール管理クラス
├── scheduler-integration.js     # スケジューラー統合
├── scheduled-posts.json         # スケジュールデータ（.gitignore）
└── SCHEDULED-PUBLISHING-RESEARCH.md  # 調査レポート
```

#### 主な機能

1. **スケジュール管理クラス（Scheduler）**:
   - スケジュールデータの保存・読み込み
   - 投稿の配信予約追加
   - 予約済み投稿の一覧取得
   - 予約のキャンセル
   - 実行すべき投稿の判定
   - 古いスケジュールのクリーンアップ

2. **スケジューラー統合（SchedulerIntegration）**:
   - Threads APIとの統合
   - 投稿の実行
   - Discord通知
   - CLIコマンド

#### CLIコマンド

```bash
# スケジューラーの開始
node scheduler-integration.js --start

# ブログ記事の配信予約
node scheduler-integration.js --schedule <postId> <scheduledAt>

# テキスト投稿の配信予約
node scheduler-integration.js --schedule-text <text> <scheduledAt>

# 予約済み投稿の一覧
node scheduler-integration.js --list [status]

# 配信予約のキャンセル
node scheduler-integration.js --cancel <id>

# 統計情報
node scheduler-integration.js --stats
```

#### スケジュールデータ構造

```json
{
  "scheduledPosts": [
    {
      "id": "scheduled_1739600000_abc123",
      "post": { /* 投稿データ */ },
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

#### ステータス

- `pending`: 待機中
- `published`: 完了
- `failed`: 失敗
- `cancelled`: キャンセル済み

### 技術仕様

#### スケジューラーの動作

1. **定期的チェック**:
   - デフォルト：1分ごとにスケジュールを確認
   - `checkInterval` で調整可能

2. **投稿実行**:
   - 時刻が来た投稿を自動実行
   - 失敗時は自動再試行（最大3回）
   - 再試行間隔は5秒

3. **クリーンアップ**:
   - 古い完了済み・キャンセル済み投稿を自動削除
   - デフォルト：7日より古い投稿を削除

#### エラーハンドリング

- 投稿失敗時の再試行ロジック
- 最大再試行回数到達時のステータス変更
- エラー情報の保存
- Discordへの失敗通知

#### タイムゾーン

- スケジュールデータはUTCで保存
- 表示時にはローカルタイムに変換
- ISO 8601形式で日時を指定

### 使用例

#### ブログ記事の配信予約

```bash
node scheduler-integration.js --schedule 045-never-too-late "2026-02-16T10:00:00"
```

#### テキスト投稿の配信予約

```bash
node scheduler-integration.js --schedule-text "Hello, Threads!" "2026-02-16T10:00:00"
```

#### 予約済み投稿の一覧

```bash
node scheduler-integration.js --list pending
```

### ドキュメント

- **README.md**: 配信予約機能の使用方法を追加
- **SCHEDULED-PUBLISHING-RESEARCH.md**: 配信予約機能の調査レポート

### テスト

スケジューラーの基本機能をテスト済み：
- ✅ スケジュールデータの保存・読み込み
- ✅ 投稿の配信予約
- ✅ 予約済み投稿の一覧取得
- ✅ 予約のキャンセル
- ✅ 実行すべき投稿の判定
- ✅ 古いスケジュールのクリーンアップ

### 注意事項

1. **Threads APIのレート制限**: 配信予約機能を使用しても、投稿時にレート制限（1日あたり250回）に注意が必要
2. **トークンの有効期限**: アクセストークンが期限切れの場合、投稿に失敗する可能性がある
3. **タイムゾーン**: 日時を指定する際は、ローカルタイムで入力しても自動的にUTCに変換される

### 今後の改善

- WebUIからの予約管理
- 定期投稿（週次・月次）のサポート
- 予約投稿の編集機能
- バッチ予約（複数記事を一括予約）
- スケジュールのインポート・エクスポート

---

## 制限事項

1. **現在の実装**: テキスト投稿のみ対応
2. **レート制限**: 1日あたり250回
3. **トークン有効期間**: 60日（長期トークン）
4. **文字数制限**: 500文字（Threadsの制限）

## ドキュメント

- **README.md**: ユーザー向け完全ドキュメント
- **API-RESEARCH.md**: API調査メモ
- **IMPLEMENTATION_REPORT.md**: 本レポート

## 結論

Threads自動投稿エージェントの開発が完了しました。以下の機能が実装されています：

✅ **タスク1: Threads APIの調査・実装**
- Threads Graph APIのドキュメント調査完了
- APIの正式リリース状況確認済み
- APIキーの取得・設定方法をドキュメント化

✅ **タスク2: 基本的な投稿機能の実装**
- テキスト投稿機能の実装完了
- 認証フローの実装完了
- テスト投稿実行可能

本スキルはOpenClaw環境で直接使用可能で、CLIコマンドやOpenClawスキルとして機能します。設定ファイルを用意し、認証情報を設定することで即座に使用可能です。

---

**作成日**: 2026-02-15
**作成者**: OpenClaw Subagent
**Issue**: #202
**ステータス**: ✅ 完了
