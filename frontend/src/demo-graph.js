import {people,meeting} from './data/pizza-expo.js';
import {plannedStops} from './demo-agenda.js';
import {meetingPreferences} from './meeting-preferences.js';

export const demoTopics=[{id:'tomatoes',label:'Tomato sourcing'},{id:'flour',label:'Flour & fermentation'},{id:'equipment',label:'Kitchen equipment'},{id:'distribution',label:'Distribution'},{id:'growth',label:'Growing a pizzeria'}];
const usefulness={id:'usefulness',version:1,prompt:'Was this meetup useful?',required:true,choices:[{id:'yes',label:'Yes, useful'},{id:'somewhat',label:'Somewhat'},{id:'no',label:'Not really'},{id:'didnt_meet',label:'We didn’t meet'}]};
const choices=items=>items.map(([id,label])=>({id,label}));
function baseFollowup(value,respondentId) {
  if(value==='didnt_meet')return null;
  if(value==='no')return {id:'better-fit',version:1,prompt:'What would make your next conversation more useful?',required:true,choices:choices([['topic','A closer topic match'],['stage','A similar business stage'],['buyer','Someone ready to buy']])};
  if(respondentId==='theo')return {id:'share-next',version:1,prompt:'Where could you help someone next?',required:true,choices:choices([['tomatoes','Ingredient sourcing'],['equipment','Kitchen operations'],['growth','Growing a pizzeria']])};
  if(value==='somewhat')return {id:'unresolved',version:1,prompt:'What do you still need help with?',required:true,choices:choices([['tomatoes','Finding a supplier'],['flour','Dough consistency'],['equipment','Kitchen capacity']])};
  return {id:'next-priority',version:1,prompt:'Which topic should your next connection help with?',required:true,choices:demoTopics.map(topic=>({id:topic.id,label:topic.label}))};
}
function followup(value,respondentId) {
  const question=baseFollowup(value,respondentId);
  if(!question)return null;
  return {...question,choices:[...question.choices,{id:'other',label:'Something else',requiresText:true},{id:'no_similar',label:'No more meetings like this',requiresConfirmation:true}]};
}

