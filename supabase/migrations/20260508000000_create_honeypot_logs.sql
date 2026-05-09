-- Migration: create honeypot_logs table
-- Records every hit to /api/honeypot for IP analysis and audit.

CREATE TABLE IF NOT EXISTS honeypot_logs (
  id         BIGSERIAL PRIMARY KEY,
  ip         TEXT        NOT NULL DEFAULT '',
  user_agent TEXT        NOT NULL DEFAULT '',
  referer    TEXT        NOT NULL DEFAULT '',
  ts         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for IP-based lookups
CREATE INDEX IF NOT EXISTS honeypot_logs_ip_idx ON honeypot_logs (ip);
CREATE INDEX IF NOT EXISTS honeypot_logs_ts_idx  ON honeypot_logs (ts DESC);
