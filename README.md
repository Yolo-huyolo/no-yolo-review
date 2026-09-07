# no-yolo-review

[![npm version](https://img.shields.io/npm/v/no-yolo-review.svg)](https://www.npmjs.com/package/no-yolo-review)
[![license](https://img.shields.io/npm/l/no-yolo-review.svg)](./LICENSE)

The deep-dive companion to [no-yolo-commits](https://www.npmjs.com/package/no-yolo-commits). That one runs a fast, single-pass AI review on every commit. This one runs three separate reviewers — correctness, security, SEO — each looking at the diff through one lens only, in parallel, then merged into one report. It's slower, so it's not a commit-time gate: you run it by hand, or from a `pre-push` hook.

```bash
npx no-yolo-review
```

Reviews whatever's staged (`git diff --cached`). No staged changes and nothing piped in on stdin? Nothing to review, exits 0.

### Install it once instead

`npx` re-fetches whatever's currently published on every single invocation — fine occasionally, less fine from a hook that runs on every push, both for speed and because it means an unpinned registry fetch runs on every developer's machine at push time:

```bash
npm install -g no-yolo-review
```

After that, hooks and scripts should call the bare `no-yolo-review` command (it's on PATH) instead of `npx --yes no-yolo-review` — see the pre-push example below, which checks for the global install first and only falls back to `npx` if it's not there.

## What it actually does

1. **Three built-in personas run concurrently**, each with a narrow brief:
   - `correctness` — logic errors, edge cases, framework footguns (severity: block)
   - `security` — injection, XSS, secrets, SSRF, broken auth (severity: block)
   - `seo` — canonical/OG/structured-data regressions, and specifically a `lastModified`/`dateModified` value computed from request time instead of a stored content-edit date (severity: warn)
2. **A fourth call aggregates** their findings — dedupes overlap, doesn't invent new ones.
3. **A deterministic policy pass** escalates anything that looks like `xss`, `secret`, `credential`, `sql injection`, or `ssrf` to `block`, regardless of what the reporting persona said — this one rule can't be downgraded by project config.
4. **Fails open.** A persona that errors, times out, or can't reach its CLI (one retry first) is dropped, not fatal — the report says `degraded: true` and moves on with whatever did complete. A broken reviewer should never be why nothing gets reviewed.

Routes through [Kitana](https://www.npmjs.com/package/@kitana-sdk/core), so it runs on the `claude` CLI subscription you already have — no separate API key.

## Flags

```bash
npx no-yolo-review --stack "Next.js + TypeScript"   # tell personas what they're looking at
npx no-yolo-review --html report.html               # also write a static HTML report
npx no-yolo-review --all                            # whole tracked codebase, not just the diff
```

| Flag | Does what it says |
|---|---|
| `--stack <text>` | Free-text project description passed into every persona's prompt, so findings are relevant instead of generic |
| `--namer <claude\|codex\|ollama>` | Which CLI runs the personas |
| `--config <path>` | `.no-yolo-review.yml` path, if not at the project root |
| `--html <path>` | Also writes a self-contained HTML report — no server, just a file to open |
| `--all` | Reviews every tracked (and not-gitignored) file on disk, chunked by size so each request stays within the underlying CLI's own timeout. **Manual-audit only** — deliberately not something a hook runs on every commit or push; on anything past a small project it's dozens of requests and several minutes |

Exit code is `0` if nothing hit `block`, `1` otherwise — same contract whether you're reading it yourself or a hook is checking it.

## Configuring personas

Zero config is the common case: all three built-ins, all enabled, sensible defaults. You only need a `.no-yolo-review.yml` to change something.

An entry in `personas:` is a **patch by name**, not a replacement list — mention only what you're changing, everything else keeps its built-in default:

```yaml
# .no-yolo-review.yml
personas:
  - name: seo
    enabled: false
```

That's the whole file for a project with no SEO surface. `correctness` and `security` keep running on their defaults; only `seo` is touched.

### A website

Keep all three — this is exactly what they're for. Maybe tighten what counts as worth mentioning:

```yaml
stack: "Next.js 14 (App Router) + TypeScript + MiniCMS (YAML content)"

policy_overrides:
  - match: "console.log"
    severity: warn
```

### A library or CLI tool

No pages, no metadata, no sitemap — `seo` has nothing to check. This is this project's own `.no-yolo-review.yml`:

```yaml
personas:
  - name: seo
    enabled: false

stack: "TypeScript CLI/library"
```

### An agent project

Same reasoning — no `seo` — plus a custom persona for what actually breaks in agent code: tools handed more permission than the task needs, an LLM's own output driving a side effect with no validation in between, a destructive action with no confirmation gate. A custom persona needs `focus` — there's no built-in default to fall back to:

```yaml
personas:
  - name: seo
    enabled: false

  - name: agent-safety
    enabled: true
    severity_default: block
    focus: >
      You review a git diff for agent-specific safety issues only: a tool
      granted broader permissions (filesystem, network, shell) than the
      task requires; an LLM's raw output used directly to drive a side
      effect (a file write, an API call, a shell command) with no
      validation in between; a destructive or irreversible action with no
      confirmation step; a prompt built by concatenating untrusted content
      (a tool result, a fetched page) directly into the system prompt
      without delimiting it from instructions.
```

### Full field list

See [`.no-yolo-review.example.yml`](./.no-yolo-review.example.yml) — every field, commented, nothing required.

## Pairing with no-yolo-commits

`no-yolo-commits` already gates every commit (fast, single pass). Point `no-yolo-review` at what's actually being pushed, in a `pre-push` hook — not `--all`, which doesn't scale to "review this push" on anything but a small project:

```sh
#!/usr/bin/env sh
# .husky/pre-push
zero="0000000000000000000000000000000000000000"
diff_all=""
while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$zero" ] && continue
  range="$remote_sha..$local_sha"
  [ "$remote_sha" = "$zero" ] && range="$(git merge-base "$local_sha" origin/main)..$local_sha"
  diff_all="${diff_all}$(git diff "$range")
"
done
[ -z "$diff_all" ] && exit 0
run_review() {
  if command -v no-yolo-review >/dev/null 2>&1; then no-yolo-review "$@"
  else npx --yes no-yolo-review "$@"
  fi
}
# if/elif here, not `A && B || C` — that trap re-runs via npx (against
# already-consumed, now-empty stdin) whenever the installed binary finds a
# real blocking issue and exits 1, silently replacing a real finding with
# npx's "nothing to review" result.
printf '%s' "$diff_all" | run_review --html .no-yolo-review-report.html || {
  echo "Push anyway with: git push --no-verify"
  exit 1
}
```

For a project small enough that a whole-repo pass is actually reasonable to run occasionally (not on every push), `npx no-yolo-review --all --html report.html` by hand is the audit.

## The eject button

```bash
git push --no-verify
```

Same as `no-yolo-commits` — a guardrail, not a cage.

## License

MIT