function pair(state,meetingId,respondentId) {
  const stop=plannedStops(state).find(stop=>stop.kind==='meeting'&&stop.id===meetingId);
  if(!stop||!['paul',stop.personId].includes(respondentId))throw new Error('This meeting is not available for this attendee.');
  const paul={id:'paul',name:state.profile.name,company:state.profile.company,role:state.profile.role,color:'peach'};
  const peer=people.find(person=>person.id===stop.personId);
  return {...(respondentId==='paul'?{respondent:paul,subject:peer}:{respondent:peer,subject:paul}),time:stop.time,location:stop.location};
}
function allAnswers(state) {
  const saved=state.surveyAnswers||[];
  if(saved.some(answer=>answer.respondentId==='paul'&&answer.meetingId===meeting.id)||!state.feedback||state.feedback.meetingId!==meeting.id)return saved;
  const base={meetingId:meeting.id,respondentId:'paul',subjectId:'theo',submittedAt:state.feedback.submittedAt};
  const legacy=[{...base,id:'legacy-usefulness',questionId:'usefulness',questionVersion:1,prompt:usefulness.prompt,answerKey:state.feedback.usefulness,answerLabel:usefulness.choices.find(choice=>choice.id===state.feedback.usefulness)?.label||state.feedback.usefulness}];
  const next=followup(state.feedback.usefulness,'paul');
  const choice=next?.choices.find(choice=>choice.id===state.feedback.next);
  if(choice)legacy.push({...base,id:'legacy-next',questionId:next.id,questionVersion:next.version,prompt:next.prompt,answerKey:choice.id,answerLabel:choice.label});
  return [...legacy,...saved];
}
export function demoSurvey(state,meetingId,respondentId='paul') {
  const actors=pair(state,meetingId,respondentId);
  const stop=plannedStops(state).find(stop=>stop.id===meetingId);
  const answers=allAnswers(state).filter(answer=>answer.meetingId===meetingId&&answer.respondentId===respondentId);
  const value=answers.find(answer=>answer.questionId==='usefulness')?.answerKey;
  const next=value?followup(value,respondentId):null;
  const questions=[usefulness,...(next?[next]:[])];
  const currentQuestion=questions.find(question=>!answers.some(answer=>answer.questionId===question.id))||null;
  const topic=demoTopics.find(topic=>topic.id===stop.topicId||topic.label===stop.topic);
  const meetingTopic={id:topic?.id||stop.topicId||'operations',label:topic?.label||stop.topic};
  return {meetingId,...actors,meetingTopic,graphRevision:state.graphRevision||0,surveyRevision:state.graphRevision||0,complete:!currentQuestion,currentQuestion,queuedQuestions:[],answers,questions,canRevise:true,preferences:meetingPreferences(state,respondentId)};
}
function conflict(survey) {
  const error=new Error('Your feedback changed. Review the latest answer and try again.');
  error.status=409;error.survey=survey;throw error;
}
export function answerDemoSurvey(state,meetingId,respondentId,body,{revise=false}={}) {
  if(!Number.isSafeInteger(body.surveyRevision)||body.surveyRevision<0)throw new Error('The survey version is missing. Please refresh.');
  const survey=demoSurvey(state,meetingId,respondentId);
  const saved=survey.answers.find(answer=>answer.questionId===body.questionId&&answer.questionVersion===body.questionVersion);
  const answerText=typeof body.answerText==='string'?body.answerText.trim():'';
  if(saved?.answerKey===body.answerKey&&(saved.answerText||'')===answerText){
    if(revise&&saved.preference&&(state.restoredMeetingPreferences||[]).includes(saved.id)){
      if(body.surveyRevision!==survey.surveyRevision)conflict(survey);
      return {...state,restoredMeetingPreferences:state.restoredMeetingPreferences.filter(id=>id!==saved.id),graphRevision:(state.graphRevision||0)+1};
    }
    return state;
  }
  const current=revise?survey.questions.find(question=>question.id===body.questionId):survey.currentQuestion;
  if((saved&&!revise)||(revise&&(!saved||body.surveyRevision!==survey.surveyRevision))||body.surveyRevision>survey.surveyRevision||!current||current.id!==body.questionId||current.version!==body.questionVersion)conflict(survey);
  const choice=current.choices.find(choice=>choice.id===body.answerKey);
  if(!choice)throw new Error('Choose one of the available answers.');
  if(choice.requiresText&&(!answerText||answerText.length>300))throw new Error('Add a short answer, up to 300 characters.');
  if(!choice.requiresText&&answerText)throw new Error('This answer does not accept extra text.');
  const preference=choice.id==='no_similar'?{kind:'avoid_topic',topicId:survey.meetingTopic.id,topicLabel:survey.meetingTopic.label}:null;
  const answer={id:crypto.randomUUID(),meetingId,respondentId,subjectId:survey.subject.id,questionId:current.id,questionVersion:current.version,prompt:current.prompt,answerKey:choice.id,answerLabel:choice.requiresText?answerText:preference?'No more '+preference.topicLabel.toLowerCase()+' meetups':choice.label,...(answerText?{answerText}:{}),...(preference?{preference}:{}),submittedAt:new Date().toISOString()};
  // A changed first answer invalidates only this respondent's dependent question.
  const retained=allAnswers(state).filter(item=>!(item.meetingId===meetingId&&item.respondentId===respondentId&&(current.id==='usefulness'||item.questionId===current.id)));
  const stop=plannedStops(state).find(stop=>stop.id===meetingId);
  let next={...state,graphRevision:(state.graphRevision||0)+1,surveyAnswers:[...retained,answer]};
  if(respondentId==='paul'){
    next.agendaProgress={...state.agendaProgress,[meetingId]:{...state.agendaProgress?.[meetingId],stop,status:'feedback_due'}};
    const ownAnswers=next.surveyAnswers.filter(item=>item.respondentId==='paul'&&item.meetingId===meetingId);
    const usefulnessAnswer=ownAnswers.find(item=>item.questionId==='usefulness');
    const interest=ownAnswers.find(item=>demoTopics.some(topic=>topic.id===item.answerKey))?.answerKey||'';
    next.feedback={meetingId,usefulness:usefulnessAnswer.answerKey,next:interest,attendance:usefulnessAnswer.answerKey==='didnt_meet'?'not_met':'reported_attended',submittedAt:answer.submittedAt};
    if(meetingId===meeting.id)next.meetingFeedbackDue=!demoSurvey(next,meetingId,respondentId).complete;
  }
  return next;
}
// Fixture ordering only. Live ranking comes entirely from the graph API.
export function demoRanking(state,topicId,limit) {
  const topic=demoTopics.find(topic=>topic.id===topicId);
  if(!topic)throw new Error('Choose an available topic.');
  const order={tomatoes:['luca','maya','samir','theo'],flour:['elena','theo','maya'],equipment:['nia','theo'],distribution:['samir','luca'],growth:['nia','maya','theo']}[topicId];
  return {topic,limit,graphRevision:state.graphRevision||0,generatedAt:new Date().toISOString(),status:'ready',items:order.slice(0,limit).map((id,index)=>{const person=people.find(person=>person.id===id);return {rank:index+1,person,reason:person.offering,profileSource:{kind:'fixture'}};})};
}
