// uv.lock(TOML) 읽기. [[package]] 중 source 가 editable/virtual "." 인 것이 루트 프로젝트이고,
// 루트의 dependencies(+ optional·dev 그룹)에 적힌 이름이 직접 의존성이다.
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import type { Pkg } from "../types.ts";
import { normalizePypiName } from "../versions/pep440.ts";

interface UvPackage {
  name: string;
  version?: string;
  source?: Record<string, string>;
  dependencies?: { name: string }[];
  "optional-dependencies"?: Record<string, { name: string }[]>;
  "dev-dependencies"?: Record<string, { name: string }[]>;
}

const isLocal = (p: UvPackage) => !!p.source && ("editable" in p.source || "virtual" in p.source || "path" in p.source || "directory" in p.source);

export function parseUvLock(lockPath: string, rel: string): { packages: Pkg[]; warnings: string[]; requiresPython: string | null } {
  const doc = parse(readFileSync(lockPath, "utf8")) as { "requires-python"?: string; package?: UvPackage[] };
  const all = doc.package ?? [];

  // 루트(로컬) 패키지들의 의존성 이름 = 직접 의존성
  const direct = new Set<string>();
  for (const p of all.filter(isLocal)) {
    const groups = [p.dependencies ?? [], ...Object.values(p["optional-dependencies"] ?? {}), ...Object.values(p["dev-dependencies"] ?? {})];
    for (const g of groups) for (const d of g) direct.add(normalizePypiName(d.name));
  }

  const packages: Pkg[] = all
    .filter((p) => !isLocal(p) && p.version)
    .map((p) => ({
      ecosystem: "PyPI",
      name: normalizePypiName(p.name),
      version: p.version!,
      direct: direct.has(normalizePypiName(p.name)),
      lockfile: rel,
      lockfileKind: "uv.lock",
    }));
  return { packages, warnings: [], requiresPython: doc["requires-python"] ?? null };
}
