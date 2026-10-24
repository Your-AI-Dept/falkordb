import React, {useEffect,useRef,useState} from 'react';
import {api,isDemo,viewerId} from '../api.js';
import {persona,resolvePersona,people} from '../data/pizza-expo.js';
import {demoMeetings} from '../demo-agenda.js';
import {topicName} from '../data/topics.js';
import {reconcileSurvey,validateSurvey} from '../graph-contract.js';
import {observeResource} from '../observe-resource.js';
import {attendeeLink} from '../navigation.js';
import {Avatar,Button,Icon,Logo,Modal} from './ui.jsx';
import {VisualizationHandoff} from './VisualizationHandoff.jsx';

// Options come from the backend's question (or the fixture built in the same shape).
function AnswerChoices({question,saved,pending,answer}) {
  return <div className="feedback-choices" aria-busy={pending}>{question.choices.map(choice=><button type="button" key={choice.id} className={'feedback-choice '+(saved?.answerKey===choice.id?'selected':'')} aria-pressed={saved?.answerKey===choice.id} disabled={pending} onClick={()=>answer(choice.id)}>{choice.label}<Icon name={saved?.answerKey===choice.id?'check':'arrow'} size={16}/></button>)}</div>;
}

export function MeetingSurveyDialog({meetingId,respondentId=viewerId(),close,onSaved=()=>{},onContinue=close}) {
  const [survey,setSurvey]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[reviewId,setReviewId]=useState(null);
  const observer=useRef(),alive=useRef(true),retry=useRef(null),saving=useRef(false),readError=useRef(false);
  const savedCallback=useRef(onSaved);savedCallback.current=onSaved;
  useEffect(()=>{
    alive.current=true;
    observer.current=observeResource({load:signal=>api.survey(meetingId,respondentId,{signal}),onValue:next=>{if(saving.current)return;setSurvey(previous=>reconcileSurvey(previous,next));if(readError.current){setError('');readError.current=false;}},onError:failure=>{readError.current=true;setError(failure.message);},subscribe:api.subscribe});
    return()=>{alive.current=false;observer.current.stop();};
  },[meetingId,respondentId]);
  const questions=survey?.questions||[...(survey?.answers||[]).map(item=>({id:item.questionId,version:item.questionVersion,prompt:item.prompt,choices:[]})),...(survey?.currentQuestion?[survey.currentQuestion]:[])];
  const current=questions.find(question=>question.id===reviewId)||survey?.currentQuestion;
  const saved=current&&survey?.answers.find(item=>item.questionId===current.id&&item.questionVersion===current.version);
  const index=current?questions.findIndex(question=>question.id===current.id):questions.length;
  const completed=Boolean(survey?.complete);
  async function answer(answerKey){
    if(saving.current||!current)return;
    saving.current=true;readError.current=false;setPending(true);setError('');
    const payload={questionId:current.id,questionVersion:current.version,answerKey,surveyRevision:survey.surveyRevision};
    const signature=JSON.stringify(payload);
    if(retry.current?.signature!==signature)retry.current={signature,idempotencyKey:crypto.randomUUID()};
    try{
      const next=await api.answerSurvey(meetingId,respondentId,payload,{idempotencyKey:retry.current.idempotencyKey,revise:Boolean(saved)});
      if(alive.current){setSurvey(previous=>reconcileSurvey(previous,next,{afterAnswer:true}));setReviewId(saved?next.questions?.[index+1]?.id||null:null);retry.current=null;savedCallback.current(next);}
    }catch(failure){
      if(alive.current){
        setError(failure.message);
        if(failure.status===409&&failure.survey){try{const next=validateSurvey(failure.survey);setSurvey(previous=>reconcileSurvey(previous,next,{afterAnswer:true}));retry.current=null;}catch{ /* Preserve the current question on malformed conflicts. */ }}
      }
    }finally{saving.current=false;if(alive.current)setPending(false);}
  }
  function previous(){setError('');setReviewId(questions[index-1]?.id||null);}
  function forward(){setError('');setReviewId(questions[index+1]?.id||null);}
  const blockedMessage=pending?'Your answer is saving. Please wait.':survey?'Complete your feedback before leaving. Your saved answers are kept.':'Please wait for your feedback to load.';
  const noun=survey?.context==='checkin'?'check-in':'meetup';
  return <Modal title={survey?'Your '+noun+' with '+survey.subject.name.split(' ')[0]:'Your meetup'} close={close} dismissible={completed&&!pending} blockedMessage={blockedMessage} error={error}>
    {!survey?<div className="survey-loading"><p role="status">{error?'Questions unavailable':'Loading questions…'}</p>{error&&<Button onClick={()=>{setError('');observer.current.refresh();}}>Try again</Button>}</div>:<>
      <div className="detail-identity"><Avatar person={survey.subject} size="large"/><div><strong>{survey.subject.name}</strong><span>{[survey.subject.role,survey.subject.company].filter(Boolean).join(' · ')}</span></div></div>
      {(survey.time||survey.location)&&<div className="meeting-facts">{survey.time&&<p><Icon name="clock"/>{survey.time}</p>}{survey.location&&<p><Icon name="pin"/>{survey.location}</p>}</div>}
      <section className="meeting-feedback">
        <div className="survey-progress"><span className="eyebrow">{survey.respondent.name.split(' ')[0].toUpperCase()}’S FEEDBACK</span>{current&&<span>Question {index+1}</span>}</div>
        {current?<>{current.kind==='claim'&&current.topicId&&<span className="eyebrow">{topicName(current.topicId)}</span>}<h3 className="survey-question">{current.prompt}</h3>
          {(!saved||survey.canRevise)?<AnswerChoices key={current.id+':'+current.version+':'+(saved?.answerKey||'new')} question={current} saved={saved} pending={pending} answer={answer}/>:<p className="saved-answer">{saved.answerLabel}</p>}
          {pending&&<span className="feedback-saved" role="status">Saving…</span>}
          <div className="survey-navigation"><Button variant="text" disabled={pending||index===0} onClick={previous}><Icon name="back" size={16}/>Back</Button><Button variant="text" disabled={pending||!saved} onClick={forward}>{saved&&index===questions.length-1?'Review answers':'Next'}<Icon name="arrow" size={16}/></Button></div>
          {!saved&&survey.queuedQuestions[0]&&<p className="survey-next"><span>Up next</span>{survey.queuedQuestions[0].prompt}</p>}
        </>:<>
          <div className="request-status" role="status"><Icon name="check"/><strong>Feedback saved</strong></div>
          {survey.answers.length>0&&<dl className="survey-receipt">{survey.answers.map(item=><div key={item.questionId+':'+item.questionVersion}><dt>{item.prompt}</dt><dd>{item.answerLabel}<button className="text-button" onClick={()=>setReviewId(item.questionId)} aria-label={'Review answer: '+item.prompt}>{survey.canRevise?'Change':'Review'}<Icon name="edit" size={14}/></button></dd></div>)}</dl>}
          <Button variant="text" disabled={!questions.length||pending} onClick={previous}><Icon name="back" size={16}/>Back to answers</Button>
          {completed&&!pending&&<VisualizationHandoff onContinue={onContinue} participant={survey.respondent.id}/>}
        </>}
      </section>
    </>}
  </Modal>;
}
const first=id=>people.find(person=>person.id===id)?.name.split(' ')[0]||id;
export function SurveyPage(){
  const params=new URLSearchParams(window.location.search);
  const meetingId=params.get('meeting')||(isDemo?demoMeetings.theo:'');
  const respondentId=resolvePersona(params.get('participant')||'')||viewerId();
  const home=attendeeLink('attendee',respondentId);
  const [open,setOpen]=useState(true);
  const tab=(id,label)=><a aria-current={respondentId===id?'page':undefined} href={'?view=survey&meeting='+encodeURIComponent(meetingId)+'&participant='+id}>{label}</a>;
  return <div className="attendee-app"><header className="app-header"><Logo href={home}/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><a className="text-button header-actions" href={home}>My day<Icon name="arrow" size={16}/></a></header><main className="survey-page"><h1>Meetup feedback</h1>{isDemo&&<nav className="participant-tabs" aria-label="Attendee preview">{tab(persona.paul,'Drita')}{tab(persona.theo,first(persona.theo))}</nav>}<Button onClick={()=>setOpen(true)}>View meetup</Button><a className="persona-link" href={attendeeLink('rankings',respondentId)}>Topic experts<Icon name="arrow" size={16}/></a></main>{open&&meetingId&&<MeetingSurveyDialog meetingId={meetingId} respondentId={respondentId} close={()=>setOpen(false)} onContinue={()=>window.location.assign(home)}/>}</div>;
}
