# AI System Prompt for Architecto

This file guides AI agents (Claude, GPT, etc.) on how to read and materialize Architecto specs.

## Context

You are reading a software architecture defined as Architecto specs. Architecto is an AI-first declarative architecture protocol. Specs are the source of truth — code is materialization.

The 6 spec kinds are:

- **Flow** — Orchestration, data pipelines, step dependencies
- **Interface** — UI structure, states, user actions, components
- **Artifact** — Data contracts, schemas, field definitions
- **Policy** — Execution rules, caching, auth, rate limiting
- **Behavior** — Acceptance scenarios (given/when/then)
- **Workspace** — Folder structure and generation mappings

## How to Read Specs

1. **Start with workspace.yaml** — understand the folder structure and what needs to be generated
2. **Read interface specs** — understand what the user sees and interacts with
3. **Read flow specs** — understand orchestration and data movement
4. **Read artifact specs** — understand data contracts (DB schemas, API payloads)
5. **Read policy specs** — understand constraints (caching, auth, rate limits)
6. **Read behavior specs** — understand acceptance criteria

## Spec Format

Specs are YAML files with this structure:

```yaml
kind: flow|interface|artifact|policy|behavior|workspace
name: human-readable-name
version: "X.Y.Z"
description: Optional description
# kind-specific fields follow...
```

Every spec has `kind`, `name`, and optionally `version` and `description`.

## Flow Specs (Orchestration)

```yaml
kind: flow
name: load-homepage
inputs:
  - request_params
outputs:
  - page_data
steps:
  - id: query-markets
    action: db.query
    requires:
      - request_params
    provides:
      - markets
    critical: true
    onError: fail
```

- `inputs` — data the flow receives
- `steps` — tasks in order
- `provides` — what each step outputs
- `requires` — what each step needs
- `critical: true` — step must succeed (onError must be "fail")
- `enabled: false` — skip this step (don't use if downstream steps need its output)

When generating code:
- Create functions/routes that accept `inputs`
- Call services/queries in step order
- Return `outputs`
- Handle errors according to `onError`

## Interface Specs (UI)

```yaml
kind: interface
name: homepage
route: /
states:
  - id: loading
  - id: loaded
actions:
  - id: filter-by-category
    triggers: reload-events
components:
  - id: top-movers
    type: section
```

- `states` — UI states (loading, loaded, error, etc.)
- `actions` — user actions (click, submit, filter, etc.)
- `components` — UI elements (sections, tables, modals, etc.)
- `route` — URL path (use `[slug]` for dynamic segments)

When generating code:
- Create React/Vue/Svelte components
- Implement state transitions
- Add event handlers for actions
- Render components

## Artifact Specs (Data)

```yaml
kind: artifact
name: market
fields:
  - name: id
    type: uuid
    required: true
  - name: title
    type: string
    required: true
  - name: yes_probability
    type: float
    required: true
```

- `fields` — data structure
- `type` — field type (string, uuid, float, boolean, timestamp, enum, etc.)
- `required` — true/false
- `references` — foreign key reference (e.g., "other_artifact.id")

When generating code:
- Create database tables/schemas
- Create TypeScript interfaces
- Create ORM models (Drizzle, Prisma, etc.)
- Validate data at API boundaries

## Policy Specs (Rules)

```yaml
kind: policy
name: cache
rules:
  - id: markets-cache
    applies_to: GET /api/markets
    condition: cache_ttl_seconds == 60
    action: cache-response
```

- `rules` — named rules with IDs
- `applies_to` — HTTP method/route or flow/component name
- `action` — what to do (cache-response, allow, deny, rate-limit, require-auth)

When generating code:
- Add middleware for caching
- Add authentication checks
- Add rate limiting
- Add logging/monitoring

## Behavior Specs (Acceptance)

```yaml
kind: behavior
name: homepage
scenarios:
  - id: shows-top-movers
    given: Markets have price changes in the last 24h
    when: User visits the homepage
    then: Top 5 movers are displayed sorted by change
```

- `scenarios` — test cases in Gherkin format
- `given` — precondition
- `when` — action
- `then` — expected result

When generating code:
- Create test cases (Cypress, Playwright, Vitest)
- Implement integration tests
- Verify acceptance criteria

## Workspace Specs (Structure)

```yaml
kind: workspace
name: my-app
structure:
  - path: src/app/page.tsx
    generated_from: homepage.interface.yaml
    generate_with: nextjs-page
  - path: src/db/schema/market.ts
    generated_from: market.artifact.yaml
    generate_with: drizzle-schema
```

- `structure` — file/folder layout
- `path` — where to create the file
- `generated_from` — which spec to materialize
- `generate_with` — template/generator to use

When generating code:
- Create folders
- Generate files according to mappings
- Use language-appropriate generators

## Key Rules

1. **Specs are truth** — If spec says flow must complete in 5 seconds, enforce it. If spec says interface has a "loading" state, implement it.
2. **No business logic in specs** — Specs describe structure. Business logic (sorting algorithm, pricing formula) lives in code.
3. **Required fields matter** — If a flow step is `critical: true`, it must not fail. If a field is `required: true`, validate it.
4. **Ports are inputs/outputs** — Treat flow `inputs` and `outputs` as function parameters/returns. Don't hardcode data.
5. **Actions are events** — Interface actions should be wired to actual handlers that trigger flows.

## Example: Homepage Flow

```yaml
kind: flow
name: load-homepage
inputs: []
outputs:
  - markets
  - categories
steps:
  - id: query-top-movers
    action: db.query
    provides:
      - top_movers
    critical: true
  - id: query-all-markets
    action: db.query
    provides:
      - all_markets
    critical: true
  - id: compose-markets
    action: compose
    requires:
      - top_movers
      - all_markets
    provides:
      - markets
```

When you see this, generate:

```typescript
// pages/api/homepage.ts
export async function handler(req, res) {
  const topMovers = await db.query('SELECT ... ORDER BY change_24h DESC LIMIT 5');
  const allMarkets = await db.query('SELECT ...');
  const markets = {
    topMovers,
    allMarkets,
  };
  return res.json(markets);
}
```

## Anti-Patterns

Don't:
- Put business logic in specs (`amount = quantity * price` — this goes in code)
- Reference specs that don't exist (flows shouldn't use artifacts that aren't defined)
- Ignore critical steps (if `critical: true`, treat as non-optional)
- Hardcode values (use flow inputs instead)
- Implement features not in specs (stick to spec boundaries)

Do:
- Ask for missing specs before implementing
- Validate that all references exist
- Treat specs as contracts
- Ask clarifying questions if specs are ambiguous
- Test according to behavior specs

## When You're Stuck

If a spec is unclear or missing:
1. Ask the user for clarification
2. Check if it's documented in the DSL guides
3. Look for similar patterns in other specs
4. Propose what you think it means and ask for confirmation

Specs are written by humans and may be incomplete. AI should help fill gaps intelligently while staying true to spec intent.
