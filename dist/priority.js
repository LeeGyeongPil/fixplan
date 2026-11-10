const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const EASE_RANK = { "fixable-in-major": 0, "major-upgrade": 1, "runtime-blocked": 2, "no-patch": 3 };
export function cvesOf(record) {
    return [record.id, ...(record.aliases ?? [])].filter((id) => id.startsWith("CVE-"));
}
export function severityOf(record) {
    const s = String(record.database_specific?.severity ?? "UNKNOWN").toUpperCase();
    return s in SEVERITY_RANK ? s : "UNKNOWN";
}
export function advisoryView(record, fixed, kev, epss) {
    const cves = cvesOf(record);
    const scores = cves.map((c) => epss.get(c)).filter((n) => typeof n === "number");
    return {
        id: record.id,
        aliases: record.aliases ?? [],
        summary: record.summary ?? "",
        severity: severityOf(record),
        kev: cves.some((c) => kev.has(c)),
        epss: scores.length ? Math.max(...scores) : "unknown",
        fixed,
    };
}
/** 패키지(finding) 하나의 대표 신호 */
export function findingSignals(f) {
    const kev = f.advisories.some((a) => a.kev);
    const known = f.advisories.map((a) => a.epss).filter((e) => e !== "unknown");
    const severity = f.advisories.map((a) => a.severity).sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0] ?? "UNKNOWN";
    return { kev, epss: known.length ? Math.max(...known) : "unknown", severity };
}
/** 정렬하고 priority(1부터)를 매긴다. 같은 입력이면 항상 같은 순서(이름·버전으로 마지막 정렬) */
export function rankFindings(findings) {
    const keyed = findings.map((f) => ({ f, s: findingSignals(f) }));
    keyed.sort((x, y) => {
        if (x.s.kev !== y.s.kev)
            return x.s.kev ? -1 : 1;
        const ex = x.s.epss === "unknown" ? -1 : x.s.epss;
        const ey = y.s.epss === "unknown" ? -1 : y.s.epss;
        if (ex !== ey)
            return ey - ex;
        const sv = SEVERITY_RANK[y.s.severity] - SEVERITY_RANK[x.s.severity];
        if (sv !== 0)
            return sv;
        const ease = EASE_RANK[x.f.verdict] - EASE_RANK[y.f.verdict];
        if (ease !== 0)
            return ease;
        return `${x.f.ecosystem}/${x.f.name}@${x.f.version}`.localeCompare(`${y.f.ecosystem}/${y.f.name}@${y.f.version}`);
    });
    return keyed.map(({ f }, i) => ({ ...f, priority: i + 1 }));
}
