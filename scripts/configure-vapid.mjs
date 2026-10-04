import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

const apply = process.argv.includes("--apply");
const subject = argument("subject");

if (!apply) {
  fail("Nenhuma alteração foi feita. Use --apply somente após a aprovação do Architect.");
} else if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
  fail("Informe --subject=mailto:email@dominio ou uma URL https.");
} else {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
    fail("Não foi possível gerar o par VAPID.");
  } else {
    const vapidPublicKey = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(publicJwk.x, "base64url"),
      Buffer.from(publicJwk.y, "base64url"),
    ]).toString("base64url");
    const secrets = JSON.stringify({
      VAPID_PUBLIC_KEY: vapidPublicKey,
      VAPID_PRIVATE_KEY: privateJwk.d,
      VAPID_SUBJECT: subject,
    });
    const wranglerBin = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
    const result = spawnSync(process.execPath, [
      wranglerBin,
      "versions",
      "secret",
      "bulk",
      "--message",
      "Configurar VAPID para notificações SharkBot",
    ], {
      cwd: process.cwd(),
      input: secrets,
      stdio: ["pipe", "inherit", "inherit"],
      shell: false,
    });
    if (result.error || result.status !== 0) {
      fail("A configuração VAPID não foi concluída. Nenhuma chave foi exibida.");
    } else {
      process.stdout.write("Chaves VAPID enviadas como secrets para uma versão ainda não publicada. Nenhuma chave privada foi exibida.\n");
    }
  }
}
