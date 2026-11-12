// 테스트 공용 도우미: 저장소 경로, 동봉 스냅샷으로 한 패키지의 계획을 세우기.
// 출력 언어는 import 시점에 영어로 고정한다. 개발자 로케일(LANG=ko_KR.UTF-8)이어도,
// node --test 로 파일을 직접 실행해도, 영어 단언과 e2e 로 띄우는 CLI 가 같은 결과를 낸다.
process.env.FIXPLAN_LANG = "en";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeRecords } from "../src/osv/affects.ts";
import { planFix, type PlanResult } from "../src/plan/minimal-fix.ts";
import { SnapshotSource } from "../src/sources/snapshot.ts";
import type { Ecosystem, OsvRecord } from "../src/types.ts";
import { schemeFor } from "../src/versions/index.ts";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SNAPSHOT = join(ROOT, "snapshot", "2026-11-10");
export const FIXTURES = join(ROOT, "test", "fixtures");

export function readJson<T = unknown>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(...parts), "utf8")) as T;
}

/** 스냅샷에 든 실제 OSV 레코드 한 개 */
export function snapshotOsv(id: string): OsvRecord {
  return readJson<OsvRecord>(SNAPSHOT, "osv", `${id}.json`);
}

/** 동봉 스냅샷의 실제 데이터로 planFix 를 돌린다 */
export async function planFromSnapshot(ecosystem: Ecosystem, name: string, version: string, runtimeVersion: string | null): Promise<PlanResult | null> {
  const source = new SnapshotSource(SNAPSHOT);
  const advisories = dedupeRecords((await source.advisoriesFor(ecosystem, name)) ?? []);
  const registry = await source.registry(ecosystem, name);
  return planFix({ scheme: schemeFor(ecosystem), name, version, advisories, registry, runtimeVersion });
}
