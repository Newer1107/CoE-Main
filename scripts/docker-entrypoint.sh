#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Applying Prisma migrations..."
  npx prisma migrate deploy
fi

echo "[entrypoint] Starting application..."
exec "$@"
