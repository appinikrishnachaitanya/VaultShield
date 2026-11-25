import type {Stage} from '../types/privacy';
import type {TokenEntry} from './tokenVault';
export const urlFeatures=['none','shortener','bank-like','agency-like','other'] as const;
export const amountBuckets=['none','lt1k','1k-10k','10k-50k','50k-plus'] as const;
export type PatternSignal={tacticTypes:Stage['name'][];urlFeature:typeof urlFeatures[number];amountBucket:typeof amountBuckets[number];language:'en'|'hi'};
export type TrendingPatterns={threshold:number;buckets:(PatternSignal&{count:number})[]};
export function patternSignal(stages:Stage[],entries:TokenEntry[],language:'en'|'hi'):PatternSignal {
 const url=entries.find(e=>e.category==='URL')?.token.split(':')[1]?.replace(']','');
 const amount=entries.find(e=>e.category==='AMOUNT')?.token.split(':')[1]?.replace(']','');
 return {tacticTypes:stages.filter(s=>s.found).map(s=>s.name),urlFeature:urlFeatures.find(v=>v===url)??'none',amountBucket:amountBuckets.find(v=>v===amount)??'none',language};
}
