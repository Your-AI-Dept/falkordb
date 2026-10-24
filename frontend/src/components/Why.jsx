import React,{useEffect,useId,useRef,useState} from 'react';
import {api} from '../api.js';
import {Icon} from './ui.jsx';
import {configuredGraphLink} from '../graph-link.js';
import './why.css';

const top=percentile=>`top ${Math.max(1,Math.round(100-percentile))}%`;

/** Opens on mouse hover (desktop) and pins on click or tap; Escape closes. `onOpen` runs on first open. */
export function Disclosure({label,children,onOpen,className=''}){
  const [pinned,setPinned]=useState(false),[hover,setHover]=useState(false),seen=useRef(false),id=useId();
  const open=pinned||hover;
  useEffect(()=>{if(open&&!seen.current){seen.current=true;onOpen?.();}},[open,onOpen]);
  const mouse=handler=>event=>{if(event.pointerType==='mouse')handler();};
  return <div className={'why '+(open?'open ':'')+className} onPointerEnter={mouse(()=>setHover(true))} onPointerLeave={mouse(()=>setHover(false))} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setPinned(false);setHover(false);}}}>
    <button type="button" className="why-toggle" aria-expanded={open} aria-controls={id} onClick={event=>{event.stopPropagation();if(pinned){setPinned(false);setHover(false);}else setPinned(true);}}><Icon name="spark" size={14}/>{label}</button>
    {open&&<div className="why-panel" id={id} role="region" aria-label={label}>{children}</div>}
  </div>;
}

export function Reasons({reasons}){
  return <ul className="why-reasons">{reasons.map((reason,index)=><li key={index} className={'why-reason '+reason.kind}><strong>{reason.title}</strong>{reason.detail&&<span>{reason.detail}</span>}</li>)}</ul>;
}

export function PathChips({path}){
  return <ol className="why-path" aria-label="How you’re connected">{path.map((step,index)=><li key={step.person.id+index}><span className="why-chip">{step.person.name}</span>{step.via&&<span className="why-tie">{step.viaLabel}</span>}</li>)}</ol>;
}

export function GraphQueries({queries}){
  if(!queries?.length)return null;
  return <details className="why-queries"><summary>Show the graph queries</summary>{queries.map((query,index)=><div key={index}><span>{query.label}</span><pre><code>{query.cypher}</code></pre></div>)}</details>;
}

/** "Why we matched you": loads GET .../meetings/{rater}/why when first opened; hidden if the backend has none. */
export function MeetingWhy({meetingId,respondentId}){
  const [state,setState]=useState({status:'idle'});
  const load=()=>{setState({status:'loading'});api.meetingWhy(meetingId,respondentId).then(why=>setState(why?{status:'ready',why}:{status:'hidden'})).catch(error=>setState({status:'error',message:error.message}));};
  if(state.status==='hidden')return null;
  const why=state.why,graphLink=configuredGraphLink(respondentId);
  return <Disclosure label="Why we matched you" onOpen={load} className="meeting-why">
    {state.status==='loading'&&<p role="status">Loading…</p>}
    {state.status==='error'&&<p className="error" role="alert">{state.message}</p>}
    {why&&<>
      <p className="why-headline">{why.headline}</p>
      <Reasons reasons={why.reasons}/>
      {why.path&&<div className="why-section"><span className="eyebrow">HOW YOU’RE CONNECTED</span><PathChips path={why.path}/></div>}
      {graphLink&&<a className="text-button why-graph-link" href={graphLink} target="_blank" rel="noopener noreferrer">See it in the graph<Icon name="link" size={14}/></a>}
      <GraphQueries queries={why.evidenceQueries}/>
    </>}
  </Disclosure>;
}

/** Per micro-influencer: competence, likability and who only they reach. */
export function InfluencerWhy({why}){
  if(!why)return null;
  return <Disclosure label="Why them?" className="influencer-why">
    <div className="why-facts">
      {why.competencePercentile!==null&&<span>Competence: {top(why.competencePercentile)}</span>}
      {why.likabilityPercentile!==null&&<span>Likability: {top(why.likabilityPercentile)}</span>}
      {why.directTargets!==null&&<span>Reaches {why.directTargets} · {why.uniqueTargets??0} only via them</span>}
      {why.pickOrder!==null&&<span>Pick #{why.pickOrder}</span>}
    </div>
    <Reasons reasons={why.reasons}/>
  </Disclosure>;
}

/** The micro-influencer set as a whole: joint reach, circles, runners-up. */
export function AudienceWhy({explanation}){
  if(!explanation)return null;
  return <Disclosure label="Why these people?" className="audience-why">
    <div className="why-stats">
      <div><strong>{explanation.covered}<small>/{explanation.interested}</small></strong><span>Interested attendees reached</span></div>
      <div><strong>{explanation.expectedAttendees.toFixed(1)}</strong><span>Expected additional attendees</span></div>
      <div><strong>{explanation.tribes}</strong><span>{explanation.tribes===1?'Circle':'Circles'}</span></div>
    </div>
    {explanation.method&&<p className="why-method">{explanation.method}</p>}
    {explanation.runnersUp.length>0&&<div className="why-section"><span className="eyebrow">ALSO CONSIDERED</span><ul className="why-reasons">{explanation.runnersUp.map(runner=><li key={runner.person.id} className="why-reason runner-up"><strong>{runner.person.name}{runner.marginalReach!==null&&<small> · +{runner.marginalReach.toFixed(1)} expected</small>}</strong><span>{runner.reason}</span></li>)}</ul></div>}
    <GraphQueries queries={explanation.evidenceQueries}/>
  </Disclosure>;
}
