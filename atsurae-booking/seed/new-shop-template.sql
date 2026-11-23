-- 新しいお店を登録するためのひな形。【】を書き換えてから実行する。
--   npx wrangler d1 execute atsurae-booking --remote --file seed/（書き換えたファイル）.sql
-- 合言葉のハッシュは次のコマンドで作る（合言葉は店主にだけ伝える）:
--   node -e "crypto.subtle.digest('SHA-256',new TextEncoder().encode(process.argv[1])).then(b=>console.log(Buffer.from(b).toString('hex')))" '【合言葉】'

INSERT INTO shops (slug, name, email, phone, address, accent, capacity, slot_minutes, days_ahead,
                   min_notice_minutes, cancel_notice_minutes, policy, admin_token_hash)
VALUES ('【英小文字とハイフンの識別名】', '【店名】', '【通知を受けるメール】', '【電話】', '【住所】', '【色 例 #1f2a3a】',
        【席の数】, 30, 60, 120, 1440, '【予約画面の注意書き】', '【合言葉のハッシュ】');

-- 上で登録したお店の id を使う
INSERT INTO menus (shop_id, name, description, duration_min, price, sort) VALUES
  ((SELECT id FROM shops WHERE slug = '【識別名】'), '【メニュー名】', '【説明】', 【所要分】, 【税込価格】, 1);

-- 曜日ごとの営業時間（0=日〜6=土）。定休日の曜日は書かない
INSERT INTO business_hours (shop_id, weekday, open_time, close_time) VALUES
  ((SELECT id FROM shops WHERE slug = '【識別名】'), 1, '10:00', '19:00');

-- 臨時休業日
-- INSERT INTO closed_dates (shop_id, date) VALUES ((SELECT id FROM shops WHERE slug = '【識別名】'), '2026-12-31');
