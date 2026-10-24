import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,completeProfile,agendaFor,updateAssignment,applyBoothFeedback,snapshot} from '../src/demo.js';
import {demoSurvey,answerDemoSurvey} from '../src/demo-graph.js';

function attendee(){const state=freshState();return completeProfile(state,{...state.profile,goals:['suppliers'],focus:'tomatoes'});}
function answer(state,id,key){const survey=demoSurvey(state,id,'paul');return answerDemoSurvey(state,id,'paul',{questionId:survey.currentQuestion.id,questionVersion:survey.currentQuestion.version,surveyRevision:survey.surveyRevision,answerKey:key});}

test('the demo assigns times and places without a scan, request, or RSVP',()=>{
  const state=attendee();
  assert.deepEqual(agendaFor(state).map(stop=>stop.id),['meet-theo','tomato-table','meet-maya']);
  assert.ok(agendaFor(state).every(stop=>stop.status==='scheduled'&&stop.time&&stop.location));
  assert.deepEqual(state.requestedIds,[]);assert.deepEqual(state.encounters,[]);
  assert.equal(state.boothInvitationStatus,undefined);
});
test('checking in is not feedback and finishing requires persisted feedback before another stop',()=>{
  const here=updateAssignment(attendee(),'meet-theo','check_in');
  assert.equal(agendaFor(here)[0].status,'checked_in');
  assert.equal(here.feedback,null);
  assert.strictEqual(updateAssignment(here,'meet-theo','check_in'),here);
  assert.throws(()=>updateAssignment(here,'tomato-table','check_in'),/current stop/);
  const due=JSON.parse(JSON.stringify(updateAssignment(here,'meet-theo','finish')));
  assert.equal(snapshot(due).agenda[0].status,'feedback_due');
  assert.throws(()=>updateAssignment(due,'tomato-table','check_in'),/feedback first/);
  const partial=answer(due,'meet-theo','yes');
  assert.equal(agendaFor(partial)[0].status,'feedback_due');
  const done=answer(partial,'meet-theo','flour');
  assert.equal(agendaFor(done)[0].status,'completed');
  assert.ok(agendaFor(done).some(stop=>stop.id==='meet-elena'));
});
test('a later assigned peer has its own survey and stays fixed while its answers change priorities',()=>{
  let state=updateAssignment(attendee(),'meet-maya','check_in');
  state=updateAssignment(state,'meet-maya','finish');
  state=answer(state,'meet-maya','yes');
  state=answer(state,'meet-maya','equipment');
  const survey=demoSurvey(state,'meet-maya','paul');
  assert.equal(survey.subject.id,'maya');assert.equal(survey.complete,true);
  assert.equal(demoSurvey(state,'meet-theo','paul').complete,false);
  assert.equal(agendaFor(state).find(stop=>stop.id==='meet-maya').status,'completed');
  assert.ok(!agendaFor(state).some(stop=>stop.id==='meet-nia'));
});
test('booth arrival, finished visit, and usefulness remain distinct without accepting an invite',()=>{
  const here=updateAssignment(attendee(),'tomato-table','check_in');
  assert.equal(here.boothInvitationStatus,undefined);
  assert.ok(here.boothVisit.checkedInAt);assert.equal(here.boothVisit.feedback,null);
  assert.equal(agendaFor(here).find(stop=>stop.kind==='booth').status,'checked_in');
  const due=updateAssignment(here,'tomato-table','finish');
  assert.equal(agendaFor(due).find(stop=>stop.kind==='booth').status,'feedback_due');
  const done=applyBoothFeedback(due,'tomato-table','no');
  assert.equal(agendaFor(done).find(stop=>stop.kind==='booth').status,'completed');
  assert.equal(done.feedback,null);assert.deepEqual(done.encounters,[]);
});
test('unavailability is not an attendance or usefulness signal and survives goal changes',()=>{
  const missed=updateAssignment(attendee(),'meet-maya','miss');
  assert.equal(missed.feedback,null);assert.equal(missed.surveyAnswers,undefined);
  const edited=completeProfile(missed,{...missed.profile,goalFocus:{suppliers:'flour'}});
  assert.equal(agendaFor(edited).find(stop=>stop.id==='meet-maya').status,'missed');
  assert.throws(()=>updateAssignment(edited,'meet-maya','check_in'),/already/);
  assert.throws(()=>updateAssignment(attendee(),'tomato-table','finish'),/already/);
});
