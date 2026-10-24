import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,snapshot} from '../src/demo.js';
import {demoSurvey,demoQuestionSet,answerDemoSurvey,demoRanking,demoExpertsPayload} from '../src/demo-graph.js';
import {demoMeetings} from '../src/demo-agenda.js';
import {persona as P} from '../src/data/pizza-expo.js';
import {validateSurvey,validateRanking,reconcileSurvey} from '../src/graph-contract.js';
import {createRestClient} from '../src/rest.js';
import {createGraphClient} from '../src/graph-api.js';
import {observeResource} from '../src/observe-resource.js';
const meetingId=demoMeetings.theo;
function answer(state,respondentId,key){const survey=demoSurvey(state,meetingId,respondentId),q=survey.currentQuestion;return answerDemoSurvey(state,meetingId,respondentId,{questionId:q.id,questionVersion:q.version,answerKey:key,surveyRevision:survey.surveyRevision});}

test('fixture surveys have the backend QuestionSet shape: met, 4 claims with Didn’t come up, act, meet_again',()=>{
  const raw=demoQuestionSet(freshState(),meetingId,P.paul);
  assert.deepEqual(raw.questions.map(q=>q.kind),['met','claim','claim','claim','claim','act','meet_again']);
  assert.equal(raw.meeting_id,meetingId);assert.equal(raw.rater_id,P.paul);assert.equal(raw.partner.id,P.theo);
  for(const q of raw.questions.filter(q=>q.kind==='claim')){
    assert.deepEqual(q.options.map(o=>o.value),['true','false','skip']);
    assert.match(q.topic_id,/^[a-z-]+$/);assert.ok(['partner_taught','self_taught'].includes(q.claim));assert.ok(q.why);
  }
  assert.equal(raw.current_question_id,'met');assert.equal(raw.survey_revision,0);
});

test('both participants answer independently on one shared meeting id',()=>{
  let state=answer(freshState(),P.paul,'yes');
  state=answer(state,P.theo,'yes');state=answer(state,P.theo,'false');
  const paul=demoSurvey(state,meetingId,P.paul),theo=demoSurvey(state,meetingId,P.theo);
  assert.equal(paul.meetingId,theo.meetingId);
  assert.equal(paul.answers.length,1);assert.equal(theo.answers.length,2);
  assert.equal(theo.subject.id,P.paul);assert.equal(paul.subject.id,P.theo);
  assert.equal(paul.currentQuestion.id,'t0a');assert.equal(theo.currentQuestion.id,'t0b');
  assert.equal(state.encounters.length,0);
});

test('completing a survey records attendance and the topics discussed, never usefulness',()=>{
  let state=freshState();
  for(const key of ['yes','true','false','skip','skip','yes','yes'])state=answer(state,P.paul,key);
  const survey=validateSurvey(demoSurvey(JSON.parse(JSON.stringify(state)),meetingId,P.paul));
  assert.equal(survey.complete,true);assert.equal(survey.currentQuestion,null);
  assert.equal(state.feedback.attendance,'reported_attended');
  assert.deepEqual(state.feedback.topics,[demoQuestionSet(state,meetingId,P.paul).questions[1].topic_id]);
  assert.equal(state.feedback.usefulness,undefined);
  assert.equal(snapshot(state).meeting.surveyComplete,true);
});

test('“We didn’t meet” completes the survey and writes no topics',()=>{
  const state=answer(freshState(),P.paul,'no');
  assert.equal(demoSurvey(state,meetingId,P.paul).complete,true);
  assert.equal(state.feedback.attendance,'not_met');assert.deepEqual(state.feedback.topics,[]);assert.equal(state.feedback.next,'');
  assert.equal(demoSurvey(state,meetingId,P.theo).answers.length,0);
  assert.throws(()=>demoSurvey(state,meetingId,'PE27-99999'),/not available/);
});

test('retries are idempotent; changed answers bump the revision; bad input is rejected like the API',()=>{
  const payload={questionId:'met',questionVersion:1,answerKey:'yes',surveyRevision:0};
  const state=answerDemoSurvey(freshState(),meetingId,P.paul,payload);
  assert.strictEqual(answerDemoSurvey(state,meetingId,P.paul,payload),state);
  assert.equal(demoSurvey(state,meetingId,P.paul).surveyRevision,1);
  const changed=answerDemoSurvey(state,meetingId,P.paul,{...payload,answerKey:'no'});
  assert.equal(demoSurvey(changed,meetingId,P.paul).surveyRevision,2);
  assert.throws(()=>answerDemoSurvey(freshState(),meetingId,P.paul,{...payload,answerKey:'maybe'}),error=>error.status===422);
  assert.throws(()=>answerDemoSurvey(freshState(),meetingId,P.paul,{...payload,questionId:'nope'}),error=>error.status===422);
});

