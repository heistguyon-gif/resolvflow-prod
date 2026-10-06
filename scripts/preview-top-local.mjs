import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const varsFile = join(root, ".dev.vars");
const expectedVars = 'NEXOFLOW_OWNER_EMAIL="local@nexoflow.dev"\n';

if (existsSync(varsFile)) {
  if (readFileSync(varsFile, "utf8") !== expectedVars) {
    throw new Error(".dev.vars já existe com outro conteúdo. Remova as credenciais locais manualmente antes de usar este preview.");
  }
} else {
  writeFileSync(varsFile, expectedVars, { flag: "wx" });
}

const permitted = ["PATH", "Path", "SystemRoot", "ComSpec", "PATHEXT", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "TEMP", "TMP", "ProgramFiles", "ProgramFiles(x86)"];
const childEnv = Object.fromEntries(permitted.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
childEnv.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
childEnv.CLOUDFLARE_INCLUDE_PROCESS_ENV = "false";
childEnv.WRANGLER_WRITE_LOGS = "false";
childEnv.WRANGLER_LOG_PATH = ".wrangler/logs";
childEnv.MINIFLARE_REGISTRY_PATH = ".wrangler/registry";
childEnv.TOP_LOCAL_PREVIEW = "1";

const command = process.platform === "win32" ? "cmd.exe" : "npm";
const npmArgs = process.platform === "win32" ? ["/d", "/s", "/c"] : [];
const migrate = process.platform === "win32"
  ? ["npx --no-install wrangler d1 migrations apply DB --local --config wrangler.top-local.jsonc"]
  : ["exec", "--", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.top-local.jsonc"];
const prepared = spawnSync(command, [...npmArgs, ...migrate], { cwd: root, env: childEnv, stdio: "inherit" });
if (prepared.error) throw prepared.error;
if (prepared.status !== 0) process.exit(prepared.status || 1);
const seed = process.platform === "win32"
  ? ["npx --no-install wrangler d1 execute DB --local --config wrangler.top-local.jsonc --file scripts/top-preview-seed.sql"]
  : ["exec", "--", "wrangler", "d1", "execute", "DB", "--local", "--config", "wrangler.top-local.jsonc", "--file", "scripts/top-preview-seed.sql"];
const seeded = spawnSync(command, [...npmArgs, ...seed], { cwd: root, env: childEnv, stdio: "inherit" });
if (seeded.error) throw seeded.error;
if (seeded.status !== 0) process.exit(seeded.status || 1);
if (process.argv[2] === "prepare") process.exit(0);
if (process.argv[2] !== "dev") throw new Error("Use prepare ou dev.");

const dev = process.platform === "win32"
  ? ["npm run dev -- --host localhost --port 4173 --strictPort"]
  : ["run", "dev", "--", "--host", "localhost", "--port", "4173", "--strictPort"];
const child = spawn(command, [...npmArgs, ...dev], { cwd: root, env: childEnv, stdio: "inherit" });
child.on("error", (error) => { throw error; });
child.on("exit", (code) => process.exit(code || 0));
