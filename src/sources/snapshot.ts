// 오프라인(연습용 목) 데이터 소스: 저장소에 든 스냅샷 폴더를 읽기만 한다. 네트워크 호출 0.
// 스냅샷은 2026-11-10 에 공개 API 에서 받은 실제 응답을 잘라 담은 것이다(snapshot/NOTICE.md).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { messages, type Messages } from "../i18n.ts";
import type { Ecosystem, OsvRecord, RegistryInfo } from "../types.ts";
import { schemeFor } from "../versions/index.ts";
import { normalizePypiName } from "../versions/pep440.ts";
import { npmToRegistry } from "./npm-registry.ts";
import { packagistToRegistry } from "./packagist.ts";
import { pypiToRegistry } from "./pypi.ts";
import { FixplanError, type DataSource, type SourceDescription } from "./types.ts";

interface Manifest {
  recorded: string;
  note: string;
  sources: Record<string, string>;
  /** 생태계 → 패키지 이름 → 그 패키지의 OSV ID 목록(빈 배열 = 알림 없음을 확인함) */
  packages: Record<string, Record<string, string[]>>;
}

/** 레지스트리 파일 이름: "/" 는 "~" 로(guzzlehttp/guzzle → guzzlehttp~guzzle) */
export function registryFileName(ecosystem: Ecosystem, name: string): string {
  if (ecosystem === "PyPI") return normalizePypiName(name);
  return name.toLowerCase().replace("/", "~");
}

export class SnapshotSource implements DataSource {
  private readonly dir: string;
  private readonly manifest: Manifest;

  constructor(dir: string, m: Messages = messages("en")) {
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) throw new FixplanError(m.snapshotNotFound(manifestPath));
    this.dir = dir;
    this.manifest = this.readJson("manifest.json") as Manifest;
  }

  private readJson(...parts: string[]): unknown {
    return JSON.parse(readFileSync(join(this.dir, ...parts), "utf8"));
  }

  describe(): SourceDescription {
    return { mode: "offline", recorded: this.manifest.recorded, note: this.manifest.note, sources: this.manifest.sources };
  }

  async advisoriesFor(ecosystem: Ecosystem, name: string): Promise<OsvRecord[] | null> {
    const scheme = schemeFor(ecosystem);
    const byName = this.manifest.packages[ecosystem] ?? {};
    const key = Object.keys(byName).find((k) => scheme.normalizeName(k) === scheme.normalizeName(name));
    if (key === undefined) return null; // 스냅샷이 다루지 않는 패키지
    return byName[key]!.map((id) => this.readJson("osv", `${id}.json`) as OsvRecord);
  }

  async registry(ecosystem: Ecosystem, name: string): Promise<RegistryInfo | null> {
    const folder = { npm: "npm", PyPI: "pypi", Packagist: "packagist" }[ecosystem];
    const file = join(this.dir, "registry", folder, `${registryFileName(ecosystem, name)}.json`);
    if (!existsSync(file)) return null;
    const doc = JSON.parse(readFileSync(file, "utf8"));
    if (ecosystem === "npm") return npmToRegistry(doc);
    if (ecosystem === "PyPI") return pypiToRegistry(doc);
    return packagistToRegistry(doc, name.toLowerCase());
  }

  async kev(): Promise<Set<string>> {
    const doc = this.readJson("kev.json") as { vulnerabilities: { cveID: string }[] };
    return new Set(doc.vulnerabilities.map((v) => v.cveID));
  }

  async epss(cves: string[]): Promise<Map<string, number>> {
    const doc = this.readJson("epss.json") as { data: { cve: string; epss: number }[] };
    const wanted = new Set(cves);
    return new Map(doc.data.filter((d) => wanted.has(d.cve)).map((d) => [d.cve, Number(d.epss)]));
  }
}
