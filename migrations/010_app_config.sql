-- Migration 010: app_config
-- Generic key/value config table for runtime-tunable settings that we want
-- to flip without redeploying. First use case (v1.9.0): the active AI model
-- (Haiku vs Sonnet) — admins toggle it from /admin and the next AI call
-- picks up the new value. The table is intentionally generic so future
-- toggles (e.g. feature flags, kill switches) reuse the same surface.
--
-- Read path: server/aiModel.ts caches the value in-memory; loads once at
-- startup and is updated synchronously inside the admin POST handler so
-- propagation is instant.

CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
