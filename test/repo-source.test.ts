import { describe, expect, it } from "vitest";
import { packIntoChunks, type FileEntry } from "../src/repo-source.js";

function entry(file: string, len: number): FileEntry {
  return { file, text: "x".repeat(len) };
}

describe("packIntoChunks", () => {
  it("packs several small entries into one chunk under budget", () => {
    const chunks = packIntoChunks([entry("a", 10), entry("b", 10), entry("c", 10)], 100);
    expect(chunks).toHaveLength(1);
  });

  it("starts a new chunk once the running total would exceed budget", () => {
    const chunks = packIntoChunks([entry("a", 60), entry("b", 60), entry("c", 60)], 100);
    // a alone (60) fits; a+b (120) doesn't -> b starts a new chunk; b+c (120) doesn't -> c starts another.
    expect(chunks).toHaveLength(3);
  });

  it("never splits a single entry, even one larger than the budget", () => {
    const chunks = packIntoChunks([entry("huge", 500)], 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("x".repeat(500));
  });

  it("puts an oversized entry in its own chunk without merging neighbors into it", () => {
    const chunks = packIntoChunks([entry("small", 10), entry("huge", 500), entry("small2", 10)], 100);
    expect(chunks).toHaveLength(3);
    expect(chunks[1]).toBe("x".repeat(500));
  });

  it("returns an empty array for no entries", () => {
    expect(packIntoChunks([], 100)).toEqual([]);
  });
});
