export function renderJson(result, toolVersion) {
    const doc = {
        tool: "fixplan",
        version: toolVersion,
        mode: result.source.mode,
        // offline 이면 스냅샷 날짜와 "연습용 데이터" 안내를 그대로 싣는다
        snapshot: result.source.mode === "offline" ? { recorded: result.source.recorded, note: result.source.note } : null,
        data_sources: result.source.sources,
        path: result.path,
        lockfiles: result.lockfiles,
        packages_scanned: result.packages,
        packages_unchecked: result.unchecked,
        summary: result.summary,
        findings: result.findings,
        warnings: result.warnings,
        // --ignore 를 줬을 때만 키가 생긴다(미지정이면 출력이 그대로)
        ...(result.ignored ? { ignored: result.ignored } : {}),
    };
    return JSON.stringify(doc, null, 2) + "\n";
}
