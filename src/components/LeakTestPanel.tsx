import {t} from '../lib/i18n';
import type {LeakResult} from '../lib/leakTest';
export default function LeakTestPanel({result,text}:{result:LeakResult;text:string}){
 const spans=[...result.findings].sort((a,b)=>a.start-b.start);let cursor=0;const parts:React.ReactNode[]=[];
 for(const span of spans){if(span.start<cursor)continue;parts.push(text.slice(cursor,span.start),<mark key={span.start}>{text.slice(span.start,span.end)}</mark>);cursor=span.end;}parts.push(text.slice(cursor));
 return <section className="routing-banner" aria-label={t('Leak test')} role="status"><strong>{t('Leak test')}: {t(result.status)}</strong><p>{t(result.blocked?'A known private value remains. Remove the highlighted text before approving.':result.status==='WARN'?'Review these possible identifiers before approving.':'No known private values or identifier patterns found. Review is still required.')}</p>{result.findings.length>0&&<><p>{[...new Set(result.findings.map(f=>t(f.category)))].join(' · ')}</p><pre className="leak-preview">{parts}</pre></>}<small>{t('Deterministic check. Names and unusual identifiers can still be missed.')}</small></section>;
}
