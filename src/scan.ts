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
import { messages, type Lang } from "./i18n.ts";
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
  /** 판정에서 뺄 알림 ID(OSV id 또는 aliases, 대소문자 무시·정확 일치). 이미 검증된 값 */
  ignore?: string[];
  /** 동시에 조회할 패키지 수(공개 API 에 부담을 덜 주도록 작게) */
  concurrency?: number;
  /** language of error messages (default en) */
  lang?: Lang;
}

export interface LockfileSummary {
  path: string;
  kind: Pkg["lockfileKind"];
  packages: number;
  runtime: RuntimeInfo;
}

/** --ignore 로 제외된 알림(현재 버전에 해당했거나 후보 버전 판단을 바꾼 것) */
export interface IgnoredAdvisory {
  id: string;
  aliases: string[];
  ecosystem: Ecosystem;
  name: string;
  version: string;
  lockfile: string;
  /** 현재 버전에는 해당하지 않고, 후보(수정) 버전 검사로 권고 버전만 바꾼 알림이면 이 값이 붙는다 */
  affects?: "candidate-versions-only";
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
  /** --ignore 를 줬을 때만 존재(미지정이면 undefined → 보고서가 바이트 단위로 그대로) */
  ignored?: IgnoredAdvisory[];
}

/**
 * ignore ID 와 맞는 그룹의 대표 레코드 id 집합.
 * 그룹 = dedupeRecords 와 같은 키(id+aliases)가 하나라도 겹치는 원본 레코드들. 그룹 안 어떤 키든 정확히 일치하면 그룹 전체를 뺀다.
 */
