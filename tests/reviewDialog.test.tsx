import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ReviewDialog from '../src/components/ReviewDialog';
it('presents editable text before purpose and one separate sensitive permission with persistent actions',()=>{
 const html=renderToStaticMarkup(<ReviewDialog dialogRef={null} text="CBI says pay [AMOUNT_1] now" onEdit={()=>{}} route={{tier:'LOCAL_ONLY',reasons:['AADHAAR'],overrideAllowed:true}} leak={{status:'PASS',blocked:false,findings:[]}} busy={false} error="" purpose="hybrid" onPurpose={()=>{}} sensitiveOverride={false} onOverride={()=>{}} consent={false} onConsent={()=>{}} onSubmit={()=>{}} onClose={()=>{}}/>);
 expect(html).toContain('aria-labelledby="consent-title"');
 expect(html.indexOf('id="redacted"')).toBeLessThan(html.indexOf('name="verification-purpose"'));
 expect(html.match(/class="review-sensitive"/g)).toHaveLength(1);
 expect(html).toContain('Keep current result');
 expect(html).toMatch(/review-submit[^>]*disabled/);
 expect(html).toContain('<footer class="review-footer">');
});
