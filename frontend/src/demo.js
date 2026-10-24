import { event, goals, people, professionalEdges, boothInvitation, persona, viewer } from './data/pizza-expo.js';
import { topicName } from './data/topics.js';
import { demoSurvey } from './demo-graph.js';
import { didntMeet } from './backend-adapter.js';
import { plannedStops,sessionProgress,demoMeetings } from './demo-agenda.js';
export { goals };
// The arranged meetup with Sunil (persona "theo"): date 1 of the demo session.
const meeting = { id: demoMeetings.theo, personId: persona.theo, time: 'Wednesday · 12:00–12:15 PM', location: 'Meeting table 4', reason: 'Compare approaches to ingredient sourcing and running a pizzeria.', status: 'scheduled' };
export function freshState() {
  return { version: 2, onboardingComplete: false, profile: { name: viewer.name, role: viewer.role, company: viewer.company, businessType: viewer.businessType, context: viewer.context, linkedin: '', goals: [], focus: '', intention: '' }, encounters: [], feedback: null, requestedIds: [], dismissedIds: [] };
}
// Goal follow-ups offer canonical topics (src/data/topics.js), labeled with their canonical names.
const choices=(ids,other='Something else')=>[...ids.map(id=>[id,topicName(id)]),['other',other]];
export function focusQuestion(profile, primary = profile.goals?.[0]) {
  if (primary === 'suppliers') return { title: 'What are you looking for?', hint: profile.businessType === 'pizzeria' ? 'A little more context for your pizzeria.' : 'Choose the area that matters most.', choices: choices(['tomatoes-sauce','dough-flour','ovens-equipment','supply-chain-packaging']) };
  if (primary === 'peers') return { title: 'What would you like to compare notes on?', hint: 'We’ll look for people with useful experience.', choices: choices(['dough-flour','tomatoes-sauce','brick-and-mortar','chefs-culinary']) };
  if (primary === 'growth') return { title: 'Where would a good connection help?', hint: 'One priority is enough to get started.', choices: choices(['brick-and-mortar','supply-chain-packaging','tech-ordering-delivery']) };
  if (primary === 'explore') return { title: 'What would you like to discover?', choices: choices(['spices-seasonings','dough-flour','tech-ordering-delivery'],'Surprise me') };
  return null;
}
export function goalAnswers(profile) {
  const saved = profile.goalFocus || {};
  return Object.fromEntries((profile.goals || []).flatMap((goal,index) => {
    const answer = saved[goal] ?? (index === 0 ? profile.focus : '');
    return focusQuestion(profile,goal)?.choices.some(([id])=>id===answer) ? [[goal,answer]] : [];
  }));
}
export function toggleProfileGoal(profile, goal) {
  const nextGoals = profile.goals.includes(goal) ? profile.goals.filter(id=>id!==goal) : [...profile.goals,goal];
  const saved = goalAnswers(profile);
  const goalFocus = Object.fromEntries(nextGoals.filter(id=>saved[id]).map(id=>[id,saved[id]]));
  return {...profile,goals:nextGoals,goalFocus,focus:goalFocus[nextGoals[0]] || ''};
}
export function completeProfile(state, profile) {
  const clean = { ...profile, name: profile.name.trim(), company: profile.company.trim(), role: profile.role.trim(), context: profile.context.trim(), intention: profile.intention.trim(), linkedin: profile.linkedin.trim() };
  if (!clean.name || !clean.company || !clean.context) throw new Error('Add your name, company, and a little context about your work.');
  if (!Array.isArray(clean.goals) || clean.goals.some(id => !goals.some(g => g.id === id))) throw new Error('Choose a valid event goal.');
  clean.goals = [...new Set(clean.goals)];
  clean.goalFocus = goalAnswers(clean);
  clean.focus = clean.goalFocus[clean.goals[0]] || '';
  if (clean.linkedin) {
    let url; try { url = new URL(clean.linkedin); } catch { throw new Error('Use a full LinkedIn URL, or leave it blank.'); }
    if (url.protocol !== 'https:' || !['linkedin.com','www.linkedin.com'].includes(url.hostname)) throw new Error('Use a linkedin.com profile URL, or leave it blank.');
  }
  return { ...state, onboardingComplete: true, profile: clean, dismissedIds: [] };
}
/** Badge tokens are attendee ids, as in the backend's POST /checkins. */
export function recordEncounter(state, input, viewerId = persona.paul) {
  let token = input.trim();
  if (/^https?:\/\//i.test(token)) { try { token = new URL(token).searchParams.get('badge') || ''; } catch { token = ''; } }
  token = token.toUpperCase();
  if (token === viewerId) throw new Error('That is your own badge. Try another attendee’s badge.');
  const person = people.find(p => p.badge === token);
  if (!person) throw new Error('Badge not found. Check the code or try the sample scan.');
  if (state.encounters.some(e => e.personId === person.id)) return { state, person, duplicate: true };
  return { state: { ...state, encounters: [...state.encounters, { id: crypto.randomUUID(), personId: person.id, kind: 'chosen_qr_connection', createdAt: new Date().toISOString() }] }, person, duplicate: false };
}
// Earlier arranged-meetup feedback (usefulness + next topic); dormant adapter compatibility only.
export function applyFeedback(state, answers) {
  if (!['yes','somewhat','no','didnt_meet'].includes(answers.usefulness)) throw new Error('Choose how the meetup went.');
  const next = answers.usefulness === 'didnt_meet' ? '' : (answers.next || '');
  if (next && !topicName(next)) throw new Error('Choose a valid next interest.');
  return { ...state, meetingFeedbackDue: false, feedback: { meetingId: meeting.id, usefulness: answers.usefulness, next, attendance: answers.usefulness === 'didnt_meet' ? 'not_met' : 'reported_attended', submittedAt: new Date().toISOString() } };
}
export function requestMeeting(state, personId) {
  if (!people.some(p => p.id === personId)) throw new Error('This attendee is no longer available.');
  const requests = meetingRequestsFor(state);
  if (requests.some(request => request.toId === personId)) return state;
  const person = people.find(person => person.id === personId);
  return { ...state, requestedIds: [...new Set([...state.requestedIds, personId])], meetingRequests: [...requests, { id: crypto.randomUUID(), fromId: persona.paul, toId: personId, status: 'pending', time: person.slot, location: person.place, createdAt: new Date().toISOString() }] };
}
export function meetingRequestsFor(state) {
  const requests = state.meetingRequests || [];
  // Preserve requests saved by the earlier prototype without inventing their creation time.
  const legacy = state.requestedIds.filter(id => !requests.some(request => request.toId === id)).flatMap(id => {
    const person = people.find(person => person.id === id);
    return person ? [{ id: 'peer-' + id, fromId: persona.paul, toId: id, status: 'pending', time: person.slot, location: person.place, createdAt: null }] : [];
  });
  return [...requests, ...legacy];
}
export function respondToMeeting(state, requestId, response, recipientId) {
  const requests = meetingRequestsFor(state);
  const request = requests.find(item => item.id === requestId);
  if (!request || request.toId !== recipientId) throw new Error('This meeting request is not addressed to you.');
  if (!['accepted', 'declined'].includes(response)) throw new Error('Choose whether to meet.');
  if (request.status === response) return state;
  if (request.status !== 'pending') throw new Error('This request already has a reply.');
  return { ...state, meetingRequests: requests.map(item => item.id === requestId ? { ...item, status: response, respondedAt: new Date().toISOString() } : item) };
}
export function peerInbox(state, recipientId) {
  const viewerPerson = people.find(person => person.id === recipientId);
  if (!viewerPerson) throw new Error('Attendee not found.');
  return { viewer: viewerPerson, requests: meetingRequestsFor(state).filter(request => request.toId === recipientId).map(request => ({ ...request, sender: { id: persona.paul, ...state.profile } })) };
}
function recommendationReason(state, person, via) {
  const firstName = person.name.split(' ')[0];
  if (via) return { source: 'From a saved connection', reason: `You saved ${via.name.split(' ')[0]}’s badge. They have a professional connection to ${firstName}.` };
  const feedbackTopic = state.feedback?.next && person.topics.includes(state.feedback.next) ? state.feedback.next : '';
  if (feedbackTopic) return { source: 'Matches your latest feedback', reason: `Your last meetup covered “${topicName(feedbackTopic)}”. ${firstName} lists this topic on their profile.` };
  const selected = Object.entries(goalAnswers(state.profile)).find(([,topic]) => person.topics.includes(topic));
  if (selected) {
    const [,topicId] = selected;
    return { source: 'Shared topic', reason: `You picked “${topicName(topicId)}”. ${firstName} lists it on their profile.` };
  }
  // A generic goal or an unrelated answer is not evidence for this person.
  return { source: '', reason: '' };
}
const p = key => persona[key];
const recommendationOrder = {
  'tomatoes-sauce': ['luca','maya','samir'], 'dough-flour': ['elena','maya','nia'], 'ovens-equipment': ['nia','maya','elena'],
  'supply-chain-packaging': ['samir','luca','nia'], 'brick-and-mortar': ['nia','samir','maya'], 'tech-ordering-delivery': ['maya','nia','samir'],
  'spices-seasonings': ['elena','maya','nia'], 'chefs-culinary': ['elena','maya','nia'],
  peers: ['maya','nia','elena'], suppliers: ['luca','samir','maya'], growth: ['nia','samir','maya'], explore: ['elena','maya','nia'],
};
export function recommendations(state) {
  const met = new Set(state.encounters.map(e => e.personId));
  const focus = state.feedback?.next || state.profile.focus;
  const primary = state.profile.goals[0] || 'explore';
  const order = (recommendationOrder[focus] || recommendationOrder[primary]).map(p);
  const extraFocus = Object.entries(goalAnswers(state.profile)).filter(([goal])=>goal!==primary).map(([,answer])=>answer);
  const extraPeople = extraFocus.map(topic=>people.find(person=>person.id!==persona.theo&&person.topics.includes(topic))?.id).filter(Boolean);
  const unique = [...new Set([order[0], ...extraPeople, ...order.slice(1), ...people.filter(person => person.id !== persona.theo).map(person => person.id)])];
  return unique.filter(id => !met.has(id) && !state.dismissedIds.includes(id)).map(id => {
    const person = people.find(item => item.id === id);
    const edge = professionalEdges.find(e => e.to === id && met.has(e.from));
    const via = edge && people.find(item => item.id === edge.from);
    return { person, ...recommendationReason(state,person,via), path: via ? [{id:'you',name:'You'}, {id:via.id,name:via.name.split(' ')[0]}, {id:person.id,name:person.name.split(' ')[0]}] : [] };
  });
}
export function invitationFor(state) {
  const interests = state.feedback?.next ? [state.feedback.next] : Object.values(goalAnswers(state.profile));
  const eligible = interests.includes(boothInvitation.topicId) && state.encounters.some(e => e.personId === persona.maya);
  if (!eligible && !state.boothInvitationStatus) return null;
  return { ...boothInvitation, status: state.boothInvitationStatus || 'pending', visit: state.boothVisit || null };
}
export function respondToInvitation(state, invitationId, response) {
  if (invitationId !== boothInvitation.id || !invitationFor(state)) throw new Error('This invitation is no longer available.');
  if (!['accepted','declined'].includes(response)) throw new Error('Choose whether to attend.');
  if (state.boothVisit && response === 'declined') throw new Error('You have already checked in to this visit.');
  return { ...state, boothInvitationStatus: response };
}
export function checkInBooth(state, invitationId) {
  const invitation = invitationFor(state);
  if (invitation?.id !== invitationId || invitation.status !== 'accepted') throw new Error('Accept the invitation before checking in.');
  if (state.boothVisit) return state;
  return { ...state, boothVisit: { invitationId, checkedInAt: new Date().toISOString(), feedback: null } };
}
/** Booth-visit feedback (yes/somewhat/no). The backend has no booth-visit model yet, so this stays local. */
export function applyBoothFeedback(state, invitationId, usefulness) {
  if (state.boothVisit?.invitationId !== invitationId) throw new Error('Check in before leaving feedback.');
  if (!['yes', 'somewhat', 'no'].includes(usefulness)) throw new Error('Choose how the booth visit went.');
  if (state.boothVisit.feedback?.usefulness === usefulness) return state;
  return { ...state, boothVisit: { ...state.boothVisit, feedback: { usefulness, submittedAt: new Date().toISOString() } } };
}
export function agendaFor(state){
  return plannedStops(state).map(stop=>{
    const progress=state.agendaProgress?.[stop.id];
    let status=progress?.status||'scheduled';
    if(stop.kind==='booth'){
      if(state.boothVisit?.feedback)status='completed';
      else if(state.boothVisit?.feedbackDue)status='feedback_due';
      else if(state.boothVisit)status='checked_in';
      else if(state.boothInvitationStatus==='declined')status='missed';
    }else{
      const survey=demoSurvey(state,stop.id,persona.paul);
      if(survey.complete)status=didntMeet(survey)?'missed':'completed';
      else if(stop.id===meeting.id&&state.meetingFeedbackDue)status='feedback_due';
    }
    return {...stop,status,person:people.find(person=>person.id===stop.personId)};
  });
}
export function updateAssignment(state,id,action){
  const stop=agendaFor(state).find(stop=>stop.id===id);
  if(!stop)throw new Error('This stop is no longer on your schedule.');
  if(!['check_in','finish','miss'].includes(action))throw new Error('Choose a valid schedule action.');
  const status={check_in:'checked_in',finish:'feedback_due',miss:'missed'}[action];
  if(stop.status===status)return state;
  if(agendaFor(state).some(item=>item.id!==id&&item.status==='feedback_due'))throw new Error('Finish your previous feedback first.');
  if(action==='check_in'&&agendaFor(state).some(item=>item.id!==id&&item.status==='checked_in'))throw new Error('Finish your current stop first.');
  if(action==='finish'?stop.status!=='checked_in':stop.status!=='scheduled')throw new Error('This stop has already been updated.');
  const timestamp=new Date().toISOString();
  const next={...state,agendaProgress:{...state.agendaProgress,[id]:{...state.agendaProgress?.[id],stop:{id:stop.id,kind:stop.kind,personId:stop.personId,time:stop.time,location:stop.location,topic:stop.topic,topicId:stop.topicId,reason:stop.reason},status,updatedAt:timestamp}}};
  if(stop.kind==='booth'){
    if(action==='check_in')next.boothVisit={invitationId:id,checkedInAt:timestamp,feedback:null};
    if(action==='finish')next.boothVisit={...state.boothVisit,feedbackDue:true};
    if(action==='miss')next.boothInvitationStatus='declined';
  }else if(id===meeting.id&&action==='finish')next.meetingFeedbackDue=true;
  return next;
}
export function snapshot(state) { const survey=demoSurvey(state,meeting.id,persona.paul); return { event, graphRevision: state.graphRevision || 0, viewerId: persona.paul, state, people, agenda:agendaFor(state), session:sessionProgress(agendaFor(state)), recommendations: recommendations(state), viewer: { badgeToken: persona.paul }, meeting: {...meeting,feedbackRequired: Boolean(state.meetingFeedbackDue && !survey.complete), surveyComplete: survey.complete}, meetingRequests: meetingRequestsFor(state), invitation: invitationFor(state) }; }
