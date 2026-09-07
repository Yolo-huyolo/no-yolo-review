#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { loadReviewConfig } from "./config/load.js";
import { reviewDiff, reviewDiffChunked } from "./flows/review-diff.js";
import { formatReport, formatReportHtml } from "./report.js";
import { getWholeRepoChunks } from "./repo-source.js";
import type { ReviewReport } from "./config/schema.js";

function getStagedDiff(): string {
  try {
    return execFileSync("git", ["diff", "--cached"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read staged diff via \`git diff --cached\`: ${message}`);
  }
}

/**
 * Reads a diff piped in on stdin, e.g. from a pre-push hook computing
 * `git diff <remote>..<local>` for the commits actually being pushed —
 * `--all` reviews the whole repo, which doesn't scale to "review what I'm
 * about to push" on anything past a small project, and `git diff --cached`
 * is normally empty by push time (everything's already committed). Standard
 * Unix convention: only read stdin when it's actually piped/redirected, so
 * a plain interactive `no-yolo-review` never blocks waiting on a TTY.
 */
function readPipedStdin(): string | undefined {
  if (process.stdin.isTTY) return undefined;
  try {
    const data = readFileSync(0, "utf8");
    return data.trim() ? data : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("no-yolo-review")
    .description(
      "Standalone multi-persona AI code review — run it manually, or later from a " +
        "no-yolo-commits hook via `npx no-yolo-review`.",
    )
    .option("--stack <stack>", "Project stack description, passed into every persona's prompt")
    .option("--namer <namer>", "Which CLI runs the personas: claude, codex, or ollama")
    .option("--config <path>", "Path to a .no-yolo-review.yml, relative to cwd")
    .option(
      "--all",
      "Review the whole tracked codebase as it stands on disk, not just staged changes " +
        "(chunked by file so each request stays within the underlying CLI's own timeout)",
    )
    .option("--html <path>", "Also write an HTML report to this path")
    .parse(process.argv);

  const opts = program.opts<{
    stack?: string;
    namer?: "claude" | "codex" | "ollama";
    config?: string;
    all?: boolean;
    html?: string;
  }>();

  const reviewConfig = loadReviewConfig(process.cwd(), {
    stack: opts.stack,
    namer: opts.namer,
    configPath: opts.config,
  });

  let report: ReviewReport;

  if (opts.all) {
    const chunks = getWholeRepoChunks().filter((c) => c.trim());
    if (chunks.length === 0) {
      console.log("No tracked (non-ignored) files found — nothing to review.");
      process.exit(0);
    }
    const totalChars = chunks.reduce((n, c) => n + c.length, 0);
    console.log(
      `Reviewing ~${Math.round(totalChars / 1000)}k characters of source across ` +
        `${chunks.length} chunk${chunks.length === 1 ? "" : "s"}, sequentially...`,
    );
    report = await reviewDiffChunked({ materialChunks: chunks, reviewConfig });
  } else {
    const piped = readPipedStdin();
    const stagedDiff = piped ?? getStagedDiff();
    if (!stagedDiff.trim()) {
      console.log(
        piped !== undefined
          ? "Piped input was empty — nothing to review."
          : "No staged changes — nothing to review.",
      );
      process.exit(0);
    }
    report = await reviewDiff({ stagedDiff, reviewConfig });
  }

  console.log(formatReport(report));

  if (opts.html) {
    const html = formatReportHtml(report, {
      scope: opts.all ? "whole tracked codebase" : "staged changes",
    });
    writeFileSync(opts.html, html, "utf8");
    console.log(`\nHTML report written to ${opts.html}`);
  }

  process.exit(report.blocked ? 1 : 0);
}

main().catch((err) => {
  // Anything that reaches here is a bug or a fundamentally broken
  // environment (e.g. git itself missing) — not something fail-open covers,
  // since fail-open is specifically about the *review* being unavailable,
  // not the CLI's own plumbing.
  console.error(`no-yolo-review: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
