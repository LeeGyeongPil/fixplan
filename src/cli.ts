#!/usr/bin/env node
// fixplan CLI. 종료 코드: 0 = 통과, 1 = --fail-on 조건 해당, 2 = 입력·네트워크 오류
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { detectLang, envLang, LANGS, messages, type Lang } from "./i18n.ts";
import { renderJson } from "./report/json.ts";
import { renderMarkdown } from "./report/markdown.ts";
import { scan, type ScanResult } from "./scan.ts";
import { FixplanError } from "./sources/types.ts";

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

/** argv 에서 마지막 --lang 값을 찾는다(검증은 parseArgs 뒤에). 없으면 undefined */
function peekLang(argv: string[]): string | undefined {
  let found: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (a === "--lang") found = argv[i + 1];
    else if (a.startsWith("--lang=")) found = a.slice("--lang=".length);
  }
  return found;
}

/** parseArgs 오류를 code 로 구분해 옵션 이름만 뽑아 현지화한다. 모르는 code 는 원문 유지 */
function parseArgsMessage(err: Error & { code?: string }, lang: Lang): string {
  // English keeps Node's own message so that default output stays byte-identical to 0.2.0
  if (lang === "en") return err.message;
  const m = messages(lang);
  const name = err.message.match(/'([^']+)'/)?.[1]?.replace(/ <value>$/, "");
  if (!name) return err.message;
  switch (err.code) {
    case "ERR_PARSE_ARGS_UNKNOWN_OPTION":
      return m.unknownOption(name);
    case "ERR_PARSE_ARGS_INVALID_OPTION_VALUE":
      return /does not take/i.test(err.message) ? m.optionTakesNoValue(name) : m.optionNeedsValue(name);
    case "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL":
      return m.unexpectedArgument(name);
    default:
      return err.message;
  }
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
  // 언어는 parseArgs 오류 문구에도 필요하므로 파싱 전에 --lang 값을 미리 엿본다
  let lang: Lang = detectLang(peekLang(argv), io.env);
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
        lang: { type: "string" },
        verbose: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });

    // --lang 값 검사: en|ko 외에는 종료 코드 2 (오류 문구는 환경 언어로)
    if (values.lang !== undefined && !(LANGS as readonly string[]).includes(values.lang)) {
      lang = envLang(io.env);
      throw new FixplanError(messages(lang).unknownLang(values.lang));
    }
    const m = messages(lang);

    if (values.help) {
      io.stdout(m.help + "\n");
      return 0;
    }
    if (values.version) {
      io.stdout(toolVersion() + "\n");
      return 0;
    }
    const [command, path = ".", ...extra] = positionals;
    if (command !== "scan") throw new FixplanError(command ? m.unknownCommand(command) : m.missingCommand);
    if (extra.length) throw new FixplanError(m.unexpectedArgument(extra[0]!));
    if (values.format !== "md" && values.format !== "json") throw new FixplanError(m.unknownFormat(values.format));

    // --fail-on 값 검사: 모르는 값이면 실행 전에 종료 코드 2
    const failOn: FailOn[] = [];
    if (values["fail-on"] !== undefined) {
      for (const raw of values["fail-on"].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!(FAIL_ON as readonly string[]).includes(raw)) throw new FixplanError(m.unknownFailOn(raw));
        failOn.push(raw as FailOn);
      }
      if (failOn.length === 0) throw new FixplanError(m.failOnNeedsValue);
    }

    // --ignore 값 검사: 여러 번·쉼표 모두 허용, 형식이 틀리면 실행 전에 종료 코드 2
    const ignore: string[] = [];
    for (const group of values.ignore ?? []) {
      const parts = group.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) throw new FixplanError(m.invalidIgnore(group));
      for (const id of parts) {
        if (!IGNORE_ID.test(id)) throw new FixplanError(m.invalidIgnore(id));
        if (!ignore.includes(id)) ignore.push(id);
      }
    }

    // 런타임 플래그 값 검사: 오타가 런타임 검사를 조용히 끄지 않도록 실행 전에 막는다
    for (const [flag, example] of [["php", "8.1"], ["node", "18"], ["python", "3.10"]] as const) {
      const v = values[flag];
      if (v !== undefined && !/^\d+(\.\d+){0,2}$/.test(v)) throw new FixplanError(m.runtimeValue(flag, example, v));
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
      lang,
      fetch: io.fetch,
      log: values.verbose ? (line) => io.stderr(`fixplan: ${line}\n`) : undefined,
    });

    const report = values.format === "json" ? renderJson(result, toolVersion()) : renderMarkdown(result, lang);
    if (values.out) {
      try {
        writeFileSync(values.out, report);
      } catch (e) {
        throw new FixplanError(m.cannotWriteOut(values.out, (e as NodeJS.ErrnoException).code ?? (e as Error).message));
      }
      io.stderr(`fixplan: ${m.wroteFile(values.out)}\n`);
    } else {
      io.stdout(report);
    }
    return failOnMatched(result, failOn) ? 1 : 0;
  } catch (e) {
    // 입력·네트워크 오류는 한 줄로 알리고 2 로 끝낸다
    const err = e as Error & { code?: string };
    if (e instanceof FixplanError) {
      io.stderr(`fixplan: ${err.message}\n`);
      return 2;
    }
    if (err.code?.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(`fixplan: ${parseArgsMessage(err, lang)}\n`);
      return 2;
    }
    io.stderr(`fixplan: unexpected error: ${err.stack ?? err.message}\n`);
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
