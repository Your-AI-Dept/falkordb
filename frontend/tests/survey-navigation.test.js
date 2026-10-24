import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,completeProfile,agendaFor,updateAssignment} from '../src/demo.js';
import {demoSurvey,answerDemoSurvey} from '../src/demo-graph.js';
import {meetingPreferences,restoreMeetingTopic} from '../src/meeting-preferences.js';
import {homeLink,attendeeLink} from '../src/navigation.js';
import {reconcileSurvey} from '../src/graph-contract.js';
const id='meet-theo';
function attendee(){const state=freshState();return completeProfile(state,{...state.profile,goals:['suppliers'],focus:'tomatoes'});}
function answer(state,respondent,key,extra={}){
  const survey=demoSurvey(state,id,respondent),q=survey.currentQuestion;
  return answerDemoSurvey(state,id,respondent,{questionId:q.id,questionVersion:q.version,surveyRevision:survey.surveyRevision,answerKey:key,...extra});
}
function revise(state,respondent,questionId,key,extra={}){
  const survey=demoSurvey(state,id,respondent),q=survey.questions.find(item=>item.id===questionId);
  return answerDemoSurvey(state,id,respondent,{questionId:q.id,questionVersion:q.version,surveyRevision:survey.surveyRevision,answerKey:key,...extra},{revise:true});
}
test('reviewing does not mutate evidence; changing usefulness invalidates only the same respondent and meeting follow-up',()=>{
  let state=answer(answer(attendee(),'paul','yes'),'paul','flour');
  state=answer(answer(state,'theo','yes'),'theo','equipment');
  const original=JSON.stringify(state),before=demoSurvey(state,id,'paul');
  assert.equal(before.questions.length,2);assert.equal(before.complete,true);
  assert.equal(before.questions[1].choices.find(choice=>choice.id==='flour').label,'Flour & fermentation');
  assert.equal(JSON.stringify(state),original);
  const otherAnswers=demoSurvey(state,id,'theo').answers;
  const updated=revise(state,'paul','usefulness','no');
  assert.equal(demoSurvey(updated,id,'paul').complete,false);
  assert.equal(demoSurvey(updated,id,'paul').currentQuestion.id,'better-fit');
  assert.deepEqual(demoSurvey(updated,id,'theo').answers,otherAnswers);
  assert.equal(updated.feedback.next,'');
  assert.equal(agendaFor(updated)[0].status,'feedback_due');
  assert.equal(demoSurvey(answer(updated,'paul','stage'),id,'paul').complete,true);
});
test('editing a later answer preserves the revealed lineup and rejects stale edits',()=>{
  let state=answer(answer(attendee(),'paul','yes'),'paul','flour');
  const usefulness=demoSurvey(state,id).answers[0];
  const revision=state.graphRevision;
  state=revise(state,'paul','next-priority','equipment');
  assert.equal(state.feedback.next,'equipment');
  assert.deepEqual(agendaFor(state).map(stop=>stop.id),['meet-theo','meet-maya','meet-elena','meet-samir']);
  assert.deepEqual(demoSurvey(state,id).answers[0],usefulness);
  assert.equal(state.surveyAnswers.length,2);
  assert.strictEqual(revise(state,'paul','next-priority','equipment'),state);
  assert.throws(()=>revise(state,'paul','next-priority','flour',{surveyRevision:revision}),error=>error.status===409);
});
test('something else requires explicit text and stores it without inventing a structured topic or expertise',()=>{
  const state=answer(attendee(),'theo','yes');
  assert.throws(()=>answer(state,'theo','other'),/short answer/);
  assert.throws(()=>answer(state,'theo','other',{answerText:'   '}),/short answer/);
  assert.throws(()=>answer(state,'theo','other',{answerText:'x'.repeat(301)}),/short answer/);
  const done=answer(state,'theo','other',{answerText:'  Hiring a kitchen manager  '});
  assert.equal(demoSurvey(done,id,'theo').complete,true);
  const saved=demoSurvey(done,id,'theo').answers[1];
  assert.equal(saved.answerText,'Hiring a kitchen manager');
  assert.equal(saved.answerLabel,saved.answerText);
  assert.equal(done.feedback,null);
  assert.equal(saved.preference,undefined);
  assert.equal(agendaFor(done)[0].status,'scheduled');
});
test('a topic pause is saved for future sessions without removing the revealed lineup, and can be undone',()=>{
  const state=answer(answer(attendee(),'paul','yes'),'paul','no_similar');
  assert.deepEqual(meetingPreferences(state).map(item=>item.topicId),['tomatoes']);
  assert.ok(agendaFor(state).some(stop=>stop.id==='meet-maya'));
  assert.equal(agendaFor(state).find(stop=>stop.id===id).status,'completed');
  assert.equal(agendaFor(state).filter(stop=>stop.kind==='meeting').length,4);
  assert.equal(state.feedback.usefulness,'yes');assert.equal(state.feedback.next,'');
  const restored=restoreMeetingTopic(JSON.parse(JSON.stringify(state)),'paul','tomatoes');
  assert.equal(meetingPreferences(restored).length,0);
  assert.ok(agendaFor(restored).some(stop=>stop.id==='meet-maya'));
  assert.equal(demoSurvey(restored,id).complete,true);
  const pausedAgain=revise(restored,'paul','next-priority','no_similar');
  assert.equal(meetingPreferences(pausedAgain).length,1);
  assert.strictEqual(revise(pausedAgain,'paul','next-priority','no_similar'),pausedAgain);
  const changed=revise(state,'paul','next-priority','flour');
  assert.equal(meetingPreferences(changed).length,0);
  assert.ok(agendaFor(changed).some(stop=>stop.id==='meet-elena'));
});
test('a peer preference never changes Paul’s schedule; an already-started meeting survives a pause',()=>{
  const peer=answer(answer(attendee(),'theo','yes'),'theo','no_similar');
  assert.equal(meetingPreferences(peer).length,0);
  assert.equal(meetingPreferences(peer,'theo').length,1);
  assert.ok(agendaFor(peer).some(stop=>stop.id==='meet-maya'));
  let state=answer(answer(attendee(),'paul','yes'),'paul','tomatoes');
  state=updateAssignment(state,'meet-maya','check_in');
  state=revise(state,'paul','next-priority','no_similar');
  assert.equal(agendaFor(state).find(stop=>stop.id==='meet-maya').status,'checked_in');
});
test('a revised first answer replaces an invalid follow-up on another tab',()=>{
  const state=answer(attendee(),'paul','yes');
  const displayed=demoSurvey(state,id,'paul');
  const changed=demoSurvey(revise(state,'paul','usefulness','no'),id,'paul');
  assert.equal(reconcileSurvey(displayed,changed).currentQuestion.id,'better-fit');
});
test('home navigation retains attendee persona and exhibitor context without carrying survey routes',()=>{
  assert.equal(homeLink('?view=survey&meeting=meet-theo&participant=theo'),'?view=attendee&participant=theo');
  assert.equal(homeLink('?view=exhibitor'),'?view=exhibitor');
  assert.equal(homeLink('?view=rankings&participant=paul'),'?view=attendee');
  assert.equal(attendeeLink('rankings','theo'),'?view=rankings&participant=theo');
});
