# Policy Spec Reference

## Purpose

Policy specs describe **execution rules and constraints**. They define how your system behaves under certain conditions (caching, authentication, rate limiting, error handling).

## Structure

```yaml
kind: policy
name: policy-name
version: "0.1.0"
description: What this policy enforces

rules:
  - id: rule-id
    description: What this rule does
    applies_to: target  # flow/route/endpoint name
    condition: when to apply
    action: what to do
```

## Fields

### `kind: policy`
Required. Always "policy".

### `name`
Required. Unique policy name. Use kebab-case.

Examples:
- `cache`
- `cron`
- `public-api`
- `authentication`

### `rules`
Optional. List of rules this policy defines.

Each rule has:

#### `id`
Required. Rule identifier (kebab-case).

#### `description`
Optional. What this rule enforces.

#### `applies_to`
Optional. What this rule applies to.

Targets:
- Flow name: `ingest-polymarket`
- Route/endpoint: `GET /api/markets`, `POST /api/trades`
- Pattern: `GET /api/*`, `/api/cron/*`
- Component: `homepage`, `market-detail`

#### `condition`
Optional. When to apply the rule.

Examples:
- `cache_ttl_seconds == 60`
- `request.headers.authorization exists`
- `interval_minutes == 2`
- `user.is_authenticated`

#### `action`
Optional. What to do.

Common actions:
- `cache-response` — Cache the response
- `allow` — Allow access
- `deny` — Deny access
- `require-auth` — Require authentication
- `rate-limit` — Apply rate limit
- `trigger-flow` — Trigger a flow
- `pass-through` — Don't cache

## Examples

### Cache Policy

```yaml
kind: policy
name: cache
version: "0.1.0"
description: Cache rules for API responses

rules:
  - id: markets-list-cache
    description: Cache GET /api/markets for 60 seconds
    applies_to: GET /api/markets
    condition: cache_ttl_seconds == 60
    action: cache-response

  - id: market-detail-cache
    description: Cache GET /api/markets/[slug] for 30 seconds
    applies_to: GET /api/markets/[slug]
    condition: cache_ttl_seconds == 30
    action: cache-response

  - id: price-history-no-cache
    description: Don't cache price history (real-time data)
    applies_to: GET /api/markets/[slug]/history
    action: pass-through
```

### Cron Policy

```yaml
kind: policy
name: cron
version: "0.1.0"
description: Rules for scheduled jobs

rules:
  - id: polymarket-every-2-minutes
    description: Fetch from Polymarket every 2 minutes
    applies_to: ingest-polymarket
    condition: interval_minutes == 2
    action: trigger-flow

  - id: kalshi-every-2-minutes
    description: Fetch from Kalshi every 2 minutes
    applies_to: ingest-kalshi
    condition: interval_minutes == 2
    action: trigger-flow
```

### Authentication Policy

```yaml
kind: policy
name: public-api
version: "0.1.0"
description: Who can access what

rules:
  - id: markets-public
    description: Markets list is public
    applies_to: GET /api/markets
    action: allow

  - id: watchlist-protected
    description: Watchlist requires authentication
    applies_to: GET /api/watchlist/*
    condition: user.is_authenticated
    action: allow

  - id: admin-only
    description: Admin routes require admin role
    applies_to: POST /api/admin/*
    condition: user.role == "admin"
    action: allow
```

## Validation Rules

Architecto validates:

1. **Required fields:** `kind`, `name`
2. **Rules:** Each rule must have `id`
3. **Rule syntax:** `applies_to` and `action` should be recognizable

## Code Generation

Policy specs generate:

- **Middleware** (caching, auth, rate limiting)
- **Decorators** (@Cached, @RequireAuth)
- **Configuration** (TTL, rate limits)
- **Route guards** (Auth checks)

Example generation (Express):

```typescript
// Generated from cache policy
import { CacheMiddleware } from './middleware/cache';

// Apply cache to /api/markets
app.get('/api/markets',
  CacheMiddleware({ ttl: 60 }), // from policy rule
  handler
);

// Apply cache to /api/markets/:slug
app.get('/api/markets/:slug',
  CacheMiddleware({ ttl: 30 }), // from policy rule
  handler
);

// Don't cache /api/markets/:slug/history
app.get('/api/markets/:slug/history',
  handler // no cache middleware
);
```

## Anti-Patterns

### ❌ Policy in spec field

```yaml
kind: flow
name: ingest-polymarket
description: "Must cache results for 60 seconds before saving"
```

Issue: Caching is a policy, not a flow property.

### ✅ Correct

```yaml
kind: policy
name: cache
rules:
  - id: ingest-cache
    applies_to: ingest-polymarket
    action: cache-response
    condition: cache_ttl_seconds == 60
```

### ❌ Implementation detail

```yaml
rules:
  - id: redis-cache
    description: "Use Redis with key expiry of 60 seconds"
```

Issue: "Redis" is implementation detail. Spec should describe what to do, not how.

### ✅ Correct

```yaml
rules:
  - id: cache-markets
    description: "Cache market data for 60 seconds"
    action: cache-response
    condition: cache_ttl_seconds == 60
```

## Learn More

- [Spec Types Overview](./spec-types.md)
- [Flow Spec](./flow-spec.md) — How flows handle errors
