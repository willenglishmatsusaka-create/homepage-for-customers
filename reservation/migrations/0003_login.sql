-- 店主・スタッフのログイン：メールで届くリンク（または6桁のコード）で入る。パスワードは持たない。

-- ログイン用のリンクとコード（15分で切れる・1回だけ使える）。どちらもハッシュだけを保存する
CREATE TABLE login_tokens (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,  -- コードの入力回数（5回で使えなくする）
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_tokens_email ON login_tokens (email, created_at);

-- ログイン中の端末。クッキーの値のハッシュだけを保存する
CREATE TABLE sessions (
  id_hash       TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX idx_sessions_email ON sessions (email);

CREATE INDEX idx_store_users_email ON store_users (email);
