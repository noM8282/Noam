#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db exec drizzle-kit push

# Create the connect-pg-simple sessions table if it doesn't exist
psql $DATABASE_URL << 'SQL'
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");
SQL
