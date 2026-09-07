# Workspace Spec Reference

## Purpose

Workspace specs describe **folder structure and file generation mappings**. They define where generated code should live and how specs map to files.

## Structure

```yaml
kind: workspace
name: workspace-name
version: "0.1.0"
description: Folder structure for generated code

structure:
  - path: path/to/file.ts
    description: What this file does
    generated_from: spec-file-name.yaml
    generate_with: generator-type
```

## Fields

### `kind: workspace`
Required. Always "workspace".

### `name`
Required. Project/workspace name. Use kebab-case.

Examples:
- `prediction-market-dashboard`
- `my-startup-api`
- `ecommerce-site`

### `structure`
List of files/folders and their generation mappings.

Each item has:

#### `path`
Required. Where to generate the file.

Use relative paths from project root:
- `src/app/page.tsx` — React page
- `src/db/schema/market.ts` — DB schema
- `src/api/markets/route.ts` — API route

#### `description`
Optional. What this file does.

#### `generated_from`
Optional. Which spec generates this file.

Examples:
- `homepage.interface.yaml` — Interface spec
- `market.artifact.yaml` — Artifact spec
- `ingest-polymarket.flow.yaml` — Flow spec
- `cache.policy.yaml` — Policy spec

#### `generate_with`
Optional. Template or generator to use.

Examples (framework-specific):
- `nextjs-page` — Next.js page component
- `nextjs-api-route` — Next.js API route
- `drizzle-schema` — Drizzle ORM schema
- `zod-schema` — Zod validation schema
- `service-class` — Service/client class
- `react-component` — React component
- `vue-component` — Vue component

## Examples

### Next.js Project

```yaml
kind: workspace
name: prediction-market-dashboard
version: "0.1.0"
description: Next.js + Drizzle application

structure:
  # Pages (from Interface specs)
  - path: src/app/page.tsx
    description: Homepage
    generated_from: homepage.interface.yaml
    generate_with: nextjs-page

  - path: src/app/market/[slug]/page.tsx
    description: Market detail page
    generated_from: market-detail.interface.yaml
    generate_with: nextjs-page

  # API Routes (from Flow specs)
  - path: src/app/api/markets/route.ts
    description: GET /api/markets endpoint
    generated_from: load-homepage.flow.yaml
    generate_with: nextjs-api-route

  - path: src/app/api/markets/[slug]/route.ts
    description: GET /api/markets/[slug] endpoint
    generated_from: load-market-detail.flow.yaml
    generate_with: nextjs-api-route

  - path: src/app/api/markets/[slug]/history/route.ts
    description: Price history endpoint
    generated_from: price-history.artifact.yaml
    generate_with: nextjs-api-route

  # Cron Routes (from Flow specs)
  - path: src/app/api/cron/polymarket/route.ts
    description: Polymarket ingestion cron
    generated_from: ingest-polymarket.flow.yaml
    generate_with: nextjs-cron-route

  - path: src/app/api/cron/kalshi/route.ts
    description: Kalshi ingestion cron
    generated_from: ingest-kalshi.flow.yaml
    generate_with: nextjs-cron-route

  # Database Schemas (from Artifact specs)
  - path: src/db/schema/markets.ts
    description: Markets table schema
    generated_from: market.artifact.yaml
    generate_with: drizzle-schema

  - path: src/db/schema/market-platforms.ts
    description: Market platforms table schema
    generated_from: market-platform.artifact.yaml
    generate_with: drizzle-schema

  - path: src/db/schema/price-history.ts
    description: Price history table schema
    generated_from: price-history.artifact.yaml
    generate_with: drizzle-schema

  # Services (from Flow specs)
  - path: src/services/polymarket.ts
    description: Polymarket API client
    generated_from: ingest-polymarket.flow.yaml
    generate_with: service-class

  - path: src/services/kalshi.ts
    description: Kalshi API client
    generated_from: ingest-kalshi.flow.yaml
    generate_with: service-class

  # Types (from Artifact specs)
  - path: src/types/market.ts
    description: Market TypeScript type
    generated_from: market.artifact.yaml
    generate_with: typescript-type

  - path: src/types/price-history.ts
    description: Price history TypeScript type
    generated_from: price-history.artifact.yaml
    generate_with: typescript-type
```

### FastAPI Project

```yaml
kind: workspace
name: prediction-market-api
version: "0.1.0"
description: FastAPI backend

structure:
  - path: app/routes/markets.py
    description: GET /markets endpoint
    generated_from: load-homepage.flow.yaml
    generate_with: fastapi-router

  - path: app/routes/market_detail.py
    description: GET /markets/{slug} endpoint
    generated_from: load-market-detail.flow.yaml
    generate_with: fastapi-router

  - path: app/models/market.py
    description: Market SQLAlchemy model
    generated_from: market.artifact.yaml
    generate_with: sqlalchemy-model

  - path: app/schemas/market.py
    description: Market Pydantic schema
    generated_from: market.artifact.yaml
    generate_with: pydantic-schema

  - path: app/services/polymarket.py
    description: Polymarket ingestion service
    generated_from: ingest-polymarket.flow.yaml
    generate_with: service-class

  - path: app/tasks/cron_polymarket.py
    description: Polymarket periodic task
    generated_from: ingest-polymarket.flow.yaml
    generate_with: celery-task
```

## Validation Rules

Architecto validates:

1. **Required fields:** `kind`, `name`
2. **Structure:** Each structure item must have `path`
3. **Uniqueness:** All paths should be unique (no two files to same location)

## Code Generation (v0.2)

In v0.1, workspace specs are informational (describe structure). In v0.2, they will drive code generation:

```bash
architecto generate --workspace workspace.structure.yaml
```

This will:
1. Read all referenced specs
2. Create folders
3. Generate files using specified generators
4. Return list of generated files

## Best Practices

1. **Use consistent paths** — Choose a framework convention (Next.js app dir, src/pages, etc.)
2. **Group by concern** — Keep related files together (schemas, routes, services)
3. **Be explicit** — Include all files that will be generated (not just some)
4. **Add descriptions** — Explain what each file does
5. **Reference specs** — Always include `generated_from` and `generate_with`

## Anti-Patterns

### ❌ Ambiguous generators

```yaml
structure:
  - path: src/market.ts
    generate_with: component
```

Issue: Is this a React component? Vue component? Service class? Be specific.

### ✅ Correct

```yaml
structure:
  - path: src/components/market.tsx
    generate_with: react-component

  - path: src/services/market.ts
    generate_with: service-class
```

### ❌ Orphan specs

```yaml
# spec defines: homepage.interface.yaml
# but workspace never references it
```

This is fine for v0.1 (informational), but in v0.2 orphan specs won't be generated.

## Learn More

- [Spec Types Overview](./spec-types.md)
- [Code Generation Rules](./generation-rules.md) — How generators work
