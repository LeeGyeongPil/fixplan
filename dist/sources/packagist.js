export function expandMinified(p2, name) {
    const list = p2.packages?.[name] ?? p2.packages?.[name.toLowerCase()] ?? [];
    if (p2.minified !== "composer/2.0")
        return list; // 펼칠 필요 없는 형식
    const out = [];
    let prev = null;
    for (const item of list) {
        // 앞 항목을 복사한 뒤 이번 항목의 필드로 덮어쓴다(생략 = 상속)
        const full = prev ? { ...prev } : {};
        for (const [k, v] of Object.entries(item)) {
            if (v === "__unset")
                delete full[k]; // 이번 버전에서 사라진 필드
            else
                full[k] = v;
        }
        out.push(full);
        prev = full;
    }
    return out;
}
export function packagistToRegistry(p2, name) {
    return {
        versions: expandMinified(p2, name).map((e) => {
            const require = (e.require ?? {});
            return { version: String(e.version), runtimeConstraint: require.php ?? null };
        }),
    };
}
