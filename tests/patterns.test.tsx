import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('../src/lib/firebase/family',()=>({sharePattern:vi.fn(),loadTrendingPatterns:vi.fn()}));
import CommunitySignal from '../src/components/CommunitySignal';
import {patternSignal} from '../src/lib/patterns';
import {TokenVaultSession} from '../src/lib/tokenVault';
describe('community opt in',()=>{
 it('constructs only closed categories from a private vault',()=>{const s=new TokenVaultSession();const {entries}=s.tokenize('Name: Demo Ravi\nPay ₹35,000 at https://bit.ly/private');const signal=patternSignal([{name:'Fear',found:true,evidence:'private',action:'private'}],entries,'hi');expect(signal).toEqual({tacticTypes:['Fear'],urlFeature:'shortener',amountBucket:'10k-50k',language:'hi'});expect(JSON.stringify(signal)).not.toMatch(/Ravi|private|35000/);s.clear();});
 it('starts unchecked and does not render invented trend data',()=>{const html=renderToStaticMarkup(<CommunitySignal signal={{tacticTypes:[],urlFeature:'none',amountBucket:'none',language:'en'}}/>);expect(html).not.toContain('checked=""');expect(html).toContain('disabled=""');expect(html).not.toContain('observations, not');});
});
