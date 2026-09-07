# Architecto Design Principles

## 1. Specs Are Source of Truth

Your architecture specs are the single source of truth. Code is generated from specs.

- Write specs first
- Use specs to communicate architecture to the team
- Feed specs to AI agents for code generation
- Update specs when architecture changes
- Keep specs in version control

## 2. No Business Logic in Specs

Specs describe **structure and flow**, not implementation details.

**Correct:** A flow step that "computes total revenue"
**Wrong:** A flow step that includes the formula (multiply * add / divide)

**Correct:** An artifact field "user_email" of type "string" with validation rules
**Wrong:** An artifact field with regex validation logic

Business logic lives in code. Use specs for:
- What data flows where
- Which steps must complete before others
- What UI states exist
- Which endpoints are protected

## 3. Protocol, Not Runtime

Architecto doesn't execute code. It validates specs and describes structure.

- Architecto validates that specs are well-formed
- Architecto cannot run flows or check if code works
- You (or AI) materializes specs into runnable code
- Framework-specific runtimes execute the generated code

## 4. Portable and Framework-Agnostic

A single Architecto spec can generate code for multiple frameworks.

**One spec:**
```yaml
kind: flow
name: load-markets
```

**Multiple materializations:**
- Next.js API route
- FastAPI endpoint
- Express.js handler
- GraphQL resolver
- Lambda function

Use specs to capture *what* your system does, not *how* any particular framework does it.

## 5. AI-First Design

Specs are designed to be read by AI agents (LLMs).

- Clear, consistent structure
- Unambiguous field names
- Self-documenting (kind, name, description)
- Reference other specs by name
- No arbitrary syntax

When you feed specs + `AI_SYSTEM.md` to Claude/GPT:
- The AI understands your architecture
- The AI can generate code that matches specs
- The AI can validate that generated code satisfies behavior specs
- The AI can suggest architectural improvements

## 6. Simple Defaults

Optional fields have sensible defaults.

- `enabled: true` — steps are enabled by default
- `critical: false` — steps are not critical by default
- `onError: fail` — steps fail on error by default
- `required: false` — fields are optional by default

You only need to specify non-default values.

## 7. Clear Boundaries

Each spec kind has a clear purpose:

- **Flow** — *Orchestration only*. How data moves between steps.
- **Interface** — *UI structure only*. What users see and interact with.
- **Artifact** — *Data contracts only*. What data looks like.
- **Policy** — *Execution rules only*. How steps are executed (caching, auth, rate limits).
- **Behavior** — *Acceptance criteria only*. How to test the system.
- **Workspace** — *File structure only*. Where code goes.

Don't mix concerns. A flow should not describe UI. An interface should not describe database schema. A policy should not describe business logic.

## 8. Version Everything

All specs have optional `version` fields following semver.

```yaml
kind: flow
name: ingest-polymarket
version: "0.2.1"
```

This helps:
- Track when specs change
- Understand which generated code is based on which spec version
- Communicate breaking changes to the team
- Test spec evolution

## 9. Describe Portals, Not Implementation

Think of flows as functions with inputs/outputs (ports):

```yaml
kind: flow
name: load-markets
inputs:
  - category_filter
outputs:
  - markets
```

Not:

```yaml
kind: flow
name: load-markets
description: "Query database with SELECT ..., map to JSON, return"
```

The first describes *what the flow does* (contract). The second describes *how* (implementation).

## 10. Specs Evolve

As your system grows:

1. Start simple (one flow, one interface)
2. Add artifacts as data models emerge
3. Add policies as constraints appear
4. Add behaviors as acceptance criteria become clear
5. Add workspace once you know folder structure
6. Iterate on versions

Specs are not final. They evolve with your understanding.
