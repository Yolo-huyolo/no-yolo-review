# Behavior Spec Reference

## Purpose

Behavior specs describe **acceptance scenarios and test cases**. They define what success looks like from the user's perspective.

## Structure

```yaml
kind: behavior
name: behavior-name
version: "0.1.0"
description: What these scenarios test

scenarios:
  - id: scenario-id
    given: Precondition
    when: Action the user takes
    then: Expected result
```

## Format: Given/When/Then

Behavior specs use **Gherkin format** (given/when/then), the same format used by BDD frameworks (Cucumber, etc.).

- **Given** — The initial state or precondition
- **When** — The action the user or system takes
- **Then** — The expected result/outcome

## Fields

### `kind: behavior`
Required. Always "behavior".

### `name`
Required. What is being tested. Use kebab-case.

Examples:
- `homepage` — Test the homepage
- `market-detail` — Test market detail page
- `user-registration` — Test registration flow

### `scenarios`
List of test cases.

Each scenario has:

#### `id`
Required. Scenario identifier (kebab-case).

#### `given`
Required. Precondition or initial state.

```
"Markets are loaded in the database"
"User is logged in"
"User has a watchlist with 3 items"
```

#### `when`
Required. Action taken.

```
"User visits the homepage"
"User clicks the 'Buy YES' button"
"User filters by 'elections' category"
```

#### `then`
Required. Expected result/outcome.

```
"Top 5 markets by 24h change are displayed"
"A trade modal appears"
"Only election markets are shown"
```

## Examples

### Simple Scenarios

```yaml
kind: behavior
name: homepage
version: "0.1.0"
description: Test the homepage market dashboard

scenarios:
  - id: shows-top-movers
    given: Markets have price changes in the last 24h
    when: User visits the homepage
    then: Top 5 movers are displayed sorted by change descending

  - id: shows-all-markets
    given: Multiple markets exist in the database
    when: User visits the homepage
    when: All published markets are shown in a table

  - id: can-filter-by-category
    given: Markets from multiple categories exist
    when: User selects the "elections" category filter
    then: Only election markets are displayed in the table

  - id: can-navigate-to-market
    given: The homepage displays a market
    when: User clicks on a market row
    then: User is navigated to /market/[slug]
```

### Detail Page Scenarios

```yaml
kind: behavior
name: market-detail
version: "0.1.0"
description: Test the market detail page

scenarios:
  - id: shows-current-probability
    given: A market with YES probability 65% exists
    when: User visits /market/btc-price-eoy
    then: YES probability shows 65% and NO shows 35%

  - id: shows-price-chart
    given: Historical price data exists for the market
    when: User visits the market detail page
    then: A price chart is displayed with data points

  - id: shows-platform-comparison
    given: Market exists on both Polymarket and Kalshi
    when: User visits the market detail page
    then: A table compares prices from both platforms

  - id: market-not-found
    given: No market exists with slug "nonexistent"
    when: User visits /market/nonexistent
    then: A 404 not found message appears

  - id: can-trade
    given: Market is in open status
    when: User clicks "Trade YES"
    then: Trade modal appears with order form
```

### Error Scenarios

```yaml
kind: behavior
name: ingest-flow
version: "0.1.0"
description: Test data ingestion flow

scenarios:
  - id: handles-api-error
    given: Polymarket API is down
    when: Ingest flow is triggered
    then: Flow logs error and retries in 2 minutes

  - id: validates-data
    given: API returns malformed market data
    when: Ingest flow processes the data
    then: Invalid records are skipped and logged

  - id: updates-existing
    given: Market already exists in database
    when: Ingest flow runs with updated prices
    then: Market record is updated with new prices
```

## Validation Rules

Architecto validates:

1. **Required fields:** `kind`, `name`
2. **Scenarios:** Each scenario must have `id`, `given`, `when`, `then`
3. **String fields:** All scenario fields must be strings

## Code Generation

Behavior specs generate:

- **Test files** (Jest, Vitest, Cypress, Playwright)
- **Test cases** using Gherkin/BDD style
- **Acceptance tests** (E2E tests)
- **Unit tests** (if testable at that level)

Example generation (Cypress E2E):

```typescript
// Generated from homepage behavior
describe('Homepage', () => {
  describe('shows-top-movers', () => {
    it('should display top 5 markets by 24h change', () => {
      // Given: Markets are loaded
      cy.seedDatabase({ markets: [...] });

      // When: User visits homepage
      cy.visit('/');

      // Then: Top movers are displayed
      cy.contains('Top Movers').should('be.visible');
      cy.get('[data-testid="top-movers"]')
        .find('tr')
        .should('have.length', 5);
      cy.get('[data-testid="top-movers"] tr:first')
        .contains('BTC Price')
        .should('be.visible');
    });
  });

  describe('can-filter-by-category', () => {
    it('should show only election markets when filtered', () => {
      cy.visit('/');
      cy.contains('Elections').click();
      cy.get('[data-testid="markets-table"] tr')
        .each((row) => {
          cy.wrap(row).contains('Elections');
        });
    });
  });
});
```

## Best Practices

1. **Be specific** — "User logs in with email/password" not "User authenticates"
2. **Use real data** — "Market with title 'Will BTC hit $50k?'" not "Any market"
3. **Test happy path first** — Start with "everything works" scenarios
4. **Test edge cases** — Add "error", "empty", "edge case" scenarios
5. **Use existing conventions** — Follow your team's Gherkin style

## Anti-Patterns

### ❌ Implementation detail in when/then

```yaml
scenarios:
  - id: loads-data
    given: Database connection exists
    when: User visits /market
    then: "SELECT query executes and returns 10 rows"
```

Issue: Details like "10 rows" and "SELECT query" are implementation, not acceptance criteria.

### ✅ Correct

```yaml
scenarios:
  - id: loads-data
    given: Markets exist in the database
    when: User visits /market
    then: "Market list is displayed with all markets"
```

### ❌ Too vague

```yaml
scenarios:
  - id: works
    given: Normal conditions
    when: User does things
    then: System works
```

### ✅ Correct

```yaml
scenarios:
  - id: can-trade
    given: Market with YES probability 60% exists
    when: User clicks 'Trade YES' button
    then: Trade modal opens with current YES price
```

## Learn More

- [Spec Types Overview](./spec-types.md)
- [Interface Spec](./interface-spec.md) — Interfaces have actions that scenarios test
- [Behavior-Driven Development](https://en.wikipedia.org/wiki/Behavior-driven_development)
