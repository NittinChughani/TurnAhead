/** Shared browser recovery and operation guards, with no network or storage side effects on import. */
export function operationGate(){
 let active=null;
 return {get busy(){return active!==null;},begin(){if(active!==null)return null;active=Symbol('operation');return active;},end(token){if(active===token)active=null;}};
}
export function canMutateQueue({online,confirmed,pending}){
 return Boolean(online&&confirmed&&!pending);
}
export function connectionLabel({online,confirmed,pending}){
 if(!online)return 'Offline · changes are paused';
 if(!confirmed)return 'Reconnecting · waiting for live data';
 if(pending)return 'Saving · waiting for confirmation';
 return 'Connected · live queue';
}
export function safeStorage(storage){
 const fallback=new Map();
 return {getItem(key){if(fallback.has(key))return fallback.get(key);try{return storage()?.getItem(key)??null;}catch{return null;}},setItem(key,value){fallback.set(key,String(value));try{storage()?.setItem(key,value);}catch{}},removeItem(key){fallback.set(key,null);try{storage()?.removeItem(key);}catch{}}};
}
export const persistent=safeStorage(()=>globalThis.localStorage);
export const session=safeStorage(()=>globalThis.sessionStorage);
export async function mapLimited(items,concurrency,fn){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw Error('Invalid concurrency');
 const results=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(cursor<items.length){const i=cursor++;results[i]=await fn(items[i],i);}}));
 return results;
}
