import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,completeProfile,agendaFor,updateAssignment,applyBoothFeedback,snapshot} from '../src/demo.js';
import {demoSurvey,answerDemoSurvey} from '../src/demo-graph.js';
import {demoMeetings as M} from '../src/demo-agenda.js';
import {persona as P,boothInvitation} from '../src/data/pizza-expo.js';

function attendee(){const state=freshState();return completeProfile(state,{...state.profile,goals:['suppliers'],focus:'tomatoes-sauce'});}
function answer(state,id,key){const survey=demoSurvey(state,id,P.paul);return answerDemoSurvey(state,id,P.paul,{questionId:survey.currentQuestion.id,questionVersion:survey.currentQuestion.version,surveyRevision:survey.surveyRevision,answerKey:key});}
/** Answer every question with its first option (met yes, claims true, act yes, meet_again yes). */
function complete(state,id){while(!demoSurvey(state,id,P.paul).complete)state=answer(state,id,demoSurvey(state,id,P.paul).currentQuestion.choices[0].id);return state;}

test('the demo assigns 4 dates with times and places, in the backend meeting-id format',()=>{
  const state=attendee();
  assert.deepEqual(agendaFor(state).map(stop=>stop.id),[M.theo,M.maya,M.elena,M.samir]);
  assert.match(M.theo,/^s0-d0-PE27-\d{5}-PE27-\d{5}$/);
  assert.deepEqual(agendaFor(state).map(stop=>stop.date),[0,1,2,3]);
  assert.ok(agendaFor(state).every(stop=>stop.status==='scheduled'&&stop.time&&stop.location&&stop.topicId));
  assert.deepEqual(state.requestedIds,[]);assert.deepEqual(state.encounters,[]);
  assert.equal(state.boothInvitationStatus,undefined);
});
test('checking in is not feedback and finishing requires persisted feedback before another stop',()=>{
  const here=updateAssignment(attendee(),M.theo,'check_in');
  assert.equal(agendaFor(here)[0].status,'checked_in');
  assert.equal(here.feedback,null);
  assert.strictEqual(updateAssignment(here,M.theo,'check_in'),here);
  assert.throws(()=>updateAssignment(here,M.maya,'check_in'),/current stop/);
  const due=JSON.parse(JSON.stringify(updateAssignment(here,M.theo,'finish')));
  assert.equal(snapshot(due).agenda[0].status,'feedback_due');
  assert.throws(()=>updateAssignment(due,M.maya,'check_in'),/feedback first/);
  const partial=answer(due,M.theo,'yes');
  assert.equal(agendaFor(partial)[0].status,'feedback_due');
  const done=complete(partial,M.theo);
  assert.equal(agendaFor(done)[0].status,'completed');
  assert.ok(agendaFor(done).some(stop=>stop.id===M.elena));
});
test('a later assigned peer has its own survey and stays fixed while its answers are saved',()=>{
  let state=updateAssignment(attendee(),M.maya,'check_in');
  state=updateAssignment(state,M.maya,'finish');
  state=complete(state,M.maya);
  const survey=demoSurvey(state,M.maya,P.paul);
  assert.equal(survey.subject.id,P.maya);assert.equal(survey.complete,true);
  assert.equal(demoSurvey(state,M.theo,P.paul).complete,false);
  assert.equal(agendaFor(state).find(stop=>stop.id===M.maya).status,'completed');
  assert.ok(!agendaFor(state).some(stop=>stop.personId===P.nia));
});
test('legacy accepted booth history still supports arrival and booth feedback',()=>{
  const id=boothInvitation.id;
  const here=updateAssignment({...attendee(),boothInvitationStatus:'accepted'},id,'check_in');
  assert.equal(here.boothInvitationStatus,'accepted');
  assert.ok(here.boothVisit.checkedInAt);assert.equal(here.boothVisit.feedback,null);
  assert.equal(agendaFor(here).find(stop=>stop.kind==='booth').status,'checked_in');
  const due=updateAssignment(here,id,'finish');
  assert.equal(agendaFor(due).find(stop=>stop.kind==='booth').status,'feedback_due');
  const done=applyBoothFeedback(due,id,'no');
  assert.equal(agendaFor(done).find(stop=>stop.kind==='booth').status,'completed');
  assert.equal(done.feedback,null);assert.deepEqual(done.encounters,[]);
});
test('unavailability is not an attendance or survey signal and survives goal changes',()=>{
  const missed=updateAssignment(attendee(),M.maya,'miss');
  assert.equal(missed.feedback,null);assert.equal(missed.surveyAnswers,undefined);
  const edited=completeProfile(missed,{...missed.profile,goalFocus:{suppliers:'dough-flour'}});
  assert.equal(agendaFor(edited).find(stop=>stop.id===M.maya).status,'missed');
  assert.throws(()=>updateAssignment(edited,M.maya,'check_in'),/already/);
  assert.throws(()=>updateAssignment(attendee(),M.maya,'finish'),/already/);
});
test('all four dates remain fixed for the hour; readiness requires every date to resolve',()=>{
  let state=attendee();const lineup=agendaFor(state);
  assert.equal(snapshot(state).session.total,4);assert.equal(snapshot(state).session.ready,false);
  state=complete(state,M.theo);
  state=completeProfile(state,{...state.profile,goalFocus:{suppliers:'dough-flour'}});
  assert.deepEqual(agendaFor(state).map(({id,time})=>({id,time})),lineup.map(({id,time})=>({id,time})));
  assert.equal(snapshot(state).session.resolved,1);
  for(const id of [M.maya,M.elena,M.samir])state=answer(state,id,'no');  // "We didn't meet"
  assert.equal(snapshot(state).session.ready,true);assert.equal(snapshot(state).session.resolved,4);
  assert.equal(agendaFor(state).find(stop=>stop.id===M.maya).status,'missed');
});
