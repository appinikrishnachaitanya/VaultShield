import {TokenVaultSession,rehydrate} from '../src/lib/tokenVault';
import {it,expect} from 'vitest';
it('normalizes combining accents without shifting private-value offsets',()=>{const s=new TokenVaultSession();const text='Cafe\u0301: Call +91 90000 00000.';const value=s.tokenize(text);expect(rehydrate(value.text,s)).toBe('Café: Call +91 90000 00000.');s.clear();});

it('does not collapse distinct case-sensitive URL values',()=>{const s=new TokenVaultSession();const raw='https://example.com/Secret https://example.com/secret';const value=s.tokenize(raw);expect(value.text).toBe('[URL_1:other] [URL_2:other]');expect(rehydrate(value.text,s)).toBe(raw);s.clear();});
