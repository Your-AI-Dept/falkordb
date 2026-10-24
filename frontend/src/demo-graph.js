// Offline stand-ins for the backend's survey and ranking payloads. Each function builds the exact
// response shape the API returns (backend/openapi.json) and passes it through the same adapter as
// live mode (backend-adapter.js), so both modes share one vocabulary.
import {people,persona} from './data/pizza-expo.js';
import {topics,topicOptions,topicName,isTopic} from './data/topics.js';
import {plannedStops} from './demo-agenda.js';
import {meetingPreferences} from './meeting-preferences.js';
import {mapSurvey,mapRanking} from './backend-adapter.js';

export const demoTopics=topicOptions;
const CLAIM_OPTIONS=[{value:'true',label:'True'},{value:'false',label:'False'},{value:'skip',label:'Didn’t come up'}];
const MET_OPTIONS=[{value:'yes',label:'Yes, we met'},{value:'no',label:'We didn’t meet'}];
const ACT_OPTIONS=[{value:'yes',label:'Yes'},{value:'maybe',label:'Maybe'},{value:'no',label:'No'}];
const MEET_OPTIONS=[{value:'yes',label:'Yes'},{value:'no',label:'No'}];
const ref=person=>({id:person.id,name:person.name,company:person.company||'',title:person.role||person.title||''});
const first=name=>name.split(' ')[0];

function pair(state,meetingId,respondentId) {
  const stop=plannedStops(state).find(stop=>stop.kind==='meeting'&&stop.id===meetingId);
  if(!stop||![persona.paul,stop.personId].includes(respondentId))throw new Error('This meeting is not available for this attendee.');
  const viewer={id:persona.paul,name:state.profile.name,company:state.profile.company,role:state.profile.role,color:'peach'};
  const peer=people.find(person=>person.id===stop.personId);
  return {stop,...(respondentId===persona.paul?{respondent:viewer,subject:peer}:{respondent:peer,subject:viewer})};
}
// Two topics per meeting, two claims each (design doc §4.1): the meeting's topic, then a second
// topic either person cares about.
function surveyTopics(stop,subject,respondent) {
  const second=[...(subject.topics||[]),...(respondent.topics||[]),'brick-and-mortar'].find(id=>isTopic(id)&&id!==stop.topicId);
  return [stop.topicId,second];
}
function questionsFor(stop,respondent,subject) {
  const partner=first(subject.name);
  const claims=surveyTopics(stop,subject,respondent).flatMap((topicId,i)=>{
    const why={score:round(0.2-0.05*i),ig:round(0.4-0.06*i),plausibility:round(0.7-0.15*i)};
    return [
      {question_id:`t${i}a`,version:1,kind:'claim',required:true,topic_id:topicId,claim:'partner_taught',text:`${partner} taught me something about ${topicName(topicId)}.`,options:CLAIM_OPTIONS,why},
      {question_id:`t${i}b`,version:1,kind:'claim',required:true,topic_id:topicId,claim:'self_taught',text:`I taught ${partner} something about ${topicName(topicId)}.`,options:CLAIM_OPTIONS,why},
    ];
  });
  return [
    {question_id:'met',version:1,kind:'met',required:true,text:`Did you meet ${partner}?`,options:MET_OPTIONS,why:null},
    ...claims,
    {question_id:'act',version:1,kind:'act',required:true,text:`Would you act on ${partner}’s recommendation?`,options:ACT_OPTIONS,why:null},
    {question_id:'meet_again',version:1,kind:'meet_again',required:true,text:`Would you like to meet ${partner} again?`,options:MEET_OPTIONS,why:null},
  ];
}
function round(x){return Math.round(x*1000)/1000;}
const saved=(state,meetingId,respondentId)=>(state.surveyAnswers||[]).filter(answer=>answer.meetingId===meetingId&&answer.respondentId===respondentId);
const revisionKey=(meetingId,respondentId)=>meetingId+'|'+respondentId;

