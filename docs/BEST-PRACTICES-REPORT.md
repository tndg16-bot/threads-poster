# Threads API 自動投稿 ベストプラクティス & 運用戦略レポート

> 調査日: 2026-03-17
> 対象: Threads Graph API (graph.threads.net / graph.threads.com)
> 対象プロジェクト: threads-poster

---

## 目次

1. [エラーハンドリング戦略](#1-エラーハンドリング戦略)
2. [トークン管理のベストプラクティス](#2-トークン管理のベストプラクティス)
3. [コンテンツ最適化](#3-コンテンツ最適化)
4. [投稿タイミング戦略](#4-投稿タイミング戦略)
5. [セキュリティベストプラクティス](#5-セキュリティベストプラクティス)
6. [モニタリング・分析](#6-モニタリング分析)
7. [現行コードへの改善提案](#7-現行コードへの改善提案)

---

## 1. エラーハンドリング戦略

### 1.1 レート制限の仕組み

Threads APIは**24時間ローリングウィンドウ**でレート制限を適用する。

| リソース | 制限値 (24時間) | 備考 |
|----------|----------------|------|
| 投稿 | **250件** | カルーセルは1件としてカウント |
| リプライ | **1,000件** | |
| 削除 | **100件** | |
| ロケーション検索 | **500件** | |
| API呼び出し全般 | `4800 * インプレッション数` | 最低インプレッション数=10 |
| CPU時間 | `720000 * インプレッション数` | |
| トータル時間 | `2880000 * インプレッション数` | |

### 1.2 429 Too Many Requests の対処法

```javascript
// 推奨: Exponential Backoff with Jitter
class RateLimitHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 5;        // 推奨: 3-5回
    this.baseDelay = options.baseDelay || 1000;       // 初回: 1秒
    this.maxDelay = options.maxDelay || 60000;        // 最大: 60秒
    this.backoffMultiplier = options.multiplier || 2; // 倍率: 2
  }

  async executeWithRetry(fn) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (!this.isRetryable(error) || attempt === this.maxRetries) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);
        console.log(`[Retry] Attempt ${attempt + 1}/${this.maxRetries}, waiting ${delay}ms`);
        await this.sleep(delay);
      }
    }
  }

  calculateDelay(attempt, error) {
    // APIがリセット時間を返す場合はそれを優先
    if (error.estimatedTimeToRegain) {
      return error.estimatedTimeToRegain * 60 * 1000; // 分 -> ミリ秒
    }

    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt);
    const jitter = Math.random() * exponentialDelay * 0.1; // 10%のジッター
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  isRetryable(error) {
    const retryableCodes = [429, 500, 502, 503, 504];
    const retryableApiCodes = [1, 2, 4, 17, 80002];
    return retryableCodes.includes(error.httpStatus) ||
           retryableApiCodes.includes(error.apiCode);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 1.3 リトライ回数の推奨値

| シナリオ | 推奨回数 | 理由 |
|----------|---------|------|
| 一般的なAPI呼び出し | 3回 | 一時的なネットワーク障害対応 |
| レート制限 (429) | 5回 | APIの `estimated_time_to_regain_access` を参照して待機 |
| メディアアップロード | 3回 | タイムアウトが長いため回数は控えめに |
| 投稿公開 | 2回 | 冪等性が保証されないため慎重に |

### 1.4 メディアアップロードのステータスチェック

コンテナ作成後、公開前にステータスを確認する必要がある。

```javascript
async function waitForContainerReady(containerId, accessToken, maxWait = 300000) {
  const startTime = Date.now();
  const pollInterval = 60000; // 公式推奨: 約1分間隔

  while (Date.now() - startTime < maxWait) {
    const status = await checkContainerStatus(containerId, accessToken);

    switch (status.status) {
      case 'FINISHED':
        return { ready: true, status };

      case 'ERROR':
        return {
          ready: false,
          status,
          error: status.error_message
          // エラーコード例:
          // FAILED_DOWNLOADING_VIDEO
          // FAILED_PROCESSING_AUDIO
          // FAILED_PROCESSING_VIDEO
          // INVALID_ASPECT_RATIO
          // INVALID_BIT_RATE
          // INVALID_DURATION
          // INVALID_FRAME_RATE
          // INVALID_AUDIO_CHANNELS
          // INVALID_AUDIO_CHANNEL_LAYOUT
          // UNKNOWN
        };

      case 'EXPIRED':
        return { ready: false, status, error: 'Container expired' };

      case 'PUBLISHED':
        return { ready: true, status };

      case 'IN_PROGRESS':
        await sleep(pollInterval);
        break;

      default:
        await sleep(pollInterval);
    }
  }

  throw new Error('Container processing timeout');
}
```

**重要ポイント:**
- 公式ドキュメントでは「約1分間隔で約5分間ポーリング」を推奨
- テキスト投稿は即座にFINISHEDになるが、メディア投稿は処理時間が必要
- コンテナ作成後、公開前に**約30秒の待機**を推奨（Meta公式）

### 1.5 APIエラーコード一覧と対処法

| コード | サブコード | 説明 | 対処法 |
|--------|-----------|------|--------|
| 1 | - | 不明なエラー | リトライ（一時的な問題の可能性） |
| 2 | - | サービス一時停止 | 数分後にリトライ |
| 3 | - | メソッド利用不可 | APIバージョン/エンドポイント確認 |
| 4 | - | APIコール上限超過 | Exponential backoffで待機 |
| 10 | - | 権限不足 | パーミッション確認・再認証 |
| 17 | - | ビジネスAPIレート制限 | X-Business-Use-Case-Usageヘッダー確認 |
| 100 | - | パラメータ不正 | リクエストパラメータ確認 |
| 102 | - | セッション無効 | トークン再取得 |
| 190 | 458 | アプリ未インストール | ユーザー再認証 |
| 190 | 459 | ユーザーチェックポイント | facebook.comでログイン |
| 190 | 460 | パスワード変更済み | 再認証 |
| 190 | 467 | トークン無効 | 新しいトークン取得 |
| 200-299 | - | パーミッションエラー | 権限の確認・再リクエスト |
| 506 | - | 重複投稿 | 同一内容の連続投稿を回避 |
| 80002 | - | レート制限（スロットリング） | `estimated_time_to_regain_access`まで待機 |
| 1609005 | - | リンクデータ取得失敗 | URL有効性確認 |

### 1.6 レート制限の事前確認

```javascript
// 投稿前にクォータ残量を確認
async function checkPublishingQuota(userId, accessToken) {
  const response = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads_publishing_limit` +
    `?fields=quota_usage,config&access_token=${accessToken}`
  );
  const data = await response.json();

  // quota_usage: 現在の使用量
  // config: 総許可量
  return {
    used: data.data[0].quota_usage,
    limit: data.data[0].config.quota_total,
    remaining: data.data[0].config.quota_total - data.data[0].quota_usage
  };
}
```

### 1.7 レスポンスヘッダーの監視

```javascript
// X-Business-Use-Case-Usage ヘッダーを解析
function parseRateLimitHeaders(response) {
  const usageHeader = response.headers.get('X-Business-Use-Case-Usage');
  if (!usageHeader) return null;

  const usage = JSON.parse(usageHeader);
  // 各ビジネスIDごとの使用状況
  for (const [bizId, limits] of Object.entries(usage)) {
    for (const limit of limits) {
      if (limit.call_count > 80 || limit.total_cputime > 80 || limit.total_time > 80) {
        console.warn(`[Rate Limit Warning] Usage approaching limit: ${JSON.stringify(limit)}`);
        // 80%を超えたらリクエスト間隔を広げる
      }
      if (limit.estimated_time_to_regain_access > 0) {
        // スロットリング中: 指定時間まで待機
        return {
          throttled: true,
          waitMinutes: limit.estimated_time_to_regain_access
        };
      }
    }
  }
  return { throttled: false };
}
```

---

## 2. トークン管理のベストプラクティス

### 2.1 トークンの種類と有効期限

| トークン種別 | 有効期限 | 取得方法 |
|-------------|---------|---------|
| 短期トークン | **1時間** | OAuth認証後の認可コード交換 |
| 長期トークン | **60日** | 短期トークンを交換 |
| リフレッシュ | 60日延長 | `GET /refresh_access_token` |

**注意:** プライベートプロフィールのユーザーはトークン延長不可。再認証が必要。

### 2.2 環境変数 vs 暗号化ストレージ

| 方式 | メリット | デメリット | 推奨用途 |
|------|---------|-----------|---------|
| `.env`ファイル | シンプル、標準的 | 平文保存、Git誤コミットリスク | 開発環境 |
| OS Keychain (keytar) | OS暗号化、プロセス間共有可 | プラットフォーム依存 | ローカル運用 |
| 暗号化JSON | ポータブル | 復号キーの管理が必要 | 小規模運用 |
| Vault (HashiCorp) | 監査ログ、動的シークレット | インフラ必要 | 大規模プロダクション |
| CI/CDシークレット | プロバイダ管理 | プロバイダロックイン | CI/CD環境 |

**推奨アーキテクチャ:**

```
開発環境: .env + dotenv（.gitignore必須）
本番環境: 環境変数 + CI/CDシークレット
ローカル自動化: OS Keychain (node-keytar)
```

### 2.3 自動リフレッシュの実装パターン

```javascript
class TokenManager {
  constructor(config) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.tokenStore = config.tokenStore; // トークン永続化先
    this.refreshBuffer = 7 * 24 * 60 * 60 * 1000; // 7日前にリフレッシュ
  }

  async getValidToken() {
    const stored = await this.tokenStore.load();

    if (!stored || !stored.accessToken) {
      throw new Error('No token available. Please authenticate.');
    }

    // 有効期限チェック
    const expiresAt = new Date(stored.expiresAt);
    const now = new Date();
    const bufferTime = new Date(expiresAt.getTime() - this.refreshBuffer);

    if (now >= expiresAt) {
      throw new Error('Token expired. Re-authentication required.');
    }

    if (now >= bufferTime) {
      // 期限7日前: 自動リフレッシュ
      console.log('[TokenManager] Token expiring soon, refreshing...');
      return await this.refreshToken(stored.accessToken);
    }

    return stored.accessToken;
  }

  async refreshToken(currentToken) {
    const response = await fetch(
      `https://graph.threads.net/refresh_access_token` +
      `?grant_type=th_refresh_token` +
      `&access_token=${currentToken}`
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(`Token refresh failed: ${data.error.message}`);
    }

    // 新しいトークンを保存
    await this.tokenStore.save({
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      refreshedAt: new Date().toISOString()
    });

    return data.access_token;
  }

  async exchangeForLongLived(shortLivedToken) {
    const response = await fetch(
      `https://graph.threads.net/access_token` +
      `?grant_type=th_exchange_token` +
      `&client_secret=${this.appSecret}` +
      `&access_token=${shortLivedToken}`
    );

    const data = await response.json();

    await this.tokenStore.save({
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      type: 'long_lived'
    });

    return data.access_token;
  }
}
```

### 2.4 トークン期限切れアラートシステム

```javascript
// cronジョブ or スケジューラーで毎日実行
async function checkTokenExpiry(tokenStore, notifier) {
  const stored = await tokenStore.load();
  if (!stored) return;

  const expiresAt = new Date(stored.expiresAt);
  const now = new Date();
  const daysRemaining = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

  const alerts = [
    { days: 14, level: 'info',    message: 'Token expires in 2 weeks' },
    { days: 7,  level: 'warning', message: 'Token expires in 1 week - auto-refresh triggered' },
    { days: 3,  level: 'critical',message: 'Token expires in 3 days!' },
    { days: 0,  level: 'error',   message: 'Token has EXPIRED. Re-authentication required.' },
  ];

  for (const alert of alerts) {
    if (daysRemaining <= alert.days) {
      await notifier.send(alert.level, alert.message, {
        daysRemaining,
        expiresAt: expiresAt.toISOString()
      });

      // 7日以内ならリフレッシュ試行
      if (daysRemaining <= 7 && daysRemaining > 0) {
        try {
          await tokenManager.refreshToken(stored.accessToken);
          await notifier.send('info', 'Token successfully refreshed');
        } catch (e) {
          await notifier.send('error', `Auto-refresh failed: ${e.message}`);
        }
      }
      break;
    }
  }
}
```

### 2.5 複数アカウント管理

```javascript
// アカウント別トークン管理
class MultiAccountTokenStore {
  constructor(storePath) {
    this.storePath = storePath;
  }

  async getToken(accountId) {
    const accounts = await this.loadAll();
    const account = accounts[accountId];
    if (!account) throw new Error(`Account ${accountId} not found`);

    // 有効期限チェック & 自動リフレッシュ
    const manager = new TokenManager({ tokenStore: this.forAccount(accountId) });
    return manager.getValidToken();
  }

  forAccount(accountId) {
    return {
      load: async () => {
        const all = await this.loadAll();
        return all[accountId];
      },
      save: async (data) => {
        const all = await this.loadAll();
        all[accountId] = { ...all[accountId], ...data };
        await this.saveAll(all);
      }
    };
  }
}
```

---

## 3. コンテンツ最適化

### 3.1 Threadsアルゴリズムの仕組み（2025-2026年）

Threadsのアルゴリズムは**3段階のプロセス**で動作する:

1. **収集 (Gathering)**: 公開コンテンツをプールに集約
2. **分析 (Analyzing)**: ユーザー行動シグナルに基づく入力分析
3. **ランキング (Ranking)**: 個別ユーザーへの関連性予測でスコアリング

**5つの主要シグナル:**

| シグナル | 説明 | 重み |
|---------|------|------|
| いいね確率 | 過去のいいね・閲覧パターン | 高 |
| リプライ閲覧確率 | エンゲージメント頻度・活動レベル | 高 |
| フォロー確率 | 最近のフォローパターン、クロスプラットフォーム活動 | 中 |
| プロフィールクリック確率 | 閲覧履歴（Threads + Instagram両方） | 中 |
| スクロール行動 | 繰り返し閲覧、著者への親和性 | 低-中 |

**重要な発見:** Instagramでの活動がThreadsのレコメンデーションに影響する。クロスプラットフォームシグナルが考慮される。

### 3.2 効果的な投稿形式

**高エンゲージメント形式（優先順）:**

1. **質問・投票（ポール）** -- 最も簡単にエンゲージメントを獲得できる形式。「人々にどう反応すればいいか直接的に示す」効果がある
2. **チャレンジ・コンテスト** -- フォロワーに派生コンテンツの作成を促す
3. **トレンドトピック参加** -- MetaのAIがコミュニティの話題を特定し、有機的リーチを拡大
4. **画像付き投稿** -- テキストのみより視覚的に目立つ（フィードでの滞在時間増加）
5. **テキストのみ** -- 適切な内容であれば十分に効果的

### 3.3 最適な文字数・改行の使い方

| 要素 | 推奨値 | 理由 |
|------|--------|------|
| 文字数上限 | **500文字**（API制限） | 絵文字はUTF-8バイト数でカウント |
| 推奨文字数 | **100-300文字** | 短すぎず長すぎず、スクロール止め効果 |
| 改行 | 2-3段落に分割 | 視認性向上、読みやすさ |
| 冒頭 | フック（質問・驚き） | 最初の1-2行で興味を引く |

**効果的な構成テンプレート:**

```
[フック / 質問 / 驚きの事実]

[本文 / 価値提供 / ストーリー]

[CTA / 質問で締める]
```

### 3.4 ハッシュタグ戦略

**現状（2025-2026年）:**
- Threadsは従来型ハッシュタグを**重視しない設計**
- トピックタグ（#topic）は1投稿あたり**1個まで**がプラットフォームの意図
- アルゴリズムはハッシュタグよりも**コンテンツの文脈とエンゲージメント**を優先

**推奨戦略:**

| アプローチ | 詳細 |
|-----------|------|
| トピックタグ1個 | 最も関連性の高いトピックを1つ選択 |
| 自然な文脈 | ハッシュタグに頼らず、テキスト内でキーワードを自然に使用 |
| トレンド参加 | MetaのAIが識別するトレンドトピックに参加 |
| コミュニティ会話 | 他ユーザーの投稿へのリプライでリーチ拡大 |

**現行コードの問題点:** `generateFallbackPost()`で最大3つのハッシュタグを付与しているが、1個に減らすべき。

### 3.5 URL付き投稿のエンゲージメント影響

- URL付き投稿はリンクプレビューが自動生成される
- 多くのSNSアルゴリズムと同様、**外部リンク付き投稿はリーチが制限される傾向**がある
- 対策: テキストのみの投稿と、URL付き投稿を交互に投稿する
- セルフリプライ戦略: 本文はテキストのみ、リプライでURLを追加

### 3.6 画像付き vs テキストのみ

| 形式 | リーチ | エンゲージメント | 制作コスト |
|------|--------|----------------|-----------|
| テキストのみ | 中 | 中-高（内容次第） | 低 |
| 画像1枚付き | 高 | 高 | 中 |
| カルーセル | 高 | 最高 | 高 |
| 動画付き | 中-高 | 中-高 | 最高 |

**画像の仕様:**
- 形式: JPEG, PNG
- 最大サイズ: 8MB
- アスペクト比: 最大10:1
- 幅: 320-1440px
- カラースペース: sRGB

**動画の仕様:**
- 形式: MOV, MP4
- コーデック: H264 or HEVC
- フレームレート: 23-60 FPS
- 最大長: 300秒（5分）
- 最大サイズ: 1GB
- 推奨アスペクト比: 9:16

---

## 4. 投稿タイミング戦略

### 4.1 グローバルベストタイム（UTC基準 → JST変換）

Hootsuite 2025年調査データに基づく:

| 曜日 | ベストタイム (EST) | ベストタイム (JST) | 備考 |
|------|-------------------|-------------------|------|
| 月曜 | 9:00 AM | **23:00** | 夜のリラックスタイム |
| 火曜 | 8:00 AM (**最良**) | **22:00** | 週間ベスト |
| 水曜 | 12:00 PM | 翌2:00 AM | 深夜帯（日本向けは不適） |
| 木曜 | 9:00 AM | **23:00** | |
| 金曜 | 2:00 PM | 翌4:00 AM | 深夜帯（日本向けは不適） |
| 土曜 | 12:00 PM | 翌2:00 AM | |
| 日曜 | 1:00 PM | 翌3:00 AM | |

### 4.2 日本市場向け最適投稿時間帯（推定）

グローバルデータ、日本のSNS利用パターン、InstagramのJPデータから推定:

| 時間帯 | 優先度 | 理由 |
|--------|--------|------|
| **7:00-8:00 AM** | 最高 | 通勤・朝のスマホチェック |
| **12:00-13:00 PM** | 高 | 昼休み |
| **18:00-19:00 PM** | 高 | 帰宅時間・夕方のリラックス |
| **21:00-22:00 PM** | 高 | 就寝前のスクロール時間 |
| **8:00-9:00 AM (土日)** | 中 | 週末の朝 |
| **10:00-11:00 AM (土日)** | 中 | 週末の活動前 |

**日本のSNS利用コンテキスト:**
- LINEが最も普及（9600万ユーザー、人口の78.1%）
- X（Twitter）が7340万ユーザー（59.7%）
- Instagramが5545万ユーザー（45.1%）
- ThreadsはInstagramからの流入がメイン
- Instagram経由のクロスプラットフォーム効果が重要

### 4.3 投稿頻度の推奨値

| 頻度 | 推奨度 | 根拠 |
|------|--------|------|
| 1日1-2回 | 最推奨 | 一貫性を維持しつつ質を確保 |
| 1日3-5回 | 積極的 | エンゲージメント率は維持可能だがコンテンツ品質に注意 |
| 週3-5回 | 最低ライン | アルゴリズムに「活動的」と認識されるために必要 |
| 1日10回以上 | 非推奨 | スパム認定リスク、フォロワー疲れ |

**API制限との関係:** 24時間で250投稿が上限だが、品質を考えると1日10投稿以下が実用的。

### 4.4 曜日別エンゲージメント傾向

```
エンゲージメント指数（相対値）:

火曜 ████████████████████ 100（最高）
月曜 ██████████████████   90
木曜 ██████████████████   90
水曜 ████████████████     80
金曜 ██████████████       70
土曜 ████████████         60
日曜 ████████████         60
```

**ポイント:**
- 平日が週末を上回る傾向
- 火曜日が全体で最もエンゲージメントが高い
- 週末は投稿数が少ないため逆にチャンスでもある（競合が少ない）
- 「自分のオーディエンスのデータ」を最終的に優先すること

---

## 5. セキュリティベストプラクティス

### 5.1 APIキー/トークンの安全な保管方法

**原則: Defense in Depth（多層防御）**

```
レイヤー1: 暗号化保存（保管時暗号化）
レイヤー2: アクセス制御（最小権限の原則）
レイヤー3: 監査ログ（誰がいつアクセスしたか）
レイヤー4: ローテーション（定期的な更新）
```

**具体的な保管方法:**

| 環境 | 推奨方式 | 実装 |
|------|---------|------|
| 開発 | `.env` + `dotenv` | `process.env.THREADS_ACCESS_TOKEN` |
| ローカル本番 | OS Keychain | `node-keytar` パッケージ |
| サーバー | 環境変数（直接注入） | Systemd EnvironmentFile |
| Docker | Docker Secrets | `/run/secrets/threads_token` |
| クラウド | マネージドシークレット | AWS Secrets Manager / GCP Secret Manager |

### 5.2 .envファイル管理

```gitignore
# .gitignore - 必須エントリ
.env
.env.local
.env.production
.env.*.local
*.key
*.pem
credentials.json
token-store.json
```

**追加対策:**
- `git-secrets` または `gitleaks` をpre-commitフックに設定
- `.env.example` をテンプレートとして管理（値はプレースホルダー）
- ファイルパーミッション: `chmod 600 .env`（Linux/Mac）

```bash
# pre-commit hookでシークレット漏洩を防止
# .git/hooks/pre-commit
#!/bin/bash
if git diff --cached --name-only | grep -q '\.env$'; then
  echo "ERROR: .env file should not be committed!"
  exit 1
fi

# トークンパターンの検出
if git diff --cached | grep -qE '(THREADS_ACCESS_TOKEN|APP_SECRET)=.{10,}'; then
  echo "ERROR: Possible secret detected in staged changes!"
  exit 1
fi
```

### 5.3 CI/CDでのシークレット管理

| CI/CDプラットフォーム | シークレット機能 | 設定方法 |
|---------------------|-----------------|---------|
| GitHub Actions | Repository Secrets | Settings > Secrets > Actions |
| GitLab CI | CI/CD Variables (Masked) | Settings > CI/CD > Variables |
| Vercel | Environment Variables | Project Settings > Environment Variables |
| n8n | Credentials | Credentials > New Credential |

**GitHub Actions の例:**

```yaml
# .github/workflows/threads-post.yml
name: Threads Auto Post

on:
  schedule:
    - cron: '0 22 * * 1-5'  # JST 7:00 AM 平日

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: node index.js
        env:
          THREADS_ACCESS_TOKEN: ${{ secrets.THREADS_ACCESS_TOKEN }}
          THREADS_APP_ID: ${{ secrets.THREADS_APP_ID }}
          THREADS_APP_SECRET: ${{ secrets.THREADS_APP_SECRET }}
```

### 5.4 HTTPS通信の必須化

- Threads APIエンドポイント（`graph.threads.net`）は**HTTPS only**
- OAuth リダイレクトURIも**HTTPS必須**（`localhost`のみ例外）
- `node-fetch`はデフォルトでHTTPS検証を実施

```javascript
// HTTPS強制の追加検証
function validateApiUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('Threads API requires HTTPS');
  }
  if (!['graph.threads.net', 'graph.threads.com'].includes(parsed.hostname)) {
    throw new Error('Invalid Threads API hostname');
  }
}
```

### 5.5 追加セキュリティ対策

```javascript
// トークンのログ出力を防止
function maskToken(token) {
  if (!token || token.length < 10) return '***';
  return token.substring(0, 4) + '...' + token.substring(token.length - 4);
}

// 環境変数の検証
function validateConfig(config) {
  const required = ['THREADS_ACCESS_TOKEN', 'THREADS_APP_ID'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // トークン長の検証（異常検出）
  if (process.env.THREADS_ACCESS_TOKEN.length < 20) {
    throw new Error('THREADS_ACCESS_TOKEN appears to be invalid (too short)');
  }
}
```

---

## 6. モニタリング・分析

### 6.1 Threads Insights APIの活用方法

**必要なパーミッション:**
- `threads_basic` -- 全エンドポイントに必須
- `threads_manage_insights` -- Insightsエンドポイントのアクセスに必要

#### メディアインサイト（投稿単位）

```javascript
async function getPostInsights(mediaId, accessToken) {
  const metrics = [
    'views',    // 表示回数
    'likes',    // いいね数
    'replies',  // リプライ数
    'reposts',  // リポスト数
    'quotes',   // 引用数
    'shares'    // シェア数（開発中）
  ].join(',');

  const response = await fetch(
    `https://graph.threads.net/v1.0/${mediaId}/insights` +
    `?metric=${metrics}&access_token=${accessToken}`
  );
  return response.json();
}
```

#### ユーザーインサイト（アカウント全体）

```javascript
async function getUserInsights(userId, accessToken, since, until) {
  const metrics = [
    'views',                // プロフィール表示回数（時系列）
    'likes',                // 総いいね数
    'replies',              // 総リプライ数
    'reposts',              // 総リポスト数
    'quotes',               // 総引用数
    'followers_count',      // フォロワー数
    'follower_demographics' // フォロワー属性（100人以上必要）
  ].join(',');

  const params = new URLSearchParams({
    metric: metrics,
    access_token: accessToken,
    since: Math.floor(since.getTime() / 1000),   // Unixタイムスタンプ
    until: Math.floor(until.getTime() / 1000)
  });

  const response = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads_insights?${params}`
  );
  return response.json();
}
```

**フォロワーデモグラフィックの内訳:**
- `breakdown=country` -- 国別分布
- `breakdown=city` -- 都市別分布
- `breakdown=age` -- 年齢別分布
- `breakdown=gender` -- 性別分布
- 注: 1リクエストにつき1つの`breakdown`のみ指定可能
- 要件: **フォロワー100人以上**

**制限事項:**
- `since`の最も古い値: `1712991600`（2024年4月13日）
- デフォルト範囲: 昨日〜今日の2日間
- ネストされたリプライと`REPOST_FACADE`投稿は空データを返す

### 6.2 投稿パフォーマンスの計測指標

**KPI設計:**

| 指標 | 計算方法 | 目標（参考値） |
|------|---------|--------------|
| エンゲージメント率 | (likes + replies + reposts + quotes) / views * 100 | 3-5% |
| リプライ率 | replies / views * 100 | 0.5-2% |
| バイラル係数 | (reposts + quotes) / views * 100 | 1-3% |
| クリック率 (URL付き) | clicks / views * 100 | 1-3% |
| フォロワー成長率 | (new_followers - unfollows) / total_followers * 100 / day | 0.1-1%/日 |

### 6.3 パフォーマンストラッキングの実装

```javascript
class PerformanceTracker {
  constructor(threadsClient, store) {
    this.client = threadsClient;
    this.store = store;
  }

  // 投稿後24時間/48時間/7日のパフォーマンスを記録
  async trackPost(mediaId, checkpoints = [24, 48, 168]) {
    for (const hours of checkpoints) {
      // スケジュール済みのチェック
      setTimeout(async () => {
        const insights = await this.client.getPostInsights(mediaId);
        await this.store.saveInsight(mediaId, hours, insights);
      }, hours * 60 * 60 * 1000);
    }
  }

  // 週次レポート生成
  async generateWeeklyReport(userId) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const insights = await getUserInsights(userId, this.client.accessToken, weekAgo, now);
    const posts = await this.store.getPostsInRange(weekAgo, now);

    return {
      period: { from: weekAgo, to: now },
      summary: {
        totalPosts: posts.length,
        totalViews: this.sumMetric(posts, 'views'),
        totalLikes: this.sumMetric(posts, 'likes'),
        totalReplies: this.sumMetric(posts, 'replies'),
        avgEngagementRate: this.avgEngagementRate(posts),
        bestPost: this.findBestPost(posts),
        worstPost: this.findWorstPost(posts),
      },
      followerGrowth: insights.followers_count,
      recommendations: this.generateRecommendations(posts)
    };
  }

  generateRecommendations(posts) {
    const recommendations = [];

    // 時間帯分析
    const byHour = this.groupByHour(posts);
    const bestHour = Object.entries(byHour)
      .sort(([,a], [,b]) => b.avgEngagement - a.avgEngagement)[0];
    recommendations.push(`Best posting hour: ${bestHour[0]}:00 (avg engagement: ${bestHour[1].avgEngagement.toFixed(2)}%)`);

    // コンテンツタイプ分析
    const withUrl = posts.filter(p => p.hasUrl);
    const withoutUrl = posts.filter(p => !p.hasUrl);
    if (withUrl.length > 0 && withoutUrl.length > 0) {
      const urlEngagement = this.avgEngagementRate(withUrl);
      const noUrlEngagement = this.avgEngagementRate(withoutUrl);
      recommendations.push(
        `URL posts engagement: ${urlEngagement.toFixed(2)}% vs Text-only: ${noUrlEngagement.toFixed(2)}%`
      );
    }

    return recommendations;
  }
}
```

### 6.4 A/Bテストの実施方法

Threads APIには組み込みのA/Bテスト機能はないため、手動で実装する:

```javascript
class ABTestManager {
  constructor(store) {
    this.store = store;
  }

  // テスト作成
  async createTest(testConfig) {
    // testConfig例:
    // {
    //   name: 'hashtag_vs_no_hashtag',
    //   variants: ['with_hashtag', 'without_hashtag'],
    //   metric: 'engagement_rate',
    //   sampleSize: 20, // 各バリアント20投稿
    //   duration: '14d'
    // }
    const test = {
      ...testConfig,
      id: crypto.randomUUID(),
      status: 'running',
      createdAt: new Date().toISOString(),
      results: {}
    };

    await this.store.saveTest(test);
    return test;
  }

  // 投稿時にバリアント割り当て
  getVariant(testId) {
    // 交互に割り当て（曜日/時間帯の偏りを防ぐ）
    const test = this.store.getTest(testId);
    const counts = test.variants.map(v =>
      (test.results[v] || []).length
    );
    const minIdx = counts.indexOf(Math.min(...counts));
    return test.variants[minIdx];
  }

  // 結果の統計的検定
  async analyzeResults(testId) {
    const test = await this.store.getTest(testId);
    const variantMetrics = {};

    for (const variant of test.variants) {
      const posts = test.results[variant] || [];
      const values = posts.map(p => p[test.metric]);
      variantMetrics[variant] = {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        stddev: this.stddev(values),
        n: values.length
      };
    }

    // 簡易的なt検定相当の評価
    const [a, b] = test.variants;
    const diff = variantMetrics[a].mean - variantMetrics[b].mean;
    const significant = Math.abs(diff) > (variantMetrics[a].stddev + variantMetrics[b].stddev) / 2;

    return {
      variants: variantMetrics,
      winner: diff > 0 ? a : b,
      statistically_significant: significant,
      recommendation: significant
        ? `Use variant "${diff > 0 ? a : b}" (${Math.abs(diff).toFixed(2)}% better)`
        : 'No significant difference detected. Continue testing.'
    };
  }
}
```

**推奨A/Bテスト項目:**

| テスト項目 | バリアントA | バリアントB | 最低サンプル数 |
|-----------|------------|------------|--------------|
| ハッシュタグ効果 | タグあり | タグなし | 各20投稿 |
| URL配置 | 本文内 | セルフリプライ | 各15投稿 |
| 投稿時間 | 朝7時 | 夜21時 | 各20投稿 |
| 文字数 | 短文（100字） | 長文（300字） | 各20投稿 |
| 画像有無 | テキストのみ | 画像付き | 各15投稿 |
| CTA文言 | 質問形式 | 指示形式 | 各20投稿 |

---

## 7. 現行コードへの改善提案

現在の `threads-poster` プロジェクトのコードを分析した結果、以下の改善を推奨する。

### 7.1 最優先改善（セキュリティ・安定性）

| # | 問題 | 現状 | 改善案 |
|---|------|------|--------|
| 1 | リトライなし | エラー時に即座にfail | Exponential backoff付きリトライ実装 |
| 2 | レート制限未チェック | 投稿前にクォータ確認なし | `threads_publishing_limit`エンドポイント事前チェック |
| 3 | 429対応なし | レスポンスヘッダー未解析 | `X-Business-Use-Case-Usage`ヘッダー監視 |
| 4 | 投稿間隔が短い | `setTimeout(1000)` のみ | 最低5秒、メディア投稿は30秒間隔推奨 |
| 5 | トークン管理なし | `.env`に静的保存のみ | 自動リフレッシュ + 期限アラート実装 |
| 6 | メディアステータス未チェック | 即座にpublish | `FINISHED`ステータス確認後にpublish |

### 7.2 コンテンツ改善

| # | 問題 | 現状 | 改善案 |
|---|------|------|--------|
| 7 | ハッシュタグ過多 | 最大3個 | **1個に制限**（Threadsの設計思想に合致） |
| 8 | 投稿形式が固定 | テンプレート1種類 | 複数テンプレート（質問形式、フック形式など） |
| 9 | URL常時付与 | 全投稿にURL | テキストのみ投稿とURL付き投稿を交互に |
| 10 | Insightsの活用なし | パフォーマンス計測未実装 | Insights API連携で投稿効果を測定 |

### 7.3 具体的なコード変更（優先度順）

**変更1: ハッシュタグを1個に制限** (`index.js` L153-154)
```javascript
// Before:
const hashtags = tags.slice(0, 3).map(tag => `#${tag.replace(/\s/g, '')}`);

// After:
const hashtags = tags.slice(0, 1).map(tag => `#${tag.replace(/\s/g, '')}`);
```

**変更2: 投稿間隔を拡大** (`index.js` L337)
```javascript
// Before:
await new Promise(resolve => setTimeout(resolve, 1000));

// After:
await new Promise(resolve => setTimeout(resolve, 5000)); // 最低5秒
```

**変更3: `threads-client.js`にリトライロジック追加**
- `request()`メソッドにExponential backoff組み込み
- レスポンスヘッダーからレート制限情報を解析
- コンテナステータスポーリングを投稿フローに追加

---

## まとめ: 運用チェックリスト

### 投稿前チェック
- [ ] `threads_publishing_limit`でクォータ残量確認
- [ ] トークン有効期限の確認（残り7日以内ならリフレッシュ）
- [ ] コンテンツが500文字以内であることを確認
- [ ] ハッシュタグが1個以内であることを確認

### 投稿時チェック
- [ ] コンテナ作成 → ステータス確認 → 公開の3ステップ順守
- [ ] メディア投稿は`FINISHED`ステータスを確認してから公開
- [ ] 投稿間隔は最低5秒、メディアは30秒以上
- [ ] レスポンスヘッダー`X-Business-Use-Case-Usage`を監視
- [ ] 429エラー時はExponential backoffでリトライ

### 定期チェック（週次）
- [ ] トークン期限の確認
- [ ] Insights APIで投稿パフォーマンスをレビュー
- [ ] 最適投稿時間の分析更新
- [ ] エンゲージメント率のトレンド確認

### セキュリティチェック（月次）
- [ ] `.env`がgit管理されていないことを確認
- [ ] 不要なトークンの無効化
- [ ] APIパーミッションの最小権限確認
- [ ] ログにトークンが出力されていないことを確認

---

> **調査ソース:** Meta公式Threads API Documentation (developers.facebook.com/docs/threads), Hootsuite 2025 Social Media Report, Meta Graph API Error Handling Guide, OWASP Web Security Testing Guide, DataReportal Digital 2024 Japan Report
