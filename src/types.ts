// fixplan 전체에서 쓰는 타입 모음.

/** OSV 의 생태계 이름(대소문자 구분). M1 은 세 개만 다룬다. */
export type Ecosystem = "Packagist" | "npm" | "PyPI";

/** lockfile 에서 읽은 패키지 한 개. */
export interface Pkg {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** 매니페스트(composer.json·package.json·pyproject)에 직접 적힌 의존성인가 */
  direct: boolean;
  /** 어느 lockfile 에서 왔나(보고서·명령 문구용, 스캔 경로 기준 상대 경로) */
  lockfile: string;
  /** lockfile 종류: 명령 문구가 달라진다 */
  lockfileKind: LockfileKind;
}

export type LockfileKind = "composer.lock" | "package-lock.json" | "uv.lock" | "requirements.txt";

/** OSV 레코드 중 fixplan 이 읽는 부분. */
export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvRange {
  type: string; // ECOSYSTEM | SEMVER | GIT
  events: OsvEvent[];
}

export interface OsvAffected {
  package: { ecosystem: string; name: string; purl?: string };
  ranges?: OsvRange[];
  versions?: string[];
}

export interface OsvRecord {
  id: string;
  aliases?: string[];
  summary?: string;
  withdrawn?: string;
  modified?: string;
  affected?: OsvAffected[];
  severity?: { type: string; score: string }[];
  database_specific?: { severity?: string; [k: string]: unknown };
}

/** 레지스트리에서 얻은 버전 한 개의 정보. */
export interface RegistryVersion {
  version: string;
  /** 런타임 요구 조건 원문(npm engines.node, PyPI requires_python, Composer require.php). 없으면 null */
  runtimeConstraint: string | null;
  /** PyPI: 유효(yanked 아님) 파일별 requires_python 목록. 하나라도 맞으면 설치 가능 */
  fileConstraints?: (string | null)[];
  /** 설치 후보로 쓸 수 없는 이유(yanked 등). 없으면 후보 */
  excluded?: string;
}

export interface RegistryInfo {
  versions: RegistryVersion[];
}

/** 런타임 정보: 어디서 왔는지까지 남긴다(추정이면 estimated). */
export interface RuntimeInfo {
  name: "php" | "node" | "python";
  version: string | null;
  source: string;
  checked: boolean;
}

export type Verdict = "fixable-in-major" | "major-upgrade" | "runtime-blocked" | "no-patch";

export interface AdvisoryView {
  id: string;
  aliases: string[];
  summary: string;
  severity: string;
  kev: boolean;
  /** EPSS 점수. CVE 가 없거나 점수를 못 찾으면 "unknown"(0 이 아니다) */
  epss: number | "unknown";
  /** 현재 버전이 속한 갈래의 fixed. 없으면 null */
  fixed: string | null;
}

export interface Finding {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  direct: boolean;
  lockfile: string;
  advisories: AdvisoryView[];
  verdict: Verdict;
  minimal_fix: string | null;
  naive_fix: string | null;
  still_affected_by: string[];
  runtime: RuntimeInfo;
  blocked_reason: string | null;
  notes: string[];
  command: string | null;
  priority: number;
}
