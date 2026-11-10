// npm 레지스트리 corgi 문서(Accept: application/vnd.npm.install-v1+json) 해석.
// 버전별 engines.node 를 런타임 요구 조건으로 쓴다. engines 는 "권고" 필드라 해석이 안 되면 차단하지 않는다.
import type { RegistryInfo } from "../types.ts";
import { normalizeEngines } from "../versions/npm.ts";

interface CorgiDoc {
  versions?: Record<string, { engines?: unknown; deprecated?: string }>;
}

export function npmToRegistry(doc: CorgiDoc): RegistryInfo {
  return {
    versions: Object.entries(doc.versions ?? {}).map(([version, meta]) => ({
      version,
      runtimeConstraint: normalizeEngines(meta.engines),
      // deprecated 버전은 설치는 되지만 권할 후보에서 뺀다
      ...(meta.deprecated ? { excluded: `deprecated: ${meta.deprecated}` } : {}),
    })),
  };
}
