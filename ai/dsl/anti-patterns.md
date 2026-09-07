# Anti-Patterns to Avoid

This guide highlights common mistakes when writing Architecto specs.

## General

### ❌ Mixing Concerns Across Spec Types

```yaml
# WRONG: Flow describing UI behavior
kind: flow
name: display-markets
steps:
  - id: query
    action: db.query
  - id: render-table
    action: ui.render-table  # This belongs in interface spec!
  - id: add-styles
    action: css.apply  # This is implementation
```

`✅ CORRECT:`
- Flow defines data orchestration
- Interface defines UI structure
- Policies define styling/caching

```yaml
kind: flow
name: load-markets
steps:
  - id: query
    action: db.query
    provides:
      - markets

---

kind: interface
name: markets-table
components:
  - id: table
    type: table

---

kind: policy
name: styling
rules:
  - id: table-colors
    applies_to: markets-table
    action: apply-theme
```

### ❌ Business Logic in Specs

```yaml
kind: artifact
name: market
fields:
  - name: profit
    type: float
    description: "Calculated as: yes_price * yes_volume + no_price * no_volume"
```

Issue: Formula (business logic) belongs in code, not spec.

`✅ CORRECT:`
```yaml
kind: artifact
name: market
fields:
  - name: profit
    type: float
    description: "Total transaction profit on this market"
```

The code knows how to calculate profit.

### ❌ Implementation Details in Descriptions

```yaml
kind: flow
name: ingest-polymarket
description: "Fetch from Polymarket API (uses request library v2.28.0), parse JSON, transform with lodash, save to PostgreSQL"
```

Issue: Versions, libraries, implementation are code concerns.

`✅ CORRECT:`
```yaml
kind: flow
name: ingest-polymarket
description: "Fetch market data from Polymarket and update local database"
```

## Flows

### ❌ Unused Provided Tokens

```yaml
kind: flow
name: load-markets
outputs:
  - markets
steps:
  - id: query
    action: db.query
    provides:
      - markets
      - metadata  # Never used or output!
      - timestamp
```

Validator warns about unused tokens.

`✅ CORRECT:`

Option 1: Add to outputs
```yaml
outputs:
  - markets
  - metadata
  - timestamp
```

Option 2: Remove unused
```yaml
steps:
  - id: query
    action: db.query
    provides:
      - markets
```

Option 3: Use downstream
```yaml
steps:
  - id: query
    action: db.query
    provides:
      - markets
      - metadata
  - id: log
    action: log
    requires:
      - metadata
```

### ❌ Missing Required Inputs

```yaml
kind: flow
name: load-markets
steps:
  - id: query
    action: db.query
    requires:
      - filter_category  # Where does this come from?
    provides:
      - markets
```

Validator errors: "filter_category" not available.

`✅ CORRECT:`

```yaml
kind: flow
name: load-markets
inputs:
  - filter_category  # Add to inputs
steps:
  - id: query
    action: db.query
    requires:
      - filter_category
    provides:
      - markets
```

### ❌ Critical Step with Non-Fail Error Handler

```yaml
steps:
  - id: save
    action: db.upsert
    critical: true
    onError: warn  # INVALID! Critical must fail
```

Validator errors.

`✅ CORRECT:`
```yaml
steps:
  - id: save
    action: db.upsert
    critical: true
    onError: fail
```

Or make non-critical:
```yaml
steps:
  - id: save
    action: db.upsert
    critical: false
    onError: warn
```

### ❌ Disabled Step Breaking Downstream

```yaml
steps:
  - id: fetch-api
    action: http.get
    provides:
      - data
    enabled: false
  - id: process
    action: transform
    requires:
      - data  # Can't require from disabled step!
```

Validator errors.

`✅ CORRECT:`

Disable both:
```yaml
steps:
  - id: fetch-api
    action: http.get
    provides:
      - data
    enabled: false
  - id: process
    action: transform
    requires:
      - data
    enabled: false  # Also disabled
```

Or provide default:
```yaml
inputs:
  - optional_data
steps:
  - id: fetch-api
    action: http.get
    provides:
      - data
    enabled: false
  - id: process
    action: transform
    requires:
      - optional_data  # Required from input, not step
```

## Interfaces

### ❌ Action Without Clear Trigger

```yaml
actions:
  - id: submit
    description: "do some processing"
    # What flow does this trigger?
```

`✅ CORRECT:`
```yaml
actions:
  - id: submit-trade
    description: "User submits a buy order"
    triggers: create-trade
```

### ❌ Vague State Names

```yaml
states:
  - id: processing
  - id: ready
  - id: bad
```

Issue: What do these mean? Too ambiguous.

`✅ CORRECT:`
```yaml
states:
  - id: loading
    description: "Markets are being fetched from API"
  - id: loaded
    description: "Markets are displayed"
  - id: error
    description: "Failed to load markets"
```

