import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { api, isDemo } from './api.js';
import { goals, focusQuestion, goalAnswers, toggleProfileGoal } from './demo.js';
import BadgeArt from './components/BadgeArt.jsx';
import ExhibitorApp from './exhibitor/ExhibitorApp.jsx';
import { Icon, Avatar, Button, Logo, Modal } from './components/ui.jsx';
import { SurveyPage } from './components/MeetingSurvey.jsx';
import { Agenda, StopDialog } from './components/Agenda.jsx';
import Rankings from './components/Rankings.jsx';
import ProfileSummary from './components/ProfileSummary.jsx';
import ParticipantHome from './components/ParticipantHome.jsx';
import PromotionInbox from './components/PromotionInbox.jsx';
import './styles.css';

function Onboarding({data, save, cancel, pending, error, initialStep=1}) {
  const [step,setStep]=useState(initialStep);
  const [draft,setDraft]=useState({...data.state.profile,goalFocus:goalAnswers(data.state.profile)});
  const [identity,setIdentity]=useState(!data.state.profile.name||!data.state.profile.company?{...data.state.profile}:null);
  const identityFields=useRef();
  const change=(key,value)=>setDraft(d=>({...d,[key]:value}));
  const questions=draft.goals.map(goal=>({goal,...focusQuestion(draft,goal)})).filter(question=>question.choices);
  function commitIdentity(){
    if([...identityFields.current.querySelectorAll('input')].some(input=>!input.reportValidity()))return;
    const updated={...draft,name:identity.name.trim(),role:identity.role.trim(),company:identity.company.trim(),businessType:identity.businessType};
    setDraft(updated);setIdentity(null);
    if(data.state.onboardingComplete)save(updated);
  }
  function submitContext(event){event.preventDefault();if(identity)commitIdentity();else if(data.state.onboardingComplete)save(draft);else setStep(2);}
  function answer(goal,value){setDraft(d=>{const goalFocus={...goalAnswers(d),[goal]:d.goalFocus[goal]===value?'':value};return{...d,goalFocus,focus:goalFocus[d.goals[0]]||''};});}
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[step]);
  return <div className="onboarding">
    <header className="setup-header"><Logo/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div></header>
    <main className="setup-layout">
      <aside className="setup-intro"><BadgeArt profile={identity?{...draft,...identity}:draft} badgeToken={data.viewer.badgeToken}/></aside>
      <section className="setup-form" aria-label={step===1?'Your profile':'Your goals'}>
        <div className="step-label"><span className="step-dot">{step}</span><span>{step===1?'YOUR PROFILE':'YOUR GOALS'}</span><span className="step-count">{step} of 2</span></div>
        {step===1?<form onSubmit={submitContext}>
          <h2>Your profile</h2>
          {!identity?<div className="identity-card"><Avatar person={{name:draft.name,color:'peach'}}/><div><strong>{draft.name}</strong><span>{draft.role} · {draft.company}</span></div><button type="button" className="icon-button" aria-label="Edit profile details" onClick={()=>setIdentity({name:draft.name,role:draft.role,company:draft.company,businessType:draft.businessType})}><Icon name="edit" size={18}/></button></div>:<div className="identity-edit" ref={identityFields}>
            <label>Your name<input autoComplete="name" required pattern=".*\S.*" maxLength={100} value={identity.name} onChange={e=>setIdentity(d=>({...d,name:e.target.value}))}/></label>
            <div className="field-grid"><label>Company<input autoComplete="organization" required pattern=".*\S.*" maxLength={120} value={identity.company} onChange={e=>setIdentity(d=>({...d,company:e.target.value}))}/></label><label>Your role<input autoComplete="organization-title" required pattern=".*\S.*" maxLength={100} value={identity.role} onChange={e=>setIdentity(d=>({...d,role:e.target.value}))}/></label></div>
            <label>Your business<select value={identity.businessType} onChange={e=>setIdentity(d=>({...d,businessType:e.target.value}))}><option value="pizzeria">Pizzeria / restaurant</option><option value="supplier">Producer / supplier</option><option value="distributor">Distributor</option><option value="other">Something else</option></select></label>
            <div className="identity-actions"><Button variant="text" disabled={pending} onClick={()=>setIdentity(null)}>Cancel</Button><Button disabled={pending} onClick={commitIdentity}>{pending?'Saving…':'Save'}</Button></div>
          </div>}
          {!identity&&<>
            <label className="context-label" htmlFor="business-context">What does your business do?</label><textarea id="business-context" required maxLength={500} rows={3} value={draft.context} onChange={e=>change('context',e.target.value)} placeholder="Three neighborhood pizzerias in San Francisco."/>
            <details className="optional-details"><summary><Icon name="link" size={16}/>LinkedIn profile <span>Optional</span></summary><label htmlFor="linkedin">Profile URL</label><input id="linkedin" type="url" placeholder="https://www.linkedin.com/in/..." value={draft.linkedin} onChange={e=>change('linkedin',e.target.value)}/></details>
            <div className="setup-actions">{data.state.onboardingComplete?<Button variant="text" onClick={cancel}>Back</Button>:<span/>}<Button type="submit" disabled={pending}>{pending?'Saving…':data.state.onboardingComplete?'Save changes':'Continue'}<Icon name="arrow" size={18}/></Button></div>
          </>}
          {error&&<p className="error" role="alert">{error}</p>}
        </form>:<form onSubmit={e=>{e.preventDefault();save(draft);}}>
          <h2>What brings you here?</h2>
          <div className="goal-grid">{goals.map(g=><button type="button" key={g.id} className={'goal-card '+(draft.goals.includes(g.id)?'selected':'')} aria-pressed={draft.goals.includes(g.id)} onClick={()=>setDraft(d=>toggleProfileGoal(d,g.id))}><span className="goal-icon"><Icon name={g.icon} size={26}/></span><span className="selection-check">{draft.goals.includes(g.id)&&<Icon name="check" size={12}/>}</span><strong>{g.title}</strong></button>)}</div>
          {questions.map(question=><fieldset className="adaptive-question goal-follow-up" key={question.goal}><legend>{question.title}</legend><div className="chips">{question.choices.map(([id,label])=><button key={id} type="button" className={'chip '+(draft.goalFocus[question.goal]===id?'selected':'')} aria-pressed={draft.goalFocus[question.goal]===id} onClick={()=>answer(question.goal,id)}>{label}{draft.goalFocus[question.goal]===id&&<Icon name="check" size={13}/>}</button>)}</div></fieldset>)}
          <label className="context-label" htmlFor="intention">Anything specific? <span className="optional-label">Optional</span></label><textarea id="intention" rows={2} maxLength={500} value={draft.intention} placeholder={draft.focus==='flour'?'Cold-weather proofing in San Francisco.':'A reliable tomato grower in Italy.'} onChange={e=>change('intention',e.target.value)}/>
          {error&&<p className="error" role="alert">{error}</p>}
          <div className="setup-actions"><Button variant="text" onClick={()=>data.state.onboardingComplete?cancel():setStep(1)} disabled={pending}><Icon name="back" size={17}/>Back</Button><Button type="submit" disabled={pending}>{pending?'Saving…':data.state.onboardingComplete?'Save changes':'Show my day'}<Icon name="arrow" size={18}/></Button></div>
        </form>}
        <div className="step-progress" aria-label={'Step '+step+' of 2'}><span className="filled"/><span className={step===2?'filled':''}/></div>
      </section>
    </main>
  </div>;
}
function ScanDialog({close, run, error, initialCode=''}) {
  const [code,setCode]=useState(initialCode), [busy,setBusy]=useState(false), [localError,setLocalError]=useState(''), [camera,setCamera]=useState(false), [result,setResult]=useState(null);
  const video=useRef(), stream=useRef(), timer=useRef(), alive=useRef(true), reading=useRef(false);
  function stop(){clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
  useEffect(()=>()=>{alive.current=false;stop();},[]);
  async function scan(value){if(reading.current)return;reading.current=true;setBusy(true);setLocalError('');stop();setCamera(false);try{const next=await run(()=>api.scan(value));if(alive.current)setResult(next.scanResult);}catch{}finally{reading.current=false;if(alive.current)setBusy(false);}}
  async function openCamera(){
    setLocalError('');setBusy(true);
    try {
      if(!window.BarcodeDetector||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera scanning isn’t supported here. Enter a badge code below.');
      const detector=new window.BarcodeDetector({formats:['qr_code']});
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;setCamera(true);
      timer.current=setTimeout(async function detect(){if(!stream.current||!alive.current)return;if(video.current){if(video.current.srcObject!==stream.current){video.current.srcObject=stream.current;await video.current.play().catch(()=>{});}try{const codes=await detector.detect(video.current);if(codes[0]){await scan(codes[0].rawValue);return;}}catch{}}timer.current=setTimeout(detect,300);},100);
    } catch(e){stop();setCamera(false);setLocalError(e.message==='Permission denied'?'Camera access was declined. You can enter a badge code below.':e.message);}
    finally{if(alive.current)setBusy(false);}
  }
  if(result)return <Modal title={result.duplicate?'Already connected':'Connection saved'} close={close}><div className="scan-success"><span className="success-mark"><Icon name="check" size={26}/></span>{result.person&&<><Avatar person={result.person} size="large"/><h3>{result.person.name}</h3><p>{result.person.role} · {result.person.company}</p></>}</div><Button variant="full" onClick={close}>Done<Icon name="check" size={18}/></Button></Modal>;
  return <Modal title="Save a connection" close={close} error={error||localError}><div className="scanner">{camera?<><video ref={video} playsInline muted/><Button variant="light" onClick={()=>{stop();setCamera(false);}}>Stop camera</Button></>:<><Icon name="scan" size={68}/><Button variant="secondary" disabled={busy} onClick={openCamera}>Open camera</Button></>}</div><form onSubmit={e=>{e.preventDefault();scan(code);}}><label htmlFor="badge-code">Or enter their badge code</label><div className="input-row"><input id="badge-code" value={code} autoComplete="off" placeholder="PIZZA-MAYA" onChange={e=>setCode(e.target.value)}/><Button type="submit" disabled={busy||!code.trim()}>Save</Button></div></form>{isDemo&&<div className="demo-line"><button className="text-button" disabled={busy} onClick={()=>scan('PIZZA-MAYA')}>Sample scan<Icon name="arrow" size={15}/></button></div>}</Modal>;
}
function BadgeDialog({close,data}) {
  const canvas=useRef(), [error,setError]=useState('');
  useEffect(()=>{const url=new URL(window.location.href);url.search='';url.searchParams.set('badge',data.viewer.badgeToken);QRCode.toCanvas(canvas.current,url.toString(),{width:224,margin:2,color:{dark:'#222222',light:'#ffffff'}}).catch(()=>setError('QR unavailable. Share the code below.'));},[data.viewer.badgeToken]);
  return <Modal title="Your badge" close={close} error={error}><div className="my-badge"><Avatar person={{name:data.state.profile.name,color:'peach'}} size="large"/><h3>{data.state.profile.name}</h3><p>{data.state.profile.company}</p><canvas ref={canvas} aria-label="Your QR badge"/><strong className="badge-code">{data.viewer.badgeToken}</strong></div></Modal>;
}
function App() {
  const [setupStep,setSetupStep]=useState(1);
  const [data,setData]=useState(null),[view,setView]=useState('loading'),[tab,setTab]=useState('agenda'),[modal,setModal]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[toast,setToast]=useState('');
  const initialBadge=useRef(new URLSearchParams(window.location.search).get('badge'));
  async function load(){setError('');try{const next=await api.dashboard();if(!next?.state?.profile||!Array.isArray(next.people))throw new Error('Your schedule is not available yet.');setData(next);setView(next.state.onboardingComplete?'home':'setup');}catch(e){setError(e.message);setView('error');}}
  useEffect(()=>{load();return api.subscribe(()=>{api.dashboard().then(setData).catch(error=>setError(error.message));});},[]);
  useEffect(()=>{if(view==='home'&&initialBadge.current){setModal({type:'scan',code:initialBadge.current});initialBadge.current=null;}},[view]);
  useEffect(()=>{if(view!=='home')return;const due=data?.agenda?.find(stop=>stop.status==='feedback_due');if(due)setModal({type:'stop',id:due.id});},[view,data]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
  async function run(fn,message){setError('');setPending(true);try{const next=await fn();setData(next);if(message)setToast(message);return next;}catch(e){setError(e.message);throw e;}finally{setPending(false);}}
  function open(value){setError('');setModal(value);}
  function close(){if(pending||data.agenda?.some(stop=>stop.status==='feedback_due'))return;setModal(null);setError('');}
  function editProfile(step=1){setError('');setModal(null);setSetupStep(step);setView('setup');}
  function save(profile){run(()=>api.profile(profile)).then(()=>{setView('home');window.scrollTo({top:0,behavior:'instant'});}).catch(()=>{});}
  if(!data)return <div className="loading-shell"><Logo/><h1>{view==='error'?'Let’s try that again.':'Loading…'}</h1>{error&&<p role="alert">{error}</p>}{view==='error'&&<Button onClick={load}>Try again</Button>}</div>;
  if(view==='setup')return <Onboarding initialStep={setupStep} data={data} save={save} cancel={()=>{setView('home');setError('');}} pending={pending} error={error}/>;
  const profile=data.state.profile;
  const selectedGoals=goals.filter(goal=>profile.goals.includes(goal.id));
  const connections=data.state.encounters.map(encounter=>({encounter,person:data.people.find(person=>person.id===encounter.personId)})).filter(item=>item.person);
  const activeStop=modal?.type==='stop'&&data.agenda?.find(stop=>stop.id===modal.id);
  const person=modal?.type==='person'&&modal.person;
  return <div className="attendee-app">
    <header className="app-header"><Logo/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><div className="header-actions"><Button variant="text badge-trigger" onClick={()=>open({type:'badge'})}><Icon name="scan" size={18}/>My badge</Button><button className="profile-trigger" aria-label="Open your profile" onClick={()=>open({type:'profile'})}><Avatar person={{name:profile.name,color:'peach'}}/></button></div></header>
    <main className="event-main guided-event">
      <div className="welcome-row"><div><span className="eyebrow">WEDNESDAY</span><h1>Your day at Pizza Expo.</h1></div><Button variant="secondary" onClick={()=>open({type:'scan'})}><Icon name="scan" size={19}/>Save a connection</Button></div>
      <PromotionInbox/>
      <nav className="view-tabs" aria-label="Attendee views"><button className={tab==='agenda'?'active':''} aria-current={tab==='agenda'?'page':undefined} onClick={()=>setTab('agenda')}>My day</button><button className={tab==='connections'?'active':''} aria-current={tab==='connections'?'page':undefined} onClick={()=>setTab('connections')}>Saved connections<span>{connections.length}</span></button></nav>
      {error&&!modal&&<p className="error" role="alert">{error}</p>}
      {tab==='agenda'?<div className="home-grid guided-home"><div>{Array.isArray(data.agenda)?<Agenda stops={data.agenda} session={data.session} openStop={id=>open({type:'stop',id})}/>:<div className="agenda-finished"><h2>Your schedule is not available yet.</h2><Button onClick={load}>Refresh</Button></div>}</div><aside className="home-aside"><section className="goal-summary"><span className="eyebrow">WHAT YOU’RE HERE FOR</span><p>{profile.intention||selectedGoals.map(goal=>goal.title).join(' and ')||'Fresh ideas and useful connections'}</p><div className="goal-summary-tags">{Object.entries(goalAnswers(profile)).map(([goal,value])=><span className="goal-tag" key={goal}>{focusQuestion(profile,goal)?.choices.find(([id])=>id===value)?.[1]}</span>)}</div><button className="text-button" onClick={()=>editProfile(2)}>Edit your goals<Icon name="edit" size={14}/></button></section></aside></div>:<section className="connections-section">{connections.length?<div className="connection-list">{[...connections].reverse().map(({person,encounter})=><button key={encounter.id} onClick={()=>open({type:'person',person})}><Avatar person={person}/><div><strong>{person.name}</strong><span>{person.role} · {person.company}</span></div><span className="connection-status"><Icon name="check" size={14}/>Saved</span><Icon name="arrow" size={18}/></button>)}</div>:<div className="empty-state"><span className="empty-icon"><Icon name="people" size={34}/></span><h2>No connections yet</h2><Button onClick={()=>open({type:'scan'})}>Save a connection<Icon name="scan" size={18}/></Button></div>}</section>}
    </main>
    <footer className="app-footer">{isDemo&&<div><a href="?view=survey&meeting=meet-theo&participant=paul">Paul’s survey</a><a href="?view=survey&meeting=meet-theo&participant=theo">Theo’s survey</a><a href="?view=rankings">Top people</a><a href="?view=exhibitor">Exhibitor view</a><button onClick={()=>open({type:'reset'})}>Start over</button></div>}</footer>
    {toast&&<div className="toast" role="status"><Icon name="check" size={18}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><Icon name="close" size={15}/></button></div>}
    {modal?.type==='scan'&&<ScanDialog close={close} run={run} error={error} initialCode={modal.code}/>}
    {modal?.type==='profile'&&<ProfileSummary profile={profile} close={close} onEdit={()=>editProfile(1)} onGoals={()=>editProfile(2)} onBadge={()=>open({type:'badge'})} onPreferencesChanged={load}/>}
    {modal?.type==='badge'&&<BadgeDialog close={close} data={data}/>}
    {activeStop&&<StopDialog stop={activeStop} visit={activeStop.kind==='booth'?data.state.boothVisit:null} close={close} run={run} pending={pending} error={error} refresh={load}/>}
    {person&&<Modal title={person.name} close={close}><div className="detail-identity"><Avatar person={person} size="large"/><div><strong>{person.name}</strong><span>{person.role} · {person.company}</span></div></div><p className="bio">{person.bio}</p><div className="detail-note"><span className="eyebrow">HAPPY TO SHARE</span><p>{person.offering}</p></div><div className="modal-actions"><Button onClick={close}>Done<Icon name="check" size={17}/></Button></div></Modal>}
    {modal?.type==='reset'&&<Modal title="Start over?" close={close} error={error}><p>Reset your profile, connections, schedule, and feedback?</p><div className="modal-actions"><Button variant="text" onClick={close}>Keep my day</Button><Button disabled={pending} onClick={()=>run(()=>api.reset()).then(()=>{setModal(null);setSetupStep(1);setView('setup');setTab('agenda');}).catch(()=>{})}>Start over</Button></div></Modal>}
  </div>;
}
const params=new URLSearchParams(window.location.search);
const route=params.get('view');
const participant=isDemo?params.get('participant'):null;
createRoot(document.getElementById('root')).render(route==='exhibitor'?<ExhibitorApp/>:route==='survey'?<SurveyPage/>:route==='rankings'?<Rankings/>:participant&&participant!=='paul'?<ParticipantHome participant={participant}/>:<App/>);
