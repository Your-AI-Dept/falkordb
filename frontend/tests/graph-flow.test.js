import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,snapshot} from '../src/demo.js';
import {demoSurvey,answerDemoSurvey,demoRanking} from '../src/demo-graph.js';
import {validateSurvey,validateRanking,reconcileSurvey} from '../src/graph-contract.js';
import {createRestClient} from '../src/rest.js';
import {createGraphClient} from '../src/graph-api.js';
import {observeResource} from '../src/observe-resource.js';
const meetingId='meet-theo';
function answer(state,respondentId,key){const survey=demoSurvey(state,meetingId,respondentId),q=survey.currentQuestion;return answerDemoSurvey(state,meetingId,respondentId,{questionId:q.id,questionVersion:q.version,answerKey:key,surveyRevision:survey.surveyRevision});}

test('opposing participant responses remain directional and select different required questions',()=>{
  let state=answer(freshState(),'paul','yes');
  const paulNext=demoSurvey(state,meetingId,'paul');
  assert.equal(paulNext.complete,false);assert.equal(paulNext.currentQuestion.id,'next-priority');
  state=answer(state,'theo','no');
  const theoNext=demoSurvey(state,meetingId,'theo');
  assert.equal(theoNext.complete,false);assert.equal(theoNext.currentQuestion.id,'better-fit');
  assert.equal(theoNext.answers[0].respondentId,'theo');assert.equal(theoNext.answers[0].subjectId,'paul');
  assert.equal(theoNext.answers[0].answerKey,'no');
  assert.equal(demoSurvey(state,meetingId,'paul').answers[0].answerKey,'yes');
  assert.ok(theoNext.answers.every(value=>value.respondentId==='theo'));
  assert.equal(state.encounters.length,0);
  assert.equal(snapshot(state).meeting.feedbackRequired,true);
  state=answer(state,'paul','tomatoes');state=answer(state,'theo','stage');
  const restored=JSON.parse(JSON.stringify(state));
  assert.equal(validateSurvey(demoSurvey(restored,meetingId,'paul')).complete,true);
  assert.equal(demoSurvey(restored,meetingId,'theo').complete,true);
  assert.equal(restored.graphRevision,4);
  assert.equal(restored.surveyAnswers.length,4);
  assert.equal(snapshot(restored).meeting.feedbackRequired,false);
});

test('missed meetings end the survey without manufacturing usefulness or attendance',()=>{
  const state=answer(freshState(),'paul','didnt_meet');
  assert.equal(demoSurvey(state,meetingId,'paul').complete,true);
  assert.equal(state.feedback.attendance,'not_met');assert.equal(state.feedback.next,'');
  assert.equal(demoSurvey(state,meetingId,'theo').answers.length,0);
  assert.throws(()=>demoSurvey(state,meetingId,'unknown'),/not available/);
});

test('retries are idempotent and stale changed answers cannot overwrite stored evidence',()=>{
  const payload={questionId:'usefulness',questionVersion:1,answerKey:'yes',surveyRevision:0};
  const state=answerDemoSurvey(freshState(),meetingId,'paul',payload);
  assert.strictEqual(answerDemoSurvey(state,meetingId,'paul',payload),state);
  assert.throws(()=>answerDemoSurvey(state,meetingId,'paul',{...payload,answerKey:'no'}),error=>error.status===409);
  assert.throws(()=>answerDemoSurvey(freshState(),meetingId,'paul',{...payload,questionVersion:8}),error=>error.status===409);
  assert.throws(()=>answerDemoSurvey(freshState(),meetingId,'paul',{...payload,answerKey:'made-up'}),/available answers/);
});

test('live revisions update queued questions without replacing an unanswered active prompt',()=>{
  const current=demoSurvey(freshState(),meetingId);
  const changed={...current,graphRevision:10,surveyRevision:3,currentQuestion:{...current.currentQuestion,id:'graph-q-9',version:2,prompt:'What matters about your suppliers?'},queuedQuestions:[{...current.currentQuestion,id:'graph-q-10',prompt:'Which delivery schedule fits?'}]};
  const merged=reconcileSurvey(current,validateSurvey(changed));
  assert.equal(merged.currentQuestion.id,'usefulness');
  assert.deepEqual(merged.queuedQuestions.map(question=>question.id),['graph-q-9','graph-q-10']);
  assert.strictEqual(reconcileSurvey(merged,{...changed,graphRevision:2}),merged);
  assert.equal(reconcileSurvey(current,changed,{afterAnswer:true}).currentQuestion.id,'graph-q-9');
  assert.strictEqual(reconcileSurvey(current,{...changed,respondent:{id:'wrong',name:'Wrong'}}),current);
  assert.throws(()=>validateSurvey({...changed,complete:true}),/incomplete/);
  assert.throws(()=>validateSurvey({...current,currentQuestion:null}),/not available/);
});

test('rankings accept imported identities and preserve authoritative order; never pad sparse results',()=>{
  const result={topic:{id:'bd:topic/43',label:'Cheese procurement'},limit:5,graphRevision:41,status:'ready',items:[{rank:1,person:{id:'bd-917',name:'A new supplier',company:'Imported Company'},reason:'Can supply your target region',profileSource:{kind:'bright_data',sourceId:'917'}}]};
  assert.strictEqual(validateRanking(result,'bd:topic/43',5),result);
  assert.equal(demoRanking(freshState(),'equipment',20).items.length,2);
  assert.throws(()=>validateRanking({...result,items:[{...result.items[0],rank:7}]},'bd:topic/43',5),/unsupported/);
  assert.throws(()=>validateRanking(result,'wrong-topic',5),/unsupported/);
});

test('backend adapter uses scoped IDs and exact answer schema without the obsolete event prefix',async()=>{
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
