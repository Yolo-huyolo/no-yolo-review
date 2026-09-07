import { describe, expect, it, vi } from "vitest";
import { resolvePersonas, reviewDiff, reviewDiffChunked, type ReviewDiffDeps } from "../../src/flows/review-diff.js";
import { ReviewConfigSchema, type AggregatedOutput, type Persona, type PersonaOutput, type ReviewConfig, type TaggedFinding } from "../../src/config/schema.js";
import { applyPolicyOverrides } from "../../src/policy/apply.js";
import { composeReport } from "../../src/report.js";

// One test per scenario id in specs/behaviors/review-diff.behavior.yaml.
// Real Claude/Codex/Ollama CLI calls are never exercised here — every test
// injects a fake ReviewDiffDeps so the behavior under test (fan-out,
// timeout, fail-open, policy escalation) is isolated from whether a
// provider CLI happens to be installed.

const config: ReviewConfig = ReviewConfigSchema.parse({});

function empty(): Promise<PersonaOutput> {
  return Promise.resolve({ findings: [] });
}

function passthroughAggregator(findings: readonly TaggedFinding[]): Promise<AggregatedOutput> {
  return Promise.resolve({ findings: [...findings] });
}

describe("blocks-unsanitized-dangerously-set-inner-html", () => {
  it("reports a block finding from the security persona", async () => {
    const deps: ReviewDiffDeps = {
      runPersonaLlm: (persona) =>
        persona.name === "security"
          ? Promise.resolve({
              findings: [
                {
                  severity: "block",
                  summary:
                    "Renders an externally-fetched, any-typed field via dangerouslySetInnerHTML with no sanitization",
                  file: "app/page.tsx",
                  line: 42,
                },
              ],
            })
          : empty(),
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiff({ stagedDiff: "diff --git a/app/page.tsx ...", reviewConfig: config, deps });

    expect(report.blocked).toBe(true);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ persona: "security", severity: "block" }),
    );
  });
});

