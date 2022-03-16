#!/usr/bin/env bash
# LumaSearch Development Start Script

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "🚀 Starting LumaSearch in development mode..."

# Check if services are running
if ! curl -sf http://localhost:9200/_cluster/health > /dev/null 2>&1; then
  echo "⚠️  Elasticsearch not running. Starting Docker services..."
  docker compose -f infra/docker-compose.yml up -d
  sleep 5
fi

# Start all services with Turborepo
pnpm dev