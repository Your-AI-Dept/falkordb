import { freshState, snapshot, completeProfile, recordEncounter, applyFeedback, requestMeeting, respondToInvitation, respondToMeeting, peerInbox, checkInBooth, applyBoothFeedback, updateAssignment } from './demo.js';
import { createRestClient } from './rest.js';
import { createGraphClient } from './graph-api.js';
import { validateSurvey, validateTopics, validateRanking } from './graph-contract.js';
import { demoSurvey, answerDemoSurvey, demoTopics, demoRanking } from './demo-graph.js';
import { demoMeetings } from './demo-agenda.js';
import { demoMeetingWhy } from './demo-explain.js';
import { promoAudienceDetails } from './demo-promotions.js';
import { persona } from './data/pizza-expo.js';
import { meetingPreferences, restoreMeetingTopic } from './meeting-preferences.js';
import { createLiveSource, liveIdentity } from './live.js';
// Fixture mode by default (offline demo on real dataset people). VITE_DATA_MODE=live reads the backend
// (backend/openapi.json) through the /api proxy (vite.config.ts) or VITE_API_BASE_URL.
const base = import.meta.env?.VITE_DATA_MODE!=='live'?'':(import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export const isDemo = !base;
const key = 'rally-pizza-attendee-v3';
let state = freshState();
function readState() {
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved?.version === 2 && saved.profile && Array.isArray(saved.profile.goals) && Array.isArray(saved.encounters) && Array.isArray(saved.requestedIds) && Array.isArray(saved.dismissedIds)) state = saved; } catch { /* Continue in memory if storage is unavailable. */ }
  return state;
}
function updateDemo(change) { return persist(change(readState())); }
function persist(next) { state = next; try { localStorage.setItem(key, JSON.stringify(next)); } catch {} return snapshot(next); }
export const request = createRestClient({base});
export const graph = createGraphClient(request);
const live = createLiveSource(request, graph);
/** Who is using the app: the demo attendee, or the attendee chosen in live mode. */
export const viewerId = () => isDemo ? persona.paul : liveIdentity();
const whyCache = new Map();
const notConnected = what => () => { throw new Error(what + ' is not connected to the backend yet.'); };
// No silent demo fallback when a real API origin is configured.
export const api = {
  assignment: async (id,action) => {
    if(!isDemo){await live.assignment(viewerId(),id,action);return live.dashboard(viewerId());}
    return updateDemo(current=>updateAssignment(current,id,action));
  },
  dashboard: async () => isDemo ? snapshot(readState()) : live.dashboard(viewerId()),
  subscribe: callback => {
    const onStorage = event => { if (isDemo && (!event.key || event.key === key)) callback(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', callback);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', callback); };
  },
  profile: async profile => {
    if (isDemo) return persist(completeProfile(readState(), profile));
    const validated = completeProfile((await live.dashboard(viewerId())).state, profile);
    await live.saveProfile(viewerId(), validated.profile);
    return live.dashboard(viewerId());
  },
  scan: async badgeToken => {
    if (!isDemo) { const scanResult = await live.scan(viewerId(), badgeToken); return {...await live.dashboard(viewerId()),scanResult}; }
    const result = recordEncounter(readState(), badgeToken); return {...persist(result.state),scanResult:{person:result.person,duplicate:result.duplicate}};
  },
  reviewMeeting: async () => isDemo ? updateDemo(current => ({...current,meetingFeedbackDue: !demoSurvey(current,demoMeetings.theo,persona.paul).complete})) : live.dashboard(viewerId()),
  feedback: async (_meetingId, answers) => isDemo ? updateDemo(current => applyFeedback(current, answers)) : notConnected('Arranged-meetup feedback')(),
  requestMeeting: async personId => isDemo ? updateDemo(current => requestMeeting(current, personId)) : notConnected('Meeting requests')(),
  peerInbox: async recipientId => isDemo ? peerInbox(readState(), recipientId) : notConnected('Meeting requests')(),
  respondMeeting: async (requestId, response, recipientId) => {
    if (!isDemo) notConnected('Meeting requests')();
    updateDemo(current => respondToMeeting(current, requestId, response, recipientId));
    return api.peerInbox(recipientId);
  },
  invitation: async (invitationId, response) => isDemo ? updateDemo(current => respondToInvitation(current, invitationId, response)) : notConnected('Booth invitations')(),
  checkIn: async invitationId => isDemo ? updateDemo(current => checkInBooth(current, invitationId)) : notConnected('Booth check-in')(),
  boothFeedback: async (invitationId, usefulness) => isDemo ? updateDemo(current => applyBoothFeedback(current, invitationId, usefulness)) : notConnected('Booth feedback')(),
  dismiss: async personId => isDemo ? updateDemo(current => ({...current,dismissedIds:[...new Set([...current.dismissedIds,personId])]})) : notConnected('Recommendation feedback')(),
  survey: async (meetingId, respondentId=viewerId(), options={}) => {
    const result=validateSurvey(isDemo?demoSurvey(readState(),meetingId,respondentId):await graph.survey(meetingId,respondentId,options));
    if(result.meetingId!==meetingId&&!(result.context==='checkin'))throw new Error('The API returned a different meeting.');
    return result;
  },
  answerSurvey: async (meetingId, respondentId, answer, options={}) => {
    if(isDemo){updateDemo(current=>answerDemoSurvey(current,meetingId,respondentId,answer));return api.survey(meetingId,respondentId);}
    if(answer.answerText!==undefined)throw new Error('Written answers are not part of the survey.');
    return graph.answerSurvey(meetingId,respondentId,answer,options);
  },
  meetingPreferences: async (respondentId=viewerId()) => isDemo?meetingPreferences(readState(),respondentId):[],
  restoreMeetingTopic: async (topicId,respondentId=viewerId()) => {
    if(!isDemo)notConnected('Meeting preferences')();
    return updateDemo(current=>restoreMeetingTopic(current,respondentId,topicId));
  },
  topics: async (options={}) => validateTopics(isDemo?{topics:demoTopics}:await graph.topics(options)),
  rankings: async (topicId, limit, options={}) => {
    if(![3,5,10,20].includes(limit))throw new Error('Choose 3, 5, 10, or 20 people.');
    return validateRanking(isDemo?demoRanking(readState(),topicId,limit):await graph.rankings(topicId,limit,options),topicId,limit);
  },
  /**
   * "Why we matched you" for a planned date (GET .../meetings/{rater}/why). Resolves to null when the
   * backend has no explanation for it yet (404/409), so the UI can hide the disclosure.
   */
  meetingWhy: async (meetingId, respondentId=viewerId()) => {
    if (isDemo) return demoMeetingWhy(readState(), meetingId, respondentId);
    const key = meetingId + '|' + respondentId;
    if (!whyCache.has(key)) whyCache.set(key, graph.meetingWhy(meetingId, respondentId).catch(error => { whyCache.delete(key); if ([404, 409].includes(error.status)) return null; throw error; }));
    return whyCache.get(key);
  },
  /** Exhibitor audience plus "Why these people?" (explanation is null for topic experts only). */
  audienceDetails: async (topicId, target) => isDemo ? promoAudienceDetails(topicId, target) : graph.audienceDetails(topicId, target),
  /** Live mode: everyone at the event, for the identity picker. */
  attendees: async () => isDemo ? [] : live.people(),
  reset: async () => {
    if (!isDemo) { live.reset(viewerId()); return live.dashboard(viewerId()); }
    return persist(freshState());
  },
};
