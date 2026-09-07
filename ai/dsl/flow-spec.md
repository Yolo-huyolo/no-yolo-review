# Flow Spec Reference

## Purpose

Flows describe **orchestration and data pipelines**. They define:

- What inputs a flow receives
- What steps execute and in what order
- What data each step requires and produces
- What outputs the flow returns
- How to handle errors

Think of flows as **functions with ports** (inputs/outputs).

## Structure

```yaml
kind: flow
name: flow-name
version: "0.1.0"
description: What this flow does

inputs:
  - input1
  - input2

outputs:
  - output1
  - output2

steps:
  - id: step-id
    action: action-type
    requires:
      - required-token
    provides:
      - provided-token
    enabled: true
    critical: false
    onError: fail
```

## Fields

### `kind: flow`
Required. Always "flow".

### `name`
Required. Unique name for the flow. Use kebab-case.

Examples:
- `ingest-polymarket`
- `load-homepage`
- `compute-market-probability`

### `version`
Optional. Semantic version (x.y.z format).

### `description`
Optional. What this flow does (one sentence).

### `inputs`
Optional. List of input tokens the flow accepts.

Think of these as **function parameters**. The flow receives these values and uses them in steps.

```yaml
inputs:
  - api_base_url
  - market_category
  - page_number
```

### `outputs`
Optional. List of output tokens the flow produces.

Think of these as **return values**. Steps must provide these tokens.

```yaml
outputs:
  - markets
  - total_count
```

The validator checks:
- Each output token is provided by some step
- Output tokens are not overridden by later steps

### `steps`
Optional (but usually present). List of steps the flow executes.

Each step is a task. Steps execute in order.

## Step Fields

### `id`
Required. Unique identifier for the step. Use kebab-case.

```yaml
- id: fetch-markets
  action: http.get
```

### `action`
Required. What the step does. Use dot notation.

Common actions (framework-agnostic):
- `http.get` — HTTP GET request
- `http.post` — HTTP POST request
- `db.query` — Database query
- `db.upsert` — Database insert/update
- `cache.get` — Get from cache
- `cache.set` — Set in cache
- `transform.normalize` — Transform/normalize data
- `compose` — Combine multiple inputs
- `log` — Log data
- `validate` — Validate data

These are framework-agnostic. Code generators map them to actual implementations.

### `requires`
Optional. List of tokens this step needs.

Tokens come from:
- `inputs` (flow inputs)
- `provides` of previous steps

```yaml
requires:
  - raw_markets
  - market_category
```

The validator checks:
- Each required token is available (from inputs or earlier step provides)
- If the step is enabled

### `provides`
Optional. List of tokens this step produces.

Later steps can require these tokens.

```yaml
provides:
  - normalized_markets
  - transformation_count
```

### `enabled`
Optional. Boolean. Default: true.

If false, the step is skipped. Used for conditional logic.

```yaml
- id: send-notification
  action: notify
  enabled: true  # can be dynamic in generated code
```

**Important:** Disabled steps should not break downstream steps. If step A is disabled and provides a token that step B requires, the validator will error.

### `critical`
Optional. Boolean. Default: false.

If true, the step **must succeed**. The flow fails if this step fails.

Critical steps:
- Cannot use `onError: warn` or `onError: skip`
- Must use `onError: fail` (explicit or default)

```yaml
- id: save-to-database
  action: db.upsert
  critical: true
  onError: fail  # must be this
```

Use `critical: true` for steps you cannot recover from (saving to database, calling payment APIs).

### `onError`
Optional. How to handle step failures. Default: "fail".

Options:
- `fail` — Flow fails if step fails
- `warn` — Log warning, continue flow
- `skip` — Skip step, continue flow

```yaml
- id: load-optional-data
  action: db.query
  critical: false
  onError: warn  # Log and continue
```

Rules:
- Critical steps (`critical: true`) must have `onError: fail`
- Non-critical steps can use any value

## Examples

### Simple Pipeline

```yaml
kind: flow
name: ingest-markets
inputs:
  - api_base_url
outputs:
  - market_count
steps:
  - id: fetch-api
    action: http.get
    requires:
      - api_base_url
    provides:
      - raw_data
    critical: true

  - id: normalize
    action: transform.normalize
    requires:
      - raw_data
    provides:
      - normalized_markets
    critical: true

  - id: save
    action: db.upsert
    requires:
      - normalized_markets
    provides:
      - market_count
    critical: true
```

Data flow:
1. `fetch-api` gets `api_base_url` input
2. `fetch-api` produces `raw_data`
3. `normalize` requires and consumes `raw_data`
4. `normalize` produces `normalized_markets`
5. `save` requires and consumes `normalized_markets`
6. `save` produces `market_count` (output)

