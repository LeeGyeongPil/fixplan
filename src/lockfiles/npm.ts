// package-lock.json v2·v3 읽기. "packages" 의 키가 설치 경로다:
//   ""                                   → 루트 프로젝트(직접 의존성 목록이 있다)
//   "node_modules/lodash"                → 최상위 설치
//   "node_modules/a/node_modules/b"      → a 안에 중첩 설치된 b
//   "node_modules/@scope/name"           → 스코프 패키지
import { readFileSync } from "node:fs";
import type { Pkg } from "../types.ts";

interface LockEntry {
  name?: string;
  version?: string;
  link?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export function parseNpmLock(lockPath: string, rel: string): { packages: Pkg[]; warnings: string[] } {
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { lockfileVersion?: number; packages?: Record<string, LockEntry> };
  const warnings: string[] = [];
  if (!lock.packages) {
    warnings.push(`${rel}: lockfileVersion ${lock.lockfileVersion ?? "?"} has no "packages" map (v1 is not supported); skipped`);
    return { packages: [], warnings };
  }

  const root = lock.packages[""] ?? {};
  const directNames = new Set([
    ...Object.keys(root.dependencies ?? {}),
    ...Object.keys(root.devDependencies ?? {}),
    ...Object.keys(root.optionalDependencies ?? {}),
  ]);

  const seen = new Set<string>();
  const packages: Pkg[] = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === "" || entry.link || !entry.version) continue; // 루트·워크스페이스 링크는 건너뜀
    const idx = key.lastIndexOf("node_modules/");
    if (idx === -1) continue; // 워크스페이스 폴더 자체("packages/app")
    const installName = key.slice(idx + "node_modules/".length);
    // 별칭 설치("npm:real@1.0")면 entry.name 이 실제 패키지 이름
    const name = entry.name ?? installName;
    const topLevel = key === `node_modules/${installName}`;
    const id = `${name}@${entry.version}`;
    if (seen.has(id)) continue; // 같은 버전이 여러 곳에 중첩 설치돼도 한 번만
    seen.add(id);
    packages.push({
      ecosystem: "npm",
      name,
      version: entry.version,
      direct: topLevel && directNames.has(installName),
      lockfile: rel,
      lockfileKind: "package-lock.json",
    });
  }
  return { packages, warnings };
}
