import {describe,it,expect} from 'vitest';
import {buildReceipt,exportReceipt,receiptSource} from '../src/lib/receipt';
import {TokenVaultSession} from '../src/lib/tokenVault';
import {renderToStaticMarkup} from 'react-dom/server';
import PrivacyReceipt from '../src/components/PrivacyReceipt';
describe('privacy receipts',()=>{
 it('exports metadata and exact sanitized payload, never originals or map',()=>{const s=new TokenVaultSession();const input='Name: Demo Ravi\nSend ₹35,000 to demo@upi';const masked=s.tokenize(input);const r=buildReceipt({route:{tier:'TOKENIZE_THEN_CLOUD_OK',reasons:[]},source:'IN_CLOUD',purpose:'hybrid',model:'test-model',elapsedMs:5,counts:masked.counts,payload:masked.text,approvedText:masked.text});const json=exportReceipt(r);for(const entry of s.entries())expect(json).not.toContain(entry.original);expect(json).not.toContain('entries');expect(r.outboundBytes).toBe(new TextEncoder().encode(masked.text).length);expect(r.imagesSent).toBe('no');expect(r.source).toBe('HYBRID-CLOUD-FALLBACK');s.clear();});
 it.each(['ON_DEVICE','LOCAL_RULES'] as const)('records zero outgoing AI bytes for %s',source=>{const r=buildReceipt({route:{tier:'LOCAL_ONLY',reasons:[]},source,elapsedMs:1,counts:{}});expect(r.outboundBytes).toBe(0);expect(r.outboundText).toBe('');expect(renderToStaticMarkup(<PrivacyReceipt receipt={r} original="device secret" entries={[]}/>)).toContain('Nothing sent');expect(exportReceipt(r)).not.toContain('device secret');});
 it('requires actual payload for cloud and uses explicit SDK source',()=>{expect(receiptSource('ON_DEVICE','hybrid')).toBe('HYBRID-ON-DEVICE');expect(receiptSource('IN_CLOUD','public-sources')).toBe('CLOUD-PUBLIC-SOURCE');expect(()=>buildReceipt({route:{tier:'LOW_RISK',reasons:[]},source:'IN_CLOUD',counts:{},elapsedMs:0})).toThrow('Exact cloud payload');});
});
