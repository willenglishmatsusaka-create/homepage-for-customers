-- BIEN MANGER の試行用データ（仮）。席数・時間・コース・料金は聞き取り後に正式な値へ置き換える。
-- theme：予約ページの見た目（ホームページの配色・書体に合わせる）
-- policy.texts：予約ページに出す文章。キャンセル料の規定は確認中のため、具体的な金額は書いていない
INSERT INTO stores (id, slug, name, name_en, email, phone, theme, policy) VALUES
  ('st_bien', 'bien-manger', 'BIEN MANGER', 'BIEN MANGER', NULL, '075-275-1080',
   '{"accent":"#7f2a37","accentHover":"#962f40","background":"#e9e7e3","surface":"#f3f1ed","ink":"#2c2b29","inkDim":"#5f5c56","line":"rgba(44,43,41,0.16)","heading":"serif","logoSub":"Kyoto · Marutamachi","homepage":"https://bien-manger.jp/"}',
   '{"bookingWindowDays":60,"cutoffMinutes":1440,"maxPartyOnline":6,
     "texts":{
       "cancelPolicy":{
         "ja":"ご変更・キャンセルは、できるだけお早めにご連絡ください。",
         "en":"If you need to change or cancel, please let us know as early as possible."},
       "notices":{
         "ja":["アレルギー・苦手な食材は、ご予約の際にお知らせください。当日の変更は難しい場合がございます。","カウンターでは料理の香りもお楽しみいただくため、香りの強い香水はお控えください。","大人と同じコースを召し上がれるお子様は、ご一緒にお越しいただけます。","全席禁煙です。"],
         "en":["Please tell us about any allergies or dislikes when booking. Changes on the day may not be possible.","To let everyone enjoy the aromas at the counter, please avoid strong perfume.","Children who can enjoy the same course as adults are welcome.","The restaurant is non-smoking."]}}}');

-- 12席（仮：カウンター8・テーブル4）。試行期間はネット予約に各2席だけ出す。
INSERT INTO seat_groups (id, store_id, name_ja, name_en, capacity, online_capacity, min_party, max_party, sort) VALUES
  ('sg_counter', 'st_bien', 'カウンター', 'Counter', 8, 2, 1, 4, 1),
  ('sg_table',   'st_bien', 'テーブル',   'Table',   4, 2, 2, 4, 2);

-- 営業曜日（仮）：水曜定休。ビット 日=1 月=2 火=4 水=8 木=16 金=32 土=64 → 127-8 = 119
INSERT INTO service_periods (id, store_id, name_ja, name_en, weekdays, start_times, last_entry, duration, sort) VALUES
  ('sp_lunch',  'st_bien', 'ランチ',   'Lunch',  119, '[720,750]',   750,  120, 1),
  ('sp_dinner', 'st_bien', 'ディナー', 'Dinner', 119, '[1080,1110]', 1140, 150, 2);

INSERT INTO courses (id, store_id, name_ja, name_en, price, duration, min_party, max_party, daily_limit, period_ids, sort) VALUES
  ('co_lunch',  'st_bien', 'ランチコース',   'Lunch course',  NULL, 120, 1, 6, NULL, '["sp_lunch"]',  1),
  ('co_dinner', 'st_bien', 'ディナーコース', 'Dinner course', NULL, 150, 1, 6, NULL, '["sp_dinner"]', 2),
  ('co_wagyu',  'st_bien', '銘柄和牛のコース', 'Wagyu course', NULL, 150, 2, 6, 6,  '["sp_dinner"]', 3);

-- 台帳にログインできる人（仮）。実際の店主のメールアドレスに置き換える
INSERT INTO store_users (id, store_id, email, role) VALUES
  ('su_bien_owner', 'st_bien', 'owner@example.com', 'owner');
