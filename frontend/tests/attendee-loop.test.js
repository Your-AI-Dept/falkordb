import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, requestMeeting, meetingRequestsFor, respondToMeeting, peerInbox, recordEncounter, respondToInvitation, checkInBooth, applyBoothFeedback, applyFeedback, snapshot } from '../src/demo.js';
import { persona as P, boothInvitation } from '../src/data/pizza-expo.js';
const booth = boothInvitation.id;

function invited() {
  const state=freshState();
  state.profile.goals=['suppliers']; state.profile.focus='tomatoes-sauce';
  return recordEncounter(state,P.maya).state;
}

test('a peer accepts their incoming request without inventing attendance or feedback',()=>{
  const requested=requestMeeting(freshState(),P.elena);
  const inbox=peerInbox(requested,P.elena);
  assert.equal(inbox.viewer.id,P.elena); assert.equal(inbox.requests[0].sender.name,'Drita Krasniqi');
  assert.equal(peerInbox(requested,P.nia).requests.length,0);
  const id=inbox.requests[0].id;
  assert.throws(()=>respondToMeeting(requested,id,'accepted',P.paul),/not addressed/);
  assert.throws(()=>respondToMeeting(requested,id,'accepted',P.nia),/not addressed/);
  const accepted=respondToMeeting(requested,id,'accepted',P.elena);
  const request=snapshot(accepted).meetingRequests[0];
  assert.equal(request.status,'accepted'); assert.ok(request.respondedAt);
  assert.equal(request.time,inbox.requests[0].time); assert.equal(request.location,inbox.requests[0].location);
  assert.equal(requested.meetingRequests[0].status,'pending');
  assert.deepEqual(accepted.encounters,[]); assert.equal(accepted.feedback,null); assert.equal(accepted.boothVisit,undefined);
  assert.strictEqual(respondToMeeting(accepted,id,'accepted',P.elena),accepted);
  assert.strictEqual(requestMeeting(accepted,P.elena),accepted);
  assert.throws(()=>respondToMeeting(accepted,id,'declined',P.elena),/already/);
});

test('declines and legacy requests keep distinct persisted states',()=>{
  const legacy={...freshState(),requestedIds:[P.elena]};
  const request=meetingRequestsFor(legacy)[0];
  assert.equal(request.createdAt,null);
  assert.equal(meetingRequestsFor(requestMeeting(legacy,P.elena)).length,1);
  assert.throws(()=>respondToMeeting(legacy,request.id,'yes',P.elena),/Choose/);
  const declined=respondToMeeting(legacy,request.id,'declined',P.elena);
  assert.equal(snapshot(JSON.parse(JSON.stringify(declined))).meetingRequests[0].status,'declined');
  assert.equal(declined.encounters.length,0);
});

test('booth check-in requires acceptance and is idempotent, separate from usefulness',()=>{
  const pending=invited();
  assert.throws(()=>checkInBooth(pending,booth),/Accept/);
  assert.throws(()=>checkInBooth(respondToInvitation(pending,booth,'declined'),booth),/Accept/);
  const accepted=respondToInvitation(pending,booth,'accepted');
  assert.equal(snapshot(accepted).invitation.visit,null);
  assert.throws(()=>checkInBooth(accepted,'wrong'),/Accept/);
  assert.throws(()=>applyBoothFeedback(accepted,booth,'yes'),/Check in/);
  const checked=checkInBooth(accepted,booth);
  assert.ok(checked.boothVisit.checkedInAt); assert.equal(checked.boothVisit.feedback,null);
  assert.strictEqual(checkInBooth(checked,booth),checked);
  assert.equal(checked.encounters.length,1); assert.equal(checked.feedback,null);
  assert.throws(()=>respondToInvitation(checked,booth,'declined'),/already checked/);
});

test('one-tap booth feedback can be updated without overwriting arranged-meeting feedback',()=>{
  const arranged=applyFeedback(invited(),{usefulness:'somewhat',next:'tomatoes-sauce'});
  const checked=checkInBooth(respondToInvitation(arranged,booth,'accepted'),booth);
  assert.throws(()=>applyBoothFeedback(checked,'wrong','yes'),/Check in/);
  assert.throws(()=>applyBoothFeedback(checked,booth,'bogus'),/Choose/);
  const useful=applyBoothFeedback(checked,booth,'yes');
  assert.strictEqual(applyBoothFeedback(useful,booth,'yes'),useful);
  const revised=applyBoothFeedback(useful,booth,'no');
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
  assert.equal(answered.feedback.attendance,'not_met');
  assert.equal(answered.encounters.length,0);
});
