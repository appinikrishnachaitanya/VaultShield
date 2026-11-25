import {describe,it,expect} from 'vitest';
import {routeInput,assertCloudRoute} from '../src/lib/router';
import {renderToStaticMarkup} from 'react-dom/server';
import RoutingBanner from '../src/components/RoutingBanner';
describe('sensitivity router',()=>{
 it.each(['Aadhaar: 1234 5678 9012','PAN ABCDE1234F','Medical report\nPatient: Demo\nGlucose: 99 mg/dL\nReference range: 70-100','Student record\nName: Demo Ravi\nAge: 12','Identity document\nDOB: 2000\nAddress: Example\nGender: X','Bank statement\nOpening balance: 100\nClosing balance: 200\nDebit Credit'])('keeps sensitive category local: %s',raw=>{const route=routeInput(raw);expect(route.tier).toBe('LOCAL_ONLY');expect(()=>assertCloudRoute(route)).toThrow('disabled');for(const value of ['1234','ABCDE','12345678','diabetes'])expect(JSON.stringify(route.reasons)).not.toContain(value);});
 it('retains the policy for tokenized identifiers',()=>expect(routeInput('[AADHAAR_1]').tier).toBe('LOCAL_ONLY'));
 it('allows reviewed contracts and suspicious messages',()=>{expect(routeInput('Contract: pay ₹10,000 to demo@upi').tier).toBe('TOKENIZE_THEN_CLOUD_OK');expect(routeInput('Parcel arrives today').tier).toBe('LOW_RISK');});
 it('starts images locally and explains the route',()=>{const route=routeInput('',true);expect(route.tier).toBe('LOCAL_ONLY');expect(renderToStaticMarkup(<RoutingBanner route={route}/>)).toContain('An image must be read locally');});
});
