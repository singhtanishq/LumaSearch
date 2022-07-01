# LumaSearch API Reference

## Base URL

```
http://localhost:4000/api/v1
```

## Authentication

- **Public endpoints**: No auth required (search, answer)
- **Admin endpoints**: Require session cookie or API key
- **API Key**: `Authorization: Bearer luma_xxxxx`

## Endpoints

### Health

#### GET `/health/live`
Liveness probe - always returns 200 if process is running.

**Response:**
```json
{ "status": "ok" }
```

#### GET `/health/ready`
Readiness probe - checks dependencies.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptimeSeconds": 3600,
  "checks": {
    "database": { "status": "ok", "latencyMs": 5 },
    "elasticsearch": { "status": "ok", "latencyMs": 12, "detail": "cluster=green version=8.14.1" },
    "memory": { "status": "ok", "latencyMs": 0, "detail": "245MB" }
  }
}
```

### Search

#### POST `/search`

Execute a search query.

**Request:**
```json
{
  "q": "typescript tutorial site:github.com",
  "profile": "hybrid",
  "filters": {
    "domains": ["github.com"],
    "languages": ["en"],
    "dateFrom": "2023-01-01",
    "dateTo": "2024-12-31"
  },
  "limit": 10,
  "offset": 0,
  "debug": false
}
```

**Response:**
```json
{
  "query": "typescript tutorial site:github.com",
  "interpretation": {
    "original": "typescript tutorial site:github.com",
    "normalized": "typescript tutorial",
    "operators": {
      "phrases": [],
      "exclusions": [],
      "site": "github.com",
      "filetype": null,
      "intitle": [],
      "inurl": [],
      "before": null,
      "after": null,
      "lang": null
    },
    "detectedIntent": "informational",
    "language": "en",
    "corrections": [],
    "confidence": 0.8
  },
  "results": [
    {
      "id": "doc_abc123",
      "url": "https://github.com/microsoft/TypeScript",
      "canonicalUrl": "https://github.com/microsoft/TypeScript",
      "title": "TypeScript - GitHub",
      "snippet": "TypeScript is a strongly typed programming language...",
      "domain": "github.com",
      "vertical": "web",
      "language": "en",
      "publishedAt": "2024-02-01T00:00:00Z",
      "crawledAt": "2024-06-15T10:30:00Z",
      "score": 12.45,
      "highlights": [
        { "field": "title", "fragments": ["<mark>TypeScript</mark>"] },
        { "field": "content", "fragments": ["...<mark>TypeScript</mark> is a strongly typed..."] }
      ],
      "source": "local-index"
    }
  ],
  "total": 1,
  "took": 45,
  "profile": "hybrid",
  "facets": {
    "domains": [{ "value": "github.com", "count": 1 }],
    "languages": [{ "value": "en", "count": 1 }]
  }
}
```

### AI Answer

#### POST `/answer`

Generate an AI answer with citations from search evidence.

**Request:**
```json
{
  "q": "What is TypeScript?",
  "profile": "research",
  "filters": {},
  "mode": "answer"
}
```

**Response:**
```json
{
  "answer": "TypeScript is a strongly typed programming language that builds on JavaScript, adding static type definitions... [1][2]",
  "citations": [
    {
      "id": "cite_1",
      "resultId": "doc_abc123",
      "url": "https://github.com/microsoft/TypeScript",
      "title": "TypeScript - GitHub",
      "passage": "TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.",
      "crawledAt": "2024-06-15T10:30:00Z"
    }
  ],
  "confidence": "high",
  "contradictions": [],
  "coverage": 0.8,
  "model": "gpt-4o-mini",
  "tokensUsed": { "prompt": 1234, "completion": 567 },
  "took": 2450,
  "cached": false
}
```

### Crawl Jobs

#### POST `/crawl/jobs`

Create a new crawl job.

**Request:**
```json
{
  "seeds": ["https://example.com", "https://docs.example.com"],
  "maxPages": 1000,
  "maxDepth": 3,
  "name": "Example.com crawl"
}
```

**Response:**
```json
{
  "jobId": "cm8x7y2z9",
  "status": "pending"
}
```

#### GET `/crawl/jobs/:id`

Get crawl job status.

**Response:**
```json
{
  "id": "cm8x7y2z9",
  "name": "Example.com crawl",
  "seeds": ["https://example.com"],
  "status": "running",
  "maxPages": 1000,
  "maxDepth": 3,
  "createdAt": "2024-06-15T10:00:00Z",
  "startedAt": "2024-06-15T10:00:05Z",
  "stats": {
    "discovered": 523,
    "fetched": 412,
    "succeeded": 398,
    "failed": 14,
    "deduplicated": 45,
    "indexed": 398
  }
}
```

### Index Management

#### GET `/index/status`

Get index statistics for all verticals.

**Response:**
```json
{
  "web": {
    "activeIndex": "luma_web_v1718456700000",
    "docs": 15420,
    "sizeBytes": 2147483648
  },
  "code": {
    "activeIndex": "luma_code_v1718456700000",
    "docs": 3200,
    "sizeBytes": 536870912
  },
  "docs": {
    "activeIndex": "luma_docs_v1718456700000",
    "docs": 890,
    "sizeBytes": 1073741824
  }
}
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/search` | 30 req | 60s |
| `/answer` | 10 req | 60s |
| `/crawl/jobs` | 5 req | 60s |
| Auth endpoints | 5 req | 60s |

## Error Responses

```json
{
  "error": "Invalid query",
  "details": [
    { "field": "q", "message": "Query is required" }
  ]
}
```

HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error
- `503` - Service Unavailable (AI disabled, ES down)