export type GmailConnection={id:"supplier_1"|"supplier_2";state:"ready"|"unconfigured"|"invalid_key"|"rate_limited"|"unavailable"|"unsupported_product";stock:number|null;priorities:number[];checkedAt:string};
export function gmailConnection(id:GmailConnection["id"],configured:boolean,status:number,data:unknown):GmailConnection {
 const result:GmailConnection={id,state:!configured?"unconfigured":status===401||status===403?"invalid_key":status===429?"rate_limited":"unavailable",stock:null,priorities:[],checkedAt:new Date().toISOString()};
 if(!configured||status<200||status>=300)return result;
 if(id==="supplier_1"){
  const root=data as {success?:boolean;data?:Array<{code?:string;offers?:Array<{domain?:string;stock?:number;warehouse?:number}>}>}|null;
  if(!root?.success||!Array.isArray(root.data))return result;
  const product=root.data.find(p=>p.code==="ig");if(!product){result.state="unsupported_product";return result;}
  const offers=product.offers?.filter(o=>o.domain==="gmail.com")??[];
  if(!offers.length){result.state="unsupported_product";return result;}
  result.state="ready";
  // Warehouse 99 is a selector; do not count its mirrored stock again.
  const stocks=offers.filter(o=>o.warehouse!==99).map(o=>o.stock);
  if(stocks.length&&stocks.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0))result.stock=stocks.reduce<number>((n,v)=>n+Math.floor(v!),0);
 }else{
  if(!Array.isArray(data))return result;
  const product=data.find(p=>p?.slug==="ig_gmail_otp");if(!product){result.state="unsupported_product";return result;}
  result.state="ready";result.priorities=Array.isArray(product.priority_options)?[...new Set<number>(product.priority_options.map((p:{mode?:unknown})=>p.mode).filter((n:unknown):n is number=>n===0||n===1||n===2))].sort():[0];
 }
 return result;
}