## Artifacts

### ❌ Too Many Fields

```yaml
kind: artifact
name: user
fields:
  # 50+ fields...
  - name: id
  - name: email
  - name: password_hash
  - name: profile_bio
  - name: profile_avatar_url
  - name: notification_email_frequency
  - name: notification_sms_enabled
  - name: ...
```

Issue: Mixing multiple concepts (identity, profile, settings).

`✅ CORRECT:`

Split into multiple artifacts:
```yaml
kind: artifact
name: user
fields:
  - name: id
    type: uuid
  - name: email
    type: string
  - name: password_hash
    type: string

---

kind: artifact
name: user_profile
fields:
  - name: user_id
    type: uuid
    references: user.id
  - name: bio
    type: string
  - name: avatar_url
    type: string

---

kind: artifact
name: user_settings
fields:
  - name: user_id
    type: uuid
    references: user.id
  - name: email_frequency
    type: enum
    values: [daily, weekly, never]
  - name: sms_enabled
    type: boolean
```

### ❌ Unclear Field Types

```yaml
fields:
  - name: data
    type: object
```

Issue: What's in the object? Too vague.

`✅ CORRECT:`

```yaml
fields:
  - name: price_data
    type: object
    description: "Contains { yes_price, no_price, timestamp }"
```

Or use nested artifacts (future):
```yaml
fields:
  - name: prices
    type: price_snapshot
    description: "See price_snapshot artifact"
```

### ❌ Mismatched Field Names and Database

```yaml
fields:
  - name: creationTime  # camelCase
    type: timestamp
```

Issue: Will generate `creationTime` field but DB tables use `created_at`.

`✅ CORRECT:`

Be consistent with your naming convention (snake_case for DB):
```yaml
fields:
  - name: created_at
    type: timestamp
```

## Policies

### ❌ Policy Describing Implementation

```yaml
rules:
  - id: redis-cache
    description: "Use Redis with SET cache_key value EX 60"
```

Issue: Redis and SET are implementation details.

`✅ CORRECT:`
```yaml
rules:
  - id: market-data-cache
    description: "Cache market data for 60 seconds"
    action: cache-response
    condition: cache_ttl_seconds == 60
```

The implementation can use Redis, Memcached, or anything.

### ❌ Missing Applies_To

```yaml
rules:
  - id: rate-limit
    description: "Rate limit to 100 requests per minute"
```

Issue: Which endpoints? Which flows?

`✅ CORRECT:`
```yaml
rules:
  - id: rate-limit-api
    applies_to: GET /api/*
    condition: rate_limit == 100_per_minute
    action: rate-limit
```

## Behaviors

### ❌ When/Then Too Implementation-Focused

```yaml
scenarios:
  - id: fetches-data
    given: Database is up
    when: SELECT query runs on markets table
    then: Result set contains 10 rows
```

Issue: SQL queries and result counts are implementation.

`✅ CORRECT:`
```yaml
scenarios:
  - id: loads-markets
    given: Markets exist in database
    when: User visits homepage
    then: Market list is displayed
```

### ❌ Vague Given/When/Then

```yaml
scenarios:
  - id: works
    given: Everything is normal
    when: The system runs
    then: It succeeds
```

Issue: Meaningless. Can't write tests from this.

`✅ CORRECT:`
```yaml
scenarios:
  - id: shows-top-movers
    given: "Market A has +10% change, Market B has +5%"
    when: User visits homepage
    then: Market A appears above Market B in top-movers list
```

## Workspace

### ❌ Orphan Specs

```yaml
# specs defined:
# - homepage.interface.yaml
# - markets.flow.yaml

kind: workspace
structure:
  - path: src/app/page.tsx
    generated_from: homepage.interface.yaml  # referenced

  # markets.flow.yaml is never referenced
```

Issue: In v0.1 this is fine. In v0.2, ungenerated specs are lost.

`✅ CORRECT:`

Map all specs in workspace:
```yaml
structure:
  - path: src/app/page.tsx
    generated_from: homepage.interface.yaml

  - path: src/app/api/markets/route.ts
    generated_from: markets.flow.yaml
```

### ❌ Mismatched Generators

```yaml
structure:
  - path: src/market.ts
    generated_from: market.artifact.yaml
    generate_with: react-component  # WRONG! Artifact -> type, not component
```

`✅ CORRECT:`
```yaml
structure:
  - path: src/types/market.ts
    generated_from: market.artifact.yaml
    generate_with: typescript-type

  - path: src/components/market.tsx
    generated_from: market-detail.interface.yaml  # Use interface spec
    generate_with: react-component
```

## Summary

**Always ask:**
1. Does each spec have a clear, single purpose?
2. Are names consistent and clear?
3. Is business logic in code, not specs?
4. Are all references valid (specs/flows/fields exist)?
5. Would an AI agent understand this spec?

If the answer is "no" to any, refactor the spec.
