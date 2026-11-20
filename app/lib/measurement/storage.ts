export type ReadScope = {values:unknown[]; complete:boolean};
export interface MeasurementStore {
  get(key:string):Promise<unknown>;
  write(key:string,value:unknown):Promise<void>;
  once(key:string,value:unknown):Promise<boolean>;
  list(prefix:string):Promise<ReadScope>;
}
export type MeasurementBucket = {
  get(key:string):Promise<{json():Promise<unknown>}|null>;
  put(key:string,value:string,options?:{onlyIf:{etagDoesNotMatch:"*"}}):Promise<unknown>;
  list(params:{prefix:string;limit:number;cursor?:string}):Promise<{objects:{key:string}[];truncated:boolean;cursor?:string}>;
};
export function measurementStore(bucket:MeasurementBucket):MeasurementStore {
  const namespace="measurement/v1/";
  const get=async(key:string)=>(await bucket.get(namespace+key))?.json()??null;
  return {
    get,
    async write(key,value){await bucket.put(namespace+key,JSON.stringify(value));},
    async once(key,value){return Boolean(await bucket.put(namespace+key,JSON.stringify(value),{onlyIf:{etagDoesNotMatch:"*"}}));},
    async list(prefix){
      const values:unknown[]=[];
      let cursor:string|undefined;
      for(let i=0;i<8;i++){
        const page=await bucket.list({prefix:namespace+prefix,limit:32,cursor});
        for(const row of page.objects){ const value=await get(row.key.slice(namespace.length));if(value!==null)values.push(value); }
        if(!page.truncated)return {values,complete:true};
        if(!page.cursor||page.cursor===cursor)break;
        cursor=page.cursor;
      }
      return {values,complete:false};
    },
  };
}
