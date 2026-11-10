import { affects } from "../osv/affects.js";
/** 후보 버전 하나가 현재 런타임에서 설치 가능한가 */
export function checkRuntime(scheme, rv, runtimeVersion) {
    if (runtimeVersion === null)
        return { status: "unknown" };
    // PyPI: 유효 파일 중 하나라도 맞으면 설치 가능(requires_python 이 없는 파일은 제약 없음)
    const constraints = rv.fileConstraints ?? [rv.runtimeConstraint];
    let sawUnknown = false;
    for (const c of constraints) {
        if (c === null)
            return { status: "ok" };
        const r = scheme.runtimeSatisfies(runtimeVersion, c);
        if (r === true)
            return { status: "ok" };
        if (r === "unknown")
            sawUnknown = true;
    }
    if (sawUnknown)
        return { status: "unknown" };
    return { status: "blocked", constraint: rv.runtimeConstraint ?? "" };
}
function affectingIds(input, version) {
    return input.advisories.filter((r) => affects(r, input.scheme, input.name, version).affected).map((r) => r.id);
}
export function planFix(input) {
    const { scheme, version } = input;
    // 1) 현재 버전에 해당하는 알림
    const current = [];
    for (const record of input.advisories) {
        const hit = affects(record, scheme, input.name, version);
        if (hit.affected)
            current.push({ record, fixed: hit.fixed });
    }
    if (current.length === 0)
        return null;
    // 2) naive_fix: 해당 알림들의 fixed 중 최댓값
    const fixes = current.map((c) => c.fixed).filter((f) => f !== null && scheme.valid(f));
    const naive_fix = fixes.length ? fixes.reduce((a, b) => (scheme.compare(a, b) >= 0 ? a : b)) : null;
    const still_affected_by = naive_fix ? affectingIds(input, naive_fix) : [];
    // 3) 후보: 레지스트리의 더 높은 정식 버전(프리릴리스·yanked·deprecated 제외). 레지스트리가 없으면 fixed 값들
    const notes = [];
    let pool;
    if (input.registry) {
        pool = input.registry.versions;
    }
    else {
        notes.push("registry metadata unavailable: candidates are the advisories' fixed versions, runtime not checked");
        const allFixed = new Set();
        for (const r of input.advisories) {
            for (const a of r.affected ?? [])
                for (const rg of a.ranges ?? [])
                    for (const e of rg.events)
                        if (e.fixed)
                            allFixed.add(e.fixed);
        }
        pool = [...allFixed].map((v) => ({ version: v, runtimeConstraint: null }));
    }
    const allowPre = scheme.isPrerelease(version);
    const candidates = pool
        .filter((rv) => !rv.excluded && scheme.valid(rv.version) && (allowPre || !scheme.isPrerelease(rv.version)))
        .filter((rv) => scheme.compare(rv.version, version) > 0)
        .sort((a, b) => scheme.compare(a.version, b.version));
    // 4) 안전한(모든 알림을 피하는) 후보를 작은 것부터 찾는다
    const runtimeVersion = input.registry ? input.runtimeVersion : null;
    let firstSafe = null;
    let sameMajorBlocked = null;
    let chosen = null;
    for (const rv of candidates) {
        if (affectingIds(input, rv.version).length > 0)
            continue; // 아직 다른 알림에 해당
        const rt = checkRuntime(scheme, rv, runtimeVersion);
        firstSafe ??= { rv, rt };
        const sameMajor = scheme.sameMajor(version, rv.version);
        if (rt.status === "blocked") {
            if (sameMajor)
                sameMajorBlocked ??= { rv, constraint: rt.constraint };
            continue;
        }
        // 후보는 오름차순이라 같은 메이저 버전이 다른 메이저보다 먼저 나온다 → 처음 통과한 후보가 답
        chosen = { rv, sameMajor, rt };
        break;
    }
    const rtName = scheme.runtimeName;
    const unknownNote = (rt, v) => {
        if (rt.status === "unknown" && runtimeVersion !== null) {
            notes.push(`${v}: ${rtName} requirement could not be interpreted; not treated as blocking`);
        }
    };
    if (chosen) {
        unknownNote(chosen.rt, chosen.rv.version);
        if (!chosen.sameMajor && sameMajorBlocked) {
            notes.push(`same-major fix ${sameMajorBlocked.rv.version} requires ${rtName} ${sameMajorBlocked.constraint} (current ${runtimeVersion})`);
        }
        return {
            current,
            verdict: chosen.sameMajor ? "fixable-in-major" : "major-upgrade",
            minimal_fix: chosen.rv.version,
            naive_fix,
            still_affected_by,
            blocked_reason: null,
            notes,
        };
    }
    if (firstSafe && firstSafe.rt.status === "blocked") {
        // 안전한 버전은 있지만 현재 런타임에서는 하나도 설치할 수 없다
        const c = firstSafe.rt.constraint;
        return {
            current,
            verdict: "runtime-blocked",
            minimal_fix: firstSafe.rv.version,
            naive_fix,
            still_affected_by,
            blocked_reason: `${firstSafe.rv.version} requires ${rtName} ${c} (current ${runtimeVersion}); upgrade ${rtName} to satisfy "${c}" to fix with ${firstSafe.rv.version}`,
            notes,
        };
    }
    // 안전한 버전이 없다: 어느 알림이 끝까지 남는지 적는다
    const highest = candidates.at(-1)?.version ?? null;
    const remaining = highest ? affectingIds(input, highest) : current.map((c) => c.record.id);
    return {
        current,
        verdict: "no-patch",
        minimal_fix: null,
        naive_fix,
        still_affected_by,
        blocked_reason: `no released version clears all advisories${highest ? ` (latest ${highest} is still affected by ${remaining.join(", ")})` : ""}`,
        notes,
    };
}
