#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db exec drizzle-kit push
