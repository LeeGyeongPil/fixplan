export function pypiToRegistry(doc) {
    const versions = [];
    for (const [version, files] of Object.entries(doc.releases ?? {})) {
        const usable = files.filter((f) => !f.yanked);
        if (files.length === 0) {
            versions.push({ version, runtimeConstraint: null, excluded: "no files uploaded" });
            continue;
        }
        if (usable.length === 0) {
            versions.push({ version, runtimeConstraint: null, excluded: "yanked" });
            continue;
        }
        const constraints = usable.map((f) => (f.requires_python ? f.requires_python.trim() : null));
        const shown = [...new Set(constraints.filter((c) => !!c))];
        versions.push({
            version,
            // 보고서용 요약. 파일마다 다르면 " | " 로 이어 붙인다
            runtimeConstraint: shown.length ? shown.join(" | ") : null,
            fileConstraints: constraints,
        });
    }
    return { versions };
}
