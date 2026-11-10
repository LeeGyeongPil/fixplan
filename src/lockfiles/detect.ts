// 스캔 경로와 그 바로 아래 폴더(1단계)에서 지원하는 lockfile 을 찾는다.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { LockfileKind } from "../types.ts";

export interface FoundLockfile {
  /** 절대 경로 */
  path: string;
  /** 스캔 경로 기준 상대 경로(보고서용, 슬래시 구분) */
  rel: string;
  kind: LockfileKind;
}

const KINDS: LockfileKind[] = ["composer.lock", "package-lock.json", "uv.lock", "requirements.txt"];
// 의존성 설치 폴더·숨김 폴더는 들여다보지 않는다
const SKIP_DIRS = new Set(["node_modules", "vendor", ".venv", "venv", "__pycache__", "dist", "build"]);

function inDir(root: string, dir: string): FoundLockfile[] {
  const out: FoundLockfile[] = [];
  for (const kind of KINDS) {
    const p = join(dir, kind);
    if (existsSync(p) && statSync(p).isFile()) {
      out.push({ path: p, rel: relative(root, p).split("\\").join("/"), kind });
    }
  }
  return out;
}

export function findLockfiles(root: string): FoundLockfile[] {
  const found = inDir(root, root);
  const subdirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP_DIRS.has(d.name))
    .map((d) => d.name)
    .sort();
  for (const name of subdirs) found.push(...inDir(root, join(root, name)));
  return found;
}
