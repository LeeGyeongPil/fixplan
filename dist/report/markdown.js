import { findingSignals } from "../priority.js";
/** 표 칸 안의 | 는 표를 깨뜨리므로 \| 로 바꾼다 */
const cell = (s) => s.replace(/\|/g, "\\|");
const pct = (e) => (e === "unknown" ? "unknown" : `${(e * 100).toFixed(2)}%`);
function runtimeLine(result) {
    const seen = new Set();
    const parts = [];
    for (const lf of result.lockfiles) {
        const r = lf.runtime;
        const text = r.version ? `${r.name} ${r.version} (${r.source})` : `${r.name} ${r.source}`;
        if (!seen.has(text))
            parts.push(text);
        seen.add(text);
    }
    return parts.join(" · ");
}
function detail(f) {
    const lines = [];
    const kind = f.direct ? "direct" : "transitive";
    lines.push(`### ${f.priority}. ${f.name} ${f.version} (${f.ecosystem}, ${kind}, ${f.lockfile})`);
    lines.push("");
    lines.push(`- verdict: **${f.verdict}**${f.minimal_fix ? ` → minimal fix **${f.minimal_fix}**` : ""}`);
    lines.push(`- runtime: ${f.runtime.version ? `${f.runtime.name} ${f.runtime.version} — ${f.runtime.source}` : `${f.runtime.name} unknown — runtime not checked`}`);
    if (f.naive_fix) {
        lines.push(f.still_affected_by.length
            ? `- naive fix ${f.naive_fix} (highest "fixed" among current advisories) is **still affected** by ${f.still_affected_by.join(", ")}`
            : `- naive fix ${f.naive_fix} (highest "fixed" among current advisories) clears every advisory`);
    }
    if (f.blocked_reason)
        lines.push(`- why: ${f.blocked_reason}`);
    for (const n of f.notes)
        lines.push(`- note: ${n}`);
    if (f.command)
        lines.push(`- command: \`${f.command}\``);
    lines.push(`- advisories (${f.advisories.length}):`);
    for (const a of f.advisories) {
        const cve = a.aliases.filter((x) => x.startsWith("CVE-")).join(", ") || "no CVE";
        const kev = a.kev ? ", **KEV**" : "";
        lines.push(`  - ${a.id} (${cve}, ${a.severity}${kev}, EPSS ${pct(a.epss)}, fixed ${a.fixed ?? "none"}) ${a.summary}`.trimEnd());
    }
    lines.push("");
    return lines;
}
export function renderMarkdown(result) {
    const out = [];
    out.push(`# fixplan report — ${result.path}`);
    out.push("");
    if (result.source.mode === "offline") {
        out.push(`> **${result.source.note ?? `offline snapshot recorded ${result.source.recorded}`}.** Practice mode (bundled data). Run without \`--offline\` for live results.`);
    }
    else {
        out.push("> live mode: data fetched from public APIs during this run.");
    }
    out.push("");
    out.push(`Scanned ${result.lockfiles.length} lockfile(s), ${result.packages} package(s). Runtimes: ${runtimeLine(result)}`);
    out.push("");
    const s = result.summary;
    out.push(`**Summary: ${s.vulnerable} vulnerable package(s)** — fixable-in-major: ${s["fixable-in-major"]} · major-upgrade: ${s["major-upgrade"]} · runtime-blocked: ${s["runtime-blocked"]} · no-patch: ${s["no-patch"]} · in CISA KEV: ${s.kev}`);
    out.push("");
    // 스냅샷에 없는 패키지는 "안전"이 아니라 "확인 안 함" 이다 — 요약에서 분명히 말한다
    if (result.unchecked > 0) {
        out.push(`> **${result.unchecked} package(s) NOT checked** (not covered by the offline snapshot). A "0 vulnerable" above does not cover them; run without \`--offline\`.`);
        out.push("");
    }
    if (result.findings.length === 0) {
        out.push(result.unchecked > 0 ? "No known advisories affect the checked versions." : "No known advisories affect the scanned versions.");
        out.push("");
    }
    else {
        out.push("| # | Package | Current | Verdict | Minimal fix | Advisories | KEV | EPSS (max) | Command |");
        out.push("|---|---|---|---|---|---|---|---|---|");
        for (const f of result.findings) {
            const sig = findingSignals(f);
            const command = f.command ? `\`${cell(f.command)}\`` : f.verdict === "runtime-blocked" ? "upgrade runtime first" : "—";
            out.push(`| ${f.priority} | ${f.ecosystem} ${cell(f.name)} | ${f.version} | ${f.verdict} | ${f.minimal_fix ?? "—"} | ${f.advisories.length} (${sig.severity}) | ${sig.kev ? "yes" : "no"} | ${pct(sig.epss)} | ${command} |`);
        }
        out.push("");
        out.push("## Details");
        out.push("");
        for (const f of result.findings)
            out.push(...detail(f));
    }
    out.push("Notes: `no-patch` and EPSS `unknown` do not mean safe. Commands are suggestions — fixplan never edits lockfiles.");
    if (result.warnings.length) {
        out.push("");
        out.push("## Warnings");
        out.push("");
        for (const w of result.warnings)
            out.push(`- ${w}`);
    }
    return out.join("\n") + "\n";
}
