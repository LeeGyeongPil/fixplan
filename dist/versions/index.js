import { composerScheme } from "./composer-scheme.js";
import { npmScheme } from "./npm.js";
import { pep440Scheme } from "./pep440.js";
export function schemeFor(ecosystem) {
    switch (ecosystem) {
        case "Packagist":
            return composerScheme;
        case "npm":
            return npmScheme;
        case "PyPI":
            return pep440Scheme;
    }
}
