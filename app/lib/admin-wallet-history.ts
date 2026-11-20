export class WalletHistoryInputError extends Error {}
export const WALLET_HISTORY_PAGE_SIZE=20;
type Filters={kind:"credit"|"debit"|"all";query:string;from:string|null;to:string|null};
type Row={id:string;type:"credit_manual"|"debit_manual";amount_cents:number;balance_after_cents:number;summary:string;created_at:string;sort_at:number|null;workspace_owner_user_id:string;actor_user_id:string;recipient_name:string|null;recipient_email:string|null;actor_name:string|null;actor_email:string|null;workspace_name:string|null};
export type WalletHistoryItem={id:string;type:Row["type"];amountCents:number;balanceAfterCents:number;summary:string;createdAt:string;recipient:{id:string;name:string|null;email:string|null};actor:{id:string;name:string|null;email:string|null};workspace:{id:string;name:string|null}};
export type WalletHistoryPage={items:WalletHistoryItem[];totals:{count:number;creditCents:number;debitCents:number;netCents:number};nextCursor:string|null};
function instant(value:string|null){
  if(!value||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new WalletHistoryInputError("Período inválido.");
  const day=value.slice(0,10);if(new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)!==day)throw new WalletHistoryInputError("Período inválido.");
  return new Date(value).toISOString();
}
export async function readWalletHistory(db:D1Database,params:URLSearchParams):Promise<WalletHistoryPage>{
  const kind=params.get("kind")||"credit",query=(params.get("q")||"").trim();
  if(!["credit","debit","all"].includes(kind)||query.length>100)throw new WalletHistoryInputError("Filtro inválido.");
  const hasPeriod=params.has("from")||params.has("to");
  const filters:Filters={kind:kind as Filters["kind"],query,from:hasPeriod?instant(params.get("from")):null,to:hasPeriod?instant(params.get("to")):null};
  if(filters.from&&filters.to&&filters.from>filters.to)throw new WalletHistoryInputError("Período inválido.");
  const scope=JSON.stringify(filters),where=["l.type IN ('credit_manual','debit_manual')"],values:unknown[]=[];
  if(kind!=="all"){where.push("l.type=?");values.push(kind==="credit"?"credit_manual":"debit_manual");}
  if(hasPeriod){where.push("julianday(l.created_at) BETWEEN julianday(?) AND julianday(?)");values.push(filters.from,filters.to);}
  if(query){
    const term=`%${query.replace(/[\\%_]/g,"\\$&")}%`;
    where.push("(u.display_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR w.name LIKE ? ESCAPE '\\' OR l.workspace_owner_user_id LIKE ? ESCAPE '\\')");values.push(...Array(4).fill(term));
  }
  const joins="FROM otp_ledger l LEFT JOIN app_users u ON u.id=l.workspace_owner_user_id LEFT JOIN app_users a ON a.id=l.actor_user_id LEFT JOIN workspaces w ON w.id=l.workspace_owner_user_id";
  const totalWhere=where.join(" AND "),pageWhere=[...where],pageValues=[...values];
  const raw=params.get("cursor");
  if(raw){
    let cursor:{at:number|null;id:string;scope:string;v:number};
    try{if(raw.length>1200)throw Error();cursor=JSON.parse(raw);if(cursor.v!==1||cursor.scope!==scope||typeof cursor.id!=="string"||!cursor.id||cursor.id.length>180||(cursor.at!==null&&(!Number.isFinite(cursor.at)||typeof cursor.at!=="number")))throw Error();}catch{throw new WalletHistoryInputError("Página inválida. Atualize o histórico.");}
    if(cursor.at===null){pageWhere.push("julianday(l.created_at) IS NULL AND l.id < ?");pageValues.push(cursor.id);}
    else{pageWhere.push("(julianday(l.created_at) < ? OR (julianday(l.created_at)=? AND l.id < ?) OR julianday(l.created_at) IS NULL)");pageValues.push(cursor.at,cursor.at,cursor.id);}
  }
  const [page,aggregate]=await db.batch([
    db.prepare(`SELECT l.id,l.type,l.amount_cents,l.balance_after_cents,l.summary,l.created_at,julianday(l.created_at) AS sort_at,l.workspace_owner_user_id,l.actor_user_id,u.display_name AS recipient_name,u.email AS recipient_email,a.display_name AS actor_name,a.email AS actor_email,w.name AS workspace_name ${joins} WHERE ${pageWhere.join(" AND ")} ORDER BY julianday(l.created_at) DESC,l.id DESC LIMIT ?`).bind(...pageValues,WALLET_HISTORY_PAGE_SIZE+1),
    db.prepare(`SELECT count(*) AS count,coalesce(sum(CASE WHEN l.type='credit_manual' THEN l.amount_cents ELSE 0 END),0) AS creditCents,coalesce(sum(CASE WHEN l.type='debit_manual' THEN l.amount_cents ELSE 0 END),0) AS debitCents,coalesce(sum(l.amount_cents),0) AS netCents ${joins} WHERE ${totalWhere}`).bind(...values),
  ]);
  const rows=page.results as unknown as Row[],visible=rows.slice(0,WALLET_HISTORY_PAGE_SIZE),last=visible.at(-1);
  return {items:visible.map(row=>({id:row.id,type:row.type,amountCents:row.amount_cents,balanceAfterCents:row.balance_after_cents,summary:row.summary,createdAt:row.created_at,recipient:{id:row.workspace_owner_user_id,name:row.recipient_name,email:row.recipient_email},actor:{id:row.actor_user_id,name:row.actor_name,email:row.actor_email},workspace:{id:row.workspace_owner_user_id,name:row.workspace_name}})),totals:aggregate.results[0] as WalletHistoryPage["totals"],nextCursor:rows.length>WALLET_HISTORY_PAGE_SIZE&&last?JSON.stringify({v:1,at:last.sort_at,id:last.id,scope}):null};
}
