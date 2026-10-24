import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, requestMeeting, meetingRequestsFor, respondToMeeting, peerInbox, recordEncounter, respondToInvitation, checkInBooth, applyBoothFeedback, applyFeedback, snapshot } from '../src/demo.js';

function invited() {
  const state=freshState();
  state.profile.goals=['suppliers']; state.profile.focus='tomatoes';
  return recordEncounter(state,'PIZZA-MAYA').state;
}

test('a peer accepts their incoming request without inventing attendance or feedback',()=>{
  const requested=requestMeeting(freshState(),'elena');
  const inbox=peerInbox(requested,'elena');
  assert.equal(inbox.viewer.id,'elena'); assert.equal(inbox.requests[0].sender.name,'Paul Rossi');
  assert.equal(peerInbox(requested,'nia').requests.length,0);
  const id=inbox.requests[0].id;
  assert.throws(()=>respondToMeeting(requested,id,'accepted','paul'),/not addressed/);
  assert.throws(()=>respondToMeeting(requested,id,'accepted','nia'),/not addressed/);
  const accepted=respondToMeeting(requested,id,'accepted','elena');
  const request=snapshot(accepted).meetingRequests[0];
  assert.equal(request.status,'accepted'); assert.ok(request.respondedAt);
  assert.equal(request.time,inbox.requests[0].time); assert.equal(request.location,inbox.requests[0].location);
  assert.equal(requested.meetingRequests[0].status,'pending');
  assert.deepEqual(accepted.encounters,[]); assert.equal(accepted.feedback,null); assert.equal(accepted.boothVisit,undefined);
  assert.strictEqual(respondToMeeting(accepted,id,'accepted','elena'),accepted);
  assert.strictEqual(requestMeeting(accepted,'elena'),accepted);
  assert.throws(()=>respondToMeeting(accepted,id,'declined','elena'),/already/);
});

test('declines and legacy requests keep distinct persisted states',()=>{
  const legacy={...freshState(),requestedIds:['elena']};
  const request=meetingRequestsFor(legacy)[0];
  assert.equal(request.createdAt,null);
  assert.equal(meetingRequestsFor(requestMeeting(legacy,'elena')).length,1);
  assert.throws(()=>respondToMeeting(legacy,request.id,'yes','elena'),/Choose/);
  const declined=respondToMeeting(legacy,request.id,'declined','elena');
  assert.equal(snapshot(JSON.parse(JSON.stringify(declined))).meetingRequests[0].status,'declined');
  assert.equal(declined.encounters.length,0);
});

test('booth check-in requires acceptance and is idempotent, separate from usefulness',()=>{
  const pending=invited();
  assert.throws(()=>checkInBooth(pending,'tomato-table'),/Accept/);
  assert.throws(()=>checkInBooth(respondToInvitation(pending,'tomato-table','declined'),'tomato-table'),/Accept/);
  const accepted=respondToInvitation(pending,'tomato-table','accepted');
  assert.equal(snapshot(accepted).invitation.visit,null);
  assert.throws(()=>checkInBooth(accepted,'wrong'),/Accept/);
  assert.throws(()=>applyBoothFeedback(accepted,'tomato-table','yes'),/Check in/);
  const checked=checkInBooth(accepted,'tomato-table');
  assert.ok(checked.boothVisit.checkedInAt); assert.equal(checked.boothVisit.feedback,null);
  assert.strictEqual(checkInBooth(checked,'tomato-table'),checked);
  assert.equal(checked.encounters.length,1); assert.equal(checked.feedback,null);
  assert.throws(()=>respondToInvitation(checked,'tomato-table','declined'),/already checked/);
});

test('one-tap booth feedback can be updated without overwriting arranged-meeting feedback',()=>{
  const arranged=applyFeedback(invited(),{usefulness:'somewhat',next:'tomatoes'});
  const checked=checkInBooth(respondToInvitation(arranged,'tomato-table','accepted'),'tomato-table');
  assert.throws(()=>applyBoothFeedback(checked,'wrong','yes'),/Check in/);
  assert.throws(()=>applyBoothFeedback(checked,'tomato-table','bogus'),/Choose/);
  const useful=applyBoothFeedback(checked,'tomato-table','yes');
  assert.strictEqual(applyBoothFeedback(useful,'tomato-table','yes'),useful);
  const revised=applyBoothFeedback(useful,'tomato-table','no');
  const restored=snapshot(JSON.parse(JSON.stringify(revised)));
  assert.equal(restored.invitation.visit.feedback.usefulness,'no');
  assert.equal(restored.invitation.visit.checkedInAt,checked.boothVisit.checkedInAt);
  assert.deepEqual(revised.feedback,arranged.feedback);
  assert.deepEqual(revised.encounters,arranged.encounters);
});

test('outstanding meetup feedback survives persistence and clears only with a valid answer',()=>{
  const due={...freshState(),meetingFeedbackDue:true};
  assert.equal(snapshot(JSON.parse(JSON.stringify(due))).meeting.feedbackRequired,true);
  assert.throws(()=>applyFeedback(due,{usefulness:''}),/Choose/);
  assert.equal(snapshot(due).meeting.feedbackRequired,true);
  const answered=applyFeedback(due,{usefulness:'didnt_meet'});
  assert.equal(snapshot(answered).meeting.feedbackRequired,false);
  assert.equal(answered.feedback.attendance,'not_met');
  assert.equal(answered.encounters.length,0);
});
