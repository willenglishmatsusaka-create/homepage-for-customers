# ATSURAE by Will サービスサイト

有限会社Willのホームページ制作サービス「ATSURAE by Will」の紹介サイトです。
BIEN MANGER のデモとは別の Cloudflare Worker（静的アセットのみ）として公開します。

## 構成

```
public/index.html      日本語（1ページ構成：考え方・できること・制作の流れ・料金・制作事例・よくある質問・お問い合わせ）
public/en/index.html   英語
public/assets/         styles.css / main.js（スマートフォンのメニュー開閉のみ）
wrangler.jsonc         Cloudflare 設定
```

料金は Google ドキュメントの料金表（ATSURAE by Will 料金表）と同じ内容です。料金を変えたら両方を直してください。

## 公開前に確認すること

- **お問い合わせ先**：`info@atsurae-will.com` を仮で入れています。ドメイン取得後にメールを用意するか、実際のアドレスに差し替えてください。
- **制作事例**：BIEN MANGER の掲載は、お店の了承（契約書第10条・別紙）を得てから公開してください。お店の写真は権利がお店にあるため使っていません。
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
