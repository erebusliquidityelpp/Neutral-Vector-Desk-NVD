-- Neutral Vector Desk backend schema. Idempotent: safe to run every deploy.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange      TEXT NOT NULL,              -- 'hyperliquid' | 'binance' | 'bybit' | 'okx' | 'deribit' | 'coinbase'
  label         TEXT,                        -- optional nickname, e.g. "Main account"
  testnet       BOOLEAN NOT NULL DEFAULT false,
  -- Every secret field below is AES-256-GCM encrypted at rest (see lib/crypto.js). Never stored
  -- or returned in plaintext. For hyperliquid, "api_key_enc" holds the wallet address (not secret)
  -- and "api_secret_enc" holds the encrypted EVM private key.
  api_key_enc      TEXT,
  api_secret_enc   TEXT NOT NULL,
  passphrase_enc   TEXT,                      -- OKX/Coinbase need a third credential
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange, testnet)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id              TEXT PRIMARY KEY,            -- client-generated id (jt_...), kept stable across sync
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at       BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  strat_id        TEXT,
  strat_name      TEXT,
  asset           TEXT,
  ccy             TEXT,
  spot            DOUBLE PRECISION,
  qty             INTEGER,
  mult            DOUBLE PRECISION,
  legs            JSONB,
  max_profit      DOUBLE PRECISION,
  max_loss        DOUBLE PRECISION,
  breakevens      JSONB,
  net_is_debit    BOOLEAN,
  net_amount      DOUBLE PRECISION,
  signal_snapshot JSONB,
  closed_at       BIGINT,
  exit_spot       DOUBLE PRECISION,
  realized_pnl    DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strat_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, strat_id)
);
