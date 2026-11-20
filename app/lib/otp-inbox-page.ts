export type InboxPageKind="open"|"history"|"hidden";
export function inboxCursor(row:{id:string;createdAt:string}) {return btoa(JSON.stringify([row.createdAt,row.id]));}
export function parseInboxCursor(cursor:string|null) {
  if(!cursor)return null;
  try {const value:unknown=JSON.parse(atob(cursor));if(Array.isArray(value)&&value.length===2&&value.every(part=>typeof part==="string"&&part.length>0&&part.length<=160))return {createdAt:value[0] as string,id:value[1] as string};}catch{/* Invalid cursor. */}
  throw new Error("Página inválida. Atualize a lista.");
}
type Row={id:string;order_id:string;email:string;product:string;status:string;price:string;codes_json:string;closed:number;hidden_at:string|null;created_at:string;supplier_api_id:string|null;supplier_name:string|null};
export async function otpInboxPage(db:D1Database,account:string,kind:InboxPageKind,cursor:string|null=null,api:string|null=null,limit=50) {
  const size=Math.min(50,Math.max(1,limit)),after=parseInboxCursor(cursor),params:unknown[]=[account,kind==="open"?0:1];
  const where=["i.account_user_id=?","i.closed=?",kind==="hidden"?"i.hidden_at IS NOT NULL":"i.hidden_at IS NULL"];
  if(api){where.push("i.supplier_api_id=?");params.push(api);}
  if(after){where.push("(i.created_at < ? OR (i.created_at = ? AND i.id < ?))");params.push(after.createdAt,after.createdAt,after.id);}
  params.push(size+1);
  const rows=await db.prepare(`SELECT i.*,a.name AS supplier_name FROM otp_inbox i LEFT JOIN otp_supplier_apis a ON a.id=i.supplier_api_id WHERE ${where.join(" AND ")} ORDER BY i.created_at DESC,i.id DESC LIMIT ?`).bind(...params).all<Row>();
  const visible=rows.results.slice(0,size),last=visible.at(-1);
  return {orders:visible.map(row=>{
    let codes:Array<{code:string;at:string}>=[];
    try {const values:unknown=JSON.parse(row.codes_json);if(Array.isArray(values))codes=values.filter(value=>value?.code).map(value=>({code:String(value.code),at:String(value.at||"")}));}catch{/* Keep a corrupt history from breaking the entire list. */}
    return {inboxId:row.id,order_id:row.order_id,email:row.email,product:row.product,status:row.status,price:row.price,codes,closed:Boolean(row.closed),hidden:Boolean(row.hidden_at),savedAt:row.created_at,supplierApiId:row.supplier_api_id,supplierApiName:row.supplier_name||"API principal"};
  }),nextCursor:rows.results.length>size&&last ? inboxCursor({id:last.id,createdAt:last.created_at}) : null};
}
