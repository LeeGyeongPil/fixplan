// 전체 흐름: lockfile 읽기 → 데이터 소스 조회 → 판정 → 우선순위 → 결과 객체.
// 보고서 모양(Markdown·JSON)은 report/ 가 맡는다.
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandFor } from "./commands.ts";
import { parseComposerLock } from "./lockfiles/composer.ts";
import { findLockfiles } from "./lockfiles/detect.ts";
import { parseNpmLock } from "./lockfiles/npm.ts";
import { parseRequirements } from "./lockfiles/requirements.ts";
import { parseUvLock } from "./lockfiles/uv.ts";
import { dedupeRecords } from "./osv/affects.ts";
import { planFix } from "./plan/minimal-fix.ts";
import { advisoryView, cvesOf, rankFindings } from "./priority.ts";
import { detectNode, detectPhp, detectPython, type RuntimeFlags } from "./runtime/detect.ts";
import { LiveSource, type DEFAULT_URLS } from "./sources/live.ts";
import { SnapshotSource } from "./sources/snapshot.ts";
import { FixplanError, type DataSource, type SourceDescription } from "./sources/types.ts";
import type { Ecosystem, Finding, OsvRecord, Pkg, RegistryInfo, RuntimeInfo, Verdict } from "./types.ts";
import { schemeFor } from "./versions/index.ts";

/** 저장소에 든 기본 스냅샷(src/ 와 dist/ 어디서 실행해도 같은 위치) */
export const DEFAULT_SNAPSHOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "snapshot", "2026-11-10");

export interface ScanOptions {
  path: string;
  runtimes?: RuntimeFlags;
  offline?: boolean;
  snapshotDir?: string;
  urls?: Partial<typeof DEFAULT_URLS>;
  /** live 모드에서 쓸 fetch(테스트 주입용) */
  fetch?: typeof fetch;
  log?: (line: string) => void;
  /** 동시에 조회할 패키지 수(공개 API 에 부담을 덜 주도록 작게) */
  concurrency?: number;
}

export interface LockfileSummary {
  path: string;
  kind: Pkg["lockfileKind"];
  packages: number;
  runtime: RuntimeInfo;
}

export interface ScanResult {
  path: string;
  source: SourceDescription;
  lockfiles: LockfileSummary[];
  packages: number;
  /** 오프라인 스냅샷에 데이터가 없어 알림을 확인하지 못한 패키지(이름 기준) 수 */
  unchecked: number;
  findings: Finding[];
  summary: Record<Verdict, number> & { vulnerable: number; kev: number };
  warnings: string[];
}

