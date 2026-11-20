import {DurableOtpPurchases} from "./otp-durable-purchase";

const stateKey="otp-unconfirmed-refunds/v1/sweep.json";
type SweepState={cursor?:string;leaseUntil:number};

/** Bounded settlement only. Never imports supplier clients or creates/advances a purchase. */
export async function sweepUnconfirmedRefunds(input:{db:D1Database;bucket:R2Bucket;limit?:number;deadline?:number;signal?:AbortSignal}) {
  const {db,bucket,signal}=input,deadline=input.deadline??Date.now()+4000;
  const result={processed:0,completed:0,errors:0,overlap:false,cursorSaved:false};
  if(signal?.aborted||Date.now()>=deadline)return result;
  const previous=await bucket.get(stateKey),state: SweepState=previous?await previous.json<SweepState>():{leaseUntil:0};
  if(state.leaseUntil>Date.now())return {...result,overlap:true};
  const claimed=await bucket.put(stateKey,JSON.stringify({...state,leaseUntil:Date.now()+15000}),{onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:"*"}});
  if(!claimed)return {...result,overlap:true};
  let cursor=state.cursor;
  try {
    const page=await bucket.list({prefix:"otp-purchases-active/v1/",limit:Math.max(1,Math.min(20,Math.floor(input.limit??8))),cursor});
    let finished=true;
    for(const object of page.objects){
      if(signal?.aborted||Date.now()>=deadline){finished=false;break;}
      result.processed++;
      try{
        const match=/^otp-purchases-active\/v1\/([^/]+)\/([^/]+)\/([a-f0-9]{64})$/.exec(object.key);
        if(!match)continue;
        const store=new DurableOtpPurchases(db,bucket,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
        const status=await store.status(match[3]);
        if(status?.state==="unconfirmed_refunded"&&!status.pending)result.completed++;
      }catch{result.errors++;}
    }
    // On a budget stop, retry this page. Settlements are idempotent; never skip its unvisited items.
    if(finished)cursor=page.truncated?page.cursor:undefined;
  }finally{
    result.cursorSaved=Boolean(await bucket.put(stateKey,JSON.stringify({cursor,leaseUntil:0}),{onlyIf:{etagMatches:claimed.etag}}));
  }
  return result;
}
