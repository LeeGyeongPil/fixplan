// 런타임 버전 정하기. 우선순위:
//   1) --php / --node / --python 플래그
//   2) lockfile 옆 매니페스트에서 추정(보고서에 "estimated" 로 표시)
//        php    : composer.json config.platform.php → composer.json require.php 하한
//        node   : package.json engines.node 하한
//        python : pyproject.toml requires-python 하한 → uv.lock requires-python 하한
//   3) 끝내 모르면 런타임 검사를 건너뛰고 checked:false (단정하지 않는다)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { parse as parseToml } from "smol-toml";
import type { RuntimeInfo } from "../types.ts";
import { composerLowerBound } from "../versions/composer.ts";

export interface RuntimeFlags {
  php?: string;
  node?: string;
  python?: string;
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** PEP 440 지정자의 하한: ">=3.10,<4" → "3.10", "~=3.9" → "3.9". 하한이 없으면 null */
export function pythonLowerBound(spec: string): string | null {
  const m = /(?:>=|~=|==|>)\s*([0-9]+(?:\.[0-9]+)*)/.exec(spec);
  return m ? m[1]! : null;
}

const known = (name: RuntimeInfo["name"], version: string, source: string): RuntimeInfo => ({ name, version, source, checked: true });
const unknown = (name: RuntimeInfo["name"]): RuntimeInfo => ({ name, version: null, source: "unknown (pass --" + name + " to check)", checked: false });

export function detectPhp(dir: string, flags: RuntimeFlags): RuntimeInfo {
  if (flags.php) return known("php", flags.php, "--php flag");
  const cj = readJson(join(dir, "composer.json"));
  const platformPhp = ((cj?.config as Record<string, unknown> | undefined)?.platform as Record<string, string> | undefined)?.php;
  if (platformPhp) return known("php", platformPhp, "composer.json config.platform.php (estimated)");
  const requirePhp = (cj?.require as Record<string, string> | undefined)?.php;
  if (requirePhp) {
    try {
      const low = composerLowerBound(requirePhp);
      if (low) return known("php", low, "composer.json require.php lower bound (estimated)");
    } catch {
      // 해석 못 하면 모르는 것으로 둔다
    }
  }
  return unknown("php");
}

export function detectNode(dir: string, flags: RuntimeFlags): RuntimeInfo {
  if (flags.node) return known("node", flags.node, "--node flag");
  const pj = readJson(join(dir, "package.json"));
  const engines = (pj?.engines as Record<string, string> | undefined)?.node;
  if (engines && semver.validRange(engines)) {
    const min = semver.minVersion(engines);
    if (min) return known("node", min.version, "package.json engines.node lower bound (estimated)");
  }
  return unknown("node");
}

export function detectPython(dir: string, flags: RuntimeFlags, uvRequiresPython: string | null = null): RuntimeInfo {
  if (flags.python) return known("python", flags.python, "--python flag");
  const pyproject = join(dir, "pyproject.toml");
  if (existsSync(pyproject)) {
    try {
      const doc = parseToml(readFileSync(pyproject, "utf8")) as { project?: { "requires-python"?: string } };
      const spec = doc.project?.["requires-python"];
      const low = spec ? pythonLowerBound(spec) : null;
      if (low) return known("python", low, "pyproject.toml requires-python lower bound (estimated)");
    } catch {
      // 잘못된 TOML 이면 다음 근거로
    }
  }
  if (uvRequiresPython) {
    const low = pythonLowerBound(uvRequiresPython);
    if (low) return known("python", low, "uv.lock requires-python lower bound (estimated)");
  }
  return unknown("python");
}
