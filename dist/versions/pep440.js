// PyPI 버전은 PEP 440 규칙을 따른다(2.0rc1 < 2.0, .post, .dev, epoch).
// 비교는 Renovate 가 운영에 쓰는 @renovatebot/pep440 에 맡긴다.
import { compare, explain, satisfies, valid, validRange } from "@renovatebot/pep440";
/** PEP 503 이름 정규화: Jinja2 == jinja2, foo_bar == foo.bar == foo-bar */
export function normalizePypiName(name) {
    return name.toLowerCase().replace(/[-_.]+/g, "-");
}
export const pep440Scheme = {
    ecosystem: "PyPI",
    runtimeName: "python",
    valid: (v) => valid(v) !== null,
    compare(a, b) {
        if (valid(a) === null || valid(b) === null)
            throw new Error(`not a PEP 440 version: ${valid(a) === null ? a : b}`);
        return compare(a, b);
    },
    isPrerelease(v) {
        const e = explain(v);
        return !e || e.is_prerelease || e.is_devrelease;
    },
    sameMajor(base, cand) {
        const a = explain(base);
        const b = explain(cand);
        if (!a || !b)
            return false;
        if (a.epoch !== b.epoch || a.release[0] !== b.release[0])
            return false;
        return a.release[0] !== 0 || (a.release[1] ?? 0) === (b.release[1] ?? 0);
    },
    normalizeName: normalizePypiName,
    runtimeSatisfies(runtimeVersion, constraint) {
        if (!validRange(constraint) || valid(runtimeVersion) === null)
            return "unknown";
        return satisfies(runtimeVersion, constraint);
    },
};
