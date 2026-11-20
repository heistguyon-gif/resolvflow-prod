import {DurableOtpPurchases,PurchaseError} from "./otp-durable-purchase";

/** Admin-only callers. Targets come from the validated journal, never a client wallet field. */
export function durableOtpReview(db:D1Database,bucket:R2Bucket) {
  return {
    async list(cursor?:string) {
      const page=await bucket.list({prefix:"otp-purchases-active/v1/",limit:100,cursor});
      const items=[];
      for(const object of page.objects){
        const match=/^otp-purchases-active\/v1\/([^/]+)\/([^/]+)\/([a-f0-9]{64})$/.exec(object.key);
        if(!match)continue;
        const store=new DurableOtpPurchases(db,bucket,decodeURIComponent(match[1]),decodeURIComponent(match[2]));
        const reviews=await store.reviewItems(match[3]);
        if(reviews.length){
          const customer=await db.prepare("SELECT email,display_name FROM app_users WHERE id=?").bind(decodeURIComponent(match[2])).first<{email:string;display_name:string}>();
          items.push(...reviews.map(item=>({...item,account_email:customer?.email,account_name:customer?.display_name})));
        }
      }
      return {items,cursor:page.truncated?page.cursor:null};
    },
    async resolve(itemId:string,input:{actor:string;note:string;confirmedNoDelivery:boolean}) {
      const parts=itemId.split("|");
      if(parts.length!==5||parts[0]!=="durable"||!/^\d{1,2}$/.test(parts[4]))throw new PurchaseError("Item inválido.",400);
      let owner:string,actor:string;
      try{owner=decodeURIComponent(parts[1]);actor=decodeURIComponent(parts[2]);}catch{throw new PurchaseError("Item inválido.",400);}
      if(!owner||!actor)throw new PurchaseError("Item inválido.",400);
      return new DurableOtpPurchases(db,bucket,owner,actor).resolveReview(parts[3],Number(parts[4]),input);
    },
  };
}
