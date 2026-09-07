import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { ReviewConfigSchema, type ReviewConfig } from "./schema.js";

export interface CliOverrides {
  stack?: string;
  namer?: "claude" | "codex" | "ollama";
  configPath?: string;
}

const DEFAULT_CONFIG_FILENAME = ".no-yolo-review.yml";

/**
 * Loads review-config from an optional .no-yolo-review.yml in the current
 * project, merges CLI flag overrides on top, and validates the result.
 *
 * No config file at all is the common, fully valid case — every field has a
 * sensible default (see review-config.artifact.yaml).
 */
export function loadReviewConfig(
  cwd: string,
  overrides: CliOverrides = {},
): ReviewConfig {
  const path = resolve(cwd, overrides.configPath ?? DEFAULT_CONFIG_FILENAME);

  let raw: unknown = {};
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    raw = parseYaml(text) ?? {};
  }

  const merged = {
    ...(raw as Record<string, unknown>),
    ...(overrides.stack ? { stack: overrides.stack } : {}),
    ...(overrides.namer ? { namer: overrides.namer } : {}),
  };

  return ReviewConfigSchema.parse(merged);
}
