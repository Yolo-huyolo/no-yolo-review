import type { Finding, ReviewConfig, TaggedFinding } from "../config/schema.js";

/**
 * review-policy.yaml's security-findings-always-block rule. Deliberately not
 * configurable — review-config's policy_overrides are additive to this, never
 * a replacement for it (see review-config.artifact.yaml).
 *
 * Word-bounded (\b...\b) on purpose — an earlier unbounded version
 * substring-matched "secretary" and "credentialing" as if they were
 * "secret"/"credential", a real false-positive this project's own
 * review-diff caught running on itself (the finding describing the bug
 * contained the word "credentialing" in its own summary, and got wrongly
 * escalated by the very rule it was describing).
 */
const SECURITY_ALWAYS_BLOCK = /\b(xss|secrets?|credentials?|sql injection|ssrf)\b/i;
const SECURITY_RULE_ID = "security-findings-always-block";

// Cheap, best-effort ReDoS guard for policy_overrides[].match, which is
// loaded straight from the target repo's .no-yolo-review.yml — untrusted
// input in the CI-on-a-PR use case (no-yolo-commits' README describes
// running this in a GitHub Action against a PR's diff), since a PR can edit
// that config file itself. Not a full safe-regex implementation, just the
// classic nested-quantifier shape that causes catastrophic backtracking
// ((x+)+, (x*)+, (x+)*, (x*)*), plus a length cap. A pattern that trips this
// is skipped, not thrown — one bad override must not take down policy
// application for every finding.
const UNSAFE_REGEX_SHAPE = /\([^()]*[+*]\)[+*]/;
const MAX_OVERRIDE_PATTERN_LENGTH = 200;

function isPatternSafe(pattern: string): boolean {
  return pattern.length <= MAX_OVERRIDE_PATTERN_LENGTH && !UNSAFE_REGEX_SHAPE.test(pattern);
}

/**
 * Pure function: (raw findings, config) -> policy-escalated findings. No LLM
 * calls — regex/keyword matching only, deterministic (review-policy.yaml's
 * apply-policy-overrides step, critical:true).
 */
export function applyPolicyOverrides(
  rawFindings: readonly TaggedFinding[],
  config: Pick<ReviewConfig, "policy_overrides">,
): Finding[] {
  return rawFindings.map((finding) => {
    let severity = finding.severity;
    let escalatedBy: string | undefined;

    for (const override of config.policy_overrides ?? []) {
      if (!isPatternSafe(override.match)) continue;

      let matches: boolean;
      try {
        matches = new RegExp(override.match, "i").test(finding.summary);
      } catch {
        // An invalid regex in project config must not crash the review —
        // skip that override, keep evaluating the rest.
        continue;
      }
      if (matches && override.severity !== severity) {
        severity = override.severity;
        escalatedBy = `policy-override:${override.match}`;
      }
    }

    // Built-in rule always wins last — see the module doc comment.
    if (SECURITY_ALWAYS_BLOCK.test(finding.summary) && severity !== "block") {
      severity = "block";
      escalatedBy = SECURITY_RULE_ID;
    }

    return {
      ...finding,
      severity,
      ...(escalatedBy ? { escalated_by: escalatedBy } : {}),
    };
  });
}
