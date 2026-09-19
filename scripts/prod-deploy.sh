#!/usr/bin/env bash
# LumaSearch Production Deployment Script
# Run: ./scripts/prod-deploy.sh [tag]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="${1:-latest}"
REGISTRY="${DOCKER_REGISTRY:-ghcr.io/singhtanishq/luma-search}"

echo "🚀 LumaSearch Production Deploy"
echo "Tag: $TAG"
echo "Registry: $REGISTRY"

# Check prerequisites
if [[ ! -f .env.production ]]; then
  echo "❌ .env.production not found. Copy from .env.example and fill in production values."
  exit 1
fi

# Build images
echo "🔨 Building Docker images..."
docker build -f infra/docker/Dockerfile.base -t "$REGISTRY-base:$TAG" .
docker build -f infra/docker/Dockerfile.api -t "$REGISTRY-api:$TAG" .
docker build -f infra/docker/Dockerfile.worker -t "$REGISTRY-worker:$TAG" .
docker build -f infra/docker/Dockerfile.web -t "$REGISTRY-web:$TAG" .
docker build -f infra/docker/Dockerfile.embeddings -t "$REGISTRY-embeddings:$TAG" .

# Push images
if [[ -n "${DOCKER_REGISTRY:-}" ]]; then
  echo "📤 Pushing images..."
  docker push "$REGISTRY-base:$TAG"
  docker push "$REGISTRY-api:$TAG"
  docker push "$REGISTRY-worker:$TAG"
  docker push "$REGISTRY-web:$TAG"
  docker push "$REGISTRY-embeddings:$TAG"
fi

# Deploy with docker-compose
echo "🚀 Deploying..."
export TAG
export $(cat .env.production | xargs)
docker compose -f infra/docker-compose.prod.yml pull
docker compose -f infra/docker-compose.prod.yml up -d

echo "✅ Deployment complete!"
echo ""
echo "Run migrations:"
echo "  docker compose -f infra/docker-compose.prod.yml exec api pnpm --filter @luma-search/storage db:migrate"
echo ""
echo "Health check:"
echo "  curl http://localhost:4000/health/ready"