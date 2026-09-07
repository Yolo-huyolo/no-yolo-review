import { randomUUID } from "node:crypto";
import { InMemoryRunner, LlmAgent } from "@google/adk";
import { KitanaLlm, extractText } from "@kitana-sdk/adk";
import {
  AggregatedOutputSchema,
  PersonaOutputSchema,
  type AggregatedOutput,
  type Persona,
  type PersonaOutput,
  type ReviewConfig,
  type ReviewReport,
  type TaggedFinding,
} from "../config/schema.js";
import { BUILTIN_PERSONAS } from "../personas/registry.js";
import { applyPolicyOverrides } from "../policy/apply.js";
import { composeReport } from "../report.js";

// review-policy.yaml: persona-timeout. Base budget for a normal-sized diff;
// scaled up for a large input (e.g. --all's whole-repo dump) by
// personaTimeoutFor below, since a 90s flat timeout doesn't hold once the
// material is a few hundred KB — observed directly: two personas each took
// ~118s (real Claude CLI calls, not hung) reviewing this project's own
// ~150KB --all dump, well past a flat 90s.
const PERSONA_TIMEOUT_MS = 90_000;
const TIMEOUT_PER_KB_MS = 400;
// @kitana-sdk/core hard-kills its `claude` CLI child process at 120s
// (providers/claude.js's callClaude, `timeout: 120000`) — not configurable
// from anything KitanaLlm/RouterConfig exposes. Capping a little under that
// means OUR timeout fires first, so a genuinely large --all run reports a
// clean "timed out" instead of surfacing Kitana's raw "exit 143"/SIGTERM.
// It does NOT raise the real ceiling — a persona given more than what fits
// in ~120s of Claude CLI time will still degrade; only Kitana's own
// constant, or a smaller `--all` input, changes that.
const MAX_PERSONA_TIMEOUT_MS = 115_000;
const APP_NAME = "no-yolo-review";

function personaTimeoutFor(materialLength: number): number {
  const extra = Math.floor(materialLength / 1024) * TIMEOUT_PER_KB_MS;
  return Math.min(MAX_PERSONA_TIMEOUT_MS, PERSONA_TIMEOUT_MS + extra);
}

/**
 * load-personas (config.resolve-personas): review_config.personas entries
 * are overrides BY NAME on top of the three built-in presets, not a
 * wholesale replacement of them — a config that only disables `seo` must
 * still leave `correctness` and `security` running on their built-in
 * defaults. Any entry whose name isn't a built-in is a custom persona,
 * added alongside them. Throws on an empty result or a custom persona
 * missing `focus` — both are config errors, not "no review" (critical:true
 * in review-diff.flow.yaml).
 */
export function resolvePersonas(config: ReviewConfig): Persona[] {
  const overridesByName = new Map((config.personas ?? []).map((p) => [p.name, p]));
  const merged: Persona[] = [];

  for (const builtin of BUILTIN_PERSONAS) {
    const override = overridesByName.get(builtin.name);
    overridesByName.delete(builtin.name);
    // Field-by-field, not a spread: only a field the override *explicitly*
    // set should win — see PersonaOverrideSchema's doc comment for why a
    // naive `{...builtin, ...override}` is wrong here.
    merged.push(
      override
        ? {
            ...builtin,
            enabled: override.enabled ?? builtin.enabled,
            severity_default: override.severity_default ?? builtin.severity_default,
            focus: override.focus ?? builtin.focus,
          }
        : builtin,
    );
  }

  for (const custom of overridesByName.values()) {
    if (!custom.focus) {
      throw new Error(
        `Persona "${custom.name}" is not a built-in persona (correctness/security/seo) ` +
          `and has no "focus" — custom personas must define one.`,
      );
    }
    merged.push({
      name: custom.name,
      enabled: custom.enabled ?? true,
      severity_default: custom.severity_default ?? "warn",
      focus: custom.focus,
    });
  }

  const active = merged.filter((p) => p.enabled);
  if (active.length === 0) {
    throw new Error(
      "No enabled personas in review_config — at least one persona must be enabled.",
    );
  }

  return active;
}

export interface ReviewDiffDeps {
  runPersonaLlm: (persona: Persona, diff: string, config: ReviewConfig) => Promise<PersonaOutput>;
  runAggregatorLlm: (
    findings: readonly TaggedFinding[],
    config: ReviewConfig,
  ) => Promise<AggregatedOutput>;
}

/**
 * Extracts a JSON object from a model's raw text reply, tolerating a
 * markdown code fence and/or leading or trailing prose around it. Every
 * persona instruction demands JSON-only output, but that's a request, not a
 * guarantee — Kitana relays through a CLI (Claude Code, Codex), which has no
 * native structured-output mode to fall back on the way a direct Gemini API
 * call would, so the model sometimes answers in prose around the JSON, or
 * with a fenced block, rather than pure JSON.
 */
