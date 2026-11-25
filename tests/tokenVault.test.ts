import {describe,it,expect,vi} from 'vitest';
import {TokenVaultSession,rehydrate} from '../src/lib/tokenVault';
describe('memory token vault',()=>{
 it('round trips and reuses identical values',()=>{const s=new TokenVaultSession();const x=s.tokenize('Call +91 90000 00000 or +91 90000 00000.');expect(x.text).toBe('Call [PHONE_1] or [PHONE_1].');expect(rehydrate(x.text,s)).toBe('Call +91 90000 00000 or +91 90000 00000.');s.clear();});
 it('round trips Devanagari and zero width digits',()=>{const s=new TokenVaultSession();const raw='Call ९००००\u200b००००० now.';const x=s.tokenize(raw);expect(x.text).toContain('[PHONE_1]');expect(rehydrate(x.text,s)).toBe(raw);s.clear();});
 it('leaves unknown tokens and tolerates case and spacing',()=>{const s=new TokenVaultSession();s.tokenize('Call 9000000000');expect(rehydrate('[ phone _ 1 ] [PHONE_999]',s)).toBe('9000000000 [PHONE_999]');s.clear();expect(rehydrate('[PHONE_1]',s)).toBe('[PHONE_1]');});
 it('expires after fifteen idle minutes and resets the clock on use',()=>{vi.useFakeTimers();const s=new TokenVaultSession();s.tokenize('9000000000');vi.advanceTimersByTime(14*60_000);s.touch();vi.advanceTimersByTime(14*60_000);expect(s.entries()).toHaveLength(1);vi.advanceTimersByTime(60_000);expect(s.entries()).toHaveLength(0);vi.useRealTimers();});
 it('only retains closed URL and amount attributes',()=>{const s=new TokenVaultSession();const x=s.tokenize('Pay ₹35,000 at https://sbi-secret.example/a?key=private');expect(x.text).toBe('Pay [AMOUNT_1:10k-50k] at [URL_1:bank-like]');s.clear();});
});
