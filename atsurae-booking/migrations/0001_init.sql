-- 予約システムの基本の表。1つのシステムで複数のお店を管理する。
-- 日時はすべて日本時間の「YYYY-MM-DDTHH:MM」で保存する（日本は夏時間がないため）。

CREATE TABLE shops (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,              -- URL に使う店の識別名（例: demo-salon）
  name TEXT NOT NULL,
  email TEXT NOT NULL,                    -- 予約の通知を受け取るアドレス
  phone TEXT,
  address TEXT,
  accent TEXT NOT NULL DEFAULT '#1f2a3a', -- 予約画面のボタンなどの色
  capacity INTEGER NOT NULL DEFAULT 1,    -- 同じ時間に受けられる人数（席の数）
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  days_ahead INTEGER NOT NULL DEFAULT 60, -- 何日先まで予約を受けるか
  min_notice_minutes INTEGER NOT NULL DEFAULT 120, -- 予約は今から何分後以降
  cancel_notice_minutes INTEGER NOT NULL DEFAULT 1440, -- お客様がキャンセルできる期限（予約の何分前まで）
  policy TEXT,                            -- 予約画面に出す注意書き
  admin_token_hash TEXT NOT NULL,         -- 店主用画面の合言葉（SHA-256）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE menus (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  description TEXT,
  duration_min INTEGER NOT NULL,
  price INTEGER,                          -- 税込の円。空ならお問い合わせ
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- 曜日ごとの営業時間（0=日曜〜6=土曜）。行がない曜日は定休日。
CREATE TABLE business_hours (
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time TEXT NOT NULL,                -- 'HH:MM'
  close_time TEXT NOT NULL,               -- 'HH:MM'（最終の施術がこの時刻までに終わる）
  PRIMARY KEY (shop_id, weekday)
);

-- 臨時休業日
CREATE TABLE closed_dates (
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  date TEXT NOT NULL,                     -- 'YYYY-MM-DD'
  PRIMARY KEY (shop_id, date)
);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  menu_id INTEGER NOT NULL REFERENCES menus(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  cancel_token TEXT NOT NULL UNIQUE,      -- お客様がキャンセルするためのリンクの鍵
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE INDEX bookings_by_time ON bookings (shop_id, status, start_at);
