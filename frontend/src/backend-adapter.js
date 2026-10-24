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
    found.set(item.person.id,{...previous,id:item.person.id,person:personFromBackend(item.person),topicId:experts.topic.id,source,kinds:[...(previous?.kinds||[]),'micro_influencer'],reports:item.m,expertise:previous?.expertise??item.comp_x,like:item.like,marginalReach:item.marginal_reach,why:mapInfluencerWhy(item.why),evidenceLabels:previous?.evidenceLabels||[`${item.m} distinct comparison partners`,`Liked by ${Math.round(item.like*100)}% of ${item.like_n} people met`],reason:previous?.reason||'Micro-influencer: knowledgeable, well liked and connected to people interested in this topic.'});
  }
  return [...found.values()];
}

// --- Explanations (backend/app/models.py: Reason, EvidenceQuery, PathStep, MeetingWhy, InfluencerWhy) ---
/** Social ties on a path, as shown to attendees. */
export const TIE_LABELS=Object.freeze({LINKEDIN:'LinkedIn',ADHOC:'met at the show',POS_TIE:'trusts their advice'});
const text=value=>typeof value==='string'&&Boolean(value.trim());
const num=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
function invalid(what){throw new Error(`The API returned an unsupported ${what}.`);}
/** One ranked, display-safe reason. Unknown kinds still render with their title and detail. */
export function mapReason(raw){
  if(!raw||!text(raw.title))invalid('explanation');
  return {kind:text(raw.kind)?raw.kind:'other',title:raw.title,detail:text(raw.detail)?raw.detail:'',weight:num(raw.weight),topicId:raw.topic_id||null};
}
export const mapEvidenceQueries=raw=>(Array.isArray(raw)?raw:[]).filter(q=>text(q?.label)&&text(q?.cypher)).map(q=>({label:q.label,cypher:q.cypher}));
function mapPath(raw){
  if(!Array.isArray(raw)||raw.length<2)return null;
  return raw.map(step=>{if(!text(step?.person?.id)||!text(step?.person?.name))invalid('social path');return {person:personFromBackend(step.person),via:step.via||null,viaLabel:step.via?TIE_LABELS[step.via]||step.via:null};});
}
/** GET /sessions/{s}/dates/{d}/meetings/{rater}/why → "Why we matched you". */
export function mapMeetingWhy(raw){
  if(!raw||!text(raw.meeting_id)||!text(raw.headline)||!Array.isArray(raw.reasons)||!raw.rater?.id||!raw.partner?.id)invalid('match explanation');
  const score=raw.score||{};
  return {meetingId:raw.meeting_id,session:raw.session,date:raw.date_no,rater:personFromBackend(raw.rater),partner:personFromBackend(raw.partner),headline:raw.headline,
    score:{valueForYou:num(score.value_for_you),valueForThem:num(score.value_for_them),pairScore:num(score.pair_score),dateFloor:num(score.date_floor),components:{...(score.components||{})}},
    reasons:raw.reasons.map(mapReason),path:mapPath(raw.path),evidenceQueries:mapEvidenceQueries(raw.evidence_queries)};
}
/** Influencer.why → per-person "Why them?". Null when the backend sent no explanation. */
export function mapInfluencerWhy(raw){
  if(!raw)return null;
  return {pickOrder:num(raw.pick_order),competencePercentile:num(raw.competence_percentile),likabilityPercentile:num(raw.likability_percentile),directTargets:num(raw.direct_targets),uniqueTargets:num(raw.unique_targets),reasons:(raw.reasons||[]).map(mapReason)};
}
/** InfluencerResult.audience/runners_up/evidence_queries → "Why these people?". Null without an audience summary. */
export function mapAudienceExplanation(raw){
  const a=raw?.audience;
  if(!a)return null;
  return {interested:num(a.interested)??0,covered:num(a.covered)??0,coverageShare:num(a.coverage_share)??0,expectedAttendees:num(a.expected_attendees)??0,tribes:num(a.tribes)??0,method:text(a.method)?a.method:'',
    runnersUp:(raw.runners_up||[]).map(r=>({person:personFromBackend(r.person),compX:num(r.comp_x),like:num(r.like),marginalReach:num(r.marginal_reach),reason:text(r.reason)?r.reason:''})),
    evidenceQueries:mapEvidenceQueries(raw.evidence_queries),picks:(raw.influencers||[]).length};
}
