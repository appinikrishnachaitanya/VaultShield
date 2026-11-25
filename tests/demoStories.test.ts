import {describe,it,expect} from 'vitest';
import {demoStories} from '../src/lib/demoStories';
import {TokenVaultSession} from '../src/lib/tokenVault';
import {routeInput} from '../src/lib/router';
import {runLeakTest} from '../src/lib/leakTest';
describe('synthetic demo stories',()=>{
 it.each(demoStories)('uses the real router and vault for $title',story=>{expect(story.text).toContain('SYNTHETIC DEMO');expect(routeInput(story.text).tier).toBe('TOKENIZE_THEN_CLOUD_OK');const s=new TokenVaultSession();const masked=s.tokenize(story.text);expect(runLeakTest(masked.text,s).status).toBe('PASS');expect(masked.text).not.toContain('90000');expect(masked.text).toContain('[PERSON_1]');s.clear();});
});