### Conditional Logic

```yaml
kind: flow
name: load-market-detail
inputs:
  - market_slug
outputs:
  - market_detail
  - platform_comparison
  - related_events
steps:
  - id: load-market
    action: db.query
    requires:
      - market_slug
    provides:
      - market
    critical: true

  - id: load-platforms
    action: db.query
    requires:
      - market
    provides:
      - platform_comparison
    critical: false
    onError: warn

  - id: load-related
    action: db.query
    requires:
      - market
    provides:
      - related_events
    critical: false
    onError: warn

  - id: compose
    action: compose
    requires:
      - market
      - platform_comparison
      - related_events
    provides:
      - market_detail
    critical: true
```

- `load-market` is critical (must succeed)
- `load-platforms` and `load-related` are optional (if fail, log and continue)
- `compose` merges results (critical)

### Branching (Future)

This demonstrates conditional behavior for future versions:

```yaml
# Not yet supported, but conceptually:
steps:
  - id: check-cache
    action: cache.get
    provides:
      - cached_result
    enabled: true

  - id: fetch-api
    action: http.get
    # enabled: if cached_result is null (future)
    provides:
      - api_result
```

## Validation Rules

Architecto validates:

1. **Required fields:** Every step must have `id` and `action`
2. **Token availability:** Every required token must come from inputs or earlier step provides
3. **Token usage:** Provided tokens should be used by later steps or declared in outputs
4. **Critical rules:** Critical steps cannot use `onError: warn` or `onError: skip`
5. **Disabled steps:** Disabled steps must not provide tokens required by enabled downstream steps

## Anti-Patterns

### ❌ Missing input

```yaml
kind: flow
name: bad-flow
steps:
  - id: query
    action: db.query
    provides:
      - data
```

Issue: Where does the query come from? No input, no previous step provides it.

### ✅ Correct

```yaml
kind: flow
name: good-flow
inputs:
  - query_params
steps:
  - id: query
    action: db.query
    requires:
      - query_params
    provides:
      - data
```

### ❌ Unused output

```yaml
kind: flow
name: bad-flow
outputs:
  - results
steps:
  - id: fetch
    action: http.get
    provides:
      - raw_data
```

Issue: Flow claims to output "results" but provides "raw_data".

### ✅ Correct

```yaml
kind: flow
name: good-flow
outputs:
  - data
steps:
  - id: fetch
    action: http.get
    provides:
      - data
```

### ❌ Unused provided token

```yaml
kind: flow
name: bad-flow
steps:
  - id: fetch
    action: http.get
    provides:
      - data
  - id: log
    action: log
```

Issue: "data" is provided but never used (and not in outputs). Either use it or add it to outputs.

### ✅ Correct

```yaml
kind: flow
name: good-flow
outputs:
  - data
steps:
  - id: fetch
    action: http.get
    provides:
      - data
  - id: log
    action: log
    requires:
      - data
```

### ❌ Disabled step breaks downstream

```yaml
kind: flow
name: bad-flow
steps:
  - id: fetch
    action: http.get
    provides:
      - data
    enabled: false
  - id: process
    action: transform
    requires:
      - data
```

Issue: "fetch" is disabled but "process" requires its output. Flow will fail.

### ✅ Correct

```yaml
kind: flow
name: good-flow
steps:
  - id: fetch
    action: http.get
    provides:
      - data
    enabled: false
  - id: process
    action: transform
    requires:
      - data
    enabled: false
```

Or provide default data/skip downstream:

```yaml
kind: flow
name: good-flow
inputs:
  - optional_data
steps:
  - id: fetch
    action: http.get
    provides:
      - data
    enabled: false
  - id: process
    action: transform
    requires:
      - data
    enabled: false
```

## Code Generation

When Architecto generates code from a flow spec, it creates:

- **Function/endpoint** that accepts `inputs`
- **Middleware** to execute steps in order
- **Data pipeline** passing tokens between steps
- **Error handling** per `onError` rules
- **Return statement** for `outputs`

Example generation (Next.js):

```typescript
// Generated from ingest-markets flow
export async function POST(req) {
  const { api_base_url } = req.body; // inputs

  try {
    // Step 1: fetch-api
    const raw_data = await fetch(api_base_url);

    // Step 2: normalize
    const normalized_markets = normalize(raw_data);

    // Step 3: save
    const market_count = await db.upsert(normalized_markets);

    // Return outputs
    return { market_count };
  } catch (error) {
    // Error handling per onError rules
  }
}
```

## Learn More

- [Spec Types Overview](./spec-types.md)
- [AI System Guide](../AI_SYSTEM.md)
- [Behavior Spec](./behavior-spec.md) — How to test flows
