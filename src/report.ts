import type { Finding, ReviewReport } from "./config/schema.js";

/**
 * review-report.artifact.yaml's compose-report step: blocked is derived, not
 * set by hand, so it can never drift from what findings actually contains.
 */
export function composeReport(
  findings: readonly Finding[],
  degraded: boolean,
): ReviewReport {
  return {
    findings: [...findings],
    blocked: findings.some((f) => f.severity === "block"),
    degraded,
  };
}

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  block: "BLOCK",
  warn: "warn",
};

export function formatReport(report: ReviewReport): string {
  const lines: string[] = [];
  lines.push("no-yolo-review — full multi-persona pass");
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const f of report.findings) {
      const location = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : "";
      const escalated = f.escalated_by ? ` [escalated by ${f.escalated_by}]` : "";
      lines.push(
        `[${SEVERITY_LABEL[f.severity]}] ${f.persona}: ${f.summary}${location}${escalated}`,
      );
    }
  }

  lines.push("");
  if (report.degraded) {
    lines.push(
      "Note: this run is degraded — one or more personas could not complete " +
        "(missing CLI, error, or timeout). Findings above are from whichever " +
        "personas did finish; this is not a reason to treat the run as blocked.",
    );
  }
  lines.push(
    report.blocked
      ? "Result: BLOCKED — at least one finding is severity:block."
      : "Result: clear.",
  );

  return lines.join("\n");
}

export interface HtmlReportMeta {
  /** What was reviewed — shown in the report header. */
  scope: "staged changes" | "whole tracked codebase";
  generatedAt?: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A single self-contained HTML file — no external CSS/JS, nothing to fetch
 * or install to view it. Matches no-yolo-commits' "no dashboard" ethos: this
 * is a report you open, not a service you run.
 */
export function formatReportHtml(report: ReviewReport, meta: HtmlReportMeta): string {
  const generatedAt = meta.generatedAt ?? new Date();
  const blockCount = report.findings.filter((f) => f.severity === "block").length;
  const warnCount = report.findings.length - blockCount;

  const rows = report.findings
    .map((f) => {
      const location = f.file
        ? `${escapeHtml(f.file)}${f.line ? `:${f.line}` : ""}`
        : "—";
      const escalated = f.escalated_by
        ? `<div class="escalated">escalated by ${escapeHtml(f.escalated_by)}</div>`
        : "";
      return `<tr class="sev-${f.severity}">
  <td><span class="badge badge-${f.severity}">${f.severity === "block" ? "BLOCK" : "warn"}</span></td>
  <td>${escapeHtml(f.persona)}</td>
  <td>${escapeHtml(f.summary)}${escalated}</td>
  <td class="loc">${location}</td>
</tr>`;
    })
    .join("\n");

  const table =
    report.findings.length === 0
      ? "<p class=\"empty\">No findings.</p>"
      : `<table>
  <thead><tr><th>Severity</th><th>Persona</th><th>Summary</th><th>Location</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>no-yolo-review report</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 2rem; background: #0b0e14; color: #d5dae3; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 .25rem; color: #fff; }
  .meta { color: #8892a4; font-size: .85rem; margin-bottom: 1.5rem; }
  .status { display: inline-block; padding: .35rem .75rem; border-radius: 6px; font-weight: 600; font-size: .95rem; margin-bottom: 1.5rem; }
  .status-blocked { background: #3a1418; color: #ff8080; border: 1px solid #5c2028; }
  .status-clear { background: #10261c; color: #6fd89a; border: 1px solid #1c3d2c; }
  .degraded { background: #3a2f10; color: #f0c674; border: 1px solid #5c4a1c; padding: .6rem .9rem; border-radius: 6px; font-size: .85rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: .88rem; }
  th { text-align: left; color: #8892a4; font-weight: 500; padding: .5rem .6rem; border-bottom: 1px solid #232a38; }
  td { padding: .6rem; border-bottom: 1px solid #1a2029; vertical-align: top; }
  tr.sev-block td:first-child { border-left: 3px solid #ff5f5f; }
  tr.sev-warn td:first-child { border-left: 3px solid #f0c674; }
  .badge { display: inline-block; padding: .15rem .5rem; border-radius: 4px; font-size: .75rem; font-weight: 700; letter-spacing: .02em; }
  .badge-block { background: #3a1418; color: #ff8080; }
  .badge-warn { background: #3a2f10; color: #f0c674; }
  .loc { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #8892a4; white-space: nowrap; }
  .escalated { font-size: .78rem; color: #8892a4; margin-top: .2rem; }
  .empty { color: #8892a4; }
</style>
</head>
<body>
<div class="wrap">
  <h1>no-yolo-review</h1>
  <div class="meta">${escapeHtml(meta.scope)} — generated ${escapeHtml(generatedAt.toISOString())}${report.degraded ? " — degraded run" : ""}</div>
  <div class="status ${report.blocked ? "status-blocked" : "status-clear"}">
    ${report.blocked ? `BLOCKED — ${blockCount} block, ${warnCount} warn` : "Clear"}
  </div>
  ${report.degraded ? `<div class="degraded">This run is degraded — one or more personas could not complete (missing CLI, error, or timeout). Findings below are from whichever personas did finish; that alone is not why this run is/isn't blocked.</div>` : ""}
  ${table}
</div>
</body>
</html>
`;
}
