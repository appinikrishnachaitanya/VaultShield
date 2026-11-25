import {TokenVaultSession,rehydrate} from '../src/lib/tokenVault';
import {it,expect} from 'vitest';
it('normalizes combining accents without shifting private-value offsets',()=>{const s=new TokenVaultSession();const text='Cafe\u0301: Call +91 90000 00000.';const value=s.tokenize(text);expect(rehydrate(value.text,s)).toBe('Café: Call +91 90000 00000.');s.clear();});
