# Spec Types Overview

Architecto defines 6 spec kinds, each describing a different aspect of your system.

## Flow

**Purpose:** Describe orchestration, data pipelines, and step dependencies.

**When to use:** When you need to describe how data moves through your system, what steps execute, and in what order.

**Key fields:**
- `inputs` — data the flow receives
- `steps` — list of tasks
- `outputs` — data the flow produces

**Example:**
```yaml
kind: flow
name: ingest-polymarket
inputs:
  - api_base_url
outputs:
  - ingested_count
steps:
  - id: fetch
    action: http.get
    provides:
      - raw_markets
```

## Interface

**Purpose:** Describe UI screens, states, user actions, and components.

**When to use:** When you need to describe what users see, how they interact with the system, and what the UI states are.

**Key fields:**
- `route` — URL path
- `states` — possible UI states (loading, loaded, error)
- `actions` — user interactions (click, submit, filter)
- `components` — UI elements

**Example:**
```yaml
kind: interface
name: homepage
route: /
states:
  - id: loading
  - id: loaded
actions:
  - id: filter-by-category
components:
  - id: markets-table
    type: table
```

## Artifact

**Purpose:** Describe data contracts and schemas.

**When to use:** When you need to define what data looks like (database tables, API payloads, event messages).

**Key fields:**
- `fields` — data structure

**Example:**
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
```

## Policy

**Purpose:** Describe execution rules, constraints, and system-wide behavior.

**When to use:** When you need to define how steps are executed (caching, authentication, rate limits, error handling).

**Key fields:**
- `rules` — named rules with conditions and actions

**Example:**
```yaml
kind: policy
name: cache
rules:
  - id: markets-cache
    applies_to: GET /api/markets
    condition: cache_ttl_seconds == 60
    action: cache-response
```

## Behavior

**Purpose:** Describe acceptance scenarios and test cases.

**When to use:** When you need to define what success looks like (from a user's perspective).

**Key fields:**
- `scenarios` — test cases in given/when/then format

**Example:**
```yaml
kind: behavior
name: homepage
scenarios:
  - id: shows-top-movers
    given: Markets have price changes
    when: User visits homepage
    then: Top 5 movers are displayed
```

## Workspace

**Purpose:** Describe folder structure and generation mappings.

**When to use:** When you need to define where generated code should live and how specs map to files.

**Key fields:**
- `structure` — file/folder layout with generation mappings

**Example:**
```yaml
kind: workspace
name: prediction-market-dashboard
structure:
  - path: src/app/page.tsx
    generated_from: homepage.interface.yaml
    generate_with: nextjs-page
  - path: src/db/schema/market.ts
    generated_from: market.artifact.yaml
    generate_with: drizzle-schema
```

---

## Spec Relationships

- **Flow → Artifact**: Flows operate on artifacts (read/write them)
- **Flow → Interface**: Interfaces trigger flows (user actions)
- **Interface → Artifact**: Interfaces display artifacts (show market data)
- **Policy → Flow**: Policies apply to flows (cache results, require auth)
- **Policy → Interface**: Policies apply to interfaces (rate limit, protect routes)
- **Behavior → Flow**: Behaviors test flows (flow must complete in 2 seconds)
- **Behavior → Interface**: Behaviors test interfaces (UI must show loading state)
- **Workspace → All**: Workspace maps all specs to files

## How to Organize Specs

Create a folder structure like this:

```
specs/
├── flows/
│   ├── ingest-polymarket.flow.yaml
│   ├── ingest-kalshi.flow.yaml
│   ├── load-homepage.flow.yaml
│   └── load-market-detail.flow.yaml
├── interfaces/
│   ├── homepage.interface.yaml
│   └── market-detail.interface.yaml
├── artifacts/
│   ├── market.artifact.yaml
│   ├── market-platform.artifact.yaml
│   └── price-history.artifact.yaml
├── policies/
│   ├── cache.policy.yaml
│   ├── cron.policy.yaml
│   └── public-api.policy.yaml
├── behaviors/
│   ├── homepage.behavior.yaml
│   └── market-detail.behavior.yaml
└── workspace/
    └── workspace.structure.yaml
```

Architecto will validate all specs in this structure.

## Required vs Optional Fields

### All Specs
- `kind` — REQUIRED (flow, interface, artifact, policy, behavior, workspace)
- `name` — REQUIRED (unique name)
- `version` — optional (semver format)
- `description` — optional

### Flow
- `steps` — optional (can have flows with no steps)
- `steps[].id` — REQUIRED
- `steps[].action` — REQUIRED
- `steps[].requires` — optional
- `steps[].provides` — optional
- `steps[].enabled` — optional (default: true)
- `steps[].critical` — optional (default: false)
- `steps[].onError` — optional (default: "fail")

### Interface
- `route` — optional
- `states[].id` — REQUIRED
- `actions[].id` — REQUIRED
- `components[].id` — REQUIRED

### Artifact
- `fields[].name` — REQUIRED
- `fields[].type` — REQUIRED
- `fields[].required` — optional (default: false)

### Policy
- `rules[].id` — REQUIRED

### Behavior
- `scenarios[].id` — REQUIRED
- `scenarios[].given` — REQUIRED
- `scenarios[].when` — REQUIRED
- `scenarios[].then` — REQUIRED

### Workspace
- `structure[].path` — REQUIRED
