// Composer 버전 비교와 제약 파서(직접 구현).
// 참고: https://getcomposer.org/doc/articles/versions.md
//  - 버전은 4자리로 정규화한다: 8.3.1 == 8.3.1.0
//  - stability 순서: dev < alpha < beta < RC < stable < patch
//  - 제약: `||` 와 `|` 는 OR, 공백·쉼표는 AND, `^ ~ * -` 범위
const STABILITY_RANK = { dev: 0, alpha: 1, beta: 2, rc: 3, stable: 4, patch: 5 };
// 7.4.0 / v7.4.0 / 8.0.0-RC1 / 1.0.0-beta.2 / 2.0-alpha / 1.0.0.0-dev / 1.0.0-p1
const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[._-]?(stable|beta|b|rc|alpha|a|patch|pl|p)(?:[.-]?(\d+))?)?(?:[.-]?(dev))?$/i;
export function parseComposerVersion(raw) {
    const m = VERSION_RE.exec(raw.trim());
    if (!m)
        return null; // dev-main, 1.0.x-dev 같은 브랜치 버전은 비교하지 않는다
    const num = (s) => (s === undefined ? 0 : Number(s));
    let stability = "stable";
    const tag = m[5]?.toLowerCase();
    if (tag === "alpha" || tag === "a")
        stability = "alpha";
    else if (tag === "beta" || tag === "b")
        stability = "beta";
    else if (tag === "rc")
        stability = "rc";
    else if (tag === "patch" || tag === "pl" || tag === "p")
        stability = "patch";
    if (m[7])
        stability = "dev"; // 1.0.0-dev, 1.0.0-beta1-dev 는 dev 로 본다
    return {
        nums: [num(m[1]), num(m[2]), num(m[3]), num(m[4])],
        stability,
        stabilityNum: m[6] === undefined ? 0 : Number(m[6]),
    };
}
function cmpParsed(a, b) {
    for (let i = 0; i < 4; i++) {
        const d = a.nums[i] - b.nums[i];
        if (d !== 0)
            return Math.sign(d);
    }
    const s = STABILITY_RANK[a.stability] - STABILITY_RANK[b.stability];
    if (s !== 0)
        return Math.sign(s);
    return Math.sign(a.stabilityNum - b.stabilityNum);
}
export function validComposer(v) {
    return parseComposerVersion(v) !== null;
}
export function compareComposer(a, b) {
    const pa = parseComposerVersion(a);
    const pb = parseComposerVersion(b);
    if (!pa || !pb)
        throw new Error(`not a comparable Composer version: ${!pa ? a : b}`);
    return cmpParsed(pa, pb);
}
/** 버전 문자열에서 "몇 자리까지 적혔는지"와 숫자들을 꺼낸다(와일드카드·캐럿 계산용). */
function parts(raw) {
    const m = /^v?(\d+)(?:\.(\d+|\*|x))?(?:\.(\d+|\*|x))?(?:\.(\d+|\*|x))?/i.exec(raw);
    if (!m)
        throw new Error(`cannot parse version '${raw}' in constraint`);
    const out = [];
    for (const g of [m[1], m[2], m[3], m[4]]) {
        if (g === undefined || g === "*" || g.toLowerCase() === "x")
            break;
        out.push(Number(g));
    }
    return out;
}
/** [1,2] → 1.2.0.0 에 stability 를 붙인 ComposerVersion */
function fromParts(p, stability = "stable") {
    return { nums: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0], stability, stabilityNum: 0 };
}
function mustParse(raw) {
    const v = parseComposerVersion(raw);
    if (!v)
        throw new Error(`cannot parse version '${raw}' in constraint`);
    return v;
}
/** 범위의 아래쪽은 `-dev` 까지 포함, 위쪽은 `-dev` 미만(Composer 와 같은 방식) */
function range(lowParts, highParts) {
    return [
        { op: ">=", v: fromParts(lowParts, "dev") },
        { op: "<", v: fromParts(highParts, "dev") },
    ];
}
function parseSingle(c) {
    if (c === "*" || c === "x" || c === "X")
        return [];
    // ^ : 가장 왼쪽의 0 아닌 자리까지 고정. ^7.2.5 = >=7.2.5 <8, ^0.3 = >=0.3 <0.4
    if (c.startsWith("^")) {
        const p = parts(c.slice(1));
        let pos = p.findIndex((n) => n !== 0);
        if (pos === -1)
            pos = Math.max(p.length - 1, 0);
        const high = p.slice(0, pos + 1);
        high[pos] = (high[pos] ?? 0) + 1;
        return range(p, high);
    }
    // ~ : 마지막 자리 바로 앞까지 고정. ~7.2.5 = >=7.2.5 <7.3, ~1.2 = >=1.2 <2
    if (c.startsWith("~")) {
        const p = parts(c.slice(1));
        const keep = Math.max(p.length - 1, 1);
        const high = p.slice(0, keep);
        high[keep - 1] = (high[keep - 1] ?? 0) + 1;
        return range(p, high);
    }
    // 와일드카드 7.4.* = >=7.4 <7.5
    if (/\.[*x]$/i.test(c)) {
        const p = parts(c);
        const high = p.slice();
        high[high.length - 1] = (high[high.length - 1] ?? 0) + 1;
        return range(p, high);
    }
    // 비교 연산자
    const m = /^(>=|<=|>|<|!=|<>|==|=)?\s*(.+)$/.exec(c);
    if (!m)
        throw new Error(`cannot parse constraint '${c}'`);
    const rawOp = m[1] ?? "==";
    const op = rawOp === "=" ? "==" : rawOp === "<>" ? "!=" : rawOp;
    const v = mustParse(m[2]);
    // Composer 는 `>=1.0`, `<2.0` 처럼 stable 버전이 오면 -dev 를 붙여 비교한다
    if ((op === ">=" || op === "<") && v.stability === "stable")
        v.stability = "dev";
    return [{ op, v }];
}
function parseAndGroup(group) {
    const g = group.trim();
    // 하이픈 범위: "1.0 - 2.0" = >=1.0 <2.1 (오른쪽이 덜 적혔으면 다음 자리 미만), "1.0.0 - 2.1.0" = <=2.1.0
    const hy = /^(\S+)\s+-\s+(\S+)$/.exec(g);
    if (hy) {
        const low = parts(hy[1]);
        const highRaw = parts(hy[2]);
        const lowBound = { op: ">=", v: fromParts(low, "dev") };
        if (highRaw.length >= 3)
            return [lowBound, { op: "<=", v: mustParse(hy[2]) }];
        const high = highRaw.slice();
        high[high.length - 1] = (high[high.length - 1] ?? 0) + 1;
        return [lowBound, { op: "<", v: fromParts(high, "dev") }];
    }
    // 연산자 뒤 공백을 붙인다(">= 7.2" → ">=7.2") 그런 다음 공백·쉼표로 AND 분리
    const tight = g.replace(/(>=|<=|<>|!=|==|>|<|=|\^|~)\s+/g, "$1");
    const items = tight.split(/[\s,]+/).filter(Boolean);
    return items.flatMap(parseSingle);
}
export function parseComposerConstraint(constraint) {
    const text = constraint.trim();
    if (text === "")
        throw new Error("empty constraint");
    // `||` 와 `|` 모두 OR
    return text.split(/\s*\|\|?\s*/).map(parseAndGroup);
}
function check(v, b) {
    const c = cmpParsed(v, b.v);
    switch (b.op) {
        case ">=":
            return c >= 0;
        case ">":
            return c > 0;
        case "<=":
            return c <= 0;
        case "<":
            return c < 0;
        case "==":
            return c === 0;
        case "!=":
            return c !== 0;
    }
}
/** version 이 constraint 를 만족하나. 버전·제약을 해석할 수 없으면 예외. */
export function satisfiesComposer(version, constraint) {
    const v = mustParse(version);
    const groups = parseComposerConstraint(constraint);
    return groups.some((group) => group.every((b) => check(v, b)));
}
/** 제약이 허용하는 가장 낮은 버전(런타임 추정용, 예: "^8.1" → "8.1"). 하한이 없으면 null. */
export function composerLowerBound(constraint) {
    let best = null;
    for (const group of parseComposerConstraint(constraint)) {
        const lows = group.filter((b) => b.op === ">=" || b.op === ">" || b.op === "==");
        if (lows.length === 0)
            return null; // 이 갈래는 하한이 없다
        for (const b of lows)
            if (!best || cmpParsed(b.v, best) < 0)
                best = b.v;
    }
    if (!best)
        return null;
    const [a, b, c] = best.nums;
    return c === 0 ? `${a}.${b}` : `${a}.${b}.${c}`;
}
