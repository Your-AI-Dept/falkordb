import {people,meeting} from './data/pizza-expo.js';

export const demoTopics=[{id:'tomatoes',label:'Tomato sourcing'},{id:'flour',label:'Flour & fermentation'},{id:'equipment',label:'Kitchen equipment'},{id:'distribution',label:'Distribution'},{id:'growth',label:'Growing a pizzeria'}];
const usefulness={id:'usefulness',version:1,prompt:'Was this meetup useful?',required:true,choices:[{id:'yes',label:'Yes, useful'},{id:'somewhat',label:'Somewhat'},{id:'no',label:'Not really'},{id:'didnt_meet',label:'We didn’t meet'}]};
const choices=items=>items.map(([id,label])=>({id,label}));
function followup(value,respondentId) {
  if(value==='didnt_meet')return null;
  if(value==='no')return {id:'better-fit',version:1,prompt:'What would make your next conversation more useful?',required:true,choices:choices([['topic','A closer topic match'],['stage','A similar business stage'],['buyer','Someone ready to buy']])};
  if(respondentId==='theo')return {id:'share-next',version:1,prompt:'Where could you help someone next?',required:true,choices:choices([['tomatoes','Ingredient sourcing'],['equipment','Kitchen operations'],['growth','Growing a pizzeria']])};
  if(value==='somewhat')return {id:'unresolved',version:1,prompt:'What do you still need help with?',required:true,choices:choices([['tomatoes','Finding a supplier'],['flour','Dough consistency'],['equipment','Kitchen capacity']])};
  return {id:'next-priority',version:1,prompt:'Which topic should your next connection help with?',required:true,choices:demoTopics.map(topic=>({id:topic.id,label:topic.label}))};
}
function pair(state,meetingId,respondentId) {
  if(meetingId!==meeting.id||!['paul','theo'].includes(respondentId))throw new Error('This meeting is not available for this attendee.');
  const paul={id:'paul',name:state.profile.name,company:state.profile.company,role:state.profile.role,color:'peach'};
  const theo=people.find(person=>person.id==='theo');
  return respondentId==='paul'?{respondent:paul,subject:theo}:{respondent:theo,subject:paul};
}
function allAnswers(state) {
  const saved=state.surveyAnswers||[];
  if(saved.some(answer=>answer.respondentId==='paul')||!state.feedback)return saved;
  const base={meetingId:meeting.id,respondentId:'paul',subjectId:'theo',submittedAt:state.feedback.submittedAt};
  const legacy=[{...base,id:'legacy-usefulness',questionId:'usefulness',questionVersion:1,prompt:usefulness.prompt,answerKey:state.feedback.usefulness,answerLabel:usefulness.choices.find(choice=>choice.id===state.feedback.usefulness)?.label||state.feedback.usefulness}];
  const next=followup(state.feedback.usefulness,'paul');
  const choice=next?.choices.find(choice=>choice.id===state.feedback.next);
  if(choice)legacy.push({...base,id:'legacy-next',questionId:next.id,questionVersion:next.version,prompt:next.prompt,answerKey:choice.id,answerLabel:choice.label});
  return [...legacy,...saved];
}
export function demoSurvey(state,meetingId,respondentId='paul') {
  const actors=pair(state,meetingId,respondentId);
  const answers=allAnswers(state).filter(answer=>answer.meetingId===meetingId&&answer.respondentId===respondentId);
  const value=answers.find(answer=>answer.questionId==='usefulness')?.answerKey;
  const next=value?followup(value,respondentId):null;
  const currentQuestion=!value?usefulness:next&&!answers.some(answer=>answer.questionId===next.id)?next:null;
  return {meetingId,...actors,time:meeting.time,location:meeting.location,graphRevision:state.graphRevision||0,surveyRevision:state.graphRevision||0,complete:!currentQuestion,currentQuestion,queuedQuestions:[],answers};
}
export function answerDemoSurvey(state,meetingId,respondentId,body) {
  if(!Number.isSafeInteger(body.surveyRevision)||body.surveyRevision<0)throw new Error('The survey version is missing. Please refresh.');
  const survey=demoSurvey(state,meetingId,respondentId);
  const saved=survey.answers.find(answer=>answer.questionId===body.questionId&&answer.questionVersion===body.questionVersion);
  if(saved?.answerKey===body.answerKey)return state;
  const current=survey.currentQuestion;
  if(saved||body.surveyRevision>survey.surveyRevision||!current||current.id!==body.questionId||current.version!==body.questionVersion){const error=new Error('This question has changed. Please answer the current question.');error.status=409;error.survey=survey;throw error;}
  const choice=current.choices.find(choice=>choice.id===body.answerKey);
  if(!choice)throw new Error('Choose one of the available answers.');
  const answer={id:crypto.randomUUID(),meetingId,respondentId,subjectId:survey.subject.id,questionId:current.id,questionVersion:current.version,prompt:current.prompt,answerKey:choice.id,answerLabel:choice.label,submittedAt:new Date().toISOString()};
  let next={...state,graphRevision:(state.graphRevision||0)+1,surveyAnswers:[...allAnswers(state),answer]};
  if(respondentId==='paul'){
    const usefulnessAnswer=next.surveyAnswers.find(answer=>answer.respondentId==='paul'&&answer.questionId==='usefulness');
    const interest=demoTopics.some(topic=>topic.id===choice.id)?choice.id:'';
    next={...next,meetingFeedbackDue:!demoSurvey(next,meetingId,respondentId).complete,feedback:{meetingId,usefulness:usefulnessAnswer.answerKey,next:interest,attendance:usefulnessAnswer.answerKey==='didnt_meet'?'not_met':'reported_attended',submittedAt:answer.submittedAt}};
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
