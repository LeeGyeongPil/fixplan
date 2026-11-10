/** events 를 [introduced, fixed|last_affected) 구간들로 바꾼다. */
function toIntervals(events, scheme) {
    // OSV 는 events 를 버전 순서로 평가한다. "0" 은 가장 작다.
    const key = (e) => e.introduced ?? e.fixed ?? e.last_affected ?? "0";
    const sorted = [...events]
        .filter((e) => e.introduced !== undefined || e.fixed !== undefined || e.last_affected !== undefined)
        .sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (ka === "0")
            return kb === "0" ? 0 : -1;
        if (kb === "0")
            return 1;
        return scheme.compare(ka, kb);
    });
    const out = [];
    let open = null;
    for (const e of sorted) {
        if (e.introduced !== undefined) {
            if (!open)
                open = { introduced: e.introduced };
        }
        else if (open) {
            if (e.fixed !== undefined)
                open.fixed = e.fixed;
            else if (e.last_affected !== undefined)
                open.lastAffected = e.last_affected;
            out.push(open);
            open = null;
        }
    }
    if (open)
        out.push(open); // 닫히지 않은 갈래 = 아직 고친 버전 없음
    return out;
}
function inInterval(version, iv, scheme) {
    if (iv.introduced !== "0" && scheme.compare(version, iv.introduced) < 0)
        return false;
    if (iv.fixed !== undefined && scheme.compare(version, iv.fixed) >= 0)
        return false;
    if (iv.lastAffected !== undefined && scheme.compare(version, iv.lastAffected) > 0)
        return false;
    return true;
}
/** 이 affected 항목이 우리 패키지를 가리키나(생태계는 대소문자 구분, 이름은 생태계 규칙으로 정규화). */
export function matchesPackage(a, scheme, name) {
    return a.package.ecosystem === scheme.ecosystem && scheme.normalizeName(a.package.name) === scheme.normalizeName(name);
}
export function affects(record, scheme, name, version) {
    // 철회(withdrawn)된 알림은 해당 없음으로 본다
    if (record.withdrawn)
        return { affected: false, fixed: null };
    for (const a of record.affected ?? []) {
        if (!matchesPackage(a, scheme, name))
            continue;
        // 1) 범위(ECOSYSTEM·SEMVER). GIT 범위는 커밋 기준이라 버전 비교에 쓰지 않는다
        for (const r of a.ranges ?? []) {
            if (r.type !== "ECOSYSTEM" && r.type !== "SEMVER")
                continue;
            try {
                for (const iv of toIntervals(r.events, scheme)) {
                    if (inInterval(version, iv, scheme))
                        return { affected: true, fixed: iv.fixed ?? null };
                }
            }
            catch {
                // 이 생태계 문법으로 읽을 수 없는 버전이 섞인 범위는 건너뛰고, 아래 versions 목록 검사는 계속한다
                continue;
            }
        }
        // 2) versions 목록: 범위 비교 없이 정확히 일치하는지만 본다
        if ((a.versions ?? []).some((v) => v === version)) {
            return { affected: true, fixed: null };
        }
    }
    return { affected: false, fixed: null };
}
/**
 * 같은 취약점이 여러 DB 의 ID 로 올 때(GHSA·PYSEC·CVE) 하나만 남긴다.
 * GHSA 를 먼저 남기고, id 나 aliases 가 이미 본 것과 겹치면 건너뛴다.
 */
export function dedupeRecords(records) {
    const rank = (id) => (id.startsWith("GHSA-") ? 0 : 1);
    const sorted = [...records].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
    const seen = new Set();
    const out = [];
    for (const r of sorted) {
        const keys = [r.id, ...(r.aliases ?? [])];
        if (keys.some((k) => seen.has(k)))
            continue;
        keys.forEach((k) => seen.add(k));
        out.push(r);
    }
    return out;
}
