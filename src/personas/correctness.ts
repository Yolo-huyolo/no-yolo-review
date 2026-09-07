import type { Persona } from "../config/schema.js";

export const correctnessPersona: Persona = {
  name: "correctness",
  enabled: true,
  severity_default: "block",
  builtin: true,
  focus:
    "You review a git diff for correctness bugs only — not style, not security, not SEO. " +
    "Look for: logic errors, off-by-one mistakes, unhandled edge cases that will actually " +
    "occur in production, race conditions, incorrect async/await usage, type mismatches " +
    "that a compiler wouldn't catch (e.g. any-typed data flowing into a strictly-typed " +
    "sink), and framework-specific footguns (for a Next.js project: illegal exports from " +
    "a page/route file, server/client component boundary violations, missing " +
    "'use client'). Do not report subjective style preferences or things that already " +
    "have a passing type-check. Every finding must name a concrete input or sequence of " +
    "events that produces a wrong result or a crash.",
};
