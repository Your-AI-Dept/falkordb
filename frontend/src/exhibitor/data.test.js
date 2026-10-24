import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../demo.js';
import { ATTENDEE_STORAGE_KEY, freshExhibitorState, makeBoothPlan, loadExhibitorState, EXHIBITOR_STORAGE_KEY, activation } from './data.js';

function eligibleAttendee(response) {
  const attendee = freshState();
  attendee.profile.goals = ['suppliers'];
  attendee.profile.focus = 'tomatoes';
  attendee.encounters = [{ personId: 'maya' }];
  if (response) attendee.boothInvitationStatus = response;
  return attendee;
}

function browserStorage(context, attendee) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
    localStorage: {
      getItem(key) { return key === ATTENDEE_STORAGE_KEY && attendee ? JSON.stringify(attendee) : null; },
      setItem() { assert.fail('The exhibitor plan must not mutate attendee storage.'); },
    },
  } });
  context.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
}

function guests(state = freshExhibitorState()) {
  return makeBoothPlan(state).flatMap(session => session.guests);
}

for (const response of [undefined, 'accepted', 'declined']) {
  test(`shared booth assignment preserves attendee context with legacy response ${response || 'none'}`, context => {
    const attendee = eligibleAttendee(response);
    attendee.profile.name = 'Paula Rossi';
    attendee.profile.company = 'North Beach Pizza Co.';
    attendee.profile.intention = 'Find a consistent tomato supplier for three pizzerias.';
    browserStorage(context, attendee);
    const paul = guests().find(person => person.id === 'paul');
    assert.equal(paul.status, response==='declined'?'unavailable':'assigned');
    assert.equal(paul.name, attendee.profile.name);
    assert.equal(paul.company, attendee.profile.company);
    assert.equal(paul.need, attendee.profile.intention);
    assert.equal(paul.invitationId, 'tomato-table');
    assert.equal(paul.appointment, 'Wednesday · 1:00–1:15 PM');
  });
}

test('a relevant attendee is scheduled at the booth without a scan or RSVP', context => {
  const attendee = eligibleAttendee();
  attendee.encounters = [];
  browserStorage(context, attendee);
  assert.equal(guests().find(person => person.id === 'paul').status, 'assigned');
});

test('unrelated exhibitor focus excludes the shared tomato invitation', context => {
  browserStorage(context, eligibleAttendee('accepted'));
  const state = freshExhibitorState();
  state.capability = 'equipment';
  state.focus = 'ovens';
  assert.equal(guests(state).some(person => person.id === 'paul'), false);
});

test('one contact and one fixed activation replace editable team schedules', context => {
  browserStorage(context, eligibleAttendee('accepted'));
  const state = freshExhibitorState();
  const plan = makeBoothPlan(state);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].contact.id, 'luca');
  assert.deepEqual(plan[0].window, activation);
  assert.equal('team' in state, false);
  assert.equal('confirmedCoverage' in state, false);
});

test('a different contact does not inherit Luca’s invitation', context => {
  browserStorage(context, eligibleAttendee('accepted'));
  const state = freshExhibitorState();
  state.contact = {id: 'another-contact', name: 'Another contact'};
  assert.equal(guests(state).some(person => person.id === 'paul'), false);
});

test('changing company or booth excludes the fixed Terra Rossa invitation', context => {
  browserStorage(context, eligibleAttendee('accepted'));
  const differentCompany = { ...freshExhibitorState(), company: 'Another Company' };
  const differentBooth = { ...freshExhibitorState(), booth: '500' };
  assert.equal(guests(differentCompany).some(person => person.id === 'paul'), false);
  assert.equal(guests(differentBooth).some(person => person.id === 'paul'), false);
});

test('earlier saved setup migrates its first contact and drops scheduling state', context => {
  browserStorage(context, null);
  window.localStorage.getItem = key => key === EXHIBITOR_STORAGE_KEY ? JSON.stringify({ version:2, complete:true, company:'Terra Rossa', booth:'412', capability:'ingredients', focus:'tomatoes', team:[{id:'luca',name:'Luca Rinaldi',expertise:'Tomatoes',window:'15'},{id:'sofia',name:'Sofia',expertise:'Dough',window:'14'}],confirmedCoverage:['luca'] }) : null;
  const migrated=loadExhibitorState();
  assert.deepEqual(migrated.contact,{id:'luca',name:'Luca Rinaldi'});
  assert.equal(migrated.complete,true);
  assert.equal(migrated.version,3);
  assert.equal('team' in migrated,false);
  assert.equal('confirmedCoverage' in migrated,false);
  assert.equal(makeBoothPlan(migrated)[0].window.label,'1:00–2:00 PM');
  window.localStorage.getItem = () => JSON.stringify(migrated);
  assert.deepEqual(loadExhibitorState(),migrated);
});

test('booth agenda reflects check-in without exposing private usefulness feedback', context => {
  const attendee = eligibleAttendee('accepted');
  attendee.boothVisit = { invitationId: 'tomato-table', checkedInAt: '2026-10-24T12:00:00Z', feedback: { usefulness: 'no', submittedAt: '2026-10-24T12:15:00Z' } };
  browserStorage(context, attendee);
  const paul = guests().find(person => person.id === 'paul');
  assert.equal(paul.status, 'assigned');
  assert.equal(paul.checkedInAt, attendee.boothVisit.checkedInAt);
  assert.equal('feedback' in paul, false);
});
