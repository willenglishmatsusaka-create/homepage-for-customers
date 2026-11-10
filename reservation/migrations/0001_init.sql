-- ATSURAE 予約・顧客管理：初期スキーマ
-- 日付は日本時間の 'YYYY-MM-DD'、時刻は 0時からの分数（例：18:30 → 1110）で持つ。
-- すべての表に store_id を持たせ、複数店舗に対応する。

CREATE TABLE stores (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,          -- URL 用の名前（例：bien-manger）
  name        TEXT NOT NULL,
  name_en     TEXT,
  email       TEXT,                          -- 新着予約の通知先
  phone       TEXT,
  theme       TEXT NOT NULL DEFAULT '{}',    -- 配色などの JSON
  policy      TEXT NOT NULL DEFAULT '{}',    -- 受付ルールの JSON（bookingWindowDays, cutoffMinutes, maxPartyOnline）
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE store_users (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (store_id, email)
);

-- 席の種類（カウンター／テーブル）。席の自動割り当てはせず、席数で在庫を管理する。
CREATE TABLE seat_groups (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id),
  name_ja          TEXT NOT NULL,
  name_en          TEXT NOT NULL,
  capacity         INTEGER NOT NULL,          -- 全体の席数
  online_capacity  INTEGER NOT NULL,          -- ネット予約に出す席数（試行期間は一部だけ出す）
  min_party        INTEGER NOT NULL DEFAULT 1,
  max_party        INTEGER NOT NULL DEFAULT 99,
  sort             INTEGER NOT NULL DEFAULT 0
);

-- 営業枠（ランチ／ディナー）
CREATE TABLE service_periods (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id),
  name_ja       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  weekdays      INTEGER NOT NULL,             -- 営業曜日のビット（日=1, 月=2, 火=4 … 土=64）
  start_times   TEXT NOT NULL,                -- 入店時刻の JSON 配列（分）
  last_entry    INTEGER NOT NULL,             -- 最終入店（分）
  duration      INTEGER NOT NULL,             -- 標準の所要時間（分）
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE courses (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  name_ja         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  description_ja  TEXT,
  description_en  TEXT,
  price           INTEGER,                    -- 税込の円
  duration        INTEGER,                    -- 所要時間（分）。NULL なら営業枠の標準
  min_party       INTEGER NOT NULL DEFAULT 1,
  max_party       INTEGER NOT NULL DEFAULT 99,
  daily_limit     INTEGER,                    -- 1日に受けられる人数。NULL なら制限なし
  period_ids      TEXT NOT NULL DEFAULT '[]', -- 提供する営業枠の JSON 配列
  online          INTEGER NOT NULL DEFAULT 1, -- ネット予約に出すか
  active          INTEGER NOT NULL DEFAULT 1,
  sort            INTEGER NOT NULL DEFAULT 0
);

-- 日付ごとの例外：closed＝臨時休業、open＝定休日に臨時営業、block＝席を閉じる（貸切など）
CREATE TABLE date_overrides (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id),
  date           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('closed', 'open', 'block')),
  period_id      TEXT,                        -- NULL なら終日
  seat_group_id  TEXT,                        -- block のときの対象。NULL なら全席
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_overrides_date ON date_overrides (store_id, date);

CREATE TABLE customers (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id),
  name             TEXT NOT NULL,
  kana             TEXT,
  phone            TEXT,                      -- 国際形式（+81…）
  email            TEXT,
  lang             TEXT NOT NULL DEFAULT 'ja',
  allergies        TEXT,
  preferences      TEXT,
  anniversaries    TEXT NOT NULL DEFAULT '[]',
  notes            TEXT,
  visit_count      INTEGER NOT NULL DEFAULT 0,
  no_show_count    INTEGER NOT NULL DEFAULT 0,
  last_visit_date  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_customers_phone ON customers (store_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_name ON customers (store_id, kana);

-- customer_id には外部キーを付けない（予約を先に保存し、成功したときだけ顧客を作るため）
CREATE TABLE reservations (
  id                 TEXT PRIMARY KEY,
  store_id           TEXT NOT NULL REFERENCES stores(id),
  customer_id        TEXT,
  date               TEXT NOT NULL,
  start_min          INTEGER NOT NULL,
  end_min            INTEGER NOT NULL,
  party_size         INTEGER NOT NULL CHECK (party_size > 0),
  period_id          TEXT,
  course_id          TEXT,
  seat_group_id      TEXT,
  status             TEXT NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('confirmed', 'seated', 'done', 'cancelled', 'no_show')),
  source             TEXT NOT NULL
                     CHECK (source IN ('web', 'phone', 'walkin', 'tablecheck', 'ikyu', 'tabelog', 'other')),
  guest_name         TEXT NOT NULL,           -- 予約時点の名前（顧客情報が変わっても残す）
  guest_note         TEXT,
  staff_note         TEXT,
  lang               TEXT NOT NULL DEFAULT 'ja',
  manage_token_hash  TEXT UNIQUE,             -- お客様用リンクの鍵（ハッシュのみ保存）
  created_by         TEXT NOT NULL,           -- 'guest' または店のユーザー
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reservations_day ON reservations (store_id, date, status);
CREATE INDEX idx_reservations_customer ON reservations (customer_id);

CREATE TABLE reservation_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id        TEXT NOT NULL,
  reservation_id  TEXT NOT NULL,
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL,
  detail          TEXT NOT NULL DEFAULT '{}',
  at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_log_reservation ON reservation_log (reservation_id);

CREATE TABLE notifications (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL,
  reservation_id  TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('confirm', 'remind', 'cancel', 'owner_new', 'owner_cancel')),
  channel         TEXT NOT NULL DEFAULT 'email',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  send_after      TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT,
  error           TEXT
);
CREATE INDEX idx_notifications_pending ON notifications (status, send_after);
