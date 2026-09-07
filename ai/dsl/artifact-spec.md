# Artifact Spec Reference

## Purpose

Artifact specs describe **data contracts and schemas**. They define what data looks like (database tables, API payloads, event messages).

## Structure

```yaml
kind: artifact
name: artifact-name
version: "0.1.0"
description: What this data represents

fields:
  - name: field-name
    type: field-type
    required: true
    description: What this field is
    references: other-artifact.field  # optional foreign key
```

## Fields

### `kind: artifact`
Required. Always "artifact".

### `name`
Required. Unique name. Use singular, snake_case.

Examples:
- `market`
- `market_platform`
- `price_history`

### `version`
Optional. Semantic version (x.y.z).

### `description`
Optional. What this artifact represents.

### `fields`
Optional. List of fields in this artifact.

Each field has:

#### `name`
Required. Field name. Use snake_case.

Examples:
- `id`
- `market_id`
- `yes_probability`

#### `type`
Required. Field type.

Common types:
- `string` — Text
- `integer` — Whole number
- `float` — Decimal number
- `boolean` — true/false
- `uuid` — UUID identifier
- `timestamp` — Date/time
- `enum` — One of predefined values
- `object` — Nested object
- `array` — List of items
- `json` — Any JSON

#### `required`
Optional. Boolean. Default: false.

If true, the field must always be present.

#### `description`
Optional. What this field represents.

#### `references`
Optional. Foreign key reference.

Format: `artifact-name.field-name`

Example:
```yaml
- name: market_id
  type: uuid
  required: true
  references: market.id
```

#### `values`
Optional. For enum types, list of valid values.

```yaml
- name: status
  type: enum
  required: true
  values: [open, closed, resolved]
```

## Examples

### Simple Artifact

```yaml
kind: artifact
name: market
version: "0.1.0"
description: A prediction market

fields:
  - name: id
    type: uuid
    required: true
    description: Unique market ID
  - name: title
    type: string
    required: true
    description: Market question
  - name: yes_probability
    type: float
    required: true
    description: Current YES probability (0-1)
  - name: no_probability
    type: float
    required: true
  - name: category
    type: enum
    required: true
    values: [elections, crypto, macro, sports]
  - name: status
    type: enum
    required: true
    values: [open, closed, resolved]
  - name: created_at
    type: timestamp
    required: true
```

### Artifact with Relationships

```yaml
kind: artifact
name: market_platform
version: "0.1.0"
description: Market presence on a specific platform

fields:
  - name: id
    type: uuid
    required: true
  - name: market_id
    type: uuid
    required: true
    references: market.id  # Foreign key
  - name: platform
    type: enum
    required: true
    values: [polymarket, kalshi]
  - name: external_id
    type: string
    required: true
  - name: yes_price
    type: float
    required: true
  - name: no_price
    type: float
    required: true
  - name: last_synced_at
    type: timestamp
    required: true
```

## Validation Rules

Architecto validates:

1. **Required fields:** `kind`, `name`
2. **Field names:** Each field must have `name` and `type`
3. **Field types:** Type should be recognized (string, uuid, float, etc.)
4. **Enums:** If type is enum, provide `values` list

## Code Generation

Artifact specs generate:

- **Database tables/schemas** (CREATE TABLE, Drizzle schemas)
- **TypeScript types** (interfaces, types)
- **ORM models** (if using Prisma, Drizzle, etc.)
- **API validation** (request/response validation)

Example generation (Drizzle):

```typescript
// Generated from market artifact
import { pgTable, uuid, varchar, float, timestamp, pgEnum } from 'drizzle-orm/pg-core';

const statusEnum = pgEnum('market_status', ['open', 'closed', 'resolved']);
const categoryEnum = pgEnum('market_category', ['elections', 'crypto', 'macro', 'sports']);

export const markets = pgTable('markets', {
  id: uuid('id').primaryKey(),
  title: varchar('title').notNull(),
  yesProbability: float('yes_probability').notNull(),
  noProbability: float('no_probability').notNull(),
  category: categoryEnum('category').notNull(),
  status: statusEnum('status').notNull(),
  createdAt: timestamp('created_at').notNull(),
});
```

## Anti-Patterns

### ❌ Too many fields

If an artifact has 50+ fields, it's probably modeling multiple concepts.

### ✅ Correct

Split into multiple artifacts:
- `market` — core market data
- `market_metadata` — optional info
- `market_stats` — calculated fields

### ❌ Business logic in type

```yaml
fields:
  - name: yes_price
    type: float
    description: "Calculated as: (yes_volume / total_volume)"
```

Issue: Formula goes in code, not spec.

### ✅ Correct

```yaml
fields:
  - name: yes_price
    type: float
    description: "Current YES price on the market"
```

Calculation logic lives in flows/code.

## Learn More

- [Spec Types Overview](./spec-types.md)
- [Flow Spec](./flow-spec.md) — How flows read/write artifacts
