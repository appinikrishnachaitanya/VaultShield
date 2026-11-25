import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import CloudApproval from '../src/components/CloudApproval';
import {reviewReducer} from '../src/lib/useReviewedText';
describe('review approval controls',()=>{
 const render=(tier:'LOCAL_ONLY'|'LOW_RISK',blocked=false)=>renderToStaticMarkup(<CloudApproval route={{tier,reasons:[]}} blocked={blocked} consent busy={false} readable onConsent={()=>{}} onSubmit={()=>{}} purpose="hybrid"/>);
 it('disables the checkbox and cloud button for local only content',()=>{const html=render('LOCAL_ONLY');expect(html.match(/disabled=""/g)).toHaveLength(2);});
 it('disables both controls for a known leak',()=>expect(render('LOW_RISK',true).match(/disabled=""/g)).toHaveLength(2));
 it('enables approved eligible text',()=>expect(render('LOW_RISK')).not.toContain('disabled'));
 it('atomically clears consent when approved text changes',()=>{const state=reviewReducer({text:'old',consent:true},{type:'edit',text:'new'});expect(state).toEqual({text:'new',consent:false});});
});
