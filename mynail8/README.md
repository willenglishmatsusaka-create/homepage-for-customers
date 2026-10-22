# My nail 8（松阪市）ホームページ デモ

三重県松阪市の自宅ネイルサロン My nail 8（Instagram [@my.nail8](https://www.instagram.com/my.nail8/)）向けの提案デモです。
HTML / CSS / JS だけで動くので、`index.html` をブラウザで開けば確認できます。

## Cloudflare で公開する

`mynail8/` だけで独立した Cloudflare Workers（静的ファイルのみ、名前は `mynail8-demo`）として公開できます。BIEN MANGER のデモとは別の URL になります。

**方法A：ダッシュボードから（ターミナル不要・おすすめ）**

1. Cloudflare ダッシュボード → Workers & Pages → Create → Import a repository
2. リポジトリ `homepage-for-customers` を選ぶ
3. Root directory（ルートディレクトリ）に `mynail8` を指定
4. Build command は空欄、Deploy command は `npx wrangler deploy` のまま → Deploy
5. `https://mynail8-demo.<アカウント名>.workers.dev` で見られます。以降は GitHub に push するたびに自動で更新されます

**方法B：ターミナルから**

```sh
cd mynail8
npx wrangler login
npx wrangler deploy
```

`wrangler.jsonc`・`README.md` は `.assetsignore` で公開対象から外しています。

## 構成（1ページ）

ヒーロー → コンセプト → こだわり4つ → 巻き爪ケア → 人気のクロスネイル → Instagram ギャラリー → メニュー・料金 → ご予約の流れ → サロン案内・ネイリスト紹介 → Q&A → LINE 予約

## Instagram から取った情報

| 項目 | 内容 |
|---|---|
| 特徴 | 巻き爪対応、シンプル〜派手ネイル、メンズネイル、クロスネイルが人気 |
| 場所 | 三重県松阪市（自宅サロン。住所は予約時に案内） |
| 営業時間 | 10:00〜19:00（最終受付 17:30）、夜のみ時間外受付 ¥550〜 |
| 定休日 | 基本 月曜・火曜・第3日曜 |
| 駐車場 | あり |
| 予約 | LINE @crg9306e |

ギャラリーは Instagram の公式埋め込みで最新6投稿を表示しています（読み込めない場合は色見本のカードを表示）。

## 配色

| 役割 | 色 |
|---|---|
| 背景 | `#f6f1eb` アイボリー |
| 帯の背景 | `#efe6dc` グレージュ |
| アクセント | `#c39a8d` / `#a5776a` くすみピンク |
| 文字 | `#4a3f3a` モカ |

ネイルチップの色は最近の投稿の色（緑茶ラテ・ジョギングピンク・ターコイズ・ネオングリーン）です。

## サロン様に確認すること（ページ上の「要確認」）

- メニューと料金（現在はすべて仮の ¥0,000）
- 巻き爪ケアの方法・所要時間・料金・通う回数の目安
- ネイリストのお名前・お写真・経歴
- 店名の「8」の由来
- お支払い方法、キャンセルの決まり、お子さま連れの可否
- サイトに使う施術写真（Instagram の写真を使ってよいか）

「要確認」は普段は隠れています。ページ上部の「確認が必要な項目を表示」ボタンで表示できます。
