import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Valid UTF-8 text, but pure noise for a reviewer — no logic to inspect, and
// large enough (a six-figure-character package-lock.json is common) to crowd
// out real source in a whole-repo dump for zero benefit. Same exclusion
// no-yolo-commits' own pre-commit review already applies to diffs.
export const NOISE_FILENAME =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock)$/;

export function isProbablyBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

export interface FileEntry {
  file: string;
  /** "--- path ---\n<content>", ready to drop straight into a chunk. */
  text: string;
}

/**
 * Tracked + untracked-but-not-gitignored file paths — deliberately not
 * `git diff <empty-tree>`, which only shows *tracked* content and silently
 * skips anything on disk but not yet `git add`-ed (exactly the case right
 * after writing a new feature, before the first commit). No `git add -N`
 * side effect on the caller's repo state either way.
 */
export function listRepoFiles(): string[] {
  const fileList = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return fileList.split("\n").filter(Boolean).filter((f) => !NOISE_FILENAME.test(f));
}

export function readRepoFileEntries(files: readonly string[]): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const file of files) {
    let buf: Buffer;
    try {
      buf = readFileSync(file);
    } catch {
      continue; // gone since listed, a symlink to nowhere, etc. — skip, not fatal
    }
    if (isProbablyBinary(buf)) continue;
    entries.push({ file, text: `--- ${file} ---\n${buf.toString("utf8")}` });
  }
  return entries;
}

/**
 * Packs entries into chunks whose total size stays under budgetChars,
 * greedily and in order, never splitting a single entry across chunks — an
 * entry larger than the budget on its own becomes its own oversized chunk
 * rather than being cut mid-file.
 *
 * Why chunk at all: @kitana-sdk/core hard-kills its `claude` CLI child
 * process at 120s (not configurable from here), and reviewing this
 * project's own ~150KB of source as one request already took ~118s per
 * persona — right at that ceiling. One request per whole repo isn't a
 * review that scales; this is.
 */
export function packIntoChunks(entries: readonly FileEntry[], budgetChars: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const entry of entries) {
    if (currentLen > 0 && currentLen + entry.text.length > budgetChars) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentLen = 0;
    }
    current.push(entry.text);
    currentLen += entry.text.length;
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));

  return chunks;
}

// ~148KB in one request measured at ~118s per persona against Kitana's hard
// 120s ceiling. Chunking to well under half that leaves real margin instead
// of trading one edge case for another.
export const DEFAULT_CHUNK_BUDGET_CHARS = 50_000;

export function getWholeRepoChunks(
  budgetChars: number = DEFAULT_CHUNK_BUDGET_CHARS,
): string[] {
  const entries = readRepoFileEntries(listRepoFiles());
  return packIntoChunks(entries, budgetChars);
}
