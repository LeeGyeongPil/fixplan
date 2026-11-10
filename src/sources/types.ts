// 데이터 소스 인터페이스. live(공개 API)와 offline(동봉 스냅샷)이 같은 모양을 구현한다.
// 판정 엔진은 어느 쪽에서 데이터가 왔는지 모른다 — 그래서 오프라인 연습 결과도 실제 엔진이 계산한 값이다.
import type { Ecosystem, OsvRecord, RegistryInfo } from "../types.ts";

export interface SourceDescription {
  mode: "offline" | "live";
  /** offline: 스냅샷 기록 날짜 */
  recorded?: string;
  /** offline: "practice data, not current advisories" 안내 */
  note?: string;
  sources: Record<string, string>;
}

export interface DataSource {
  describe(): SourceDescription;
  /** 패키지의 전체 OSV 알림(버전 무관). offline 스냅샷에 없는 패키지면 null */
  advisoriesFor(ecosystem: Ecosystem, name: string): Promise<OsvRecord[] | null>;
  /** 레지스트리 버전 목록과 버전별 런타임 요구 조건. 못 구하면 null */
  registry(ecosystem: Ecosystem, name: string): Promise<RegistryInfo | null>;
  /** CISA KEV 에 오른 CVE 집합 */
  kev(): Promise<Set<string>>;
  /** CVE → EPSS 점수. 점수가 없는 CVE 는 맵에 없다 */
  epss(cves: string[]): Promise<Map<string, number>>;
}

/** 입력·네트워크 오류: CLI 가 종료 코드 2 로 바꾼다 */
export class FixplanError extends Error {}
