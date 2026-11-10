// PyPI JSON(https://pypi.org/pypi/<name>/json) 해석.
// requires_python 은 "버전"이 아니라 "파일(sdist·wheel)"마다 붙는다. 철회(yanked)된 파일은 뺀다.
// 유효한 파일 하나라도 현재 Python 에서 설치 가능하면 그 버전은 설치 가능하다.
import type { RegistryInfo, RegistryVersion } from "../types.ts";

interface PypiFile {
  requires_python?: string | null;
  yanked?: boolean;
}

interface PypiDoc {
  releases?: Record<string, PypiFile[]>;
}

export function pypiToRegistry(doc: PypiDoc): RegistryInfo {
  const versions: RegistryVersion[] = [];
  for (const [version, files] of Object.entries(doc.releases ?? {})) {
    const usable = files.filter((f) => !f.yanked);
    if (files.length === 0) {
      versions.push({ version, runtimeConstraint: null, excluded: "no files uploaded" });
      continue;
    }
    if (usable.length === 0) {
      versions.push({ version, runtimeConstraint: null, excluded: "yanked" });
      continue;
    }
    const constraints = usable.map((f) => (f.requires_python ? f.requires_python.trim() : null));
    const shown = [...new Set(constraints.filter((c): c is string => !!c))];
    versions.push({
      version,
      // 보고서용 요약. 파일마다 다르면 " | " 로 이어 붙인다
      runtimeConstraint: shown.length ? shown.join(" | ") : null,
      fileConstraints: constraints,
    });
  }
  return { versions };
}
