export type NetworkCategory='AI-cloud'|'family'|'other';
export type NetworkCount={requests:number;bytes:number};
export type NetworkSnapshot={categories:Record<NetworkCategory,NetworkCount>;check:NetworkCount;unconfirmedAI:number};
let snapshot:NetworkSnapshot={categories:{'AI-cloud':{requests:0,bytes:0},family:{requests:0,bytes:0},other:{requests:0,bytes:0}},check:{requests:0,bytes:0},unconfirmedAI:0};
const listeners=new Set<()=>void>();
function emit(){listeners.forEach(fn=>fn());}
export const networkSnapshot=()=>snapshot;
export const subscribeNetwork=(fn:()=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};};
export function startNetworkCheck(){snapshot={...snapshot,check:{requests:0,bytes:0},unconfirmedAI:0};emit();}
export function recordPayload(category:NetworkCategory,payload:string){const bytes=new TextEncoder().encode(payload).length;const current=snapshot.categories[category];snapshot={...snapshot,categories:{...snapshot.categories,[category]:{requests:current.requests+1,bytes:current.bytes+bytes}},check:category==='AI-cloud'?{requests:snapshot.check.requests+1,bytes:snapshot.check.bytes+bytes}:snapshot.check};emit();}
export function recordAIResult(payload:string,source:'ON_DEVICE'|'IN_CLOUD'){if(source==='IN_CLOUD')recordPayload('AI-cloud',payload);}
export function markUnconfirmedAI(){snapshot={...snapshot,unconfirmedAI:snapshot.unconfirmedAI+1};emit();}
/** Counts app-supplied string bodies, excluding SDK envelopes, headers and TLS overhead. Never retains bodies. */
export function countedFetch(category:'family'|'other',url:string,options?:RequestInit){recordPayload(category,typeof options?.body==='string'?options.body:'');return fetch(url,options);}
export function clearNetworkProof(){snapshot={categories:{'AI-cloud':{requests:0,bytes:0},family:{requests:0,bytes:0},other:{requests:0,bytes:0}},check:{requests:0,bytes:0},unconfirmedAI:0};emit();}
