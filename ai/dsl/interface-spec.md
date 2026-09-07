# Interface Spec Reference

## Purpose

Interface specs describe **UI screens, user interactions, and component structure**. They define what users see and how they interact with your system.

## Structure

```yaml
kind: interface
name: interface-name
version: "0.1.0"
description: What this screen shows

route: /path/[slug]

states:
  - id: loading
  - id: loaded
  - id: error

actions:
  - id: action-id
    description: What the action does
    triggers: event-name

components:
  - id: component-id
    type: component-type
    description: What this component shows
```

## Fields

### `kind: interface`
Required. Always "interface".

### `name`
Required. Unique name for the interface. Use kebab-case.

Examples:
- `homepage`
- `market-detail`
- `user-settings`

### `route`
Optional. URL path to this screen.

Use square brackets for dynamic segments:
- `/` — root/homepage
- `/market` — static route
- `/market/[slug]` — dynamic slug
- `/user/[id]/settings` — nested dynamic

### `states`
Optional. List of UI states this screen can be in.

Possible states:
- `loading` — Data is being fetched
- `loaded` — Data is displayed
- `error` — Error occurred
- `empty` — No data to show
- `idle` — Waiting for action
- `submitting` — Form is submitting

```yaml
states:
  - id: loading
    description: Markets are being fetched
  - id: loaded
    description: Markets are displayed
  - id: error
    description: Failed to fetch markets
```

When generating code, each state maps to a conditional branch or state machine.

### `actions`
Optional. List of user actions on this screen.

Actions are things users can do:
- Click buttons
- Submit forms
- Filter/sort
- Navigate
- Open modals

```yaml
actions:
  - id: filter-by-category
    description: User selects a category filter
    triggers: reload-markets
  - id: navigate-to-market
    description: User clicks a market row
    triggers: navigate(path=/market/[slug])
```

- `id` — Action identifier (kebab-case)
- `description` — What the action does
- `triggers` — What happens (flow name, navigation, modal open, etc.)

### `components`
Optional. List of UI components on this screen.

Components are reusable UI elements.

```yaml
components:
  - id: top-movers-section
    type: section
    description: Shows top 5 markets by 24h change
  - id: markets-table
    type: table
    description: Paginated list of all markets
  - id: category-filter
    type: tabs
    description: Filter by elections, crypto, macro, sports
```

- `id` — Component identifier (kebab-case)
- `type` — Component type (section, table, modal, form, button, etc.)
- `description` — What the component displays

## Examples

### Simple Page

```yaml
kind: interface
name: homepage
route: /
version: "0.1.0"
description: Main dashboard showing prediction markets

states:
  - id: loading
  - id: loaded
  - id: error

actions:
  - id: filter-by-category
    triggers: reload-markets
  - id: navigate-to-market
    triggers: navigate

components:
  - id: top-movers
    type: section
  - id: markets-table
    type: table
  - id: category-filter
    type: tabs
```

### Detail Page

```yaml
kind: interface
name: market-detail
route: /market/[slug]
version: "0.1.0"
description: Detailed view of a single prediction market

states:
  - id: loading
  - id: loaded
  - id: not-found
  - id: error

actions:
  - id: trade-yes
    triggers: open-trade-modal
  - id: trade-no
    triggers: open-trade-modal
  - id: toggle-chart-timeframe
    triggers: reload-chart
  - id: navigate-to-related
    triggers: navigate

components:
  - id: probability-display
    type: metric
  - id: price-chart
    type: chart
  - id: platform-comparison
    type: table
  - id: trade-buttons
    type: action-group
  - id: related-events
    type: list
```

## Validation Rules

Architecto validates:

1. **Required fields:** `kind`, `name`
2. **States:** Each state must have unique `id`
3. **Actions:** Each action must have unique `id`
4. **Components:** Each component must have unique `id`

## Code Generation

When Architecto generates code from an interface spec, it creates:

- **Page/component** file
- **State management** for each state
- **Event handlers** for each action
- **Subcomponents** for each component

Example generation (React):

```typescript
// Generated from homepage interface
export function HomePage() {
  const [state, setState] = useState('loading');
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    loadMarkets();
  }, []);

  async function loadMarkets() {
    setState('loading');
    try {
      const data = await fetch('/api/markets');
      setMarkets(data);
      setState('loaded');
    } catch {
      setState('error');
    }
  }

  function handleFilterByCategory(category) {
    loadMarkets({ category }); // triggers reload-markets flow
  }

  return (
    <div>
      {state === 'loading' && <LoadingState />}
      {state === 'loaded' && (
        <>
          <TopMoversSection markets={markets} />
          <MarketsTable markets={markets} />
          <CategoryFilter onChange={handleFilterByCategory} />
        </>
      )}
      {state === 'error' && <ErrorState />}
    </div>
  );
}
```

## Anti-Patterns

### ❌ Vague action

```yaml
actions:
  - id: do-something
```

Issue: What does "do-something" mean? What flow does it trigger?

### ✅ Clear action

```yaml
actions:
  - id: filter-by-category
    description: User selects a category
    triggers: reload-markets
```

### ❌ Mixed concerns

```yaml
actions:
  - id: submit-form
    triggers: validate-email-address-with-regex-pattern-...
```

Issue: Business logic in spec. Validation logic goes in code.

### ✅ Correct

```yaml
actions:
  - id: submit-form
    triggers: save-user-settings
```

The flow handles validation.

## Learn More

- [Spec Types Overview](./spec-types.md)
- [Flow Spec](./flow-spec.md) — How actions trigger flows
- [Behavior Spec](./behavior-spec.md) — How to test interfaces
