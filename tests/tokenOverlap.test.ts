import {it,expect} from 'vitest';
import {TokenVaultSession} from '../src/lib/tokenVault';
it('masks a name and a phone when both share the same labeled line',()=>{const s=new TokenVaultSession();const result=s.tokenize('Name: Demo Ravi 9000000000');expect(result.text).not.toContain('Ravi');expect(result.text).not.toContain('9000000000');expect(result.counts.PERSON).toBe(1);expect(result.counts.PHONE).toBe(1);s.clear();});
