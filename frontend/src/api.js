import { freshState, snapshot, completeProfile, recordEncounter, applyFeedback, requestMeeting, respondToInvitation, respondToMeeting, peerInbox, checkInBooth, applyBoothFeedback } from './demo.js';
import { createRestClient } from './rest.js';
import { createGraphClient } from './graph-api.js';
import { validateSurvey, validateTopics, validateRanking } from './graph-contract.js';
import { demoSurvey, answerDemoSurvey, demoTopics, demoRanking } from './demo-graph.js';
const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const eventId = import.meta.env?.VITE_EVENT_ID || 'pizza-expo';
export const isDemo = !base;
const key = 'rally-pizza-attendee-v2';
let state = freshState();
function readState() {
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved?.version === 2 && saved.profile && Array.isArray(saved.profile.goals) && Array.isArray(saved.encounters) && Array.isArray(saved.requestedIds) && Array.isArray(saved.dismissedIds)) state = saved; } catch { /* Continue in memory if storage is unavailable. */ }
  return state;
}
function updateDemo(change) { return persist(change(readState())); }
function persist(next) { state = next; try { localStorage.setItem(key, JSON.stringify(next)); } catch {} return snapshot(next); }
const request = createRestClient({base,eventId});
const graph = createGraphClient(request);
async function mutation(path, payload) { await request(path, {method:'POST',body:JSON.stringify(payload)}); return request('/me/dashboard'); }
// No silent demo fallback when a real API origin is configured.
export const api = {
  dashboard: async () => isDemo ? snapshot(readState()) : request('/me/dashboard'),
  subscribe: callback => {
    const onStorage = event => { if (isDemo && (!event.key || event.key === key)) callback(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', callback);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', callback); };
  },
  profile: async profile => { const validated = completeProfile(isDemo ? readState() : state, profile); return isDemo ? persist(validated) : mutation('/me/profile', validated.profile); },
  scan: async badgeToken => {
    if (!isDemo) { const result = await request('/encounters', {method:'POST',body:JSON.stringify({badgeToken,kind:'chosen_qr_connection'})}); return {...await request('/me/dashboard'),scanResult:result}; }
    const result = recordEncounter(readState(), badgeToken); return {...persist(result.state),scanResult:{person:result.person,duplicate:result.duplicate}};
  },
  reviewMeeting: async () => isDemo ? updateDemo(current => ({...current,meetingFeedbackDue: !demoSurvey(current,'meet-theo','paul').complete})) : request('/me/dashboard'),
  feedback: async (meetingId, answers) => isDemo ? updateDemo(current => applyFeedback(current, answers)) : mutation('/meetings/' + encodeURIComponent(meetingId) + '/feedback', answers),
  requestMeeting: async personId => isDemo ? updateDemo(current => requestMeeting(current, personId)) : mutation('/meeting-requests', {personId,durationMinutes:15}),
  peerInbox: async recipientId => isDemo ? peerInbox(readState(), recipientId) : request('/me/meeting-requests'),
  respondMeeting: async (requestId, response, recipientId) => {
    if (isDemo) updateDemo(current => respondToMeeting(current, requestId, response, recipientId));
    else await request('/meeting-requests/' + encodeURIComponent(requestId) + '/response', { method: 'POST', body: JSON.stringify({response}) });
    return api.peerInbox(recipientId);
  },
  invitation: async (invitationId, response) => isDemo ? updateDemo(current => respondToInvitation(current, invitationId, response)) : mutation('/invitations/' + encodeURIComponent(invitationId) + '/response', {response}),
  checkIn: async invitationId => isDemo ? updateDemo(current => checkInBooth(current, invitationId)) : mutation('/invitations/' + encodeURIComponent(invitationId) + '/check-in', {}),
  boothFeedback: async (invitationId, usefulness) => isDemo ? updateDemo(current => applyBoothFeedback(current, invitationId, usefulness)) : mutation('/invitations/' + encodeURIComponent(invitationId) + '/feedback', {usefulness}),
  dismiss: async personId => isDemo ? updateDemo(current => ({...current,dismissedIds:[...new Set([...current.dismissedIds,personId])]})) : mutation('/recommendation-feedback', {personId,action:'not_now'}),
  survey: async (meetingId, respondentId='paul', options={}) => {
    const result=validateSurvey(isDemo?demoSurvey(readState(),meetingId,respondentId):await graph.survey(meetingId,options));
    if(result.meetingId!==meetingId)throw new Error('The API returned a different meeting.');
    return result;
  },
  answerSurvey: async (meetingId, respondentId, answer, options={}) => {
    if(isDemo){updateDemo(current=>answerDemoSurvey(current,meetingId,respondentId,answer));return api.survey(meetingId,respondentId);}
    return graph.answerSurvey(meetingId,answer,options);
  },
  topics: async (options={}) => validateTopics(isDemo?{topics:demoTopics}:await graph.topics(options)),
  rankings: async (topicId, limit, options={}) => {
    if(![3,5,10,20].includes(limit))throw new Error('Choose 3, 5, 10, or 20 people.');
    return validateRanking(isDemo?demoRanking(readState(),topicId,limit):await graph.rankings(topicId,limit,options),topicId,limit);
  },
  reset: async () => { if (!isDemo) throw new Error('Reset is only available in the demo.'); return persist(freshState()); },
};