/** items 를 최대 n 개씩 동시에 처리한다(결과 순서는 입력 순서) */
async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export async function scan(opts: ScanOptions): Promise<ScanResult> {
  const root = resolve(opts.path);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new FixplanError(`path not found or not a directory: ${opts.path}`);
  const flags = opts.runtimes ?? {};
  const warnings: string[] = [];

  // 1) lockfile 찾기·읽기. 런타임은 lockfile 이 있는 폴더의 매니페스트에서 추정한다
  const found = findLockfiles(root);
  if (found.length === 0) {
    throw new FixplanError(`no supported lockfile (composer.lock, package-lock.json, uv.lock, requirements.txt) in ${opts.path}`);
  }
  const lockfiles: LockfileSummary[] = [];
  const runtimeByLockfile = new Map<string, RuntimeInfo>();
  const pkgs: Pkg[] = [];
  for (const lf of found) {
    const dir = dirname(lf.path);
    let parsed: { packages: Pkg[]; warnings: string[] };
    let runtime: RuntimeInfo;
    try {
      if (lf.kind === "composer.lock") {
        parsed = parseComposerLock(lf.path, lf.rel);
        runtime = detectPhp(dir, flags);
      } else if (lf.kind === "package-lock.json") {
        parsed = parseNpmLock(lf.path, lf.rel);
        runtime = detectNode(dir, flags);
      } else if (lf.kind === "uv.lock") {
        const uv = parseUvLock(lf.path, lf.rel);
        parsed = uv;
        runtime = detectPython(dir, flags, uv.requiresPython);
      } else {
        parsed = parseRequirements(lf.path, lf.rel);
        runtime = detectPython(dir, flags);
      }
    } catch (e) {
      throw new FixplanError(`cannot read ${lf.rel}: ${(e as Error).message}`);
    }
    warnings.push(...parsed.warnings);
    pkgs.push(...parsed.packages);
    runtimeByLockfile.set(lf.rel, runtime);
    lockfiles.push({ path: lf.rel, kind: lf.kind, packages: parsed.packages.length, runtime });
  }

  // 2) 데이터 소스: --offline 이면 스냅샷(네트워크 0), 아니면 공개 API
  const source: DataSource = opts.offline
    ? new SnapshotSource(opts.snapshotDir ?? DEFAULT_SNAPSHOT)
    : new LiveSource({ fetch: opts.fetch, urls: opts.urls, log: opts.log });
  const concurrency = opts.concurrency ?? 4;

  // 3) 패키지(이름) 단위로 알림을 한 번씩만 가져온다
  const keyOf = (eco: Ecosystem, name: string) => `${eco}\u0000${schemeFor(eco).normalizeName(name)}`;
  const uniqueNames = [...new Map(pkgs.map((p) => [keyOf(p.ecosystem, p.name), p])).values()];
  const advisoryLists = await mapLimit(uniqueNames, concurrency, async (p) => {
    opts.log?.(`advisories: ${p.ecosystem} ${p.name}`);
    return source.advisoriesFor(p.ecosystem, p.name);
  });
  const advisoriesByName = new Map<string, OsvRecord[]>();
  let unchecked = 0;
  uniqueNames.forEach((p, i) => {
    const list = advisoryLists[i];
    if (list === null || list === undefined) {
      warnings.push(`${p.ecosystem} ${p.name}: not covered by the offline snapshot (no data, not checked)`);
      unchecked++;
      advisoriesByName.set(keyOf(p.ecosystem, p.name), []);
    } else {
      advisoriesByName.set(keyOf(p.ecosystem, p.name), dedupeRecords(list));
    }
  });

  // 4) 판정: 알림에 해당하는 패키지만 레지스트리를 조회한다
  const registryCache = new Map<string, Promise<RegistryInfo | null>>();
  const registryFor = (p: Pkg) => {
    const k = keyOf(p.ecosystem, p.name);
    if (!registryCache.has(k)) registryCache.set(k, source.registry(p.ecosystem, p.name));
    return registryCache.get(k)!;
  };
  const plans = await mapLimit(pkgs, concurrency, async (p) => {
    const scheme = schemeFor(p.ecosystem);
    const advisories = advisoriesByName.get(keyOf(p.ecosystem, p.name)) ?? [];
    if (!scheme.valid(p.version)) {
      warnings.push(`${p.ecosystem} ${p.name} ${p.version}: version cannot be compared; skipped`);
      return null;
    }
    // 먼저 레지스트리 없이 현재 버전 해당 여부만 본다(해당 없으면 조회 생략)
    const quick = planFix({ scheme, name: p.name, version: p.version, advisories, registry: { versions: [] }, runtimeVersion: null });
    if (!quick) return null;
    const runtime = runtimeByLockfile.get(p.lockfile)!;
    const registry = await registryFor(p);
    if (!registry) warnings.push(`${p.ecosystem} ${p.name}: registry metadata unavailable`);
    const plan = planFix({ scheme, name: p.name, version: p.version, advisories, registry, runtimeVersion: runtime.version });
    return plan ? { pkg: p, plan, runtime: { ...runtime, checked: runtime.checked && registry !== null } } : null;
  });

  // 5) KEV·EPSS 는 실제로 해당 알림이 있을 때만 조회한다
  const hits = plans.filter((x): x is NonNullable<typeof x> => x !== null);
  const allCves = [...new Set(hits.flatMap((h) => h.plan.current.flatMap((c) => cvesOf(c.record))))].sort();
  const kev = hits.length ? await source.kev() : new Set<string>();
  const epss = allCves.length ? await source.epss(allCves) : new Map<string, number>();

  const unranked: Omit<Finding, "priority">[] = hits.map(({ pkg, plan, runtime }) => ({
    ecosystem: pkg.ecosystem,
    name: pkg.name,
    version: pkg.version,
    direct: pkg.direct,
    lockfile: pkg.lockfile,
    advisories: plan.current
      .map((c) => advisoryView(c.record, c.fixed, kev, epss))
      .sort((a, b) => a.id.localeCompare(b.id)),
    verdict: plan.verdict,
    minimal_fix: plan.minimal_fix,
    naive_fix: plan.naive_fix,
    still_affected_by: plan.still_affected_by,
    runtime,
    blocked_reason: plan.blocked_reason,
    notes: plan.notes,
    command: commandFor(pkg, plan.verdict, plan.minimal_fix),
  }));
  const findings = rankFindings(unranked);

  const summary = {
    vulnerable: findings.length,
    kev: findings.filter((f) => f.advisories.some((a) => a.kev)).length,
    "fixable-in-major": 0,
    "major-upgrade": 0,
    "runtime-blocked": 0,
    "no-patch": 0,
  };
  for (const f of findings) summary[f.verdict]++;

  return {
    path: opts.path,
    source: source.describe(),
    lockfiles,
    packages: pkgs.length,
    unchecked,
    findings,
    summary,
    // 동시 조회 순서와 상관없이 같은 출력이 나오도록 정렬
    warnings: [...new Set(warnings)].sort(),
  };
}
