# Threads自動投稿スキル - 運用マニュアル

> **作成日**: 2026-02-18
> **対象者**: 日常的に運用する人向け
> **目的**: 毎日の運用・トラブル対応をすぐにできるようにする

---

## 📋 目次

1. [日常運用](#1-日常運用)
2. [定期メンテナンス](#2-定期メンテナンス)
3. [トラブルシューティング](#3-トラブルシューティング)
4. [緊急時の対応](#4-緊急時の対応)
5. [設定確認・変更](#5-設定確認変更)

---

## 1. 日常運用

### 1.1 スケジューラーの起動（毎日1回）

```bash
cd C:\Users\chatg\.openclaw\workspace\skills\threads-poster
node scheduler-integration.js --start
```

**確認ポイント**:
- 「スケジューラーを開始しました」というメッセージが出るか
- Discord通知が届くか

---

### 1.2 予約投稿の確認（毎朝）

```bash
node scheduler-integration.js --list pending
```

**出力例**:
```
待機中の予約投稿: 2件

ID: scheduled_1739600000_abc123
記事: 年齢を言い訳にしない
予約日時: 2026-02-18 10:00 (Asia/Tokyo)
```

---

### 1.3 投稿履歴の確認（毎週）

```bash
node scheduler-integration.js --list published
node scheduler-integration.js --stats
```

**出力例**:
```
統計情報:
- 待機中: 2件
- 完了: 15件
- 失敗: 1件
```

---

## 2. 定期メンテナンス

### 2.1 Threads APIトークンの更新（60日ごと）

**期限の確認**:
1. [Facebook Developer](https://developers.facebook.com) にログイン
2. 「アプリの設定」→「アクセストークン」
3. 有効期限を確認

**更新手順**:
1. 新しいLong-lived Access Tokenを取得
2. `.env`ファイルを更新:
   ```
   THREADS_ACCESS_TOKEN=新しいトークン
   ```
3. スケジューラーを再起動

---

### 2.2 古い予約投稿のクリーンアップ（月1回）

```bash
node scheduler-integration.js --list failed
```

**失敗した投稿の対処**:
- 再試行が必要なら再スケジュール
- 不要なら削除（自動的にクリーンアップされるが、確認推奨）

---

## 3. トラブルシューティング

### 3.1 投稿されない場合

**チェックリスト**:
- [ ] `scheduled-posts.json`に予約があるか
- [ ] 予約日時が過ぎているか
- [ ] ブログ記事の`published`フィールドが`true`か
- [ ] 除外カテゴリに含まれていないか

**確認コマンド**:
```bash
node scheduler-integration.js --list
cat scheduled-posts.json
```

---

### 3.2 APIエラーが出る場合

**エラー例**:
```
Threads API Error: 190 - Access token has expired
```

**対処法**:
1. `.env`の`THREADS_ACCESS_TOKEN`が正しいか確認
2. トークンの有効期限を確認（60日で期限切れ）
3. 必要なら再取得

---

### 3.3 Discord通知が来ない場合

**チェックリスト**:
- [ ] `config.json`の`discord.channel`が正しいか
- [ ] OpenClawのmessageツールが動作しているか
- [ ] Discordチャンネルの権限設定

**確認コマンド**:
```bash
cat config.json | grep "channel"
```

---

## 4. 緊急時の対応

### 4.1 手動でブログ記事を投稿

```bash
node scheduler-integration.js --schedule <記事ID> "2026-02-18T15:00:00"
```

**例**:
```bash
node scheduler-integration.js --schedule 045-never-too-late "2026-02-18T15:00:00"
```

---

### 4.2 テキストを直接投稿

```bash
node scheduler-integration.js --schedule-text "緊急投稿のテスト" "2026-02-18T15:00:00"
```

---

### 4.3 予約をキャンセル

```bash
node scheduler-integration.js --cancel <予約ID>
```

**予約IDの確認**:
```bash
node scheduler-integration.js --list pending
```

---

## 5. 設定確認・変更

### 5.1 設定ファイルの確認

```bash
cat config.json
```

**主要設定項目**:
- `portfolioSite.contentPath`: ブログ記事のパス
- `portfolioSite.baseUrl`: サイトのURL
- `posting.maxPostsPerRun`: 1回の最大投稿数
- `posting.excludeCategories`: 除外カテゴリ

---

### 5.2 除外カテゴリの変更

`config.json`を編集:

```json
{
  "posting": {
    "excludeCategories": ["draft", "private"]
  }
}
```

---

### 5.3 環境変数の確認

```bash
cat .env
```

**必要な環境変数**:
- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `THREADS_ACCESS_TOKEN`

---

## 📞 困ったときは

### ログを確認

```bash
# 最新のエラーログを確認
tail -n 50 logs/error.log

# 最新の成功ログを確認
tail -n 50 logs/success.log
```

### サポート

- **GitHub Issues**: https://github.com/tndg16-bot/threads-poster/issues
- **Discord**: #秘書さんの部屋で質問

---

## 🔄 定期タスクまとめ

| 頻度 | タスク | コマンド |
|------|--------|----------|
| 毎日 | スケジューラー起動 | `node scheduler-integration.js --start` |
| 毎日 | 予約確認 | `node scheduler-integration.js --list pending` |
| 毎週 | 統計確認 | `node scheduler-integration.js --stats` |
| 60日ごと | トークン更新 | `.env`を更新 |
| 月1回 | クリーンアップ | `node scheduler-integration.js --list failed` |

---

## 📝 クイックリファレンス

### 予約投稿の操作

```bash
# 予約一覧（全ステータス）
node scheduler-integration.js --list

# 特定ステータスでフィルタリング
node scheduler-integration.js --list pending
node scheduler-integration.js --list published
node scheduler-integration.js --list failed

# ブログ記事を予約
node scheduler-integration.js --schedule <記事ID> "YYYY-MM-DDTHH:MM:SS"

# テキスト投稿を予約
node scheduler-integration.js --schedule-text "テキスト" "YYYY-MM-DDTHH:MM:SS"

# 予約をキャンセル
node scheduler-integration.js --cancel <予約ID>

# 統計情報
node scheduler-integration.js --stats
```

---

**最終更新**: 2026-02-18
**作成者**: かんな（OpenClaw秘書）
