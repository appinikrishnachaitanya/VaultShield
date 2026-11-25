import {it,expect} from 'vitest';
import fixtures from './fixtures/rules-name-evaluation.json';
import {detectIdentifiers,normalizePrivateText} from '../src/lib/privacy';
it('measures contextual name heuristics on the committed synthetic corpus',()=>{
 let tp=0,fp=0,fn=0;
 for(const row of fixtures){const found=detectIdentifiers(row.text).matches.filter(m=>m.category==='PERSON');for(const name of row.names){if(found.some(m=>m.value.includes(normalizePrivateText(name))))tp++;else fn++;}for(const span of found)if(!row.names.some(name=>span.value.includes(normalizePrivateText(name))))fp++;}
 const metrics={fixtures:fixtures.length,expectedNames:tp+fn,truePositives:tp,falsePositives:fp,falseNegatives:fn,precision:tp/(tp+fp),recall:tp/(tp+fn),rawNameSurvivalRate:fn/(tp+fn)};
 console.info('Synthetic rules-only name evaluation:',JSON.stringify(metrics));
 expect(metrics.expectedNames).toBe(15);expect(tp).toBeGreaterThan(0);
});
