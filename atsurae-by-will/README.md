# ATSURAE by Will サービスサイト

有限会社Willのホームページ制作サービス「ATSURAE by Will」の紹介サイトです。
BIEN MANGER のデモとは別の Cloudflare Worker（静的アセットのみ）として公開します。

## 構成

```
public/index.html        日本語（1ページ構成：写真が切り替わるトップ・制作事例・対象のお店・できること・制作の流れ・料金・よくある質問・お問い合わせ）
public/en/index.html     英語
public/assets/styles.css デザイン
public/assets/main.js    メニュー開閉、トップの写真の切り替え、スクロールで現れる動き、右下の相談ボタン
public/assets/works/     制作事例の写真と画面（bm- は BIEN MANGER）
wrangler.jsonc           Cloudflare 設定
```

料金は Google ドキュメントの料金表（ATSURAE by Will 料金表）と同じ内容です。料金を変えたら両方を直してください。

動きは、端末で「視差効果を減らす」などを設定している人には止まります。

## 公開前に確認すること

- **BIEN MANGER の写真と画面**：トップの写真、制作事例、お問い合わせの背景に BIEN MANGER の写真と画面を使っています。写真の権利はお店にあるため、公開前にお店の了承（契約書第10条・別紙）を必ず得てください。了承が得られない場合は `assets/works/` の写真を差し替えます。
- **業種別の写真**：飲食店以外の5業種（宿・酒蔵・体験・美容室・子ども）は、写真の代わりに漢字のデザインを置いています。事例や写真ができたら、`index.html` の `industry-visual` に `has-photo` と `--img` を付けて差し替えます。
- **お問い合わせ先**：`info@atsurae-will.com` を仮で入れています。ドメイン取得後にメールを用意するか、実際のアドレスに差し替えてください。
- **英語教育の経歴**：「英語教育に携わってきた私たち」という表現が実態に合っているか確認してください。

## 公開（Cloudflare）

リポジトリのルートで依存関係を入れてから、このフォルダで実行します。

```sh
npm install
cd atsurae-by-will
npx wrangler deploy        # → https://atsurae-by-will.<account>.workers.dev
```

ドメイン（例：atsurae-will.com）を取得したら、Cloudflare ダッシュボードの Workers & Pages → atsurae-by-will → Settings → Domains & Routes でカスタムドメインを追加します。

## ローカルで確認

```sh
cd atsurae-by-will/public
python3 -m http.server 8765   # → http://localhost:8765
```
