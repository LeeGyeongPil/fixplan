// 기계용 JSON 보고서. 같은 입력이면 같은 출력(시각 같은 변하는 값을 넣지 않는다).
import type { ScanResult } from "../scan.ts";

export function renderJson(result: ScanResult, toolVersion: string): string {
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
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
