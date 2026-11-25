import {describe,it,expect,vi} from 'vitest';
import {runLeakTest,assertNoKnownLeak} from '../src/lib/leakTest';
import {TokenVaultSession} from '../src/lib/tokenVault';
describe('pre-send leak checks',()=>{
 it('hard blocks a reintroduced original despite case and whitespace changes',()=>{const s=new TokenVaultSession();s.tokenize('Name: Demo Ravi\nEmail: demo@example.com');const result=runLeakTest('Contact D E M O @ E X A M P L E . C O M',s);expect(result.blocked).toBe(true);expect(()=>assertNoKnownLeak('demo ravi',s)).toThrow('private value');s.clear();});
 it('passes clean typed tokens including allowed attributes',()=>{const s=new TokenVaultSession();const {text}=s.tokenize('Pay ₹35,000 to demo@upi.');expect(runLeakTest(text,s)).toMatchObject({status:'PASS',blocked:false});s.clear();});
 it('warns for new identifier and high entropy formats',()=>{const r=runLeakTest('OTP 123456 key abcdEFGHijkl1234mnopQRST5678uvwx');expect(r.status).toBe('WARN');expect(r.findings.some(x=>x.category==='High-entropy string')).toBe(true);});
 it('never logs or returns original values in findings',()=>{const log=vi.spyOn(console,'log');const warn=vi.spyOn(console,'warn');const s=new TokenVaultSession();s.tokenize('9000000000');expect(JSON.stringify(runLeakTest('9000000000',s))).not.toContain('9000000000');expect(log).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();log.mockRestore();warn.mockRestore();s.clear();});
});
