#!/usr/bin/env node
// fixplan CLI. 종료 코드: 0 = 통과, 1 = --fail-on 조건 해당, 2 = 입력·네트워크 오류
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderJson } from "./report/json.ts";
import { renderMarkdown } from "./report/markdown.ts";
import { scan, type ScanResult } from "./scan.ts";
import { FixplanError } from "./sources/types.ts";

const HELP = `fixplan — turn vulnerability alerts into a fix plan (Composer · PyPI · npm)

Usage:
  fixplan scan [path=.] [options]
  fixplan --version | --help

Runtime (otherwise estimated from composer.json / package.json / pyproject.toml):
  --php <ver>        e.g. 8.1
  --node <ver>       e.g. 18
  --python <ver>     e.g. 3.10

Data:
  --offline          replay the bundled snapshot (practice data recorded 2026-11-10, no network)
  --snapshot <dir>   use another snapshot folder with --offline
  --osv-url <url>    OSV API base           (env FIXPLAN_OSV_URL,  default https://api.osv.dev)
  --kev-url <url>    CISA KEV JSON feed     (env FIXPLAN_KEV_URL)
  --epss-url <url>   EPSS API               (env FIXPLAN_EPSS_URL, default https://api.first.org/data/v1/epss)
  --verbose          progress lines on stderr

Output:
  --format md|json   default md
  --out <file>       write the report to a file instead of stdout
  --fail-on <list>   exit 1 if any finding matches: kev, fixable, any (comma separated)
  --ignore <id>      skip an advisory by ID or alias (GHSA, CVE, PYSEC; repeatable or comma separated)

Exit codes: 0 ok · 1 --fail-on matched · 2 input or network error`;

const FAIL_ON = ["kev", "fixable", "any"] as const;
const IGNORE_ID = /^[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9._:-]+$/;
type FailOn = (typeof FAIL_ON)[number];

function toolVersion(): string {
  // src/ 와 dist/ 모두 package.json 한 단계 위
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
}

export function failOnMatched(result: ScanResult, conditions: FailOn[]): boolean {
  return conditions.some((c) => {
    if (c === "any") return result.findings.length > 0;
    if (c === "kev") return result.findings.some((f) => f.advisories.some((a) => a.kev));
    // fixable: 지금 바로 실행할 수 있는 상향(같은 메이저·메이저 상향)이 있다
    return result.findings.some((f) => f.verdict === "fixable-in-major" || f.verdict === "major-upgrade");
  });
}

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

const defaultIo: Io = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  env: process.env,
};

/** CLI 본체. 종료 코드를 돌려준다(테스트에서 프로세스를 띄우지 않고 부를 수 있다) */
export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        php: { type: "string" },
        node: { type: "string" },
        python: { type: "string" },
        offline: { type: "boolean", default: false },
        snapshot: { type: "string" },
        "osv-url": { type: "string" },
        "kev-url": { type: "string" },
        "epss-url": { type: "string" },
        format: { type: "string", default: "md" },
        out: { type: "string" },
        "fail-on": { type: "string" },
        ignore: { type: "string", multiple: true },
        verbose: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });

    if (values.help) {
      io.stdout(HELP + "\n");
      return 0;
    }
    if (values.version) {
      io.stdout(toolVersion() + "\n");
      return 0;
    }
    const [command, path = ".", ...extra] = positionals;
    if (command !== "scan") throw new FixplanError(command ? `unknown command '${command}' (try: fixplan scan .)` : "missing command (try: fixplan scan .)");
    if (extra.length) throw new FixplanError(`unexpected argument '${extra[0]}'`);
    if (values.format !== "md" && values.format !== "json") throw new FixplanError(`unknown --format '${values.format}' (use md or json)`);

    // --fail-on 값 검사: 모르는 값이면 실행 전에 종료 코드 2
    const failOn: FailOn[] = [];
    if (values["fail-on"] !== undefined) {
      for (const raw of values["fail-on"].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!(FAIL_ON as readonly string[]).includes(raw)) throw new FixplanError(`unknown --fail-on value '${raw}' (use kev, fixable, any)`);
        failOn.push(raw as FailOn);
      }
      if (failOn.length === 0) throw new FixplanError("--fail-on needs a value (kev, fixable, any)");
    }

    // --ignore 값 검사: 여러 번·쉼표 모두 허용, 형식이 틀리면 실행 전에 종료 코드 2
    const ignore: string[] = [];
    for (const group of values.ignore ?? []) {
      const parts = group.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) throw new FixplanError(`invalid --ignore id '${group}' (e.g. GHSA-xxxx-xxxx-xxxx, CVE-2021-21315)`);
      for (const id of parts) {
        if (!IGNORE_ID.test(id)) throw new FixplanError(`invalid --ignore id '${id}' (e.g. GHSA-xxxx-xxxx-xxxx, CVE-2021-21315)`);
        if (!ignore.includes(id)) ignore.push(id);
      }
    }

    // 런타임 플래그 값 검사: 오타가 런타임 검사를 조용히 끄지 않도록 실행 전에 막는다
    for (const [flag, example] of [["php", "8.1"], ["node", "18"], ["python", "3.10"]] as const) {
      const v = values[flag];
      if (v !== undefined && !/^\d+(\.\d+){0,2}$/.test(v)) throw new FixplanError(`--${flag} expects a version like ${example} (got '${v}')`);
    }

    const result = await scan({
      path,
      runtimes: { php: values.php, node: values.node, python: values.python },
      offline: values.offline,
      snapshotDir: values.snapshot,
      urls: {
        osv: values["osv-url"] ?? io.env.FIXPLAN_OSV_URL,
        kev: values["kev-url"] ?? io.env.FIXPLAN_KEV_URL,
        epss: values["epss-url"] ?? io.env.FIXPLAN_EPSS_URL,
      },
      ignore: ignore.length ? ignore : undefined,
      fetch: io.fetch,
      log: values.verbose ? (line) => io.stderr(`fixplan: ${line}\n`) : undefined,
    });

    const report = values.format === "json" ? renderJson(result, toolVersion()) : renderMarkdown(result);
    if (values.out) {
      try {
        writeFileSync(values.out, report);
      } catch (e) {
        throw new FixplanError(`cannot write --out file ${values.out}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message} (create the folder first)`);
      }
      io.stderr(`fixplan: wrote ${values.out}\n`);
    } else {
      io.stdout(report);
    }
    return failOnMatched(result, failOn) ? 1 : 0;
  } catch (e) {
    // 입력·네트워크 오류는 한 줄로 알리고 2 로 끝낸다
    const err = e as Error & { code?: string };
    if (e instanceof FixplanError || err.code?.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(`fixplan: ${err.message}\n`);
      return 2;
    }
    io.stderr(`fixplan: unexpected error: ${err.stack ?? err.message}\n`);
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
