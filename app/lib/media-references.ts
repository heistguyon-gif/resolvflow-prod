import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { campaignMedia } from "../db/schema";

/** References may belong to another workspace after copying a template. */
export async function referencedMediaKeys(keys: string[]) {
  const found = new Set<string>();
  const unique = [...new Set(keys)];
  for (let offset = 0; offset < unique.length; offset += 80) {
    const rows = await getDb().select({ key: campaignMedia.objectKey }).from(campaignMedia)
      .where(inArray(campaignMedia.objectKey, unique.slice(offset, offset + 80))).groupBy(campaignMedia.objectKey);
    for (const row of rows) found.add(row.key);
  }
  return found;
}
