// Packagist p2 메타데이터(https://repo.packagist.org/p2/<vendor>/<pkg>.json) 해석.
// "minified": "composer/2.0" 형식은 앞 항목과 같은 필드를 생략하고, 사라진 필드는 "__unset" 으로 적는다.
// 펼치지 않으면 require 가 생략된 버전을 "PHP 제약 없음"으로 잘못 읽게 된다.
import type { RegistryInfo } from "../types.ts";

type Entry = Record<string, unknown>;

export function expandMinified(p2: { minified?: string; packages?: Record<string, Entry[]> }, name: string): Entry[] {
  const list = p2.packages?.[name] ?? p2.packages?.[name.toLowerCase()] ?? [];
  if (p2.minified !== "composer/2.0") return list; // 펼칠 필요 없는 형식
  const out: Entry[] = [];
  let prev: Entry | null = null;
  for (const item of list) {
    // 앞 항목을 복사한 뒤 이번 항목의 필드로 덮어쓴다(생략 = 상속)
    const full: Entry = prev ? { ...prev } : {};
    for (const [k, v] of Object.entries(item)) {
      if (v === "__unset") delete full[k]; // 이번 버전에서 사라진 필드
      else full[k] = v;
    }
    out.push(full);
    prev = full;
  }
  return out;
}

export function packagistToRegistry(p2: { minified?: string; packages?: Record<string, Entry[]> }, name: string): RegistryInfo {
  return {
    versions: expandMinified(p2, name).map((e) => {
      const require = (e.require ?? {}) as Record<string, string>;
      return { version: String(e.version), runtimeConstraint: require.php ?? null };
    }),
  };
}
