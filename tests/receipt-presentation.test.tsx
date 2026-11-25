import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildReceipt} from '../src/lib/receipt';
import PrivacyReceipt from '../src/components/PrivacyReceipt';
import LocalCheckNotice from '../src/components/LocalCheckNotice';
import {maskIdentifiers} from '../src/lib/privacy';
describe('receipt and fallback presentation',()=>{
 it('uses human labels and small measured durations instead of raw policy enums',()=>{const receipt=buildReceipt({route:{tier:'LOCAL_ONLY',reasons:[]},source:'LOCAL_RULES',elapsedMs:1,counts:{PHONE:1,AADHAAR:1}});const html=renderToStaticMarkup(<PrivacyReceipt receipt={receipt} original="" entries={[]}/>);expect(html).toContain('Basic text check · not AI');expect(html).toContain('No message sent to cloud AI');expect(html).toContain('Phone numbers');expect(html).not.toContain('LOCAL_ONLY');expect(html).not.toContain('LOCAL RULES');expect(html).toContain('&lt; 0.01 s');expect(html).toContain('receipt-actions');});
 it('keeps diagnostics collapsed and the review warning visible',()=>{const html=renderToStaticMarkup(<LocalCheckNotice result={{source:'LOCAL_RULES',text:maskIdentifiers('Pay now').text,masked:0,stages:[],durationMs:1,fallbackReason:'Local model unavailable',fallbackCode:'Error'}} checking={false} disabled={false} onCheck={async()=>{}}/>);expect(html).toContain('A basic text check is ready');expect(html).toContain('Names and addresses');expect(html).toContain('<details class="notice-diagnostics">');expect(html).not.toContain('<details open');});
});
