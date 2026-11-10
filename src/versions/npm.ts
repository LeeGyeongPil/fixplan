// npm 버전은 정본 구현 `semver` 를 그대로 쓴다.
import semver from "semver";
import type { VersionScheme } from "./index.ts";

/**
 * package.json engines 를 node 범위 문자열로 정규화한다.
 * - 객체 {"node": ">= 18"} → ">= 18"
 * - 문자열 ">= 18" → 그대로(오래된 패키지에 있다)
 * - 레거시 배열 ["node >= 0.8"] → ">= 0.8"
 * node 항목이 없으면 null, 해석할 수 없으면 원문 그대로 둔다(나중에 "unknown" 으로 판정).
 */
export function normalizeEngines(engines: unknown): string | null {
  if (engines === null || engines === undefined) return null;
  if (typeof engines === "string") return engines.trim() || null;
  if (Array.isArray(engines)) {
    const nodeItems = engines
      .filter((e): e is string => typeof e === "string" && /^\s*node\b/.test(e))
      .map((e) => e.replace(/^\s*node\s*/, "").trim());
    return nodeItems.length ? nodeItems.join(" ") : null;
  }
  if (typeof engines === "object") {
    const node = (engines as Record<string, unknown>).node;
    if (node === undefined || node === null) return null;
    return typeof node === "string" ? node.trim() || null : String(node);
  }
  return null;
}

export const npmScheme: VersionScheme = {
  ecosystem: "npm",
  runtimeName: "node",
  valid: (v) => semver.valid(v) !== null,
  compare(a, b) {
    if (!semver.valid(a) || !semver.valid(b)) throw new Error(`not a semver version: ${semver.valid(a) ? b : a}`);
    return semver.compare(a, b);
  },
  isPrerelease: (v) => semver.prerelease(v) !== null,
  sameMajor(base, cand) {
    const a = semver.parse(base);
    const b = semver.parse(cand);
    if (!a || !b) return false;
    if (a.major !== b.major) return false;
    return a.major !== 0 || a.minor === b.minor;
  },
  normalizeName: (name) => name.toLowerCase(),
  runtimeSatisfies(runtimeVersion, constraint) {
    const range = semver.validRange(constraint);
    const node = semver.coerce(runtimeVersion);
    if (range === null || node === null) return "unknown";
    return semver.satisfies(node, range);
  },
};
