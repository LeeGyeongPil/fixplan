import { findingSignals } from "../priority.js";
import { messages } from "../i18n.js";
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
function detail(f, m) {
    const lines = [];
    const kind = f.direct ? m.direct : m.transitive;
    lines.push(`### ${f.priority}. ${f.name} ${f.version} (${f.ecosystem}, ${kind}, ${f.lockfile})`);
    lines.push("");
    lines.push(`- ${m.verdict}: **${f.verdict}**${f.minimal_fix ? ` → ${m.minimalFix} **${f.minimal_fix}**` : ""}`);
    lines.push(`- ${m.runtime}: ${f.runtime.version ? `${f.runtime.name} ${f.runtime.version} — ${f.runtime.source}` : m.runtimeUnknown(f.runtime.name)}`);
    if (f.naive_fix) {
        lines.push(f.still_affected_by.length ? `- ${m.naiveStill(f.naive_fix, f.still_affected_by.join(", "))}` : `- ${m.naiveClears(f.naive_fix)}`);
    }
    if (f.blocked_reason)
        lines.push(`- ${m.why}: ${f.blocked_reason}`);
    for (const n of f.notes)
        lines.push(`- ${m.note}: ${n}`);
    if (f.command)
        lines.push(`- ${m.command}: \`${f.command}\``);
    lines.push(`- ${m.advisories(f.advisories.length)}:`);
    for (const a of f.advisories) {
        const cve = a.aliases.filter((x) => x.startsWith("CVE-")).join(", ") || m.noCve;
        const kev = a.kev ? ", **KEV**" : "";
        lines.push(`  - ${a.id} (${cve}, ${a.severity}${kev}, EPSS ${pct(a.epss)}, ${m.fixedAt(a.fixed)}) ${a.summary}`.trimEnd());
    }
    lines.push("");
    return lines;
}
/** Markdown report. lang defaults to English; the caller (CLI) passes the detected language. */
export function renderMarkdown(result, lang = "en") {
    const m = messages(lang);
    const out = [];
    out.push(m.title(result.path));
    out.push("");
    if (result.source.mode === "offline") {
        const recorded = String(result.source.recorded);
        // 동봉 스냅샷의 영어 안내문은 한국어 보고서에서 한국어 문구로 바꾼다(다른 스냅샷의 사용자 note 는 그대로)
        const bundled = result.source.note?.startsWith(`offline snapshot recorded ${recorded}`);
        out.push(m.offlineNote(result.source.note === undefined || (lang !== "en" && bundled) ? m.offlineFallbackNote(recorded) : result.source.note));
    }
    else {
        out.push(m.liveNote);
    }
    out.push("");
    out.push(m.scanned(result.lockfiles.length, result.packages, runtimeLine(result)));
    out.push("");
    const s = result.summary;
    out.push(`${m.summary(s.vulnerable)} — fixable-in-major: ${s["fixable-in-major"]} · major-upgrade: ${s["major-upgrade"]} · runtime-blocked: ${s["runtime-blocked"]} · no-patch: ${s["no-patch"]} · ${m.inKev}: ${s.kev}${result.ignored ? ` · ${m.ignoredCount(result.ignored.length)}` : ""}`);
    out.push("");
    // 스냅샷에 없는 패키지는 "안전"이 아니라 "확인 안 함" 이다 — 요약에서 분명히 말한다
    if (result.unchecked > 0) {
        out.push(m.notChecked(result.unchecked));
        out.push("");
    }
    if (result.findings.length === 0) {
        out.push(result.unchecked > 0 ? m.noneChecked : m.noneScanned);
        out.push("");
    }
    else {
        out.push(m.tableHead);
        out.push("|---|---|---|---|---|---|---|---|---|");
        for (const f of result.findings) {
            const sig = findingSignals(f);
            const command = f.command ? `\`${cell(f.command)}\`` : f.verdict === "runtime-blocked" ? m.upgradeRuntimeFirst : "—";
            out.push(`| ${f.priority} | ${f.ecosystem} ${cell(f.name)} | ${f.version} | ${f.verdict} | ${f.minimal_fix ?? "—"} | ${f.advisories.length} (${sig.severity}) | ${sig.kev ? m.yes : m.no} | ${pct(sig.epss)} | ${command} |`);
        }
        out.push("");
        out.push(m.details);
        out.push("");
        for (const f of result.findings)
            out.push(...detail(f, m));
    }
    if (result.ignored) {
        out.push(m.ignoredHeading);
        out.push("");
        if (result.ignored.length === 0)
            out.push(result.warnings.some((w) => w.startsWith("--ignore ")) ? m.ignoredNoneWarn : m.ignoredNoneNoEffect);
        for (const i of result.ignored)
            out.push(`- ${m.ignoredItem}: ${i.id} (${i.ecosystem} ${i.name} ${i.version}, ${i.lockfile})${i.affects ? ` — ${m.candidateOnly}` : ""}`);
        out.push("");
    }
    out.push(m.notes);
    if (result.warnings.length) {
        out.push("");
        out.push(m.warnings);
        out.push("");
        for (const w of result.warnings)
            out.push(`- ${w}`);
    }
    return out.join("\n") + "\n";
}
