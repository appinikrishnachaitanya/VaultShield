import type {SanitizedText} from '../types/privacy';
import type {PrivacyRoute} from './router';
import type {TokenCounts} from './tokenVault';
export type ReceiptSource='ON-DEVICE'|'HYBRID-ON-DEVICE'|'HYBRID-CLOUD-FALLBACK'|'CLOUD-PUBLIC-SOURCE'|'LOCAL RULES';
export type PrivacyReceiptData={timestamp:string;routeTier:PrivacyRoute['tier'];source:ReceiptSource;model?:string;elapsedMs:number;tokenCounts:TokenCounts;outboundBytes:number;groundingUsed:boolean;imagesSent:'no';storageStatement:'VaultShield stored nothing';storageScope:'Original content and token mapping were not persisted by VaultShield';outboundText:SanitizedText;approvedText:SanitizedText};
export function receiptSource(source:'ON_DEVICE'|'IN_CLOUD'|'LOCAL_RULES',purpose?:'hybrid'|'public-sources'):ReceiptSource {
 if(source==='LOCAL_RULES')return 'LOCAL RULES';
 if(source==='ON_DEVICE')return purpose?'HYBRID-ON-DEVICE':'ON-DEVICE';
 return purpose==='public-sources'?'CLOUD-PUBLIC-SOURCE':'HYBRID-CLOUD-FALLBACK';
}
export function buildReceipt(input:{route:PrivacyRoute;source:'ON_DEVICE'|'IN_CLOUD'|'LOCAL_RULES';purpose?:'hybrid'|'public-sources';model?:string;elapsedMs:number;counts:TokenCounts;payload?:SanitizedText;approvedText?:SanitizedText;groundingUsed?:boolean}):PrivacyReceiptData {
 const cloud=input.source==='IN_CLOUD';
 if(cloud&&input.payload===undefined)throw new Error('Exact cloud payload required for a receipt.');
 const outboundText=(cloud?input.payload!:'') as SanitizedText;
 return {timestamp:new Date().toISOString(),routeTier:input.route.tier,source:receiptSource(input.source,input.purpose),model:cloud?input.model:undefined,elapsedMs:input.elapsedMs,tokenCounts:{...input.counts},outboundBytes:new TextEncoder().encode(outboundText).length,groundingUsed:cloud&&Boolean(input.groundingUsed),imagesSent:'no',storageStatement:'VaultShield stored nothing',storageScope:'Original content and token mapping were not persisted by VaultShield',outboundText,approvedText:(cloud?input.approvedText??'':'') as SanitizedText};
}
export function exportReceipt(receipt:PrivacyReceiptData){return JSON.stringify(receipt,null,2);}
