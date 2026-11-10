import { normalizeEngines } from "../versions/npm.js";
export function npmToRegistry(doc) {
    return {
        versions: Object.entries(doc.versions ?? {}).map(([version, meta]) => ({
            version,
            runtimeConstraint: normalizeEngines(meta.engines),
            // deprecated 버전은 설치는 되지만 권할 후보에서 뺀다
            ...(meta.deprecated ? { excluded: `deprecated: ${meta.deprecated}` } : {}),
        })),
    };
}
