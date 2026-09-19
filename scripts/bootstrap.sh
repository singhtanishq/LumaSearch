#!/usr/bin/env bash
# LumaSearch Bootstrap Script
# Run from repo root: ./scripts/bootstrap.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "🔍 LumaSearch Bootstrap"
echo "========================"

# Check prerequisites
check_cmd() {
  if ! command -v "$1" &> /dev/null; then
    echo "❌ $1 not found. Please install $1 first."
    exit 1
  fi
}

check_cmd node
check_cmd pnpm
check_cmd docker
check_cmd docker compose

echo "✅ Prerequisites met"

# Copy .env.example if .env doesn't exist
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "📝 Created .env from .env.example — please edit with your settings"
fi

# Start Docker services
echo "🐳 Starting Docker services..."
docker compose -f infra/docker-compose.yml up -d

# Wait for services
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for Elasticsearch
echo "  Waiting for Elasticsearch..."
for i in {1..30}; do
  if curl -sf http://localhost:9200/_cluster/health > /dev/null 2>&1; then
    echo "  ✅ Elasticsearch ready"
    break
  fi
  sleep 2
done

# Wait for Postgres
echo "  Waiting for PostgreSQL..."
for i in {1..30}; do
  if docker compose -f infra/docker-compose.yml exec -T postgres pg_isready -U luma -d luma_search > /dev/null 2>&1; then
    echo "  ✅ PostgreSQL ready"
    break
  fi
  sleep 2
done

# Wait for Redis
echo "  Waiting for Redis..."
for i in {1..30}; do
  if docker compose -f infra/docker-compose.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "  ✅ Redis ready"
    break
  fi
  sleep 2
done

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

# Generate Prisma client
echo "🗄️ Generating Prisma client..."
pnpm --filter @luma-search/storage db:generate

# Run database migrations
echo "🗄️ Running database migrations..."
pnpm --filter @luma-search/storage db:migrate

# Build all packages
echo "🔨 Building all packages..."
pnpm build

echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys (OpenAI, Anthropic, etc.) if needed"
echo "  2. Start development: pnpm dev"
echo "  3. Or start production: docker compose -f infra/docker-compose.yml up -d"
echo ""
echo "Services:"
echo "  - Web UI:     http://localhost:3000"
echo "  - API:        http://localhost:4000"
echo "  - Admin:      http://localhost:4001"
echo "  - Elasticsearch: http://localhost:9200"