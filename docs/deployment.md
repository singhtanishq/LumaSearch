# LumaSearch Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- 4GB+ RAM (8GB recommended for Elasticsearch)
- 20GB+ disk space
- Domain name with DNS configured (for production HTTPS)

## Local Development

```bash
# One-command bootstrap
./scripts/bootstrap.sh

# Or manually:
docker compose -f infra/docker-compose.yml up -d
pnpm install && pnpm build && pnpm dev
```

### Service Ports (Local)

| Service | Port | Internal |
|---------|------|----------|
| Web | 3000 | 3000 |
| API | 4000 | 4000 |
| Admin | 4001 | 4001 |
| Elasticsearch | 9200 | 9200 |
| Embeddings | 8000 | 8000 |
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |

## Production Deployment

### 1. Prepare Environment

```bash
# Copy and edit production config
cp .env.example .env.production
# Edit .env.production with production values:
# - Strong JWT_SECRET, SESSION_SECRET, CSRF_SECRET
# - Production DATABASE_URL (managed Postgres recommended)
# - Production REDIS_URL (managed Redis recommended)
# - Production ELASTICSEARCH_URL (Elastic Cloud or self-hosted cluster)
# - LLM_PROVIDER and API keys
# - SESSION_COOKIE_SECURE=true
```

### 2. Build and Push Images

```bash
# Build
docker build -f infra/docker/Dockerfile.base -t luma-base:latest .
docker build -f infra/docker/Dockerfile.api -t luma-api:latest .
docker build -f infra/docker/Dockerfile.worker -t luma-worker:latest .
docker build -f infra/docker/Dockerfile.web -t luma-web:latest .
docker build -f infra/docker/Dockerfile.embeddings -t luma-embeddings:latest .

# Tag and push to registry
docker tag luma-base:latest ghcr.io/your-org/luma-base:latest
docker push ghcr.io/your-org/luma-base:latest
# ... repeat for all images
```

### 3. Deploy with Docker Compose

```bash
# Set required env vars
export TAG=latest
export $(cat .env.production | xargs)

# Deploy
docker compose -f infra/docker-compose.prod.yml pull
docker compose -f infra/docker-compose.prod.yml up -d

# Run migrations
docker compose -f infra/docker-compose.prod.yml exec api \
  pnpm --filter @luma-search/storage db:migrate
```

### 4. Reverse Proxy (Nginx Example)

```nginx
# /etc/nginx/sites-available/luma-search
server {
    listen 80;
    server_name search.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name search.example.com;

    ssl_certificate /etc/letsencrypt/live/search.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/search.example.com/privkey.pem;

    # Web UI
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin
    location /admin/ {
        proxy_pass http://localhost:4001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. TLS with Let's Encrypt

```bash
certbot --nginx -d search.example.com
```

## Kubernetes (Optional)

See `infra/kubernetes/` for manifests:
- Deployments for api, worker, web, embeddings
- Services and Ingress
- ConfigMaps for configuration
- Secrets for sensitive values
- HorizontalPodAutoscaler for workers

## Health Checks

```bash
# Liveness
curl http://localhost:4000/health/live

# Readiness (checks DB, ES, memory)
curl http://localhost:4000/health/ready

# Metrics (Prometheus)
curl http://localhost:4000/metrics
```

## Backup & Restore

### Database
```bash
# Backup
docker compose exec postgres pg_dump -U luma luma_search > backup_$(date +%F).sql

# Restore
cat backup_2024-01-15.sql | docker compose exec -T postgres psql -U luma luma_search
```

### Elasticsearch Snapshots
```bash
# Register repository
curl -X PUT "localhost:9200/_snapshot/luma_backup" -H 'Content-Type: application/json' -d'
{
  "type": "fs",
  "settings": { "location": "/mnt/backups/elasticsearch" }
}'

# Create snapshot
curl -X PUT "localhost:9200/_snapshot/luma_backup/snapshot_$(date +%F)?wait_for_completion=true"

# Restore
curl -X POST "localhost:9200/_snapshot/luma_backup/snapshot_2024-01-15/_restore?wait_for_completion=true"
```

## Upgrading

```bash
# 1. Pull new images
docker compose -f infra/docker-compose.prod.yml pull

# 2. Run migrations (if any)
docker compose -f infra/docker-compose.prod.yml exec api \
  pnpm --filter @luma-search/storage db:migrate

# 3. Rolling restart
docker compose -f infra/docker-compose.prod.yml up -d --force-recreate

# 4. Verify
curl http://localhost:4000/health/ready
```

## Rollback

```bash
# Tag previous version
export TAG=previous-tag

# Redeploy
docker compose -f infra/docker-compose.prod.yml up -d --force-recreate
docker compose -f infra/docker-compose.prod.yml exec api \
  pnpm --filter @luma-search/storage db:migrate
```

## Monitoring

- **Prometheus**: Scrape `/metrics` on port 4000
- **Grafana**: Import dashboards for Fastify, Node.js, Elasticsearch
- **Alerting**: Alert on `health_check_status{status="down"}`, queue depth, error rates

## Troubleshooting

| Issue | Solution |
|-------|----------|
| ES out of memory | Increase `ES_JAVA_OPTS=-Xms2g -Xmx2g` |
| Queue stuck | Check worker logs, restart worker service |
| DB connection refused | Verify `DATABASE_URL`, check Postgres health |
| Crawler not indexing | Check robots.txt, SSRF logs, circuit breaker status |
| AI answers fail | Verify `LLM_PROVIDER` and API keys |

## Scaling

| Component | Scaling Strategy |
|-----------|------------------|
| API | Horizontal (stateless), add replicas behind LB |
| Workers | Horizontal per queue type, increase concurrency |
| Elasticsearch | Add data nodes, increase shards/replicas |
| PostgreSQL | Read replicas, connection pooling (PgBouncer) |
| Redis | Cluster mode for high throughput |