describe("clean-diff-produces-no-blocking-findings", () => {
  it("returns blocked:false and no findings for a typo-only diff", async () => {
    const deps: ReviewDiffDeps = {
      runPersonaLlm: () => empty(),
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiff({
      stagedDiff: "diff --git a/README.md ... - Instal + Install",
      reviewConfig: config,
      deps,
    });

    expect(report.blocked).toBe(false);
    expect(report.findings).toEqual([]);
  });
});

describe("fails-open-when-provider-cli-missing", () => {
  it("marks the report degraded, not blocked, when every persona call fails", async () => {
    const deps: ReviewDiffDeps = {
      runPersonaLlm: () => Promise.reject(new Error("claude: command not found")),
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiff({ stagedDiff: "diff --git a/x ...", reviewConfig: config, deps });

    expect(report.degraded).toBe(true);
    expect(report.blocked).toBe(false);
  });

  it("recovers a persona that fails once but succeeds on retry, without marking the report degraded", async () => {
    // Real runs show meaningful per-call timing variance (CLI startup,
    // provider-side load) independent of chunk size — a single failed
    // attempt is often just that one call being unlucky, not the provider
    // being genuinely unavailable. One retry should absorb that.
    let attempts = 0;
    const deps: ReviewDiffDeps = {
      runPersonaLlm: (persona) => {
        if (persona.name !== "security") return empty();
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("transient CLI error"))
          : Promise.resolve({ findings: [{ severity: "warn", summary: "found on retry" }] });
      },
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiff({ stagedDiff: "diff --git a/x ...", reviewConfig: config, deps });

    expect(attempts).toBe(2);
    expect(report.degraded).toBeFalsy();
    expect(report.findings).toContainEqual(expect.objectContaining({ summary: "found on retry" }));
  });
});

describe("fails-open-on-persona-timeout", () => {
  it("still aggregates the personas that finished when one exceeds its budget", async () => {
    vi.useFakeTimers();
    try {
      const deps: ReviewDiffDeps = {
        runPersonaLlm: (persona: Persona) => {
          if (persona.name === "seo") {
            // Never resolves — stands in for a hung ADK/CLI call.
            return new Promise<PersonaOutput>(() => {});
          }
          return Promise.resolve({
            findings: [{ severity: "warn", summary: `${persona.name} finished fine` }],
          });
        },
        runAggregatorLlm: passthroughAggregator,
      };

      const reportPromise = reviewDiff({ stagedDiff: "diff --git a/x ...", reviewConfig: config, deps });
      // One retry means a persona that never resolves times out twice
      // (see callWithRetry) before it's given up on — advance past both.
      await vi.advanceTimersByTimeAsync(90_001 * 2);
      const report = await reportPromise;

      const reportingPersonas = new Set(report.findings.map((f) => f.persona));
      expect(reportingPersonas.has("seo")).toBe(false);
      expect(reportingPersonas.has("correctness")).toBe(true);
      expect(reportingPersonas.has("security")).toBe(true);
      // A persona genuinely didn't run — the report IS degraded, even though
      // it's not empty and isn't blocked-by-default because of it. An
      // earlier version of this test never asserted this and let the
      // behavior scenario's wording drift out of sync with what the code
      // (and review-policy.yaml's own rule) actually does.
      expect(report.degraded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("request-time-lastmod-is-a-seo-finding", () => {
  it("flags a sitemap lastModified computed from request time", async () => {
    const deps: ReviewDiffDeps = {
      runPersonaLlm: (persona) =>
        persona.name === "seo"
          ? Promise.resolve({
              findings: [
                {
                  severity: "warn",
                  summary:
                    "sitemap.ts sets lastModified to new Date() instead of a stored content-edit date",
                  file: "app/sitemap.ts",
                },
              ],
            })
          : empty(),
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiff({ stagedDiff: "diff --git a/app/sitemap.ts ...", reviewConfig: config, deps });

    expect(report.findings).toContainEqual(
      expect.objectContaining({ persona: "seo", summary: expect.stringContaining("lastModified") }),
    );
  });
});

describe("disabled-persona-is-skipped-not-errored", () => {
  it("excludes a persona with enabled:false from active_personas without throwing", () => {
    const withSeoDisabled: ReviewConfig = ReviewConfigSchema.parse({
      personas: [
        { name: "correctness", enabled: true, severity_default: "block" },
        { name: "security", enabled: true, severity_default: "block" },
        { name: "seo", enabled: false, severity_default: "warn" },
      ],
    });

    const active = resolvePersonas(withSeoDisabled);

    expect(active.map((p) => p.name)).toEqual(["correctness", "security"]);
  });

  it("treats a partial override as a patch onto the built-in defaults, not a replacement", () => {
    // The real case this guards: a library repo's .no-yolo-review.yml only
    // says `- name: seo / enabled: false` — correctness and security must
    // still run on their built-in focus/severity, unmentioned.
    const onlySeoOverridden: ReviewConfig = ReviewConfigSchema.parse({
      personas: [{ name: "seo", enabled: false }],
    });

    const active = resolvePersonas(onlySeoOverridden);

    expect(active.map((p) => p.name).sort()).toEqual(["correctness", "security"]);
    expect(active.find((p) => p.name === "correctness")?.focus).toBeTruthy();
  });

  it("doesn't let an override that only sets `enabled` silently corrupt an untouched field", () => {
    // A real bug this project's own review-diff caught running on itself:
    // PersonaSchema used zod .default("warn") on severity_default, so an
    // override that only mentioned `enabled` still parsed WITH a
    // severity_default of "warn" filled in by zod — indistinguishable from
    // the user having chosen "warn" on purpose — and the merge then
    // overwrote security's real built-in default ("block") with it.
    const onlyEnabledTouched: ReviewConfig = ReviewConfigSchema.parse({
      personas: [{ name: "security", enabled: true }],
    });

    const [security] = resolvePersonas(onlyEnabledTouched);

    expect(security.severity_default).toBe("block");
  });
});

describe("runs-standalone-without-touching-git", () => {
  // The exit-code contract (0 if not blocked, 1 if blocked) that a future
  // no-yolo-commits hook would rely on when invoking `npx no-yolo-review`
  // itself — exercised here at the composeReport level, since the CLI
  // entrypoint itself needs a real provider CLI and a real git repo to run
  // end to end, which is out of scope for a unit suite.
  it("derives blocked from findings alone, with no side channel", () => {
    expect(composeReport([], false).blocked).toBe(false);
    expect(
      composeReport(
        [{ persona: "security", severity: "block", summary: "x" }],
        false,
      ).blocked,
    ).toBe(true);
  });
});

describe("apply-policy-overrides", () => {
  it("escalates a security-shaped finding to block regardless of the persona's own severity", () => {
    const [finding] = applyPolicyOverrides(
      [{ persona: "correctness", severity: "warn", summary: "Leaks an API secret in a log line" }],
      { policy_overrides: [] },
    );

    expect(finding.severity).toBe("block");
    expect(finding.escalated_by).toBe("security-findings-always-block");
  });

  it("cannot be downgraded below block by a project policy_override", () => {
    const [finding] = applyPolicyOverrides(
      [{ persona: "security", severity: "block", summary: "Hardcoded AWS credential" }],
      { policy_overrides: [{ match: "credential", severity: "warn" }] },
    );

    expect(finding.severity).toBe("block");
    expect(finding.escalated_by).toBe("security-findings-always-block");
  });

  it("does not escalate a word that merely contains 'secret' or 'credential' as a substring", () => {
    // A real, self-referential bug this project's own review-diff caught:
    // the unbounded version of this regex matched "secretary" and
    // "credentialing" — and the finding describing that bug got wrongly
    // escalated by the very rule it was reporting, since its own summary
    // contained the word "credentialing".
    const findings = applyPolicyOverrides(
      [
        { persona: "correctness", severity: "warn", summary: "Update the secretary's contact form" },
        { persona: "correctness", severity: "warn", summary: "Fix a typo in the credentialing workflow" },
      ],
      { policy_overrides: [] },
    );

    expect(findings.every((f) => f.severity === "warn")).toBe(true);
    expect(findings.every((f) => f.escalated_by === undefined)).toBe(true);
  });

  it("still escalates the plural/real forms (secrets, credentials)", () => {
    const findings = applyPolicyOverrides(
      [
        { persona: "security", severity: "warn", summary: "Logs request secrets in plaintext" },
        { persona: "security", severity: "warn", summary: "Leaks user credentials to a third-party analytics call" },
      ],
      { policy_overrides: [] },
    );

    expect(findings.every((f) => f.severity === "block")).toBe(true);
  });

  it("skips a policy_override pattern shaped for catastrophic backtracking instead of hanging", () => {
    const start = Date.now();
    const [finding] = applyPolicyOverrides(
      [{ persona: "correctness", severity: "warn", summary: "a".repeat(40) + "!" }],
      { policy_overrides: [{ match: "(a+)+$", severity: "block" }] },
    );

    expect(Date.now() - start).toBeLessThan(1000);
    expect(finding.severity).toBe("warn"); // override skipped, not applied
  });
});

describe("reviewDiffChunked", () => {
  // --all reviews the whole repo as multiple chunks (see src/repo-source.ts
  // for why: a single request over the whole repo already sat right at
  // @kitana-sdk/core's hard 120s CLI-kill ceiling). This is the merge step
  // that makes that still read as one review, not several disconnected ones.
  it("pools findings from every chunk into one report", async () => {
    const callsByChunk = new Map<string, number>();
    const deps: ReviewDiffDeps = {
      runPersonaLlm: (persona, diff) => {
        callsByChunk.set(diff, (callsByChunk.get(diff) ?? 0) + 1);
        if (diff === "chunk-a" && persona.name === "security") {
          return Promise.resolve({ findings: [{ severity: "block", summary: "issue in chunk a" }] });
        }
        if (diff === "chunk-b" && persona.name === "correctness") {
          return Promise.resolve({ findings: [{ severity: "warn", summary: "issue in chunk b" }] });
        }
        return empty();
      },
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiffChunked({
      materialChunks: ["chunk-a", "chunk-b"],
      reviewConfig: config,
      deps,
    });

    expect(report.findings).toContainEqual(expect.objectContaining({ summary: "issue in chunk a" }));
    expect(report.findings).toContainEqual(expect.objectContaining({ summary: "issue in chunk b" }));
    expect(report.blocked).toBe(true);
    // Every one of the 3 built-in personas ran once per chunk, not once total.
    expect(callsByChunk.get("chunk-a")).toBe(3);
    expect(callsByChunk.get("chunk-b")).toBe(3);
  });

  it("skips a blank chunk without calling any persona for it", async () => {
    const seen: string[] = [];
    const deps: ReviewDiffDeps = {
      runPersonaLlm: (_persona, diff) => {
        seen.push(diff);
        return empty();
      },
      runAggregatorLlm: passthroughAggregator,
    };

    await reviewDiffChunked({ materialChunks: ["real content", "   \n  "], reviewConfig: config, deps });

    expect(seen.every((d) => d === "real content")).toBe(true);
  });

  it("degrades but keeps other chunks' findings when one chunk's personas all fail", async () => {
    const deps: ReviewDiffDeps = {
      runPersonaLlm: (_persona, diff) =>
        diff === "bad-chunk"
          ? Promise.reject(new Error("boom"))
          : Promise.resolve({ findings: [{ severity: "warn", summary: "fine chunk finding" }] }),
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiffChunked({
      materialChunks: ["bad-chunk", "good-chunk"],
      reviewConfig: config,
      deps,
    });

    expect(report.degraded).toBe(true);
    expect(report.findings).toContainEqual(expect.objectContaining({ summary: "fine chunk finding" }));
  });

  it("is what reviewDiff delegates to for a single-chunk (staged-diff) review", async () => {
    let calls = 0;
    const deps: ReviewDiffDeps = {
      runPersonaLlm: () => {
        calls += 1;
        return empty();
      },
      runAggregatorLlm: passthroughAggregator,
    };

    const report = await reviewDiff({ stagedDiff: "diff --git a/x ...", reviewConfig: config, deps });

    expect(report.blocked).toBe(false);
    expect(calls).toBeGreaterThan(0);
  });
});
