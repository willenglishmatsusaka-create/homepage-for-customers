-- 通知の送信：二重送信を防ぐための「送信中」と、失敗したときの再送回数を足す。
-- SQLite は CHECK 制約を変えられないので、表を作り直して中身を移す。

CREATE TABLE notifications_new (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL,
  reservation_id  TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('confirm', 'remind', 'cancel', 'owner_new', 'owner_cancel')),
  channel         TEXT NOT NULL DEFAULT 'email',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  send_after      TEXT NOT NULL DEFAULT (datetime('now')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  claimed_at      TEXT,                       -- 送信を始めた時刻（止まったものを拾い直すため）
  sent_at         TEXT,
  provider_id     TEXT,                       -- 送信サービス側の ID
  error           TEXT
);

INSERT INTO notifications_new (id, store_id, reservation_id, kind, channel, status, send_after, sent_at, error)
  SELECT id, store_id, reservation_id, kind, channel, status, send_after, sent_at, error FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX idx_notifications_pending ON notifications (status, send_after);
CREATE INDEX idx_notifications_reservation ON notifications (reservation_id);