test('live revisions update queued questions without replacing an unanswered active prompt',()=>{
  const current=demoSurvey(freshState(),meetingId);
  const changed={...current,graphRevision:10,surveyRevision:3,currentQuestion:{...current.currentQuestion,id:'graph-q-9',version:2,prompt:'What matters about your suppliers?'},queuedQuestions:[{...current.currentQuestion,id:'graph-q-10',prompt:'Which delivery schedule fits?'}]};
  const merged=reconcileSurvey(current,validateSurvey(changed));
  assert.equal(merged.currentQuestion.id,'met');
  assert.deepEqual(merged.queuedQuestions.map(question=>question.id),['graph-q-9','graph-q-10']);
  assert.strictEqual(reconcileSurvey(merged,{...changed,graphRevision:2}),merged);
  assert.equal(reconcileSurvey(current,changed,{afterAnswer:true}).currentQuestion.id,'graph-q-9');
  assert.strictEqual(reconcileSurvey(current,{...changed,respondent:{id:'wrong',name:'Wrong'}}),current);
  assert.throws(()=>validateSurvey({...changed,complete:true}),/incomplete/);
  assert.throws(()=>validateSurvey({...current,currentQuestion:null}),/not available/);
});

test('topic experts: fixture payloads have the backend TopicRanking shape, in server order, never padded',()=>{
  const raw=demoExpertsPayload(freshState(),'ovens-equipment',20);
  assert.equal(raw.topic.id,'ovens-equipment');assert.equal(raw.topic.name,'Ovens & Equipment');
  assert.ok(raw.items.every(item=>item.person.id.startsWith('PE27-')&&item.reason&&item.evidence.length&&typeof item.m==='number'));
  const ranking=demoRanking(freshState(),'ovens-equipment',20);
  assert.equal(ranking.items.length,2);assert.equal(ranking.items[0].person.id,P.nia);
  assert.equal(validateRanking(ranking,'ovens-equipment',20),ranking);
  assert.throws(()=>validateRanking({...ranking,items:[{...ranking.items[0],rank:7}]},'ovens-equipment',20),/unsupported/);
  assert.throws(()=>demoRanking(freshState(),'ovens',5),/available topic/);
});

test('backend adapter uses scoped IDs and exact answer schema',async()=>{
 const id='s0-d0-PE27-00001-PE27-00002',calls=[];
 const raw={meeting_id:id,rater_id:'PE27-00001',partner:{id:'PE27-00002',name:'Partner',title:'Owner',company:'Pizza'},graph_revision:0,survey_revision:0,complete:false,current_question_id:'met',questions:[{question_id:'met',version:1,text:'Did you meet?',required:true,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}],answers:{}};
 const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>url.includes('/attendees/')?{id:'PE27-00001',name:'Rater'}:raw};};
 const client=createGraphClient(createRestClient({base:'https://example.test/api',fetcher}));
 assert.equal((await client.survey(id,'PE27-00001')).currentQuestion.id,'met');
 await client.answerSurvey(id,'PE27-00001',{questionId:'met',answerKey:'yes',questionVersion:1,surveyRevision:0});
 assert.equal(calls[1].url,'https://example.test/api/sessions/0/dates/0/meetings/PE27-00001/questions');
 assert.deepEqual(JSON.parse(calls[3].options.body),{answers:[{question_id:'met',value:'yes'}]});
 await assert.rejects(client.survey(id,'PE27-99999'),/participant/);
});

test('check-in surveys use the check-in routes',async()=>{
 const id='c3-PE27-00001-PE27-00002',calls=[];
 const raw={meeting_id:id,rater_id:'PE27-00002',context:'checkin',partner:{id:'PE27-00001',name:'Scanner',title:'Owner',company:'Pizza'},graph_revision:3,survey_revision:0,complete:false,current_question_id:'act',questions:[{question_id:'act',version:1,kind:'act',text:'Would you act?',required:true,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}],answers:{}};
 const fetcher=async url=>{calls.push(url);return {ok:true,status:200,json:async()=>url.includes('/attendees/')?{id:'PE27-00002',name:'Scanned'}:raw};};
 const client=createGraphClient(createRestClient({base:'',fetcher}));
 const survey=await client.survey(id,'PE27-00002');
 assert.equal(calls[1],'/checkins/PE27-00002/PE27-00001/questions');assert.equal(survey.context,'checkin');
});

test('FastAPI detail errors surface without fixture fallback',async()=>{
 const request=createRestClient({base:'https://example.test',fetcher:async()=>({ok:false,status:409,json:async()=>({detail:'date is not open'})})});
 await assert.rejects(request('/sessions/0'),/date is not open/);
});

test('resource observation serializes refreshes and ignores results after cleanup',async()=>{
  let resolve,inFlight=0,maxInFlight=0,values=[];
  const watch=observeResource({load:()=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);return new Promise(done=>{resolve=value=>{inFlight--;done(value);};});},onValue:value=>values.push(value),onError:error=>assert.fail(error.message),interval:10000,visible:()=>true});
  watch.refresh();watch.refresh();
  assert.equal(maxInFlight,1);resolve('first');
  await new Promise(done=>setTimeout(done,5));
  assert.deepEqual(values,['first']);assert.equal(maxInFlight,1);
  watch.stop();resolve('late');await Promise.resolve();
  assert.deepEqual(values,['first']);
});