function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in model output: ${text.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Runs one agent turn and returns its parsed JSON reply.
 *
 * Deliberately does not rely on ADK's outputSchema/outputKey auto-parse:
 * that mechanism only reliably produces structured output against providers
 * with native structured-output support (e.g. Gemini's responseSchema).
 * Through KitanaLlm's CLI relay it silently fails to parse and leaves
 * outputKey unset — observed directly running this against the real claude
 * CLI, not a hypothetical. Reading the model's own text and parsing JSON out
 * of it ourselves works regardless of provider.
 */
async function runLlmAgentOnce(agent: LlmAgent, promptText: string): Promise<unknown> {
  const runner = new InMemoryRunner({ agent, appName: APP_NAME });
  const userId = APP_NAME;
  const sessionId = randomUUID();
  await runner.sessionService.createSession({ appName: APP_NAME, userId, sessionId });

  let lastText: string | undefined;
  for await (const event of runner.runAsync({
    userId,
    sessionId,
    newMessage: { role: "user", parts: [{ text: promptText }] },
  })) {
    const text = extractText(event.content);
    if (text) lastText = text;
  }

  if (!lastText) {
    throw new Error(`Agent "${agent.name}" produced no text output`);
  }
  return extractJsonObject(lastText);
}

function buildKitanaModel(config: ReviewConfig): KitanaLlm {
  return new KitanaLlm({ model: "auto", chain: [config.namer] });
}

/**
 * fan-out-personas, one persona's turn. Not run directly by the flow —
 * always through fanOutPersonas' per-persona timeout race, so a hung call
 * can't be told apart from a slow-but-honest one from in here.
 */
export async function runPersonaLlm(
  persona: Persona,
  diff: string,
  config: ReviewConfig,
): Promise<PersonaOutput> {
  const agent = new LlmAgent({
    name: `persona_${persona.name}`,
    model: buildKitanaModel(config),
    instruction:
      `Project stack: ${config.stack}\n\n${persona.focus}\n\n` +
      `Review only the staged diff you're given below. Report every real issue as an ` +
      `entry in "findings", using severity "${persona.severity_default}" unless a ` +
      `specific issue clearly warrants the other severity. If you find nothing, return ` +
      `an empty findings array — do not invent issues to have something to say. What ` +
      `follows may be a unified diff or the full contents of one or more source files, ` +
      `depending on how this review was invoked — review whichever you're given.\n\n` +
      `Respond with ONLY a single JSON object of this exact shape, and nothing else — ` +
      `no markdown code fence, no explanation before or after it:\n` +
      `{"findings": [{"severity": "block" | "warn", "summary": string, "file"?: string, "line"?: number}]}`,
  });

  const raw = await runLlmAgentOnce(agent, "```\n" + diff + "\n```");
  return PersonaOutputSchema.parse(raw);
}

/**
 * aggregate-findings, the single non-persona LLM call: merges/dedupes, never
 * invents (review-diff.flow.yaml's aggregate-findings step comment).
 */
export async function runAggregatorLlm(
  findings: readonly TaggedFinding[],
  config: ReviewConfig,
): Promise<AggregatedOutput> {
  const agent = new LlmAgent({
    name: "aggregator",
    model: buildKitanaModel(config),
    instruction:
      "You receive findings already reported by several review personas, as JSON. " +
      "Deduplicate entries that point at the same root cause reported by more than one " +
      "persona (keep one; prefer the higher severity and the more specific summary, and " +
      "keep its original persona value). Do NOT invent new findings and do NOT drop a " +
      "finding just because you disagree with it — you merge, you don't judge.\n\n" +
      "Respond with ONLY a single JSON object of this exact shape, and nothing else — " +
      "no markdown code fence, no explanation before or after it:\n" +
      '{"findings": [{"persona": string, "severity": "block" | "warn", "summary": string, "file"?: string, "line"?: number}]}',
  });

  const raw = await runLlmAgentOnce(agent, JSON.stringify({ findings }, null, 2));
  return AggregatedOutputSchema.parse(raw);
}

export const defaultReviewDiffDeps: ReviewDiffDeps = {
  runPersonaLlm,
  runAggregatorLlm,
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Real calls through Kitana to a CLI provider show meaningful run-to-run
// variance independent of input size (CLI startup, provider-side load) — on
// top of @kitana-sdk/core's hard 120s kill, observed directly hitting that
// ceiling even on modest chunk sizes. A timeout or transient CLI error is
// often just that one call being unlucky; one retry recovers most of those
// without needing a bigger timeout budget (which wouldn't help — Kitana's
// ceiling isn't ours to raise) or smaller chunks (which don't address
// variance that isn't proportional to size).
async function callWithRetry<T>(fn: () => Promise<T>, timeoutMs: number, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

interface FanOutResult {
  findings: TaggedFinding[];
  degraded: boolean;
}

/**
 * fan-out-personas: every active persona, concurrently, each under its own
 * budget and up to one retry (see callWithRetry). A persona that still
 * errors or times out after that is dropped — fail-open-on-review-
 * unavailable / persona-timeout — the others still proceed to aggregation
 * (review-diff.behavior.yaml: fails-open-on-persona-timeout).
 *
 * This intentionally uses plain Promise.allSettled rather than ADK's
 * ParallelAgent: per-persona timeout and drop-on-error need to be enforced
 * exactly as review-policy.yaml states, not left to framework defaults.
 */
async function fanOutPersonas(
  diff: string,
  personas: readonly Persona[],
  config: ReviewConfig,
  deps: ReviewDiffDeps,
): Promise<FanOutResult> {
  const timeoutMs = personaTimeoutFor(diff.length);
  const settled = await Promise.allSettled(
    personas.map((persona) =>
      callWithRetry(() => deps.runPersonaLlm(persona, diff, config), timeoutMs).then(
        (output) => ({ persona, output }),
      ),
    ),
  );

  const findings: TaggedFinding[] = [];
  let degraded = false;

  for (const result of settled) {
    if (result.status === "rejected") {
      degraded = true;
      continue;
    }
    const { persona, output } = result.value;
    for (const f of output.findings) {
      findings.push({ ...f, persona: persona.name });
    }
  }

  return { findings, degraded };
}

/**
 * aggregate-findings: fails open onto the un-aggregated, persona-tagged
 * findings if the aggregator itself errors or times out — a broken
 * aggregator must not make the whole run look degraded/empty when personas
 * already reported real findings.
 */
async function aggregateFindings(
  findings: readonly TaggedFinding[],
  config: ReviewConfig,
  deps: ReviewDiffDeps,
): Promise<{ findings: TaggedFinding[]; degraded: boolean }> {
  if (findings.length === 0) {
    return { findings: [], degraded: false };
  }
  try {
    const aggregated = await callWithRetry(
      () => deps.runAggregatorLlm(findings, config),
      PERSONA_TIMEOUT_MS,
    );
    return { findings: aggregated.findings, degraded: false };
  } catch {
    return { findings: [...findings], degraded: true };
  }
}

export interface ReviewDiffParams {
  stagedDiff: string;
  reviewConfig: ReviewConfig;
  deps?: ReviewDiffDeps;
}

export interface ReviewDiffChunkedParams {
  /** Each chunk gets its own fan-out pass; personas run per chunk, sequentially chunk to chunk. */
  materialChunks: readonly string[];
  reviewConfig: ReviewConfig;
  deps?: ReviewDiffDeps;
}

/**
 * The general form of review-diff.flow.yaml: load-personas once, then
 * fan-out-personas per chunk (sequentially — each chunk already runs every
 * persona concurrently; running multiple chunks concurrently too would pile
 * up CLI process contention with no way to bound it), pooling every chunk's
 * findings before a single aggregate-findings -> apply-policy-overrides ->
 * compose-report pass over all of them together.
 *
 * A single-chunk call (`reviewDiff`, below) is just this with one element —
 * kept as its own function since it's what the flow spec and every existing
 * behavior scenario actually calls, and staged-diff review has no reason to
 * chunk (a real diff is essentially never large enough to need it).
 */
export async function reviewDiffChunked(params: ReviewDiffChunkedParams): Promise<ReviewReport> {
  const deps = params.deps ?? defaultReviewDiffDeps;
  const activePersonas = resolvePersonas(params.reviewConfig);

  const allFindings: TaggedFinding[] = [];
  let degraded = false;

  for (const chunk of params.materialChunks) {
    if (!chunk.trim()) continue;
    const fanOut = await fanOutPersonas(chunk, activePersonas, params.reviewConfig, deps);
    allFindings.push(...fanOut.findings);
    degraded = degraded || fanOut.degraded;
  }

  const aggregated = await aggregateFindings(allFindings, params.reviewConfig, deps);
  const findings = applyPolicyOverrides(aggregated.findings, params.reviewConfig);

  return composeReport(findings, degraded || aggregated.degraded);
}

/**
 * review-diff.flow.yaml, end to end: load-personas -> fan-out-personas ->
 * aggregate-findings -> apply-policy-overrides -> compose-report.
 */
export async function reviewDiff(params: ReviewDiffParams): Promise<ReviewReport> {
  return reviewDiffChunked({
    materialChunks: [params.stagedDiff],
    reviewConfig: params.reviewConfig,
    deps: params.deps,
  });
}
