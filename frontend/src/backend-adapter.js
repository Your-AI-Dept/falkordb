// Maps backend payloads (backend/openapi.json, snake_case) to the UI's shapes. Fixture mode builds
// the same backend payloads (demo-graph.js, demo-promotions.js) and maps them here too.
import {validateSurvey,validateRanking,validateTopics} from './graph-contract.js';
const initials=name=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('');
export const personFromBackend=p=>({...p,role:p.title||p.role||'',initials:p.initials||initials(p.name||''),color:p.color||'sage'});
/** Meeting ids: dates `s{session}-d{date}-{a}-{b}`, check-ins `c{tick}-{a}-{b}` (attendee ids sorted). */
export function meetingCoordinates(id){
  const date=/^s(\d+)-d(\d+)-(PE27-\d+)-(PE27-\d+)$/.exec(id);
  if(date)return {kind:'date',session:Number(date[1]),date:Number(date[2]),participants:date.slice(3)};
  const checkin=/^c(-?\d+)-(PE27-\d+)-(PE27-\d+)$/.exec(id);
  if(checkin)return {kind:'checkin',tick:Number(checkin[1]),participants:checkin.slice(2)};
  throw new Error('Choose a meeting from the current session.');
}
export function mapSurvey(raw,respondent){
  if(raw.rater_id!==respondent.id)throw new Error('The API returned another attendee’s feedback.');
  const questions=raw.questions.map(q=>({id:q.question_id,version:q.version,prompt:q.text,required:q.required,choices:q.options.map(o=>({id:o.value,label:o.label})),kind:q.kind,topicId:q.topic_id,claim:q.claim,why:q.why}));
  const answers=questions.filter(q=>Object.hasOwn(raw.answers,q.id)).map(q=>({questionId:q.id,questionVersion:q.version,prompt:q.prompt,answerKey:raw.answers[q.id],answerLabel:q.choices.find(o=>o.id===raw.answers[q.id])?.label,kind:q.kind}));
  const currentQuestion=questions.find(q=>q.id===raw.current_question_id)||null;
  return validateSurvey({meetingId:raw.meeting_id,context:raw.context,respondent:personFromBackend(respondent),subject:personFromBackend(raw.partner),graphRevision:raw.graph_revision,surveyRevision:raw.survey_revision,complete:raw.complete,currentQuestion,queuedQuestions:raw.complete?[]:questions.filter(q=>!Object.hasOwn(raw.answers,q.id)&&q.id!==currentQuestion?.id),questions,answers,canRevise:true,phrasedBy:raw.phrased_by});
}
/** "We didn't meet" (`met: no`): the survey is complete and nothing reaches the graph. */
export const didntMeet=survey=>survey.answers.some(answer=>answer.questionId==='met'&&answer.answerKey==='no');
export const mapTopics=raw=>validateTopics({topics:raw.map(t=>({...t,label:t.name}))});
export const mapRanking=raw=>validateRanking({...raw,topic:{...raw.topic,label:raw.topic.name},graphRevision:raw.graph_revision,items:raw.items.map(item=>({...item,person:personFromBackend(item.person)}))},raw.topic.id,raw.limit);
/** Exhibitor audience: topic experts (/topics/{id}/experts), micro-influencers (/topics/{id}/influencers), or both. */
export const AUDIENCE_TARGETS=Object.freeze([
  {id:'experts',label:'Topic experts',description:'Ranked by peer-confirmed competence on the topic'},
  {id:'influencers',label:'Micro-influencers',description:'Knowledgeable, well liked and well connected to interested people: give them tickets to hand out'},
  {id:'both',label:'Both',description:'Topic experts and micro-influencers'},
]);
export function mapAudience(experts,influencers,target,source='backend_graph'){
  if(!AUDIENCE_TARGETS.some(item=>item.id===target))throw new Error('Choose a topic and audience.');
  const found=new Map();
  if(target!=='influencers')for(const item of experts.items)found.set(item.person.id,{id:item.person.id,person:personFromBackend(item.person),topicId:experts.topic.id,source,kinds:['expert'],reports:item.m,expertise:item.comp,evidenceLabels:item.evidence.map(e=>e.label),reason:item.reason});
  if(target!=='experts')for(const item of influencers.influencers){
    const previous=found.get(item.person.id);
    found.set(item.person.id,{...previous,id:item.person.id,person:personFromBackend(item.person),topicId:experts.topic.id,source,kinds:[...(previous?.kinds||[]),'micro_influencer'],reports:item.m,expertise:previous?.expertise??item.comp_x,like:item.like,marginalReach:item.marginal_reach,evidenceLabels:previous?.evidenceLabels||[`${item.m} distinct comparison partners`,`Liked by ${Math.round(item.like*100)}% of ${item.like_n} people met`],reason:previous?.reason||'Micro-influencer: knowledgeable, well liked and connected to people interested in this topic.'});
  }
  return [...found.values()];
}
