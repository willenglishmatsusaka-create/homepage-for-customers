# BIEN MANGER（ヴィアン マンジェ）ホームページ リニューアル案

京都・丸太町のフランス料理店 BIEN MANGER（https://bien-manger.jp/）向けのリニューアル提案デモです。
Cloudflare Workers（静的アセット＋API）だけで動きます。

## 構成

```
public/            静的サイト（index.html / assets/styles.css / assets/main.js）
src/index.js       Worker：/api/instagram（最新投稿）、/api/event（クリック計測）、Cron
wrangler.jsonc     Cloudflare 設定
```

- **Instagram 連携**：Cron（30分ごと）で Instagram API から最新12件を取得して KV に保存。ページは `/api/instagram` を読むので、新しい投稿が自動で反映されます。長期トークン（60日）は7日ごとに自動延長。
- **トークン未設定時**はデモ用の投稿（固定投稿3本の構成案を含む）を表示します。提案時はこの状態で見せられます。
- **計測**：予約・電話・地図・Instagram のクリックを Workers Analytics Engine（`bien_manger_events`）に記録。ダッシュボードで Analytics Engine を有効化し、`wrangler.jsonc` のコメントを外すと動きます（未設定時は計測をスキップ）。予約完了数は TableCheck 側の数字と照合してください。

## デモ公開（Cloudflare）

```sh
npm install
npx wrangler login
npx wrangler deploy        # → https://bien-manger-demo.<account>.workers.dev
```

GitHub 連携で自動デプロイする場合は、Cloudflare ダッシュボード → Workers & Pages → Create → Import a repository でこのリポジトリを選択。

## Instagram を本番接続する

1. Instagram アカウントをプロアカウント（ビジネス／クリエイター）に切り替え
2. Meta for Developers でアプリを作成し「Instagram API with Instagram login」を追加、長期アクセストークンを発行
3. KV（`bien-manger-demo-IG_KV`）とユーザー名 `bien_manger_kyoto` は設定済み
4. トークンをシークレットとして登録してデプロイ
   ```sh
   npx wrangler secret put IG_ACCESS_TOKEN
   npx wrangler deploy
   ```

## 写真の差し替え

`public/assets/photos/` に次のファイル名で JPEG を置くと、ページに自動で表示されます（無い場合は仮の枠が出ます）。
横長 2000px 前後・300KB 程度が目安です。

| ファイル名 | 使われる場所 |
|---|---|
| hero-1.jpg 〜 hero-5.jpg | トップのカルーセル（万葉牛／カウンター／前菜／ワイン／外観） |
| chef.jpg | シェフ紹介（縦長 3:4） |
| beef.jpg | 万葉牛 |
| wine.jpg | ワイン |
| counter.jpg / table.jpg / exterior.jpg | 店内とお過ごし方 |
| entrance.jpg | アクセス（入口） |

Instagram 連携後は、最新投稿の写真3枚もカルーセルに自動で追加されます。

## 店主様に確認すること（ページ上の「要確認」）

| 項目 | 現状の情報 |
|---|---|
| 入口価格 | 公式：ランチ¥10,000〜／ディナー¥20,000〜。TableCheck：魚ランチ¥5,000、和牛ハンバーグ¥5,000（¥6,000表記もあり）、赤ワイン煮込み¥7,000、魚＋和牛ステーキ¥8,000、おまかせ¥11,000（旧価格？） |
| 各コースの提供状況・内容 | 現在も提供中か、品数・構成 |
| 税・サービス料 | 税込・サ込で統一表記できるか |
| ドリンク | ペアリング／ノンアル／グラスの価格目安 |
| 定休日 | 火曜＋不定休（美食めぐり）／月曜＋不定休（TableCheck）で食い違い |
| 所要時間・服装・子ども・キャンセル | FAQ の記載内容 |
| 席構成 | 全12席の内訳（カウンター／テーブル） |
| シェフの言葉・経歴 | 引用文はたたき台。経歴の年や役職の正確な表記 |
| Instagram | @bien_manger_kyoto のプロアカウント化とトークン発行 |
| 写真 | シェフ、万葉牛、カウンター、テーブル、入口・外観、ワイン |

ページ冒頭の「提案用デモ」バーと `.q`（要確認タグ）は、確定後に削除します。
