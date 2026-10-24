import React, {useEffect,useRef,useState} from 'react';
import {api,isDemo} from '../api.js';
import {reconcileSurvey,validateSurvey} from '../graph-contract.js';
import {observeResource} from '../observe-resource.js';
import {attendeeLink} from '../navigation.js';
import {Avatar,Button,Icon,Logo,Modal} from './ui.jsx';
import {VisualizationHandoff} from './VisualizationHandoff.jsx';

function AnswerChoices({question,saved,pending,answer,topic}) {
  const [detail,setDetail]=useState(null),[text,setText]=useState(saved?.answerText||'');
  if(detail)return <form className="survey-detail" onSubmit={event=>{event.preventDefault();answer(detail.id,detail.requiresText?text:undefined);}}>
    {detail.requiresText?<label>What did you have in mind?<textarea autoFocus required maxLength={300} rows={3} value={text} onChange={event=>setText(event.target.value)}/></label>:<p>Pause {topic?.label?.toLowerCase()||'this topic'} meetups for the rest of this event. Your current four-person lineup and booth visits stay on your day.</p>}
    <div className="survey-navigation"><Button variant="text" disabled={pending} onClick={()=>setDetail(null)}><Icon name="back" size={16}/>Choices</Button><Button type="submit" disabled={pending||(detail.requiresText&&!text.trim())}>{pending?'Saving…':detail.requiresText?'Save answer':'Pause these meetups'}</Button></div>
  </form>;
  return <div className="feedback-choices" aria-busy={pending}>{question.choices.map(choice=><button type="button" key={choice.id} className={'feedback-choice '+(saved?.answerKey===choice.id?'selected':'')} aria-pressed={saved?.answerKey===choice.id} disabled={pending} onClick={()=>choice.requiresText||choice.requiresConfirmation?setDetail(choice):answer(choice.id)}>{choice.label}<Icon name={saved?.answerKey===choice.id?'check':'arrow'} size={16}/></button>)}</div>;
}

export function MeetingSurveyDialog({meetingId,respondentId='paul',close,onSaved=()=>{},onContinue=close}) {
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
  async function answer(answerKey,answerText){
    if(saving.current||!current)return;
    saving.current=true;readError.current=false;setPending(true);setError('');
    const payload={questionId:current.id,questionVersion:current.version,answerKey,surveyRevision:survey.surveyRevision,...(answerText!==undefined?{answerText}: {})};
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
  return <Modal title={survey?'Your meetup with '+survey.subject.name.split(' ')[0]:'Your meetup'} close={close} dismissible={completed&&!pending} blockedMessage={blockedMessage} error={error}>
    {!survey?<div className="survey-loading"><p role="status">{error?'Questions unavailable':'Loading questions…'}</p>{error&&<Button onClick={()=>{setError('');observer.current.refresh();}}>Try again</Button>}</div>:<>
      <div className="detail-identity"><Avatar person={survey.subject} size="large"/><div><strong>{survey.subject.name}</strong><span>{[survey.subject.role,survey.subject.company].filter(Boolean).join(' · ')}</span></div></div>
      {(survey.time||survey.location)&&<div className="meeting-facts">{survey.time&&<p><Icon name="clock"/>{survey.time}</p>}{survey.location&&<p><Icon name="pin"/>{survey.location}</p>}</div>}
      <section className="meeting-feedback">
        <div className="survey-progress"><span className="eyebrow">{survey.respondent.name.split(' ')[0].toUpperCase()}’S FEEDBACK</span>{current&&<span>Question {index+1}</span>}</div>
        {current?<><h3 className="survey-question">{current.prompt}</h3>
          {(!saved||(isDemo&&survey.canRevise))?<AnswerChoices key={current.id+':'+current.version+':'+(saved?.id||'new')} question={current} saved={saved} pending={pending} answer={answer} topic={survey.meetingTopic}/>:<p className="saved-answer">{saved.answerLabel}</p>}
          {pending&&<span className="feedback-saved" role="status">Saving…</span>}
          <div className="survey-navigation"><Button variant="text" disabled={pending||index===0} onClick={previous}><Icon name="back" size={16}/>Back</Button><Button variant="text" disabled={pending||!saved} onClick={forward}>{saved&&index===questions.length-1?'Review answers':'Next'}<Icon name="arrow" size={16}/></Button></div>
          {!saved&&survey.queuedQuestions[0]&&<p className="survey-next"><span>Up next</span>{survey.queuedQuestions[0].prompt}</p>}
        </>:<>
          <div className="request-status" role="status"><Icon name="check"/><strong>Feedback saved</strong></div>
          {survey.answers.length>0&&<dl className="survey-receipt">{survey.answers.map(item=><div key={item.questionId+':'+item.questionVersion}><dt>{item.prompt}</dt><dd>{item.answerLabel}<button className="text-button" onClick={()=>setReviewId(item.questionId)} aria-label={'Review answer: '+item.prompt}>{isDemo?'Change':'Review'}<Icon name="edit" size={14}/></button></dd></div>)}</dl>}
          {survey.preferences?.length>0&&<p className="preference-confirmation">Paused: {survey.preferences.map(item=>item.topicLabel.toLowerCase()+' meetups').join(', ')}. You can turn them back on in your profile.</p>}
          <Button variant="text" disabled={!questions.length||pending} onClick={previous}><Icon name="back" size={16}/>Back to answers</Button>
          {completed&&!pending&&<VisualizationHandoff onContinue={onContinue} participant={survey.respondent.id}/>}
        </>}
      </section>
    </>}
  </Modal>;
}
export function SurveyPage(){
  const params=new URLSearchParams(window.location.search);
  const meetingId=params.get('meeting')||'meet-theo';
  const respondentId=isDemo?(params.get('participant')||'paul'):undefined;
  const home=attendeeLink('attendee',respondentId);
  const [open,setOpen]=useState(true);
  return <div className="attendee-app"><header className="app-header"><Logo href={home}/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div><a className="text-button header-actions" href={home}>My day<Icon name="arrow" size={16}/></a></header><main className="survey-page"><h1>Meetup feedback</h1>{isDemo&&<nav className="participant-tabs" aria-label="Attendee preview"><a aria-current={respondentId==='paul'?'page':undefined} href={'?view=survey&meeting='+encodeURIComponent(meetingId)+'&participant=paul'}>Paul</a><a aria-current={respondentId==='theo'?'page':undefined} href={'?view=survey&meeting='+encodeURIComponent(meetingId)+'&participant=theo'}>Theo</a></nav>}<Button onClick={()=>setOpen(true)}>View meetup</Button><a className="persona-link" href={attendeeLink('rankings',respondentId)}>Top people<Icon name="arrow" size={16}/></a></main>{open&&<MeetingSurveyDialog meetingId={meetingId} respondentId={respondentId} close={()=>setOpen(false)} onContinue={()=>window.location.assign(home)}/>}</div>;
}
