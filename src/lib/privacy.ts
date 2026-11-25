import type { SanitizedText } from '../types/privacy';
export type IdentifierCategory = 'PERSON'|'PHONE'|'BANK_ACC'|'UPI'|'AADHAAR'|'PAN'|'EMAIL'|'URL'|'AMOUNT'|'OTP'|'ORG'|'REFERENCE'|'IFSC'|'PRIVATE';
export type IdentifierMatch = { category: IdentifierCategory; value: string; start: number; end: number };
export function normalizePrivateText(input:string):string {
 return input.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u0966-\u096F]/g,d=>String(d.charCodeAt(0)-0x0966));
}
/** One ordered detection layer shared by masking, tokenization and leak checks. Offsets refer to normalized text. */
export function detectIdentifiers(input:string): {text:string;matches:IdentifierMatch[]} {
 const text=normalizePrivateText(input); const matches:IdentifierMatch[]=[];
 const add=(category:IdentifierCategory, regex:RegExp, group=0)=>{
  for (const m of text.matchAll(regex)) {
   const value=m[group]; const start=m.index!+(group ? m[0].lastIndexOf(value):0); const end=start+value.length;
   if (!matches.some(x=>start<x.end && end>x.start)) matches.push({category,value,start,end});
  }
 };
 add('BANK_ACC',/\b(?:account(?:\s*(?:number|no\.?))?|a\/c(?:\s*(?:number|no\.?))?)\s*[:#=-]\s*(\d[\d -]{3,30}\d)\b/gi,1);
 add('REFERENCE',/\b(?:utr|transaction\s*(?:id|reference)|payment\s*(?:id|reference)|reference\s*(?:id|number|no\.?))\s*[:#=-]\s*((?=[A-Z0-9]*\d)[A-Z0-9]{6,35})\b/gi,1);
 add('URL',/(?:https?:\/\/|www\.)[^\s<>"']+/gi);
 add('IFSC',/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi);
 add('OTP',/\b(?:OTP|one[- ]time (?:password|code))\s*(?:is|:|-)?\s*\d(?:[ \t-]*\d){3,7}\b/gi);
 add('AMOUNT',/(?:₹|\bINR\s*|\bRs\.?\s*)[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi);
 add('PHONE',/(?:\+91|\b91)[ \t-]*[6-9](?:[ \t-]*\d){9}\b/g);
 add('AADHAAR',/\b\d{4}[ \t-]*\d{4}[ \t-]*\d{4}\b/g);
 add('PAN',/\b[A-Z]{5}\d{4}[A-Z]\b/gi);
 for(const m of text.matchAll(/[\w.+-]+[ \t]*@[ \t]*[\w.-]+/g)) {
  const category:IdentifierCategory=/@\s*[^\s@]+\.[^\s@]+/.test(m[0])?'EMAIL':'UPI';
  const start=m.index!; const end=start+m[0].length;
  if(!matches.some(x=>start<x.end&&end>x.start))matches.push({category,value:m[0],start,end});
 }
 add('PHONE',/\b[6-9](?:[ \t-]*\d){9}\b/g);
 add('BANK_ACC',/\b\d[\d -]{11,22}\d\b/g);
 add('PERSON',/\b(?:name|customer|account holder)\s*:\s*[^\n,;]+/gi);
 add('ORG',/\b(?:client|company|employer)\s*:\s*[^\n,;]+/gi);
 return {text,matches:matches.sort((a,b)=>a.start-b.start)};
}
// The brand is a compile-time aid. Review is still required before sending.
export function maskIdentifiers(input:string):{text:SanitizedText;count:number} {
 const detected=detectIdentifiers(input);let text=detected.text;
 for(const m of [...detected.matches].reverse())text=text.slice(0,m.start)+'[REDACTED]'+text.slice(m.end);
 return {text:text as SanitizedText,count:detected.matches.length};
}
export function hasAssessableText(input:string):boolean {
 const remaining=maskIdentifiers(input).text
 .replace(/\[(?:REDACTED|MASKED|HIDDEN|[•*]+|[A-Z_]+_\d+(?::[^\]]+)?)\]/gi,'')
 .replace(/^\s*(?:name|phone(?: number)?|mobile(?: number)?|aadhaar(?: number)?|pan|email|upi(?: id)?|account(?: number| no\.?)?|address)\s*[:|—-]?\s*$/gim,'')
 .replace(/\b(?:name|phone(?: number)?|mobile(?: number)?|aadhaar(?: number)?|pan|email|upi(?: id)?|account(?: number| no\.?)?|address)\s*:/gi,'')
 .replace(/[\s\p{P}\p{S}]/gu,'');
 return /[\p{L}\p{N}]/u.test(remaining);
}
