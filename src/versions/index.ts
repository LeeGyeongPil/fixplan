// 생태계마다 다른 "버전 문법"을 같은 모양으로 감싼다.
// 판정 엔진(osv/affects.ts, plan/minimal-fix.ts)은 이 인터페이스만 본다.
import type { Ecosystem, RuntimeInfo } from "../types.ts";
import { composerScheme } from "./composer-scheme.ts";
import { npmScheme } from "./npm.ts";
import { pep440Scheme } from "./pep440.ts";

export interface VersionScheme {
  ecosystem: Ecosystem;
  /** 이 생태계 패키지가 요구하는 런타임 */
  runtimeName: RuntimeInfo["name"];
  valid(v: string): boolean;
  /** a<b 면 음수, 같으면 0, a>b 면 양수. 해석할 수 없으면 예외 */
  compare(a: string, b: string): number;
  isPrerelease(v: string): boolean;
  /** cand 가 base 와 "같은 메이저"(캐럿 호환: 1.x 는 메이저, 0.x 는 마이너까지)인가 */
  sameMajor(base: string, cand: string): boolean;
  /** 패키지 이름 비교용 정규화(PyPI 는 PEP 503) */
  normalizeName(name: string): string;
  /** 런타임 버전이 요구 조건을 만족하나. 요구 조건을 해석할 수 없으면 "unknown"(차단하지 않는다) */
  runtimeSatisfies(runtimeVersion: string, constraint: string): boolean | "unknown";
}

export function schemeFor(ecosystem: Ecosystem): VersionScheme {
  switch (ecosystem) {
    case "Packagist":
      return composerScheme;
    case "npm":
      return npmScheme;
    case "PyPI":
      return pep440Scheme;
  }
}
