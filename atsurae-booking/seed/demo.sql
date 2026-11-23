-- 動作確認用のデモ店舗。本番のデータベースには入れない。
-- 店主用画面の合言葉は demo-admin-token
INSERT INTO shops (id, slug, name, email, phone, address, accent, capacity, policy, admin_token_hash)
VALUES (1, 'demo-salon', 'Hair Salon SAMPLE', 'owner@example.com', '000-0000-0000', '京都市中京区（デモ）', '#5b4636', 2,
  'ご予約の変更・キャンセルは前日までにお願いします。当日のキャンセルはお電話でご連絡ください。',
  '91c16f0d6cc1bec3c3603972182a07c66ff4fa71618a975e963d6dbe42b6dd37');

INSERT INTO menus (shop_id, name, description, duration_min, price, sort) VALUES
  (1, 'カット', 'シャンプー・ブロー込み', 60, 5500, 1),
  (1, 'カット＋カラー', '根元から毛先までの全体カラー', 120, 12100, 2),
  (1, 'カット＋パーマ', 'デザインに合わせたパーマ', 150, 13200, 3),
  (1, 'ヘッドスパ', '頭皮と髪のクレンジング', 30, 3300, 4);

-- 火曜定休。月・水〜金は10:00〜19:00、土日は9:00〜18:00
INSERT INTO business_hours (shop_id, weekday, open_time, close_time) VALUES
  (1, 0, '09:00', '18:00'),
  (1, 1, '10:00', '19:00'),
  (1, 3, '10:00', '19:00'),
  (1, 4, '10:00', '19:00'),
  (1, 5, '10:00', '19:00'),
  (1, 6, '09:00', '18:00');
