import { z } from "zod";

/**
 * finding.artifact.yaml — one issue reported by one persona (or added by the
 * aggregator/policy step, which is the only place escalated_by gets set).
 */
export const FindingSchema = z.object({
  persona: z.string(),
  severity: z.enum(["block", "warn"]),
  summary: z.string(),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  escalated_by: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/**
 * What a single persona's LlmAgent is asked to return, via outputSchema +
 * outputKey. Neither `persona` (the caller already knows which persona it
 * asked) nor `escalated_by` (only apply-policy-overrides sets that) is part
 * of this shape — asking the model for `persona` back invites it to
 * hallucinate a different value than the one we're about to stamp on anyway.
 */
export const PersonaFindingSchema = FindingSchema.omit({
  persona: true,
  escalated_by: true,
});
export const PersonaOutputSchema = z.object({
  findings: z.array(PersonaFindingSchema),
});
export type PersonaOutput = z.infer<typeof PersonaOutputSchema>;
export type RawPersonaFinding = z.infer<typeof PersonaFindingSchema>;

/**
 * What the aggregator LlmAgent is asked to return: findings that already
 * carry which persona reported them (stamped on after each persona call, in
 * the fan-out step), still missing escalated_by (only apply-policy-overrides
 * sets that).
 */
export const AggregatedFindingSchema = FindingSchema.omit({
  escalated_by: true,
});
export const AggregatedOutputSchema = z.object({
  findings: z.array(AggregatedFindingSchema),
});
export type AggregatedOutput = z.infer<typeof AggregatedOutputSchema>;
export type TaggedFinding = z.infer<typeof AggregatedFindingSchema>;

/**
 * persona.artifact.yaml — the resolved shape: every field has a real value,
 * no ambiguity about what's inherited vs. set.
 */
export const PersonaSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  severity_default: z.enum(["block", "warn"]),
  focus: z.string().optional(),
  builtin: z.boolean().optional(),
});
export type Persona = z.infer<typeof PersonaSchema>;

/**
 * What one review_config.personas entry may supply: a patch onto a built-in
 * persona (any subset of fields), or — with `focus` — a full custom one.
 * Unlike PersonaSchema, `enabled`/`severity_default` are optional with NO
 * zod .default() here on purpose: a default would fill the field in during
 * parsing itself, making "the user didn't mention this" indistinguishable
 * from "the user explicitly chose the default value" by the time
 * resolvePersonas merges it onto the builtin — which silently overwrote a
 * builtin's real severity_default with zod's default in exactly this
 * scenario, caught by this project's own review-diff running on itself.
 */
export const PersonaOverrideSchema = z.object({
  name: z.string(),
  enabled: z.boolean().optional(),
  severity_default: z.enum(["block", "warn"]).optional(),
  focus: z.string().optional(),
  builtin: z.boolean().optional(),
});
export type PersonaOverride = z.infer<typeof PersonaOverrideSchema>;

export const PolicyOverrideSchema = z.object({
  match: z.string(),
  severity: z.enum(["block", "warn"]),
});
export type PolicyOverride = z.infer<typeof PolicyOverrideSchema>;

/**
 * review-config.artifact.yaml — everything optional, since the zero-config
 * case (three built-in personas, defaults everywhere) is the common one.
 */
export const ReviewConfigSchema = z.object({
  stack: z.string().default("TypeScript"),
  namer: z.enum(["claude", "codex", "ollama"]).default("claude"),
  personas: z.array(PersonaOverrideSchema).optional(),
  policy_overrides: z.array(PolicyOverrideSchema).default([]),
});
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;

/**
 * review-report.artifact.yaml
 */
export const ReviewReportSchema = z.object({
  findings: z.array(FindingSchema),
  blocked: z.boolean(),
  degraded: z.boolean().optional(),
});
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
