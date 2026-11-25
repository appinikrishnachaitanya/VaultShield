import {describe,it,expect} from 'vitest';
import {routeInput,assertCloudRoute} from '../src/lib/router';
import {TokenVaultSession,rehydrate,tokenAttribute} from '../src/lib/tokenVault';
import {maskIdentifiers} from '../src/lib/privacy';
import {runLeakTest} from '../src/lib/leakTest';
describe('reviewer regression cases',()=>{
 it.each(['Your Aadhaar is linked to money laundering. Pay now.',"Your child's school fee is overdue.",'Please check your account number:','A patient needs help today.','Account: 12345678'])('does not block a topic mention: %s',text=>{expect(routeInput(text).tier).not.toBe('LOCAL_ONLY');expect(()=>assertCloudRoute(routeInput(text))).not.toThrow();});
 it.each(['Inspector Rahul Sharma from CBI','Hi Priya Nair, pay now.','Mera naam Suresh Kumar hai.'])('masks contextual names and finds them in a final preview: %s',text=>{expect(maskIdentifiers(text).count).toBeGreaterThan(0);expect(runLeakTest(text).status).toBe('WARN');const s=new TokenVaultSession();expect(s.tokenize(text).text).toContain('[PERSON_1]');s.clear();});
 it('resolves shortened, changed and spaced attributes by token identity only',()=>{const s=new TokenVaultSession();s.tokenize('Pay ₹35,000 at https://sbi-check.example');for(const token of ['[AMOUNT_1]','[AMOUNT_1:10k-50k]','[ amount _ 1 ]','[amount_1:other]'])expect(rehydrate(token,s)).toBe('₹35,000');expect(rehydrate('[URL_1]',s)).toBe('https://sbi-check.example');expect(rehydrate('[AMOUNT_99]',s)).toBe('[AMOUNT_99]');s.clear();});
 it('uses domain labels rather than loose substrings',()=>{expect(tokenAttribute('URL','https://lesbian-books.com')).toBe('other');expect(tokenAttribute('URL','https://bankruptcy.example')).toBe('other');expect(tokenAttribute('URL','https://sbi-check.example')).toBe('bank-like');});
 it('requires an explicit override for actual identifiers and never overrides unread images',()=>{const route=routeInput('Aadhaar 1234 5678 9012');expect(()=>assertCloudRoute(route)).toThrow();expect(()=>assertCloudRoute(route,true)).not.toThrow();expect(()=>assertCloudRoute(routeInput('',true),true)).toThrow();});
});
