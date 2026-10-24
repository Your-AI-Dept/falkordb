import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, completeProfile, recordEncounter, recommendations, applyFeedback, requestMeeting, invitationFor, respondToInvitation, goalAnswers, toggleProfileGoal, focusQuestion } from '../src/demo.js';
function supplier(){const s=freshState();return completeProfile(s,{...s.profile,goals:['suppliers'],focus:'tomatoes'});}
test('onboarding accepts a broad goal without forcing an answer to optional questions',()=>{
  const state=freshState();const next=completeProfile(state,{...state.profile,goals:[]});
  assert.equal(next.onboardingComplete,true);assert.equal(next.profile.focus,'');assert.equal(state.onboardingComplete,false);
  assert.throws(()=>completeProfile(state,{...state.profile,name:' '}),/name/);
  assert.throws(()=>completeProfile(state,{...state.profile,linkedin:'https://wrong.example/me'}),/LinkedIn|linkedin/);
});
test('QR saves are directional, idempotent, and never add survey feedback',()=>{
  const state=supplier();const result=recordEncounter(state,'http://localhost/?badge=PIZZA-MAYA');
  assert.equal(result.state.encounters.length,1);assert.equal(state.encounters.length,0);assert.equal(result.state.feedback,null);
  assert.equal(result.state.encounters[0].kind,'chosen_qr_connection');
  assert.equal(recordEncounter(result.state,' pizza-maya ').duplicate,true);
  assert.throws(()=>recordEncounter(state,'PIZZA-PAUL'),/own badge/);
  assert.throws(()=>recordEncounter(state,'unknown'),/not found/);
});
test('connection evidence appears only after the chosen connection exists',()=>{
  const initial=recommendations(supplier())[0];assert.equal(initial.person.id,'luca');assert.deepEqual(initial.path,[]);
  const next=recordEncounter(supplier(),'PIZZA-MAYA').state;const after=recommendations(next)[0];
  assert.deepEqual(after.path.map(n=>n.id),['you','maya','luca']);
  assert.match(after.reason,/saved Maya’s badge/);
  assert.match(after.reason,/professional connection/);
  assert.ok(!after.reason.includes(after.person.offering.toLowerCase()));
  assert.ok(recommendations(next).every(r=>r.person.id!=='maya'));
});
test('recommendation reasons require a matching signal, not just any goal or feedback',()=>{
  const empty=freshState();
  const broad=completeProfile(empty,{...empty.profile,goals:['peers']});
  assert.ok(recommendations(broad).every(item=>!item.reason&&!item.source));
  const focused=completeProfile(broad,{...broad.profile,goalFocus:{peers:'tomatoes'}});
  const maya=recommendations(focused).find(item=>item.person.id==='maya');
  assert.equal(maya.source,'Shared topic');
  assert.match(maya.reason,/Ingredient sourcing/);
  assert.ok(!recommendations(focused).find(item=>item.person.id==='elena').reason);
  const updated=recommendations(applyFeedback(focused,{usefulness:'yes',next:'flour'}));
  assert.equal(updated.find(item=>item.person.id==='elena').source,'Matches your latest feedback');
  assert.equal(updated.find(item=>item.person.id==='maya').source,'Shared topic');
  assert.ok(!updated.find(item=>item.person.id==='nia').reason);
});
test('missed meetings and optional feedback cannot masquerade as useful encounters',()=>{
  const initial=supplier();const missed=applyFeedback(initial,{usefulness:'didnt_meet',next:'flour'});
  assert.equal(missed.feedback.attendance,'not_met');assert.equal(missed.feedback.next,'');assert.equal(missed.encounters.length,0);
  assert.equal(recommendations(missed)[0].person.id,'luca');
  const useful=applyFeedback(initial,{usefulness:'yes'});
  assert.equal(useful.feedback.attendance,'reported_attended');assert.equal(useful.feedback.next,'');
  const refined=applyFeedback(initial,{usefulness:'yes',next:'flour'});
  assert.equal(recommendations(refined)[0].person.id,'elena');
  assert.throws(()=>applyFeedback(initial,{usefulness:'yes',next:'bogus'}));
});
test('requests are deduplicated and do not create meetings or encounters',()=>{
  const s=requestMeeting(supplier(),'luca');const next=requestMeeting(s,'luca');
  assert.deepEqual(next.requestedIds,['luca']);assert.equal(next.encounters.length,0);assert.equal(next.feedback,null);
  assert.throws(()=>requestMeeting(next,'unknown'));
});
test('profile edits remove a stale focus and suppressed people stay suppressed',()=>{
  const s=supplier();const edited=completeProfile(s,{...s.profile,goals:['growth'],focus:'tomatoes'});
  assert.equal(edited.profile.focus,'');
  assert.ok(recommendations({...s,dismissedIds:['luca']}).every(r=>r.person.id!=='luca'));
});
test('a relevant connection opens a booth invitation; accepting is not attendance',()=>{
  const s=supplier();assert.equal(invitationFor(s),null);
  assert.throws(()=>respondToInvitation(s,'tomato-table','accepted'),/no longer/);
  const connected=recordEncounter(s,'PIZZA-MAYA').state;
  assert.equal(invitationFor(connected).status,'pending');
  const accepted=respondToInvitation(connected,'tomato-table','accepted');
  assert.equal(invitationFor(accepted).status,'accepted');
  assert.equal(accepted.encounters.length,1);assert.equal(accepted.feedback,null);
  assert.equal(invitationFor(respondToInvitation(accepted,'tomato-table','accepted')).status,'accepted');
  const declined=respondToInvitation(accepted,'tomato-table','declined');
  assert.equal(invitationFor(declined).status,'declined');
  const unrelated=recordEncounter(completeProfile(s,{...s.profile,goalFocus:{suppliers:'flour'}}),'PIZZA-MAYA').state;
  assert.equal(invitationFor(unrelated),null);
});
test('multiple goals retain independent follow-ups through save, reload, and deselection',()=>{
  const initial=supplier();
  let profile=toggleProfileGoal(initial.profile,'peers');
  assert.equal(focusQuestion(profile,'suppliers').title,'What are you looking for?');
  assert.equal(focusQuestion(profile,'peers').title,'What would you like to compare notes on?');
  profile={...profile,goalFocus:{...goalAnswers(profile),peers:'flour'}};
  const saved=JSON.parse(JSON.stringify(completeProfile(initial,profile)));
  assert.deepEqual(goalAnswers(saved.profile),{suppliers:'tomatoes',peers:'flour'});
  assert.deepEqual(recommendations(saved).slice(0,2).map(r=>r.person.id),['luca','elena']);
  const removed=toggleProfileGoal(saved.profile,'suppliers');
  assert.deepEqual(goalAnswers(removed),{peers:'flour'});assert.equal(removed.focus,'flour');
  assert.equal(toggleProfileGoal(removed,'suppliers').goalFocus.suppliers,undefined);
});
test('every selectable goal has its own follow-up and legacy profiles still load',()=>{
  const profile=freshState().profile;
  for(const goal of ['suppliers','peers','growth','explore'])assert.ok(focusQuestion(profile,goal)?.choices.length);
  assert.deepEqual(goalAnswers({...profile,goals:['suppliers'],focus:'tomatoes'}),{suppliers:'tomatoes'});
  const cleared=completeProfile(freshState(),{...profile,goals:['suppliers'],focus:'tomatoes',goalFocus:{suppliers:''}});
  assert.equal(cleared.profile.focus,'');
});
