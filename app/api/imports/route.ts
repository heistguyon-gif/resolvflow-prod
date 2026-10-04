import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, importRuns } from "../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../lib/auth";
import { recordAuditEvent } from "../../../lib/audit";

type CsvRow = Record<string, string>;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseCsv(input: string): CsvRow[] {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) matrix.push(row);
      row = []; field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) matrix.push(row);
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow) return [];
  const headers = headerRow.map(normalizeHeader);
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function first(row: CsvRow, aliases: string[]) {
  for (const alias of aliases) if (row[alias]?.trim()) return row[alias].trim();
  return "";
}

function numberValue(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Math.max(0, Math.round(Number(normalized) || 0));
}

function normalizeStatus(value: string) {
  const clean = normalizeHeader(value);
  if (/restrit|bloque|limit/.test(clean)) return "Restrita";
  if (/desconect|falha|caiu|expir/.test(clean)) return "Desconectada";
  if (/saud|normal|ativo|conect/.test(clean)) return "Saudável";
  return "Desconhecida";
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { fileName?: string; csvText?: string };
    const csvText = payload.csvText ?? "";
    if (!csvText || csvText.length > 10_000_000) return Response.json({ error: "Envie um CSV válido de até 10 MB." }, { status: 400 });
    const rows = parseCsv(csvText);
    const owner = await requireOwnerId(request);
    const db = getDb();
    const existingRows = await db.select({ username: accounts.username }).from(accounts).where(eq(accounts.ownerUserId, owner));
    const existingUsernames = new Set(existingRows.map((account) => account.username));
    const seenUsernames = new Set<string>();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const prepared: Array<{ values: typeof accounts.$inferInsert; update: { player: string; model: string; healthStatus: ReturnType<typeof sql>; postsToday: number; queueCount: number; views30d: number; source: ReturnType<typeof sql>; updatedAt: string }; existed: boolean }> = [];
    for (const row of rows) {
      const rawUsername = first(row, ["username", "usuario", "conta", "account", "instagram", "perfil"]);
      const username = rawUsername.replace(/^@/, "").trim().toLowerCase();
      if (!username || seenUsernames.has(username)) { skipped += 1; continue; }
      seenUsernames.add(username);
      const healthRaw = first(row, ["health_status", "saude", "status", "status_conta", "situacao"]);
      prepared.push({ existed: existingUsernames.has(username), values: {
        id: crypto.randomUUID(), ownerUserId: owner, username,
        instagramAccountId: first(row, ["instagram_account_id", "instagram_id", "account_id", "id"]) || null,
        displayName: first(row, ["display_name", "nome", "name"]) || null,
        player: first(row, ["player", "responsavel", "responsavel_player", "time"]) || "Sem player",
        model: first(row, ["model", "modelo", "strategy", "estrategia"]) || "Sem modelo",
        groupName: first(row, ["group", "grupo"]) || null,
        niche: first(row, ["niche", "nicho"]) || null,
        healthStatus: normalizeStatus(healthRaw),
        connectionStatus: normalizeStatus(healthRaw) === "Desconectada" ? "Desconectada" : "Não verificada",
        priority: first(row, ["priority", "prioridade"]) || "Normal",
        postsToday: numberValue(first(row, ["posts_today", "posts_hoje", "posts"])),
        queueCount: numberValue(first(row, ["queue_count", "fila", "queue"])),
        views30d: numberValue(first(row, ["views_30d", "visualizacoes_30d", "views"])),
        followersCount: numberValue(first(row, ["followers", "seguidores"])),
        lastError: first(row, ["last_error", "ultimo_erro", "erro"]) || null,
        source: "murphy_csv",
      }, update: {
        player: first(row, ["player", "responsavel", "responsavel_player", "time"]) || "Sem player",
        model: first(row, ["model", "modelo", "strategy", "estrategia"]) || "Sem modelo",
        healthStatus: sql`case when ${accounts.connectionStatus} = 'Conectada' then ${accounts.healthStatus} else ${normalizeStatus(healthRaw)} end`,
        postsToday: numberValue(first(row, ["posts_today", "posts_hoje", "posts"])),
        queueCount: numberValue(first(row, ["queue_count", "fila", "queue"])),
        views30d: numberValue(first(row, ["views_30d", "visualizacoes_30d", "views"])),
        source: sql`case when ${accounts.connectionStatus} = 'Conectada' then ${accounts.source} else 'murphy_csv' end`,
        updatedAt: new Date().toISOString(),
      }});
    }
    for (let index = 0; index < prepared.length; index += 8) {
      const batch = prepared.slice(index, index + 8);
      await Promise.all(batch.map((entry) => db.insert(accounts).values(entry.values).onConflictDoUpdate({ target: [accounts.ownerUserId, accounts.username], set: entry.update })));
      created += batch.filter((entry) => !entry.existed).length;
      updated += batch.filter((entry) => entry.existed).length;
    }
    await db.insert(importRuns).values({ id: crypto.randomUUID(), ownerUserId: owner, fileName: payload.fileName?.slice(0, 180) || "contas.csv", rowsRead: rows.length, rowsImported: created + updated, rowsSkipped: skipped });
    await recordAuditEvent(request, { ownerUserId: owner, action: "accounts.import", entityType: "import", summary: `Importação concluída: ${created} nova(s), ${updated} atualizada(s) e ${skipped} ignorada(s).`, metadata: { created, updated, skipped, total: rows.length } });
    return Response.json({ imported: created, updated, skipped, total: rows.length }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : "Não foi possível importar o arquivo.";
    return Response.json({ error: message }, { status: 500 });
  }
}
