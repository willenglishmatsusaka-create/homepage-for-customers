# ATSURAE 予約・顧客管理（予約 Worker）

個人店向けの予約・顧客管理の仕組みです。全店共通の Cloudflare Worker 1つで動き、データは D1 に置きます。
最初の導入先は BIEN MANGER です。企画の全体は企画書（ATSURAE 予約・顧客管理 企画書）を参照してください。

> いまは同じリポジトリの `reservation/` に置いています。複数店舗で使い始める段階で、別リポジトリに分ける予定です。

## 予約ページ（お客様向け）

`/r/<お店の ID>/` で開く予約ページです（`public/book/`。英語は `?lang=en`、画面上の切り替えボタンでも変わります）。

1. 人数と日付：空きのある日だけ選べるカレンダー（受付期間の範囲で月を切り替え）
2. 時間とコース：その日・その人数で入れる時間と、その時間に出しているコース
3. お客様情報：お名前・ふりがな（日本語のみ）・電話・メール・アレルギー・ご要望。ご来店の案内とキャンセル規定を読んで同意
4. 確認 → 完了：予約の確認・キャンセル用のリンク（`/r/<店>/manage#t=<鍵>`）、カレンダーに追加（.ics）

- 見た目は `stores.theme`（色・見出しの書体・店名の下の一行・ホームページの URL）で店ごとに変えます。BIEN MANGER はホームページと同じ配色と書体です
- ご来店の案内とキャンセル規定の文章は `stores.policy.texts` に日本語と英語で入れます
- 確認画面にいる間に他の予約で埋まった場合は、理由を出して時間の選択に戻します
- 確認リンクの鍵はアドレスの `#` 以降に置き、サーバーの記録や他サイトへの参照元に残らないようにしています
- `TURNSTILE_SITE_KEY` を設定すると確認画面にロボット対策が出ます。`EMAIL_ENABLED=true` にすると完了画面に「メールでお送りしました」が出ます（メール送信を始めるまでは出さない）

お店のホームページの予約ボタンからつなぐのは、試行の段階2（一部の席を自社予約に回す）を始めるときです。

## 台帳の画面（お店向け）

`/admin/` で開くスマホ向けの画面です（`public/admin/`）。ホーム画面に追加するとアプリのように使えます。

| 画面 | できること |
|---|---|
| 台帳 | 日ごとの予約一覧（ランチ・ディナー別）、席の埋まり具合、アレルギー・記念日・来店回数の表示。「来店」「退店」は1タップ。カードを押すと詳細（キャンセル・無断キャンセル・席の変更・店内メモ） |
| カレンダー | 月の一覧。日ごとの予約人数と埋まり具合、休業日。押すとその日の台帳へ |
| ＋（新規予約） | 人数 → 時間 → 名前・電話で保存。電話番号の途中から過去のお客様を呼び出す。満席のときは確認のうえ席数を超えて入れられる |
| お客様 | 名前・ふりがな・電話番号で検索。アレルギー・お好み・記念日・メモの編集、来店の履歴 |
| 設定 | 臨時休業・臨時営業・席を閉じる（貸切やグルメサイト用の確保）の追加と取り消し。営業時間・席数・コースの確認 |

ログインは試行用の共通パスワード（`ADMIN_TOKEN`）で、端末に保存します。店主ごとのログインに置き換える予定です。
画面に戻るたびに最新の予約を読み直すので、ネット予約や別の端末で入れた予約も反映されます。

## できていること（段階1：台帳とAPI）

- D1 のスキーマ（`migrations/0001_init.sql`）：店舗、席の種類、営業枠、コース、日付の例外、顧客、予約、変更の記録、通知
- 空き枠の計算（`src/availability.ts`）：定休日・臨時休業・臨時営業、受付期間と締切、人数の上限、コースごとの1日の人数、貸切などで席を閉じる
- **ダブルブッキング防止**：在庫の確認と保存を1つの SQL 文で行う（`src/repo.ts` の `insertReservation`）。同時に10件のネット予約を送っても、席数を超えない
- **ネットに出す席数**：席の種類ごとに「全体の席数」と「ネット予約に出す席数」を分けて持つ。試行期間は TableCheck と在庫を分けて一部の席だけ出せる
- お客様向け API：設定、カレンダー、空き時間、予約、予約の確認・キャンセル（ログイン不要のリンク）
- お店向け API：その日の台帳、電話などの手入力（満席でも「強制で入れる」ことができる）、状態の変更（来店済みで来店回数を更新）、顧客検索（電話番号・名前）、臨時休業などの設定
- 通知は `notifications` 表に積むところまで（確定・前日10時のリマインド・キャンセル・店主への新着）。実際の送信は次の段階

## まだのこと

- お店のホームページ（`bien-manger.jp/reserve/`）から予約ページへの接続
- メール送信（Cron と Queues で `notifications` を送る。送信サービスは Resend を想定）
- 店主ごとのログイン（今は試行用の `ADMIN_TOKEN` 1つ）
- 予約の日時の変更（今はキャンセルして入れ直す）
- カード登録（Stripe Connect）、中国語・韓国語、集計

## 在庫の考え方

席は「カウンター／テーブル」などの種類ごとの席数で管理し、個々の席は割り当てません。
ある時間帯に入れられるのは、**その時間帯と重なる予約の人数の合計＋今回の人数 ≤ 席数** のときです。
重なる予約を単純に足すので、厳密な同時在席数より少し慎重になりますが、画面に出す空きと保存時の確認が同じ式なので結果が食い違いません。
ネット予約はさらに **ネット予約の人数の合計 ≤ ネットに出す席数** を満たす必要があります。

日付は日本時間の `YYYY-MM-DD`、時刻は 0時からの分数（18:30 → 1110）で持ちます。

## 手元で動かす

```sh
cd reservation
npm install
echo 'ADMIN_TOKEN=local-test-token' > .dev.vars
npm run db:migrate:local
npm run db:seed:local          # BIEN MANGER の仮データ
npm run dev                    # → http://localhost:8787/admin/ が台帳（お店の ID：bien-manger、パスワード：local-test-token）
                               #   http://localhost:8787/r/bien-manger/ が予約ページ
npm test                       # 空き計算のテスト
```

例：

```sh
curl "localhost:8787/api/bien-manger/slots?date=2026-12-03&party=2"
curl -X POST localhost:8787/api/bien-manger/reservations -H 'content-type: application/json' \
  -d '{"date":"2026-12-03","time":"18:00","partySize":2,"courseId":"co_dinner","name":"山田 花子","phone":"090-1234-5678","email":"hanako@example.com","agreePolicy":true}'
curl -H 'Authorization: Bearer local-test-token' "localhost:8787/admin/api/bien-manger/reservations?date=2026-12-03"
```

## 本番に出すとき

```sh
npx wrangler d1 create atsurae-reservation      # 出てきた ID を wrangler.jsonc の database_id に入れる
npx wrangler d1 migrations apply atsurae-reservation --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put TURNSTILE_SECRET        # 任意（いたずら予約の対策）
npx wrangler deploy
```

お店のホームページ（例：`bien-manger.jp/reserve/*`）から予約 Worker につなぐ設定は、予約ページの画面ができた段階で追加します。

## BIEN MANGER の仮データについて

`seed/bien-manger.sql` の席数（カウンター8・テーブル4）、営業曜日（水曜定休）、時間、コースは**仮の値**です。聞き取りの後に正式な値へ置き換えます。
