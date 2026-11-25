import {describe,it,expect,vi,beforeEach} from 'vitest';
import {clearNetworkProof,startNetworkCheck,recordAIResult,networkSnapshot,countedFetch,markUnconfirmedAI} from '../src/lib/netProof';
describe('app payload accounting',()=>{
 beforeEach(()=>{clearNetworkProof();vi.unstubAllGlobals();});
 it('counts nothing for SDK-reported local inference',()=>{recordAIResult('local secret','ON_DEVICE');expect(networkSnapshot().check).toEqual({requests:0,bytes:0});expect(JSON.stringify(networkSnapshot())).not.toContain('secret');});
 it('counts the UTF8 payload once for cloud and resets per-check without clearing session totals',()=>{recordAIResult('नमस्ते [PHONE_1]','IN_CLOUD');expect(networkSnapshot().check).toEqual({requests:1,bytes:new TextEncoder().encode('नमस्ते [PHONE_1]').length});startNetworkCheck();expect(networkSnapshot().check.bytes).toBe(0);expect(networkSnapshot().categories['AI-cloud'].requests).toBe(1);});
 it('wraps fetch and stores only counters',async()=>{const fetch=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetch);await countedFetch('family','/pair/invite',{method:'POST',body:'{"name":"Demo"}'});expect(fetch).toHaveBeenCalledOnce();expect(networkSnapshot().categories.family.bytes).toBe(15);expect(JSON.stringify(networkSnapshot())).not.toContain('Demo');});
 it('does not call a failed hybrid request zero confirmed delivery',()=>{markUnconfirmedAI();expect(networkSnapshot().unconfirmedAI).toBe(1);});
});
