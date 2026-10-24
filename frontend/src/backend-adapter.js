import {validateSurvey,validateRanking,validateTopics} from './graph-contract.js';
export const personFromBackend=p=>({...p,role:p.title||'',color:'sage'});
export function meetingCoordinates(id){
  const match=/^s(\d+)-d(\d+)-(PE27-\d+)-(PE27-\d+)$/.exec(id);
  if(!match)throw new Error('Choose a meeting from the current session.');
  return {session:Number(match[1]),date:Number(match[2]),participants:match.slice(3)};
}
export function mapSurvey(raw,respondent){
  if(raw.rater_id!==respondent.id)throw new Error('The API returned another attendee’s feedback.');
  const questions=raw.questions.map(q=>({id:q.question_id,version:q.version,prompt:q.text,required:q.required,choices:q.options.map(o=>({id:o.value,label:o.label})),kind:q.kind,topicId:q.topic_id,why:q.why}));
  const answers=questions.filter(q=>Object.hasOwn(raw.answers,q.id)).map(q=>({questionId:q.id,questionVersion:q.version,prompt:q.prompt,answerKey:raw.answers[q.id],answerLabel:q.choices.find(o=>o.id===raw.answers[q.id])?.label}));
  const currentQuestion=questions.find(q=>q.id===raw.current_question_id)||null;
  return validateSurvey({meetingId:raw.meeting_id,respondent:personFromBackend(respondent),subject:personFromBackend(raw.partner),graphRevision:raw.graph_revision,surveyRevision:raw.survey_revision,complete:raw.complete,currentQuestion,queuedQuestions:raw.complete?[]:questions.filter(q=>!Object.hasOwn(raw.answers,q.id)&&q.id!==currentQuestion?.id),questions,answers,canRevise:true,phrasedBy:raw.phrased_by});
}
export const mapTopics=raw=>validateTopics({topics:raw.map(t=>({...t,label:t.name}))});
export const mapRanking=raw=>validateRanking({...raw,topic:{...raw.topic,label:raw.topic.name},graphRevision:raw.graph_revision,items:raw.items.map(item=>({...item,person:personFromBackend(item.person)}))},raw.topic.id,raw.limit);
export function mapAudience(experts,influencers,target){
  const found=new Map();
  if(target!=='connectors')for(const item of experts.items)found.set(item.person.id,{id:item.person.id,person:personFromBackend(item.person),topicId:experts.topic.id,source:'backend_graph',reports:item.m,expertise:item.comp,evidenceLabels:item.evidence.map(e=>e.label),reason:item.reason});
  if(target!=='experts')for(const item of influencers.influencers){const previous=found.get(item.person.id);found.set(item.person.id,{...previous,id:item.person.id,person:personFromBackend(item.person),topicId:experts.topic.id,source:'backend_graph',reports:item.m,expertise:item.comp_x,marginalReach:item.marginal_reach,evidenceLabels:previous?.evidenceLabels||[`${item.m} distinct comparison partners`],reason:previous?.reason||'Selected by the graph for expected additional reach for this topic.'});}
  return [...found.values()];
}
