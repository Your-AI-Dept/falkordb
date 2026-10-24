import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { api, isDemo } from './api.js';
import { goals, focusQuestion, goalAnswers, toggleProfileGoal } from './demo.js';
import BadgeArt from './components/BadgeArt.jsx';
import ExhibitorApp from './exhibitor/ExhibitorApp.jsx';
import { Icon, Avatar, Button, Logo, Modal } from './components/ui.jsx';
import { MeetingSurveyDialog, SurveyPage } from './components/MeetingSurvey.jsx';
import Rankings from './components/Rankings.jsx';
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
          <div className="setup-actions"><Button variant="text" onClick={()=>data.state.onboardingComplete?cancel():setStep(1)} disabled={pending}><Icon name="back" size={17}/>Back</Button><Button type="submit" disabled={pending}>{pending?'Saving…':data.state.onboardingComplete?'Save changes':'Find my people'}<Icon name="arrow" size={18}/></Button></div>
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
const requestLabels = { pending: 'Awaiting reply', accepted: 'Meeting confirmed', declined: 'Declined' };
function PeerInbox() {
  const recipientId = new URLSearchParams(window.location.search).get('person');
  const [data,setData] = useState(null), [error,setError] = useState(''), [pending,setPending] = useState(false);
  async function load() { try { setData(await api.peerInbox(recipientId)); setError(''); } catch(error) { setError(error.message); } }
  useEffect(() => { load(); return api.subscribe(load); },[]);
  async function respond(id,response) {
    setPending(true); setError('');
    try { setData(await api.respondMeeting(id,response,recipientId)); } catch(error) { setError(error.message); } finally { setPending(false); }
  }
  return <div className="attendee-app"><header className="app-header"><Logo/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><div className="header-actions">{data&&<><span className="viewer-name">{data.viewer.name}</span><Avatar person={data.viewer}/></>}</div></header>
    <main className="peer-inbox"><div className="welcome-row"><h1>Meeting requests</h1></div>
      {error&&<p className="error" role="alert">{error}<button className="text-button" onClick={load}>Try again</button></p>}
      {!data&&!error&&<p role="status">Loading…</p>}
      {data?.requests.length===0&&<div className="empty-state"><h2>No requests yet</h2></div>}
      {data?.requests.map(request=><article key={request.id} className="peer-request-card"><span className="eyebrow">15-MINUTE CONVERSATION</span><div className="detail-identity"><Avatar person={request.sender} size="large"/><div><strong>{request.sender.name}</strong><span>{request.sender.role} · {request.sender.company}</span></div></div><p className="bio">{request.sender.intention||request.sender.context}</p><div className="meeting-facts"><p><Icon name="clock"/>{request.time}</p><p><Icon name="pin"/>{request.location}</p></div>{request.status==='pending'?<div className="peer-request-actions"><Button variant="text" disabled={pending} onClick={()=>respond(request.id,'declined')}>Decline</Button><Button disabled={pending} onClick={()=>respond(request.id,'accepted')}>Accept meeting<Icon name="check" size={17}/></Button></div>:<div className={'request-status '+(request.status==='declined'?'neutral':'')} role="status"><Icon name={request.status==='accepted'?'check':'close'}/><strong>{requestLabels[request.status]}</strong></div>}</article>)}
      <a className="persona-link" href="?view=attendee">{isDemo?'Back to '+(data?.requests[0]?.sender.name.split(' ')[0]||'Paul')+'’s view':'Back to my event'}<Icon name="arrow" size={16}/></a>
    </main></div>;
}
function BoothVisitActions({invitation,run,pending}) {
  const visit=invitation.visit;
  if(!visit)return <div className="booth-actions"><Button variant="full" disabled={pending} onClick={()=>run(()=>api.checkIn(invitation.id),'Checked in').catch(()=>{})}>I’m at the booth<Icon name="pin" size={17}/></Button><button className="text-button" disabled={pending} onClick={()=>run(()=>api.invitation(invitation.id,'declined'),'Invitation declined').catch(()=>{})}>I can’t make it</button></div>;
  return <div className="booth-visit"><div className="request-status" role="status"><Icon name="check"/><strong>Checked in</strong></div><fieldset className="visit-feedback"><legend>Was the visit useful?</legend><div className="feedback-choices">{[['yes','Yes'],['somewhat','Somewhat'],['no','Not really']].map(([id,label])=><button type="button" key={id} disabled={pending} className={'feedback-choice '+(visit.feedback?.usefulness===id?'selected':'')} aria-pressed={visit.feedback?.usefulness===id} onClick={()=>run(()=>api.boothFeedback(invitation.id,id),'Feedback saved').catch(()=>{})}>{label}{visit.feedback?.usefulness===id&&<Icon name="check" size={16}/>}</button>)}</div>{visit.feedback&&<span className="feedback-saved" role="status">Feedback saved</span>}</fieldset></div>;
}
function App() {
  const [setupStep,setSetupStep]=useState(1);
  const [data,setData]=useState(null), [view,setView]=useState('loading'), [tab,setTab]=useState('for-you'), [modal,setModal]=useState(null), [error,setError]=useState(''), [pending,setPending]=useState(false), [toast,setToast]=useState('');
  const initialBadge=useRef(new URLSearchParams(window.location.search).get('badge'));
  async function load(){setError('');try{const next=await api.dashboard();if(!next?.state?.profile||!Array.isArray(next.people)||!Array.isArray(next.recommendations))throw new Error('The API returned an unsupported attendee response. Check docs/API.md.');setData(next);setView(next.state.onboardingComplete?'home':'setup');}catch(e){setError(e.message);setView('error');}}
  useEffect(()=>{load(); return api.subscribe(()=>{api.dashboard().then(setData).catch(error=>setError(error.message));});},[]);
  useEffect(()=>{if(view==='home'&&initialBadge.current){setModal({type:'scan',code:initialBadge.current});initialBadge.current=null;}},[view]);
  useEffect(()=>{if(view!=='home')return;if(data?.invitation?.visit&&!data.invitation.visit.feedback)setModal({type:'invitation'});else if((data?.meeting?.feedbackRequired||data?.meeting?.status==='completed')&&!data.meeting.surveyComplete)setModal({type:'meeting'});},[view,data]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
  async function run(fn,message){setError('');setPending(true);try{const next=await fn();setData(next);if(message)setToast(message);return next;}catch(e){setError(e.message);throw e;}finally{setPending(false);}}
  function open(value){setError('');setModal(value);if(value.type==='meeting'&&isDemo&&!data.meeting.surveyComplete)run(()=>api.reviewMeeting()).catch(()=>{});}
  function openPerson(recommendation){open(data.invitation?.personId===recommendation.person.id?{type:'invitation'}:{type:'person',recommendation});}
  function close(){if(pending || (modal?.type==='invitation'&&data.invitation?.visit&&!data.invitation.visit.feedback))return;setModal(null);setError('');if(modal?.type==='meeting')api.dashboard().then(setData).catch(error=>setError(error.message));}
  function editProfile(step=1){setError('');setSetupStep(step);setView('setup');}
  function save(profile){run(()=>api.profile(profile)).then(()=>{setView('home');window.scrollTo({top:0,behavior:'instant'});}).catch(()=>{});}
  if(!data)return <div className="loading-shell"><Logo/><h1>{view==='error'?'Let’s try that again.':'Loading…'}</h1>{error&&<p role="alert">{error}</p>}{view==='error'&&<Button onClick={load}>Try again</Button>}</div>;
  if(view==='setup')return <Onboarding initialStep={setupStep} data={data} save={save} cancel={()=>{setView('home');setError('');}} pending={pending} error={error}/>;
  const featured=data.recommendations[0], second=data.recommendations[1], meetingPerson=data.people.find(p=>p.id===data.meeting?.personId), connections=data.state.encounters.map(e=>({encounter:e,person:data.people.find(p=>p.id===e.personId)})).filter(p=>p.person);
  const profile=data.state.profile;
  const selectedGoals=goals.filter(g=>profile.goals.includes(g.id));
  const personModal=modal?.type==='person'&&modal.recommendation;
  const requests=data.meetingRequests||[];
  const peerRequest=personModal&&requests.find(request=>request.toId===personModal.person.id);
  return <div className="attendee-app">
    <header className="app-header"><Logo/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><div className="header-actions"><Button variant="text badge-trigger" onClick={()=>open({type:'badge'})}><Icon name="scan" size={18}/>My badge</Button><button className="profile-trigger" aria-label="Edit your profile and goals" onClick={()=>editProfile(1)}><Avatar person={{name:profile.name,color:'peach'}}/></button></div></header>
    <main className="event-main">
      <div className="welcome-row"><div><h1>Your people at Pizza Expo.</h1></div><Button onClick={()=>open({type:'scan'})}><Icon name="scan" size={19}/>Save a connection</Button></div>
      <nav className="view-tabs" aria-label="Attendee views"><button className={tab==='for-you'?'active':''} aria-current={tab==='for-you'?'page':undefined} onClick={()=>setTab('for-you')}>For you</button><button className={tab==='connections'?'active':''} aria-current={tab==='connections'?'page':undefined} onClick={()=>setTab('connections')}>Your connections<span>{connections.length}</span></button><a href="?view=rankings">Top people</a>{!isDemo&&<a href="?view=peer">Meeting requests</a>}</nav>
      {error&&!modal&&<p className="error" role="alert">{error}</p>}
      {tab==='for-you'?<div className="home-grid"><div>
        {featured?<article className="featured-person"><div className="feature-label"><span><Icon name="spark" size={16}/>SUGGESTED FOR YOU</span></div><div className="feature-identity"><Avatar person={featured.person} size="hero"/><div><span className="category-label">{featured.person.category}</span><h2>{featured.person.name}</h2><p>{featured.person.role} · {featured.person.company}</p><span className="person-location"><Icon name="pin" size={14}/>{featured.person.location}</span></div></div><p className="person-offer">{featured.person.offering}.</p><div className="match-reason"><Icon name="link" size={18}/><div><strong>{featured.source}</strong><p>{featured.reason}</p>{featured.path?.length>0&&<div className="connection-path">{featured.path.map((n,i)=><React.Fragment key={n.id}>{i>0&&<Icon name="arrow" size={13}/>}<span>{n.name}</span></React.Fragment>)}</div>}</div></div><div className="feature-actions"><Button onClick={()=>openPerson(featured)}>{data.invitation?.personId===featured.person.id?'View invitation':data.state.requestedIds.includes(featured.person.id)?'View your request':'Meet '+featured.person.name.split(' ')[0]}<Icon name="arrow" size={17}/></Button><Button variant="text" disabled={pending} onClick={()=>run(()=>api.dismiss(featured.person.id)).catch(()=>{})}>Someone else</Button></div></article>:<div className="empty-state"><Icon name="people" size={38}/><h2>No more suggestions</h2><Button onClick={()=>open({type:'scan'})}>Save a connection</Button></div>}
        {second&&<section className="another-person"><span className="eyebrow">ALSO RECOMMENDED</span><button onClick={()=>openPerson(second)}><Avatar person={second.person}/><div><strong>{second.person.name}</strong><span>{second.person.offering}</span></div><Icon name="arrow" size={19}/></button></section>}
      </div><aside className="home-aside">
        {data.invitation&&data.invitation.status!=='declined'&&<section className="booth-invitation"><span className="eyebrow">{data.invitation.visit?'YOUR BOOTH VISIT':data.invitation.status==='accepted'?'YOU’RE GOING':'A CONVERSATION FOR YOU'}</span><h3>{data.invitation.title}</h3><p>{data.invitation.company} · {data.invitation.location}</p><span className="invitation-time"><Icon name="clock" size={15}/>{data.invitation.time}</span><button className="text-button" onClick={()=>open({type:'invitation'})}>{data.invitation.visit?.feedback?'View visit':data.invitation.visit?'Leave feedback':data.invitation.status==='accepted'?'Check in':'See your invitation'}<Icon name="arrow" size={16}/></button></section>}

        {requests.length>0&&<section className="peer-meetings"><span className="eyebrow">YOUR MEETINGS</span>{requests.map(request=>{const person=data.people.find(person=>person.id===request.toId);return person&&<button type="button" className="peer-meeting-row" key={request.id} onClick={()=>open({type:'person',recommendation:{person}})}><Avatar person={person}/><span><strong>{person.name}</strong><span className={request.status==='accepted'?'confirmed-label':''}>{requestLabels[request.status]}</span><small>{request.time}</small></span><Icon name="arrow" size={16}/></button>;})}</section>}
        {meetingPerson&&<section className="meetup-panel"><span className="eyebrow">{data.meeting.surveyComplete?'YOUR RECENT MEETUP':'YOUR ARRANGED MEETUP'}</span><div className="meeting-time"><Icon name="clock" size={17}/><strong>{data.meeting.time}</strong></div><div className="meetup-identity"><Avatar person={meetingPerson}/><div><strong>{meetingPerson.name}</strong><span>{meetingPerson.role}</span></div></div><p className="meeting-place"><Icon name="pin" size={16}/>{data.meeting.location}</p><p className="small muted">{data.meeting.surveyComplete?data.state.feedback?.usefulness==='didnt_meet'?'Not met':'Feedback saved':data.meeting.feedbackRequired?'Feedback required':data.meeting.reason}</p><button className="text-button" onClick={()=>open({type:'meeting'})}>{data.meeting.surveyComplete?'View meetup':data.meeting.feedbackRequired?'Continue feedback':'See meetup details'}<Icon name="arrow" size={16}/></button></section>}
        <section className="goal-summary"><span className="eyebrow">WHAT YOU’RE HERE FOR</span><p>{profile.intention||selectedGoals.map(g=>g.title).join(' and ')||'Fresh ideas and useful connections'}</p><div className="goal-summary-tags">{Object.entries(goalAnswers(profile)).map(([goal,value])=><span className="goal-tag" key={goal}>{focusQuestion(profile,goal)?.choices.find(([id])=>id===value)?.[1]}</span>)}</div><button className="text-button" onClick={()=>editProfile(2)}>Edit your goals<Icon name="edit" size={14}/></button></section>

      </aside></div>:<section className="connections-section">{connections.length?<><div className="section-title"><h2>Your connections</h2></div><div className="connection-list">{[...connections].reverse().map(({person,encounter})=><button key={encounter.id} onClick={()=>openPerson({person,reason:'You saved this connection after a conversation.',source:'Your connections',path:[]})}><Avatar person={person}/><div><strong>{person.name}</strong><span>{person.role} · {person.company}</span></div><span className="connection-status"><Icon name="check" size={14}/>Saved</span><Icon name="arrow" size={18}/></button>)}</div></>:<div className="empty-state"><span className="empty-icon"><Icon name="people" size={34}/></span><h2>No connections yet</h2><Button onClick={()=>open({type:'scan'})}>Save your first connection<Icon name="scan" size={18}/></Button></div>}</section>}
    </main>
    <footer className="app-footer">{isDemo&&<div><a href="?view=survey&meeting=meet-theo&participant=paul">Paul’s survey</a><a href="?view=survey&meeting=meet-theo&participant=theo">Theo’s survey</a><a href="?view=exhibitor">Exhibitor view</a><button onClick={()=>open({type:'reset'})}>Start over</button></div>}</footer>
    {toast&&<div className="toast" role="status"><Icon name="check" size={18}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><Icon name="close" size={15}/></button></div>}
    {modal?.type==='scan'&&<ScanDialog close={close} run={run} error={error} initialCode={modal.code}/>}
    {modal?.type==='badge'&&<BadgeDialog close={close} data={data}/>}
    {modal?.type==='meeting'&&data.meeting&&<MeetingSurveyDialog meetingId={data.meeting.id} close={close} onSaved={survey=>setData(previous=>({...previous,graphRevision:survey.graphRevision,meeting:{...previous.meeting,surveyComplete:survey.complete,feedbackRequired:!survey.complete}}))}/>}
    {personModal&&<Modal title={'Meet '+personModal.person.name.split(' ')[0]} close={close} error={error}><div className="detail-identity"><Avatar person={personModal.person} size="large"/><div><strong>{personModal.person.name}</strong><span>{personModal.person.role} · {personModal.person.company}</span><span className="small">{personModal.person.location}</span></div></div><p className="bio">{personModal.person.bio}</p><div className="detail-note"><span className="eyebrow">HAPPY TO SHARE</span><p>{personModal.person.offering}</p></div><div className="detail-note"><span className="eyebrow">LOOKING FOR</span><p>{personModal.person.lookingFor}</p></div><div className="meeting-facts"><span className="eyebrow">15-MINUTE CONVERSATION</span><p><Icon name="clock"/>{peerRequest?.time||personModal.person.slot}</p><p><Icon name="pin"/>{peerRequest?.location||personModal.person.place}</p></div>{peerRequest?<><div className={'request-status '+(peerRequest.status==='declined'?'neutral':'')} role="status"><Icon name={peerRequest.status==='accepted'?'check':peerRequest.status==='declined'?'close':'clock'}/><strong>{requestLabels[peerRequest.status]}</strong></div>{isDemo&&peerRequest.status==='pending'&&<a className="persona-link" href={'?view=peer&person='+encodeURIComponent(personModal.person.id)}>View as {personModal.person.name.split(' ')[0]}<Icon name="arrow" size={16}/></a>}</>:<Button variant="full" disabled={pending} onClick={()=>run(()=>api.requestMeeting(personModal.person.id),'Meeting requested').catch(()=>{})}>{pending?'Saving…':'Ask for 15 minutes'}<Icon name="arrow" size={17}/></Button>}</Modal>}
    {modal?.type==='invitation'&&data.invitation&&<Modal title={data.invitation.title} close={close} error={error} dismissible={!pending&&(!data.invitation.visit||Boolean(data.invitation.visit.feedback))}><div className="detail-identity"><Avatar person={data.people.find(p=>p.id===data.invitation.personId)} size="large"/><div><strong>{data.people.find(p=>p.id===data.invitation.personId)?.name}</strong><span>{data.invitation.company}</span></div></div><p className="bio">{data.invitation.reason}</p>{data.invitation.path?.length>0&&<div className="connection-path">{data.invitation.path.map((n,i)=><React.Fragment key={n.id}>{i>0&&<Icon name="arrow" size={13}/>}<span>{n.name}</span></React.Fragment>)}</div>}<div className="meeting-facts"><span className="eyebrow">{data.invitation.topic}</span><p><Icon name="clock"/>{data.invitation.time}</p><p><Icon name="pin"/>{data.invitation.location}</p></div>{data.invitation.status==='accepted'?<BoothVisitActions invitation={data.invitation} run={run} pending={pending}/>:<div className="modal-actions"><Button variant="text" disabled={pending} onClick={()=>run(()=>api.invitation(data.invitation.id,'declined'),'Invitation declined.').then(close).catch(()=>{})}>Not this time</Button><Button disabled={pending} onClick={()=>run(()=>api.invitation(data.invitation.id,'accepted'),'You’re on the list for the booth conversation.').catch(()=>{})}>{pending?'Saving…':'I’ll be there'}<Icon name="check" size={17}/></Button></div>}</Modal>}
    {modal?.type==='reset'&&<Modal title="Start over?" close={close} error={error}><p>Reset your profile, connections, requests, and feedback?</p><div className="modal-actions"><Button variant="text" onClick={close}>Keep exploring</Button><Button disabled={pending} onClick={()=>run(()=>api.reset()).then(()=>{close();setSetupStep(1);setView('setup');setTab('for-you');}).catch(()=>{})}>Start over</Button></div></Modal>}
  </div>;
}
const route=new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')).render(route==='exhibitor'?<ExhibitorApp/>:route==='peer'?<PeerInbox/>:route==='survey'?<SurveyPage/>:route==='rankings'?<Rankings/>:<App/>);
