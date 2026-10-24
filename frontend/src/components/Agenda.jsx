import React from 'react';
import {Avatar,Button,Icon,Modal} from './ui.jsx';
import {MeetingSurveyDialog} from './MeetingSurvey.jsx';
import {api} from '../api.js';
import './agenda.css';

const labels={scheduled:'Scheduled',checked_in:'Checked in',feedback_due:'Feedback required',completed:'Completed',missed:'Unavailable'};
const title=stop=>stop.kind==='booth'?'Go to '+stop.location:'Meet '+stop.person.name;

export function Agenda({stops,openStop}){
  const next=stops.find(stop=>stop.status==='feedback_due')||stops.find(stop=>stop.status==='checked_in')||stops.find(stop=>stop.status==='scheduled');
  const later=stops.filter(stop=>stop.id!==next?.id&&['scheduled','checked_in','feedback_due'].includes(stop.status));
  const earlier=stops.filter(stop=>['completed','missed'].includes(stop.status));
  function row(stop){return <button className="agenda-row" key={stop.id} onClick={()=>openStop(stop.id)}><span className="agenda-row-time">{stop.time.replace(/^Wednesday · /,'')}</span><Avatar person={stop.person}/><span className="agenda-row-info"><strong>{stop.kind==='booth'?stop.person.company:stop.person.name}</strong><span>{stop.location} · {stop.topic}</span><small>{labels[stop.status]}</small></span><Icon name="arrow" size={17}/></button>;}
  return <div className="guided-agenda">
    {next?<article className="next-stop"><div className="next-stop-top"><span className="eyebrow">{next.status==='feedback_due'?'FINISH YOUR FEEDBACK':next.status==='checked_in'?'YOUR CURRENT STOP':'YOUR NEXT STOP'}</span><span>{next.kind==='booth'?'Booth visit':'15-minute meetup'}</span></div><h2>{title(next)}</h2><div className="stop-directions"><p><Icon name="clock" size={21}/><strong>{next.time}</strong></p><p><Icon name="pin" size={21}/>{next.location}</p></div><div className="stop-person"><Avatar person={next.person}/><div><strong>{next.kind==='booth'?next.person.name:next.person.company}</strong><span>{next.person.role}</span></div></div><p className="stop-topic">{next.topic}</p><div className="next-stop-action"><Button onClick={()=>openStop(next.id)}>{next.status==='feedback_due'?'Continue feedback':next.status==='checked_in'?'View current stop':'View stop'}<Icon name="arrow" size={18}/></Button></div></article>:<div className="agenda-finished"><Icon name="check" size={32}/><h2>No more stops scheduled</h2></div>}
    {later.length>0&&<section className="agenda-list" aria-label="Coming up"><h2>Coming up</h2>{later.map(row)}</section>}
    {earlier.length>0&&<section className="agenda-list agenda-earlier" aria-label="Earlier stops"><h2>Earlier</h2>{earlier.map(row)}</section>}
  </div>;
}

export function StopDialog({stop,visit,close,run,pending,error,refresh}){
  if(stop.kind==='meeting'&&['feedback_due','completed'].includes(stop.status))return <MeetingSurveyDialog meetingId={stop.id} close={close} onSaved={refresh}/>;
  const due=stop.status==='feedback_due';
  const done=['completed','missed'].includes(stop.status);
  const update=action=>run(()=>api.assignment(stop.id,action)).catch(()=>{});
  return <Modal title={title(stop)} close={close} dismissible={!pending&&!due} error={error}>
    <div className="detail-identity"><Avatar person={stop.person} size="large"/><div><strong>{stop.person.name}</strong><span>{stop.person.role} · {stop.person.company}</span></div></div>
    <div className="meeting-facts"><span className="eyebrow">{stop.topic}</span><p><Icon name="clock"/>{stop.time}</p><p><Icon name="pin"/>{stop.location}</p></div>
    {stop.status==='scheduled'&&<div className="stop-dialog-actions"><Button variant="full" disabled={pending} onClick={()=>update('check_in')}>I’m here<Icon name="pin" size={17}/></Button><Button variant="text" disabled={pending} onClick={()=>update('miss')}>Can’t make it</Button></div>}
    {stop.status==='checked_in'&&<><div className="request-status" role="status"><Icon name="check"/><strong>Checked in</strong></div><div className="stop-dialog-actions"><Button variant="full" disabled={pending} onClick={()=>update('finish')}>{stop.kind==='booth'?'Finish visit':'Finish meetup'}<Icon name="arrow" size={17}/></Button></div></>}
    {due&&<fieldset className="visit-feedback"><legend>Was the visit useful?</legend><div className="feedback-choices">{[['yes','Yes'],['somewhat','Somewhat'],['no','Not really']].map(([id,label])=><button className="feedback-choice" type="button" key={id} disabled={pending} onClick={()=>run(()=>api.boothFeedback(stop.id,id)).catch(()=>{})}>{label}</button>)}</div></fieldset>}
    {done&&<><div className="request-status" role="status"><Icon name={stop.status==='missed'?'clock':'check'}/><strong>{stop.status==='missed'?'Marked unavailable':'Feedback saved'}</strong></div>{visit?.feedback&&<p className="feedback-saved">{ {yes:'Useful',somewhat:'Somewhat useful',no:'Not useful'}[visit.feedback.usefulness] }</p>}<div className="stop-dialog-actions"><Button variant="full" onClick={close}>Back to my day<Icon name="arrow" size={17}/></Button></div></>}
  </Modal>;
}
