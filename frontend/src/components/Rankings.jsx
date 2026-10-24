import React, {useEffect,useRef,useState} from 'react';
import {api,isDemo} from '../api.js';
import {observeResource} from '../observe-resource.js';
import {Avatar,Icon,Logo} from './ui.jsx';
import {attendeeLink} from '../navigation.js';

export default function Rankings(){
  const [initial]=useState(()=>new URLSearchParams(window.location.search));
  const [topics,setTopics]=useState([]),[topicId,setTopicId]=useState(initial.get('topic')||''),[limit,setLimit]=useState([3,5,10,20].includes(Number(initial.get('limit')))?Number(initial.get('limit')):5);
  const [result,setResult]=useState(null),[error,setError]=useState(''),[topicsReady,setTopicsReady]=useState(false),[refreshKey,setRefreshKey]=useState(0);
  const observer=useRef();
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setError('');
    api.topics({signal:controller.signal}).then(({topics})=>{if(active){setTopics(topics);setTopicId(current=>topics.some(topic=>topic.id===current)?current:topics[0]?.id||'');setTopicsReady(true);}}).catch(error=>{if(active&&error.name!=='AbortError')setError(error.message);});
    return()=>{active=false;controller.abort();};
  },[refreshKey]);
  useEffect(()=>{
    setResult(null);setError('');
    if(!topicId||!topicsReady)return;
    const url=new URL(window.location.href);url.searchParams.set('topic',topicId);url.searchParams.set('limit',String(limit));window.history.replaceState(null,'',url);
    observer.current=observeResource({load:signal=>api.rankings(topicId,limit,{signal}),onValue:next=>{setResult(previous=>previous&&next.graphRevision<previous.graphRevision?previous:next);setError('');},onError:failure=>setError(failure.message),subscribe:api.subscribe});
    return()=>observer.current.stop();
  },[topicId,limit,topicsReady]);
  const topic=topics.find(topic=>topic.id===topicId);
  function retry(){if(!topicsReady)setRefreshKey(value=>value+1);else{setError('');observer.current?.refresh();}}
  return <div className="attendee-app"><header className="app-header"><Logo href={attendeeLink('attendee',initial.get('participant'))}/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><a className="text-button header-actions" href={attendeeLink('attendee',initial.get('participant'))}>My day<Icon name="arrow" size={16}/></a></header>
    <main className="rankings-page" data-graph-revision={result?.graphRevision}><div className="rankings-heading"><span className="eyebrow">PIZZA EXPO</span><h1>Top people</h1></div>
      <div className="ranking-filters"><label htmlFor="ranking-topic">Topic<select id="ranking-topic" value={topicId} disabled={!topics.length} onChange={event=>setTopicId(event.target.value)}>{topics.length?topics.map(topic=><option key={topic.id} value={topic.id}>{topic.label}</option>):<option value="">{topicsReady?'No topics available':'Loading topics…'}</option>}</select></label><label htmlFor="ranking-limit">Show<select id="ranking-limit" value={limit} onChange={event=>setLimit(Number(event.target.value))}>{[3,5,10,20].map(value=><option key={value} value={value}>Top {value}</option>)}</select></label></div>
      <div className="ranking-title"><h2>{topic?.label||'People by topic'}</h2>{result&&<span className="ranking-live" role="status"><i/>{error?'Refresh failed':result.status==='updating'?'Updating…':isDemo?'Ready':'Live'}<span>· {result.items.length} people</span></span>}</div>
      {error&&<div className="error" role="alert">{error}<button className="text-button" onClick={retry}>Try again</button></div>}
      {!result&&!error&&<div className="ranking-empty" role="status">{topicsReady&&!topics.length?'No topics available yet.':'Loading people…'}</div>}
      {result&&!result.items.length&&<div className="ranking-empty">{result.status==='updating'?'Results are updating…':'No people found for this topic yet.'}</div>}
      {result&&<ol className="ranked-people">{result.items.map(item=><li key={item.person.id}><span className="rank-number" aria-label={'Rank '+item.rank}>{String(item.rank).padStart(2,'0')}</span><Avatar person={item.person}/><div className="ranked-person"><h3>{item.person.name}</h3><p className="ranked-company">{[item.person.role,item.person.company].filter(Boolean).join(' · ')}</p><p className="ranked-reason">{item.reason}</p>{item.evidence?.length>0&&<div className="ranked-evidence">{item.evidence.map((evidence,index)=><span key={index}>{evidence.label}</span>)}</div>}</div></li>)}</ol>}
      {result&&<div className="ranking-update"><span>{result.generatedAt&&new Date(result.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span><button className="text-button" onClick={()=>observer.current?.refresh()}>Refresh<Icon name="arrow" size={14}/></button></div>}
    </main></div>;
}