function ignoredRepresentatives(raw: OsvRecord[], kept: OsvRecord[], ignore: Set<string>): Map<string, string[]> {
  const keysOf = (r: OsvRecord) => [r.id, ...(r.aliases ?? [])];
  const out = new Map<string, string[]>(); // 대표 id → 그룹 전체 키(PYSEC 처럼 대표에 안 보이는 id 포함)
  for (const k of kept) {
    const own = new Set(keysOf(k));
    const group = raw.filter((r) => keysOf(r).some((x) => own.has(x)));
    if (group.some((r) => keysOf(r).some((x) => ignore.has(x.toUpperCase())))) out.set(k.id, group.flatMap(keysOf).map((x) => x.toUpperCase()));
  }
  return out;
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
  const m = messages(opts.lang ?? "en");
  const root = resolve(opts.path);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new FixplanError(m.pathNotFound(opts.path));
  const flags = opts.runtimes ?? {};
  const warnings: string[] = [];

  // 1) lockfile 찾기·읽기. 런타임은 lockfile 이 있는 폴더의 매니페스트에서 추정한다
  const found = findLockfiles(root);
  if (found.length === 0) {
    throw new FixplanError(m.noLockfile(opts.path));
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
      throw new FixplanError(m.cannotRead(lf.rel, (e as Error).message));
    }
    warnings.push(...parsed.warnings);
    pkgs.push(...parsed.packages);
    runtimeByLockfile.set(lf.rel, runtime);
    lockfiles.push({ path: lf.rel, kind: lf.kind, packages: parsed.packages.length, runtime });
  }

  // 2) 데이터 소스: --offline 이면 스냅샷(네트워크 0), 아니면 공개 API
  const source: DataSource = opts.offline
    ? new SnapshotSource(opts.snapshotDir ?? DEFAULT_SNAPSHOT, m)
    : new LiveSource({ fetch: opts.fetch, urls: opts.urls, log: opts.log, messages: m });
  const concurrency = opts.concurrency ?? 4;

  // 3) 패키지(이름) 단위로 알림을 한 번씩만 가져온다
  const keyOf = (eco: Ecosystem, name: string) => `${eco}\u0000${schemeFor(eco).normalizeName(name)}`;
  const uniqueNames = [...new Map(pkgs.map((p) => [keyOf(p.ecosystem, p.name), p])).values()];
  const advisoryLists = await mapLimit(uniqueNames, concurrency, async (p) => {
    opts.log?.(m.progressAdvisories(p.ecosystem, p.name));
    return source.advisoriesFor(p.ecosystem, p.name);
  });
  const advisoriesByName = new Map<string, OsvRecord[]>();
  // --ignore: 제외할 대표 레코드 id(패키지별). dedupe 직후·planFix 전에 적용한다
  const ignoreSet = new Set((opts.ignore ?? []).map((x) => x.toUpperCase()));
  const ignoredByName = new Map<string, Map<string, string[]>>();
  let unchecked = 0;
  uniqueNames.forEach((p, i) => {
    const list = advisoryLists[i];
    if (list === null || list === undefined) {
      warnings.push(`${p.ecosystem} ${p.name}: not covered by the offline snapshot (no data, not checked)`);
      unchecked++;
      advisoriesByName.set(keyOf(p.ecosystem, p.name), []);
    } else {
      const kept = dedupeRecords(list);
      advisoriesByName.set(keyOf(p.ecosystem, p.name), kept);
      if (ignoreSet.size) ignoredByName.set(keyOf(p.ecosystem, p.name), ignoredRepresentatives(list, kept, ignoreSet));
    }
  });

  // 4) 판정: 알림에 해당하는 패키지만 레지스트리를 조회한다
  const registryCache = new Map<string, Promise<RegistryInfo | null>>();
  const registryFor = (p: Pkg) => {
    const k = keyOf(p.ecosystem, p.name);
    if (!registryCache.has(k)) registryCache.set(k, source.registry(p.ecosystem, p.name));
    return registryCache.get(k)!;
  };
  const ignored: IgnoredAdvisory[] = [];
  const usedKeys = new Set<string>(); // 이 스캔의 알림과 맞은 제외 그룹의 모든 키
  const plans = await mapLimit(pkgs, concurrency, async (p) => {
    const scheme = schemeFor(p.ecosystem);
    const allAdvisories = advisoriesByName.get(keyOf(p.ecosystem, p.name)) ?? [];
    const skip = ignoredByName.get(keyOf(p.ecosystem, p.name));
    const advisories = skip?.size ? allAdvisories.filter((r) => !skip.has(r.id)) : allAdvisories;
    // 이 패키지의 알림과 실제로 맞은 ID 는 효과가 없었더라도 "맞지 않음" 경고 대상이 아니다
    if (skip) for (const keys of skip.values()) for (const k of keys) usedKeys.add(k);
    if (!scheme.valid(p.version)) {
      warnings.push(`${p.ecosystem} ${p.name} ${p.version}: version cannot be compared; skipped`);
      return null;
    }
    // 먼저 레지스트리 없이 현재 버전 해당 여부만 본다(해당 없으면 조회 생략)
    // 제외된 알림 중 현재 버전에 실제로 해당했던 것은 ignored 목록에 남긴다
    const currentSkipped = new Set<string>();
    if (skip?.size) {
      const before = planFix({ scheme, name: p.name, version: p.version, advisories: allAdvisories, registry: { versions: [] }, runtimeVersion: null });
      for (const c of before?.current ?? []) {
        if (skip.has(c.record.id)) {
          currentSkipped.add(c.record.id);
          for (const k of skip.get(c.record.id)!) usedKeys.add(k);
          ignored.push({ id: c.record.id, aliases: [...(c.record.aliases ?? [])], ecosystem: p.ecosystem, name: p.name, version: p.version, lockfile: p.lockfile });
        }
      }
    }
    const quick = planFix({ scheme, name: p.name, version: p.version, advisories, registry: { versions: [] }, runtimeVersion: null });
    if (!quick) return null;
    const runtime = runtimeByLockfile.get(p.lockfile)!;
    const registry = await registryFor(p);
    if (!registry) warnings.push(`${p.ecosystem} ${p.name}: registry metadata unavailable`);
    const plan = planFix({ scheme, name: p.name, version: p.version, advisories, registry, runtimeVersion: runtime.version });
    // 현재 버전에는 안 맞지만 후보 버전 검사에 쓰였을 제외 알림: 되돌려 넣었을 때 권고가 달라지면 "영향을 줬다"고 기록한다
    if (plan && skip?.size) {
      const sig = (x: typeof plan) => JSON.stringify([x.verdict, x.minimal_fix, x.naive_fix, x.still_affected_by, x.blocked_reason]);
      for (const r of allAdvisories) {
        if (!skip.has(r.id) || currentSkipped.has(r.id)) continue;
        const withIt = planFix({ scheme, name: p.name, version: p.version, advisories: [...advisories, r], registry, runtimeVersion: runtime.version });
        if (withIt && sig(withIt) === sig(plan)) continue;
        for (const k of skip.get(r.id)!) usedKeys.add(k);
        ignored.push({ id: r.id, aliases: [...(r.aliases ?? [])], ecosystem: p.ecosystem, name: p.name, version: p.version, lockfile: p.lockfile, affects: "candidate-versions-only" });
      }
    }
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

  // --ignore 결과: 정렬해 결정적으로 만들고, 어떤 알림에도 맞지 않은 ID 는 경고로 알린다
  let ignoredOut: IgnoredAdvisory[] | undefined;
  if (opts.ignore?.length) {
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    ignoredOut = ignored.sort((a, b) => cmp(a.ecosystem, b.ecosystem) || cmp(a.name, b.name) || cmp(a.version, b.version) || cmp(a.id, b.id) || cmp(a.lockfile, b.lockfile));
    const used = usedKeys;
    for (const id of opts.ignore) {
      if (!used.has(id.toUpperCase())) warnings.push(`--ignore ${id}: matched no advisory in this scan`);
    }
  }

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
    ...(ignoredOut ? { ignored: ignoredOut } : {}),
  };
}
