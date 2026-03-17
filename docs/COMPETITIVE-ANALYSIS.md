# Threads自動投稿 競合ツール・OSSライブラリ 徹底調査レポート

**調査日**: 2026-03-17
**対象**: threads-poster の競合環境分析

---

## 1. OSS / GitHubプロジェクト

### 1-1. GitHub topics/threads-api の主要プロジェクト

| リポジトリ | 言語 | Stars | 最終更新 | API種別 | 概要 |
|---|---|---|---|---|---|
| [junhoyeo/threads-api](https://github.com/junhoyeo/threads-api) | TypeScript | 1,600 | 2023-09 | 非公式(リバースエンジニアリング) | Web UI付きのNode.js/TSクライアント。開発停止状態 |
| [fbsamples/threads_api](https://github.com/fbsamples/threads_api) | JavaScript | 277 | 2024-12 | 公式サンプル | Meta公式のサンプルアプリ。OAuth認証フロー実装例 |
| [Mikescops/node-threads-api](https://github.com/Mikescops/node-threads-api) | TypeScript | 5 | 2024-06 | 公式API | JS/TS SDK。WIP段階、プロダクション非推奨 |
| [threadsjs/threads.js](https://github.com/threadsjs/threads.js) | JavaScript | 278 | 2024-06 | 公式API | Node.jsライブラリ |
| [marclove/pythreads](https://github.com/marclove/pythreads) | Python | 69 | 2025-09 | 公式API | 全公式エンドポイント対応。テキスト/画像/動画/カルーセル |
| [Danie1/threads-api](https://github.com/Danie1/threads-api) | Python | 142 | 2023-10 | 非公式 | 非公式Python API。開発停止 |
| [dmytrostriletskyi/threads-net](https://github.com/dmytrostriletskyi/threads-net) | Python | 422 | 2023-10 | 非公式(リバースエンジニアリング) | 初期リバースエンジニアリング版。開発停止 |
| [paulosabayomi/ThreadsPipe-py](https://github.com/paulosabayomi/ThreadsPipe-py) | Python | - | - | 公式API | pip install threadspipepy で利用可能 |
| [Trukes/threads-api-php-client](https://github.com/Trukes/threads-api-php-client) | PHP | 9 | 2024-08 | 公式API | PHP 8.1+対応。投稿/返信/インサイト取得 |
| [davidcelis/threads-api](https://github.com/davidcelis/threads-api) | Ruby | 10 | 2024-07 | 公式API | Ruby gem。テキスト/画像/動画/カルーセル/返信対応 |
| [restfb/restfb](https://github.com/restfb/restfb) | Java | 764 | 2026-02 | 公式API | Facebook Graph APIクライアント。Threads対応 |

**言語別まとめ**:
- **JavaScript/TypeScript**: junhoyeo/threads-api (1.6k stars, 停止), threads.js (278), node-threads-api (5)
- **Python**: threads-net (422, 停止), Danie1/threads-api (142, 停止), pythreads (69, アクティブ), ThreadsPipe
- **PHP**: threads-api-php-client (9)
- **Ruby**: davidcelis/threads-api (10)
- **Java**: restfb (764, アクティブ)

> **注目**: 2023年のリバースエンジニアリング系ライブラリ(junhoyeo, threads-net等)は軒並み開発停止。2024年にMeta公式APIがリリースされて以降、公式API対応ライブラリへ移行が進んでいるが、いずれもスター数は少なく活発とは言い難い。

---

### 1-2. Postiz (https://postiz.com)

| 項目 | 詳細 |
|---|---|
| GitHub | [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) |
| Stars | **27,300** |
| 最終更新 | 2026-03-10 (v2.20.2) |
| ライセンス | AGPL-3.0 |
| 技術スタック | Next.js + NestJS + Prisma (PostgreSQL) + Temporal |
| コントリビューター | 71人, 2,360+ コミット |

**対応プラットフォーム (19+)**:
Facebook, Instagram, Threads, LinkedIn, X, TikTok, YouTube, Pinterest, Bluesky, Mastodon, Reddit, Discord, Slack, Telegram, Dribbble, Nostr, Lemmy, Warpcast, VK

**主要機能**:
- AI Copilot (投稿生成、画像/動画生成)
- スケジュール投稿、クロスポスト、繰り返し投稿
- RSS自動投稿
- チーム協業 (タスク委譲、承認フロー)
- API・Webhook連携 (n8n, Make.com, Zapier対応)
- アナリティクス
- セルフホスト可能

**料金**:
| プラン | 月額 | チャンネル | 投稿数 | AI画像 | AI動画 |
|---|---|---|---|---|---|
| Standard | $29 | 5 | 400/月 | 0 | 3/月 |
| Team | $39 | 10 | 無制限 | 100/月 | 10/月 |
| Pro | $49 | 30 | 無制限 | 300/月 | 30/月 |
| Ultimate | $99 | 100 | 無制限 | 500/月 | 60/月 |
| セルフホスト | 無料 | 無制限 | 無制限 | - | - |

---

### 1-3. Mixpost (https://mixpost.app)

| 項目 | 詳細 |
|---|---|
| GitHub | [inovector/mixpost](https://github.com/inovector/mixpost) |
| Stars | **3,000** |
| 最終更新 | 2026-03-16 (v2.6.0) |
| ライセンス | MIT |
| 技術スタック | PHP + Vue.js (Laravel) |

**対応プラットフォーム**:
- Lite (無料): Facebook Pages, X, Mastodon のみ
- Pro/Enterprise: + Instagram, LinkedIn, YouTube, TikTok, Pinterest, **Threads**, Bluesky, Google Business Profile

**主要機能**:
- スケジュール投稿、テンプレート、ハッシュタググループ
- ファーストコメント機能
- メディアライブラリ
- チーム協業 (ワークスペース)
- AI Assistant (Pro以上)
- API・Webhook (Pro以上)
- アナリティクス (Pro以上)
- ホワイトラベル対応

**料金** (買い切り):
| プラン | 価格 | Threads対応 | 特徴 |
|---|---|---|---|
| Lite | 無料 | No | 3プラットフォームのみ |
| Pro | $269 (1回) | **Yes** | 11プラットフォーム、AI、ホワイトラベル |
| Enterprise | $1,199 (1回) | **Yes** | SaaS構築可、顧客管理 |

> **注目**: 買い切りモデルは月額サブスクと比べてコスト面で有利。ただしThreadsはPro以上のみ。

---

## 2. SaaS型ツール

### 2-1. Buffer (https://buffer.com)

| 項目 | 詳細 |
|---|---|
| Threads対応 | **Yes** |
| 対応プラットフォーム | 11 (Facebook, Instagram, X, LinkedIn, TikTok, Pinterest, YouTube, Threads, Bluesky, Mastodon, Google Business) |
| AI機能 | AI Assistant (ブレインストーミング、キャプション生成) |

**料金**:
| プラン | 月額 | チャンネル | 投稿数 |
|---|---|---|---|
| Free | $0 | 3 | 10/チャンネル |
| Essentials | $5/ch | 無制限 | 無制限 |
| Team | $10/ch | 無制限 | 無制限 + 承認フロー |

> **注目**: 無料プランあり。チャンネル単価が安く、小規模運用に最適。ただし無料は生涯8回のチャンネル接続制限あり。

---

### 2-2. Later (https://later.com)

| 項目 | 詳細 |
|---|---|
| Threads対応 | **Yes** (Social Setに含まれる) |
| 対応プラットフォーム | 8 (Instagram, Facebook, Threads, Pinterest, TikTok, LinkedIn, YouTube, Snapchat) |
| AI機能 | AIキャプション生成、カレンダー提案 |

**料金**:
| プラン | 月額 | Social Sets | 特徴 |
|---|---|---|---|
| Starter | $25 | 1 | 基本スケジュール、5 AIクレジット |
| Growth | $45 | 3 | アナリティクス強化 |
| Advanced | $80 | 6 | チーム機能 |

> **注意**: 2026年に無料プランを廃止。14日間の無料トライアルのみ。

---

### 2-3. Hootsuite (https://hootsuite.com)

| 項目 | 詳細 |
|---|---|
| Threads対応 | **Yes** |
| 対応プラットフォーム | 9 (Facebook, Instagram, X, LinkedIn, TikTok, Pinterest, YouTube, WhatsApp Business, Threads) |
| AI機能 | OwlyWriter AI (キャプション生成)、OwlyGPT (画像生成beta)、ブランドボイス |
| 連携 | 150+アプリ (Canva, Salesforce, HubSpot, Google Drive等) |

**料金**:
| プラン | 月額(年払い) | 特徴 |
|---|---|---|
| Standard | $99 | 基本的な管理・分析 |
| Advanced | $249 | 高度な分析、ソーシャルリスニング |
| Enterprise | $15,000+/年 | 5ユーザー以上、カスタム |

> **注目**: エンタープライズ向け。個人や小規模チームには高額。30日間無料トライアルあり。

---

### 2-4. Ayrshare API (https://www.ayrshare.com)

| 項目 | 詳細 |
|---|---|
| Threads対応 | **Yes** |
| 対応プラットフォーム | 13+ (X, Bluesky, Threads, Snapchat, Facebook, Instagram, LinkedIn, Telegram, Reddit, Google Business, Pinterest, TikTok, YouTube) |
| 特徴 | **API-first** のソーシャルメディアサービス |

**Threads固有機能**:
- テキスト投稿 (500文字上限)
- 画像/動画投稿
- カルーセル (最大20メディア)
- スレッド投稿 (`thread: true` で連続投稿)
- 自動スレッド番号付け (`threadNumber: true`)
- 地理制限 (`allowCountries` で国別制限)
- リンクプレビュー自動生成
- 1日250投稿のAPI制限

**料金**:
| プラン | 月額 | プロファイル数 | 特徴 |
|---|---|---|---|
| Premium | $149 | 1 | 基本API、無制限スケジュール |
| Launch | $299 | 10 | マルチユーザー、Webhook |
| Business | $599 | 30-5,000 | スケーラブル |
| Enterprise | カスタム | 数千 | 専任AM、高度セキュリティ |

> **注目**: 開発者/SaaS向けAPI。他のツールにThreads投稿機能を組み込む場合に最適だが、高額。

---

### 2-5. その他のSaaSツール

| ツール | Threads対応 | 月額 | 特徴 |
|---|---|---|---|
| **SocialPilot** | Yes | $25.50~ | バルク投稿、AI投稿時間提案 |
| **Metricool** | Yes | $20~ | 高度なアナリティクス、競合分析 |
| **Gain** | Yes | $99~ | エージェンシー向け、クライアント承認 |
| **dlvr.it** | Yes | $9.99~ | RSS自動投稿特化 |
| **Circleboom** | Yes | 不明 | RSS → Threads自動化 |

---

## 3. 個人開発ツール

### 3-1. threads-poster (本プロジェクト)

| 項目 | 詳細 |
|---|---|
| GitHub | [tndg16-bot/threads-poster](https://github.com/tndg16-bot/threads-poster) |
| 言語 | JavaScript (Node.js) |
| ライセンス | MIT |
| 目的 | ポートフォリオブログ記事の自動Threads投稿 |

**現在の機能**:
- テキスト投稿 (公式Threads Graph API使用)
- ブログ記事の自動取得・投稿内容生成
- 投稿済み記事の重複排除
- 配信予約 (自前スケジューラー)
- 失敗時の自動リトライ (最大3回)
- Discord通知
- Dry Runモード

**未実装/ロードマップ**:
- 画像投稿
- カルーセル
- スレッドシリーズ (マルチパート)
- アナリティクス
- マルチアカウント

---

### 3-2. 類似の個人プロジェクト

| プロジェクト | Stars | 言語 | 最終更新 | 特徴 |
|---|---|---|---|---|
| [ptrlrd/threads-cli](https://github.com/ptrlrd/threads-cli) | 5 | Python | 2024-06 | CLIでプロフィール取得、投稿、スケジュール。typer + rich使用 |
| [ctrimm/threads-auto-poster](https://github.com/ctrimm/threads-auto-poster) | 0 | Python | 2024-10 | GitHub Actions + GitHub Pagesでスケジュール投稿。開発保留中 |
| [imyimang/threads-auto-post](https://github.com/imyimang/threads-auto-post) | 14 | Python | 2024-08 | Google Gemini APIでニュース記事を自動生成→Threads投稿。台湾ニュース特化 |
| [L422Y/AutoPostBot](https://github.com/L422Y/AutoPostBot) | - | - | - | マルチプラットフォーム自動投稿Bot。プラグイン式アーキテクチャ |
| [politsturm/social-networks-auto-poster](https://github.com/politsturm/social-networks-auto-poster) | - | - | - | マルチSNS自動投稿 |

**ブログ記事自動投稿の代替手段**:
- **WordPress → Threads**: FS Poster プラグイン、WordPress.com ネイティブ連携、Uncanny Automator
- **RSS → Threads**: dlvr.it、Circleboom、Postiz (RSS自動投稿機能)
- **GitHub Actions**: threads-auto-posterのアプローチ (cron + Python script)

---

## 4. 機能比較表

### 4-1. 主要ツール総合比較

| 機能 | threads-poster | Postiz | Mixpost (Pro) | Buffer | Later | Hootsuite | Ayrshare |
|---|---|---|---|---|---|---|---|
| **テキスト投稿** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **画像投稿** | No (計画中) | Yes | Yes | Yes | Yes | Yes | Yes |
| **動画投稿** | No | Yes | Yes | Yes | Yes | Yes | Yes |
| **カルーセル** | No (計画中) | Yes | Yes | Yes | Yes | Yes | Yes (20枚) |
| **スケジュール投稿** | Yes (自前) | Yes | Yes | Yes | Yes | Yes | Yes |
| **AI生成** | 簡易フォールバック | Yes (画像/動画/テキスト) | Yes (Pro以上) | Yes (基本) | Yes (基本) | Yes (OwlyWriter) | No |
| **アナリティクス** | No | Yes | Yes (Pro以上) | Yes (有料) | Yes (有料) | Yes | Yes (API) |
| **マルチアカウント** | No | Yes | Yes | Yes | Yes | Yes | Yes |
| **Webhook** | No | Yes | Yes (Pro以上) | No | No | Yes | Yes |
| **チーム協業** | No | Yes | Yes | Yes (Team) | Yes (有料) | Yes | No |
| **API提供** | No | Yes | Yes (Pro以上) | No | No | Yes | **Yes (主力)** |
| **RSS自動投稿** | No | Yes | No | No | No | No | No |
| **セルフホスト** | Yes | Yes | Yes | No | No | No | No |
| **Discord通知** | Yes | Yes (連携) | No | No | No | No | No |
| **対応プラットフォーム数** | 1 (Threads) | 19+ | 11 | 11 | 8 | 9 | 13+ |

### 4-2. 料金比較

| ツール | 無料枠 | 最低有料プラン | Threads含む最安 | 備考 |
|---|---|---|---|---|
| **threads-poster** | 完全無料 (セルフホスト) | - | $0 | Threads特化、自分で運用 |
| **Postiz** | セルフホスト無料 | $29/月 | $0 (セルフホスト) | OSSで全機能無料利用可 |
| **Mixpost** | Lite (Threads非対応) | $269 (買い切り) | $269 (1回) | 買い切りでランニングコスト低 |
| **Buffer** | 3ch, 10投稿/ch | $5/月/ch | $5/月 | チャンネル単価最安 |
| **Later** | なし (2026年廃止) | $25/月 | $25/月 | 14日トライアルのみ |
| **Hootsuite** | なし | $99/月 | $99/月 | 30日トライアルあり |
| **Ayrshare** | なし | $149/月 | $149/月 | API-firstで開発者向け |

---

## 5. 分析・示唆

### 5-1. 市場の状況

1. **OSSライブラリは未成熟**: Threads公式APIが2024年にリリースされてまだ日が浅く、各言語のラッパーライブラリはいずれもスター数が少なく、メンテナンスも不安定。最もアクティブなのはPythonの`pythreads` (69 stars, 2025-09更新)。

2. **リバースエンジニアリング系は全滅**: 2023年のThreadsローンチ直後に作られた非公式ライブラリ(junhoyeo/threads-api等)は公式API登場後に開発が停止。

3. **統合管理ツールが主戦場**: Postiz (27.3k stars)、Buffer、Hootsuite等のマルチプラットフォーム管理ツールがThreads対応を進めており、「Threads専用ツール」は個人プロジェクトレベルに留まる。

### 5-2. threads-poster の強みと弱み

**強み**:
- ブログ記事→Threads投稿に完全特化した唯一のツール
- セルフホスト、無料、軽量 (依存パッケージ4つのみ)
- 公式Threads Graph API使用で安定
- Discord通知統合
- 自前スケジューラーでcron不要

**弱み**:
- テキストのみ (画像/動画/カルーセル未対応)
- アナリティクスなし
- マルチアカウント非対応
- Webhook/API未提供
- コミュニティ/ユーザーベースなし

### 5-3. 差別化の方向性

1. **ニッチ特化を深掘り**: 「ブログ記事→Threads自動投稿」というニッチに特化し、Postiz/Bufferのような汎用ツールとは競合しない路線
2. **画像投稿対応**: OGP画像の自動取得→投稿で差別化
3. **AI生成の強化**: 記事内容から最適なThreads投稿文を生成するAI機能の高度化
4. **n8n/Zapier連携**: 自動化ワークフローへの組み込み
5. **npm パッケージ化**: CLIツール + ライブラリとして配布

---

## Sources

- [GitHub Topics: threads-api](https://github.com/topics/threads-api)
- [Postiz GitHub](https://github.com/gitroomhq/postiz-app)
- [Postiz公式サイト](https://postiz.com/)
- [Mixpost GitHub](https://github.com/inovector/mixpost)
- [Mixpost公式サイト](https://mixpost.app)
- [Mixpost Threads対応記事](https://mixpost.app/blog/threads-support-open-source-social-media-management)
- [Mixpost料金](https://mixpost.app/pricing)
- [Buffer公式サイト](https://buffer.com/)
- [Buffer料金](https://buffer.com/pricing)
- [Later料金](https://later.com/pricing/)
- [Hootsuite公式](https://www.hootsuite.com)
- [Ayrshare Threads API](https://www.ayrshare.com/docs/apis/post/social-networks/threads)
- [Ayrshare料金](https://www.ayrshare.com/pricing/)
- [threads-cli](https://github.com/ptrlrd/threads-cli)
- [threads-auto-post](https://github.com/imyimang/threads-auto-post)
- [threads-auto-poster](https://github.com/ctrimm/threads-auto-poster)
- [pythreads](https://github.com/marclove/pythreads)
- [Meta公式サンプル](https://github.com/fbsamples/threads_api)
- [davidcelis/threads-api (Ruby)](https://github.com/davidcelis/threads-api)
- [Trukes/threads-api-php-client](https://github.com/Trukes/threads-api-php-client)
- [5 Best Threads Schedulers 2026](https://blog.gainapp.com/best-threads-schedulers/)
- [Mixpost vs Postiz比較](https://openalternative.co/compare/mixpost/vs/postiz)
- [Postiz vs Buffer比較](https://www.bengago.com/comparisons/buffer-vs-postiz)
