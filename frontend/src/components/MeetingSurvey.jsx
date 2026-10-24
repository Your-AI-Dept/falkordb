import React, {useEffect,useRef,useState} from 'react';
import {api,isDemo} from '../api.js';
import {reconcileSurvey,validateSurvey} from '../graph-contract.js';
import {observeResource} from '../observe-resource.js';
import {Avatar,Button,Icon,Logo,Modal} from './ui.jsx';
import {VisualizationHandoff} from './VisualizationHandoff.jsx';

export function MeetingSurveyDialog({meetingId,respondentId='paul',close,onSaved=()=>{},onContinue=close}) {
  const [survey,setSurvey]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const observer=useRef(),alive=useRef(true),retry=useRef(null),saving=useRef(false),readError=useRef(false);
  const savedCallback=useRef(onSaved);savedCallback.current=onSaved;
  useEffect(()=>{
    alive.current=true;
    observer.current=observeResource({load:signal=>api.survey(meetingId,respondentId,{signal}),onValue:next=>{if(saving.current)return;setSurvey(previous=>reconcileSurvey(previous,next));if(readError.current){setError('');readError.current=false;}},onError:failure=>{readError.current=true;setError(failure.message);},subscribe:api.subscribe});
    return()=>{alive.current=false;observer.current.stop();};
  },[meetingId,respondentId]);
  async function answer(answerKey){
    if(saving.current||!survey?.currentQuestion)return;
    saving.current=true;readError.current=false;setPending(true);setError('');
    const question=survey.currentQuestion;
    const payload={questionId:question.id,questionVersion:question.version,answerKey,surveyRevision:survey.surveyRevision};
    const signature=JSON.stringify(payload);
    if(retry.current?.signature!==signature)retry.current={signature,idempotencyKey:crypto.randomUUID()};
    try{
      const next=await api.answerSurvey(meetingId,respondentId,payload,{idempotencyKey:retry.current.idempotencyKey});
      if(alive.current){setSurvey(previous=>reconcileSurvey(previous,next,{afterAnswer:true}));retry.current=null;savedCallback.current(next);}
    }catch(failure){
      if(alive.current){
        setError(failure.message);
        if(failure.status===409&&failure.survey){try{const next=validateSurvey(failure.survey);setSurvey(previous=>reconcileSurvey(previous,next,{afterAnswer:true}));retry.current=null;}catch{ /* Keep the displayed question on malformed conflicts. */ }}
      }
    }finally{saving.current=false;if(alive.current)setPending(false);}
  }
  const current=survey?.currentQuestion;
  const completed=Boolean(survey?.complete);
  return <Modal title={survey?'Your meetup with '+survey.subject.name.split(' ')[0]:'Your meetup'} close={close} dismissible={completed&&!pending} error={error}>
    {!survey?<div className="survey-loading"><p role="status">{error?'Questions unavailable':'Loading questions…'}</p>{error&&<Button onClick={()=>{setError('');observer.current.refresh();}}>Try again</Button>}</div>:<>
      <div className="detail-identity"><Avatar person={survey.subject} size="large"/><div><strong>{survey.subject.name}</strong><span>{[survey.subject.role,survey.subject.company].filter(Boolean).join(' · ')}</span></div></div>
      {(survey.time||survey.location)&&<div className="meeting-facts">{survey.time&&<p><Icon name="clock"/>{survey.time}</p>}{survey.location&&<p><Icon name="pin"/>{survey.location}</p>}</div>}
      {current?<section className="meeting-feedback"><span className="eyebrow">{survey.respondent.name.split(' ')[0].toUpperCase()}’S FEEDBACK</span><h3 className="survey-question" key={current.id+':'+current.version}>{current.prompt}</h3><div className="feedback-choices" aria-busy={pending}>{current.choices.map(choice=><button type="button" key={choice.id} className="feedback-choice" disabled={pending} onClick={()=>answer(choice.id)}>{choice.label}<Icon name="arrow" size={16}/></button>)}</div>{pending&&<span className="feedback-saved" role="status">Saving…</span>}{survey.queuedQuestions[0]&&<p className="survey-next"><span>Up next</span>{survey.queuedQuestions[0].prompt}</p>}</section>:<>
        <div className="request-status" role="status"><Icon name="check"/><strong>Feedback saved</strong></div>
        {survey.answers.length>0&&<dl className="survey-receipt">{survey.answers.map(item=><div key={item.questionId+':'+item.questionVersion}><dt>{item.prompt}</dt><dd>{item.answerLabel}</dd></div>)}</dl>}
        {completed&&!pending&&<VisualizationHandoff onContinue={onContinue}/>}
      </>}
    </>}
  </Modal>;
}
export function SurveyPage(){
  const params=new URLSearchParams(window.location.search);
  const meetingId=params.get('meeting')||'meet-theo';
  const respondentId=isDemo?(params.get('participant')||'paul'):undefined;
  const [open,setOpen]=useState(true);
  return <div className="attendee-app"><header className="app-header"><Logo/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><a className="text-button header-actions" href="?view=attendee">My event<Icon name="arrow" size={16}/></a></header><main className="survey-page"><h1>Meetup feedback</h1>{isDemo&&<nav className="participant-tabs" aria-label="Attendee preview"><a aria-current={respondentId==='paul'?'page':undefined} href={'?view=survey&meeting='+encodeURIComponent(meetingId)+'&participant=paul'}>Paul</a><a aria-current={respondentId==='theo'?'page':undefined} href={'?view=survey&meeting='+encodeURIComponent(meetingId)+'&participant=theo'}>Theo</a></nav>}<Button onClick={()=>setOpen(true)}>View meetup</Button><a className="persona-link" href="?view=rankings">Top people<Icon name="arrow" size={16}/></a></main>{open&&<MeetingSurveyDialog meetingId={meetingId} respondentId={respondentId} close={()=>setOpen(false)} onContinue={()=>window.location.assign('?view=attendee')}/>}</div>;
}
