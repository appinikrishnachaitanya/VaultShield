import {detectIdentifiers,normalizePrivateText} from './privacy';
export type RouteTier='LOCAL_ONLY'|'TOKENIZE_THEN_CLOUD_OK'|'LOW_RISK';
export type PrivacyRoute={tier:RouteTier;reasons:string[]};
export function routeInput(input:string,hasImage=false):PrivacyRoute {
 const {matches}=detectIdentifiers(input); const text=normalizePrivateText(input);
 const reasons=new Set<string>();
 for(const m of matches)if(['AADHAAR','PAN','BANK_ACC'].includes(m.category))reasons.add(m.category);
 // Existing tokens carry the same sensitivity as their original values.
 for(const category of ['AADHAAR','PAN','BANK_ACC'])if(new RegExp('\\['+category+'_\\d+','i').test(text))reasons.add(category);
 if(/bank\s+statement|statement\s+of\s+account|बैंक\s*(?:स्टेटमेंट|विवरण)/i.test(text))reasons.add('Bank statement');
 if(/medical\s*(?:report|record)|patient|diagnosis|prescription|blood\s*(?:test|report)|lab\s*report|रोगी|निदान|चिकित्सा|मेडिकल\s*रिपोर्ट/i.test(text))reasons.add('Medical content');
 if(/\b(?:minor|child|children|schoolchild|under\s*18)\b|\b(?:age|aged)\s*[:=-]?\s*(?:[0-9]|1[0-7])\b|नाबालिग|बच्च[ाेी]/i.test(text))reasons.add('Minor-related content');
 if(/(?:kyc|identity|identification)\s*(?:document|certificate|card|scan)|(?:upload|attach|scan)\s+(?:your\s+)?(?:aadhaar|pan|passport)|पहचान\s*पत्र/i.test(text))reasons.add('Identity document');
 if(hasImage)reasons.add('Image awaiting local extraction');
 if(reasons.size)return {tier:'LOCAL_ONLY',reasons:[...reasons]};
 const categories=[...new Set(matches.map(m=>m.category))];
 if(categories.length||/\[[A-Z_]+_\d+/i.test(text)||/\bcontract|agreement|invoice|offer\s*letter\b|अनुबंध|चालान/i.test(text))return {tier:'TOKENIZE_THEN_CLOUD_OK',reasons:categories.length?categories:['Reviewed document']};
 return {tier:'LOW_RISK',reasons:['No identifiers detected']};
}
export function assertCloudRoute(route:PrivacyRoute){if(route.tier==='LOCAL_ONLY')throw new Error('This content stays on this device. Cloud actions are disabled.');}
