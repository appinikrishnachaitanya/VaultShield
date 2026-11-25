import {useState} from 'react';
import {demoStories} from '../lib/demoStories';
import {t} from '../lib/i18n';
export default function DemoStories({onChoose}:{onChoose:(text:string)=>void}){
 const [open,setOpen]=useState(false);
 if(!import.meta.env.DEV&&import.meta.env.VITE_ENABLE_DEMO_STORIES!=='true')return null;
 return <div className="demo-stories"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{t('Demo story')}</button>{open&&<><p>{t('Synthetic examples. Results come from the real analysis flow.')}</p>{demoStories.map(story=><button type="button" key={story.title} onClick={()=>{onChoose(story.text);setOpen(false);}}>{t(story.title)}</button>)}</>}</div>;
}
