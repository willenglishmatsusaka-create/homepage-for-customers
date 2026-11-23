# ATSURAE 予約システム（最初の版）

美容室・ネイルサロン向けの、ホームページに組み込む予約システムです。
1つのシステムで複数のお店を受け持ち、お店は URL の識別名（slug）で見分けます。
Cloudflare Workers（プログラム）と D1（データベース）で動きます。

## できること

| 画面 | URL | 内容 |
|---|---|---|
| 予約画面 | `/book/お店の識別名` | メニュー → 日にち → 時間 → お名前・メール・電話 の順に選んで予約 |
| キャンセル画面 | `/cancel/鍵` | 予約完了メールのリンクから開く。期限（初期値は前日の同じ時刻）までキャンセルできる |
| 店主用の一覧 | `/admin/お店の識別名` | 合言葉で開く。週ごとの予約一覧、取消、電話・店頭予約の書き込み、予約を止めたい時間の書き込み |

- 席の数（同じ時間に受けられる人数）を超える予約は、同時に申し込まれても入りません。
- 予約・キャンセルのたびに、お客様と店主にメールが届きます。
- ロボットよけとして、画面に表示しない入力欄を置いています。

## まだできないこと

- スタッフ別の出勤・指名予約（席の数でまとめて管理）
- 前日のリマインドメール、LINE 通知、事前決済
- ホットペッパービューティー（サロンボード）との自動連動。二重予約を防ぐため、HPB で入った予約は店主用画面に書き込むか、自社予約に出す時間を決めて運用する
- 店主が画面からメニューや営業時間を変える機能（今は SQL で登録・変更する）

## 動作確認（手元）

リポジトリのルートで `npm install` を済ませてから:

```sh
cd atsurae-booking
npx wrangler d1 migrations apply atsurae-booking --local
npx wrangler d1 execute atsurae-booking --local --file seed/demo.sql
npx wrangler dev --local --var PUBLIC_URL:http://localhost:8787
```

- 予約画面: http://localhost:8787/book/demo-salon
- 店主用: http://localhost:8787/admin/demo-salon （合言葉 `demo-admin-token`）

メールの設定がないときは送らずに、内容をターミナルに表示します。

## 本番の準備

1. **データベースを作る**：`npx wrangler d1 create atsurae-booking` を実行し、表示された `database_id` を `wrangler.jsonc` に書き込む
2. **表を作る**：`npx wrangler d1 migrations apply atsurae-booking --remote`（`seed/demo.sql` は本番に入れない）
3. **メールの送信サービスを用意する**：[Resend](https://resend.com) に登録し、送信元のドメイン（例: atsurae-will.com）を認証する。API キーを `npx wrangler secret put RESEND_API_KEY` で登録し、`wrangler.jsonc` の `MAIL_FROM` を認証したドメインのアドレスにする
4. **公開先の URL を書く**：`wrangler.jsonc` の `PUBLIC_URL` を、実際に公開する URL にする（メールのリンクに使う）
5. **公開する**：`npx wrangler deploy`
6. **お店を登録する**：`seed/new-shop-template.sql` を書き換えて実行し、合言葉を店主に伝える
7. **ホームページから案内する**：お店のサイトの予約ボタンを `/book/お店の識別名` に向ける

## 個人情報について

予約したお客様のお名前・メールアドレス・電話番号を、有限会社Will が管理するデータベースに保存します。公開前に次を準備してください。

- 予約画面からリンクする**プライバシーポリシー**（何の情報を、何のために、いつまで保存するか）
- お店との契約書への、個人情報の取り扱いの取り決めの追加
- 古い予約を一定期間で消す運用（例: 来店日から1年）
- 店主用の合言葉は推測されにくいものにし、店主ごとに変える
