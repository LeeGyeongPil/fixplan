// requirements.txt 읽기: `name==version` 으로 고정된 줄만 쓴다.
// 고정되지 않은 줄(>=, 범위, URL, -e)은 설치될 버전을 알 수 없으므로 경고하고 건너뛴다.
import { readFileSync } from "node:fs";
import type { Pkg } from "../types.ts";
import { normalizePypiName } from "../versions/pep440.ts";

// Jinja2==3.1.2, requests[socks]==2.31.0 ; python_version >= "3.8", flask===2.0.0
const PINNED = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*===?\s*([^\s;#\\]+)/;

export function parseRequirements(path: string, rel: string): { packages: Pkg[]; warnings: string[] } {
  const packages: Pkg[] = [];
  const warnings: string[] = [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#.*$/, "").trim(); // 주석 제거
    if (!line || line.startsWith("--hash") || line === "\\") return;
    if (line.startsWith("-")) {
      // -r other.txt, -e ., --index-url … : 패키지 줄이 아니다
      if (/^-(e|-editable)\b/.test(line)) warnings.push(`${rel}:${i + 1}: editable install '${line}' skipped`);
      return;
    }
    const m = PINNED.exec(line);
    if (!m) {
      warnings.push(`${rel}:${i + 1}: '${line}' is not pinned with ==; skipped`);
      return;
    }
    packages.push({
      ecosystem: "PyPI",
      name: normalizePypiName(m[1]!),
      version: m[2]!,
      direct: true,
      lockfile: rel,
      lockfileKind: "requirements.txt",
    });
  });
  return { packages, warnings };
}
