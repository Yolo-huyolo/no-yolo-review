# Code Generation Rules (v0.2)

This guide explains how Architecto will generate code from specs (coming in v0.2).

## Overview

Spec Files → AI Agent (Claude/GPT) → Code → Framework → Running App

You write Architecto specs, which an AI agent reads along with AI_SYSTEM.md to generate framework-specific code.

## General Rules

### Rule 1: Specs are Contracts

Code must satisfy its spec. If a spec says a flow outputs "markets", the generated function must return "markets" (not "results" or "data").

### Rule 2: Defaults Apply

If a spec doesn't specify a property, use sensible defaults:
- enabled: true — Steps are on by default
- critical: false — Steps are not critical by default
- required: false — Fields are optional by default
- onError: fail — Steps fail on error by default

### Rule 3: Types Must Match

If a spec says a field is uuid, the code must validate UUIDs (not accept arbitrary strings).

If a spec says required: true, the code must enforce it.

### Rule 4: Names Are Preserved

Spec names become code identifiers:
- Flow "ingest-polymarket" → function ingestPolymarket() or ingest_polymarket()
- Artifact "market" → type Market
- Interface "homepage" → component HomePage

### Rule 5: Structure Matters

Workspace specs define file layout. Generated code follows the layout exactly.

If workspace says src/app/page.tsx, create that file (don't put it in src/pages/).

## Flow Code Generation

### Steps become middleware

Each flow step becomes a function call in a pipeline.

Step with:
  id: fetch-api
  action: http.get
  requires: [api_url]
  provides: [raw_data]

Becomes: const rawData = await fetchApi(apiUrl);

### Requires become dependencies

Step requires become function parameters.

### Provides become returns

Step provides become return values.

### Critical steps require try/catch

If critical: true and onError: fail, wrap in error handling and rethrow on failure (don't swallow).

### Disabled steps become conditionals

enabled: false becomes a conditional or feature flag in the generated code.

## Interface Code Generation

### States become conditional renders

Interface states become conditional UI rendering based on state value.

State: loading, loaded, error becomes:
  {state === 'loading' && <Spinner />}
  {state === 'loaded' && <Markets data={markets} />}
  {state === 'error' && <Error message={error} />}

### Actions become event handlers

Interface actions become click handlers or event listeners.

### Components become subcomponents

Interface components become component instances in the render tree.

## Artifact Code Generation

### Fields become types

Artifact fields become TypeScript types.

Field name: id, type: uuid, required: true becomes:
  interface Market {
    id: string; // UUID type (validate format)
  }

### Required fields use required syntax

required: true → non-optional in TypeScript

### Enums become unions or enums

Fields with type: enum and values become:
  type Status = 'open' | 'closed' | 'resolved';

### References become relationships

Field with references: market.id becomes a foreign key in the database schema.

## Policy Code Generation

### Rules become middleware

Policy rules become middleware or decorators.

Rule: applies_to GET /api/markets, action cache-response becomes:
  app.get('/api/markets', cacheMiddleware({ ttl: 60 }), handler);

### Auth rules become guards

Rules with require-auth become authentication middleware or route guards.

## Behavior Code Generation

### Scenarios become tests

Behavior scenarios become test cases in Cypress/Playwright/Jest.

Scenario becomes:
  it('should show markets on homepage', () => {
    cy.seedDatabase({ markets: [...] });
    cy.visit('/');
    cy.contains('Markets').should('be.visible');
  });

## Framework-Specific Mappings

### Next.js
- Interface → app/page.tsx or pages/index.tsx
- Flow → app/api/route.ts
- Artifact → Drizzle/Prisma schema
- Policy → Middleware

### FastAPI
- Interface → Swagger documentation
- Flow → @router.get() endpoint
- Artifact → SQLAlchemy model + Pydantic schema
- Policy → Decorator or dependency

### Vue.js
- Interface → .vue component
- Flow → Service/composable
- Artifact → TypeScript type
- Policy → Router guard

## Error Handling Strategy

Code generation must respect onError rules:

onError: fail → throw error (flow fails)
onError: warn → logger.warn(error) (log and continue)
onError: skip → ignore step (continue as if step didn't run)

## Testing Strategy

Generated code includes:
1. Unit tests for services/utils
2. Integration tests for flows (mock DB/API)
3. E2E tests from behavior specs (real browser)
4. Type safety using TypeScript strict mode

## Anti-Patterns

WRONG: Hardcoding values from specs

WRONG: Ignoring spec constraints (e.g., swallowing errors on critical steps)

WRONG: Inventing names that don't match spec

RIGHT: Use spec values as configuration
RIGHT: Honor all spec constraints
RIGHT: Preserve exact spec names

## Future Work

v0.2 will include:
- Configurable generators per framework
- Custom generator templates
- Schema export (JSON Schema, OpenAPI, Prisma)
- Type generation (TypeScript, Python, Go)