/** The backend's QuestionSet for this rater (same completion rules as backend/app/surveys.py). */
export function demoQuestionSet(state,meetingId,respondentId=persona.paul) {
  const {stop,respondent,subject}=pair(state,meetingId,respondentId);
  const questions=questionsFor(stop,respondent,subject);
  const answers=Object.fromEntries(saved(state,meetingId,respondentId).map(answer=>[answer.questionId,answer.answerKey]));
  const didntMeet=answers.met==='no';
  const pending=questions.filter(q=>!Object.hasOwn(answers,q.question_id));
  const complete=didntMeet||!pending.some(q=>q.required);
  return {meeting_id:meetingId,rater_id:respondent.id,partner:ref(subject),context:'date',phrased_by:'template',graph_revision:state.graphRevision||0,survey_revision:state.surveyRevisions?.[revisionKey(meetingId,respondentId)]||0,complete,current_question_id:didntMeet?null:pending[0]?.question_id||null,questions,answers};
}
export function demoSurvey(state,meetingId,respondentId=persona.paul) {
  const {stop,respondent,subject}=pair(state,meetingId,respondentId);
  const survey=mapSurvey(demoQuestionSet(state,meetingId,respondentId),{...ref(respondent)});
  return {...survey,respondent:{...survey.respondent,color:respondent.color},subject:{...survey.subject,color:subject.color,initials:subject.initials},time:stop.time,location:stop.location,meetingTopic:{id:stop.topicId,label:stop.topic},preferences:meetingPreferences(state,respondentId)};
}
function invalid(message){const error=new Error(message);error.status=422;throw error;}
/** Save one answer like POST .../answers: validated, idempotent, and a changed answer bumps the revision. */
export function answerDemoSurvey(state,meetingId,respondentId,body) {
  const raw=demoQuestionSet(state,meetingId,respondentId);
  const question=raw.questions.find(q=>q.question_id===body.questionId);
  if(!question)invalid('That question is not part of this survey.');
  if(!question.options.some(option=>option.value===body.answerKey))invalid('Choose one of the available answers.');
  if(body.answerText!==undefined)invalid('Written answers are not part of this survey.');
  if(raw.answers[body.questionId]===body.answerKey)return state;
  const subject=raw.partner;
  const answer={id:crypto.randomUUID(),meetingId,respondentId,subjectId:subject.id,questionId:question.question_id,questionVersion:question.version,prompt:question.text,answerKey:body.answerKey,answerLabel:question.options.find(option=>option.value===body.answerKey).label,submittedAt:new Date().toISOString()};
  const key=revisionKey(meetingId,respondentId);
  const retained=(state.surveyAnswers||[]).filter(item=>!(item.meetingId===meetingId&&item.respondentId===respondentId&&item.questionId===question.question_id));
  let next={...state,graphRevision:(state.graphRevision||0)+1,surveyRevisions:{...state.surveyRevisions,[key]:(state.surveyRevisions?.[key]||0)+1},surveyAnswers:[...retained,answer]};
  if(respondentId===persona.paul){
    const stop=plannedStops(state).find(stop=>stop.id===meetingId);
    next.agendaProgress={...state.agendaProgress,[meetingId]:{...state.agendaProgress?.[meetingId],stop,status:'feedback_due'}};
    next.feedback=feedbackSummary(next,meetingId);
  }
  return next;
}
/** What the attendee's own answers say, for local recommendations: attendance and the topics discussed. */
function feedbackSummary(state,meetingId) {
  const raw=demoQuestionSet(state,meetingId,persona.paul);
  const claims=raw.questions.filter(q=>q.kind==='claim');
  const discussed=[...new Set(claims.filter(q=>['true','false'].includes(raw.answers[q.question_id])).map(q=>q.topic_id))];
  const learned=claims.find(q=>q.claim==='partner_taught'&&raw.answers[q.question_id]==='true')?.topic_id;
  const met=raw.answers.met;
  return {meetingId,attendance:met==='no'?'not_met':met==='yes'?'reported_attended':'unknown',topics:met==='no'?[]:discussed,next:met==='no'?'':learned||discussed[0]||'',submittedAt:new Date().toISOString()};
}
// Fixture ordering only. Live ranking comes entirely from GET /topics/{id}/experts.
const rankingOrder={'tomatoes-sauce':['luca','maya','samir','theo'],'dough-flour':['elena','theo','maya'],'ovens-equipment':['nia','theo'],'supply-chain-packaging':['samir','luca'],'brick-and-mortar':['nia','maya','theo']};
/** The backend's TopicRanking for a topic (ranked by peer-confirmed competence). */
export function demoExpertsPayload(state,topicId,limit) {
  const topic=topics.find(topic=>topic.id===topicId);
  if(!topic)throw new Error('Choose an available topic.');
  const ids=(rankingOrder[topicId]||[]).map(key=>persona[key]);
  for(const person of people)if(person.topics.includes(topicId)&&!ids.includes(person.id))ids.push(person.id);
  const items=ids.slice(0,limit).map((id,index)=>{
    const person=people.find(person=>person.id===id),m=Math.max(1,5-index);
    return {rank:index+1,person:ref(person),comp:round(0.82-0.05*index),comp_unc:round(2/(2+m)),m,reason:`People they met at the show rate them highly on ${topic.name} (${m} conversation${m===1?'':'s'})`,evidence:[{label:`Compared notes on ${topic.name} with ${m} ${m===1?'person':'people'} at the show`,kind:'peer_votes'}]};
  });
  return {topic:{id:topic.id,idx:topic.idx,name:topic.name,description:topic.description},limit,graph_revision:state.graphRevision||0,status:'ready',items};
}
export function demoRanking(state,topicId,limit) {
  const ranking=mapRanking(demoExpertsPayload(state,topicId,limit));
  return {...ranking,generatedAt:new Date().toISOString(),items:ranking.items.map(item=>({...item,person:{...people.find(person=>person.id===item.person.id),...item.person}}))};
}
