import {persona} from './data/pizza-expo.js';
// Demo-only "pause this topic" preferences from earlier survey versions; the backend has no endpoint yet.
export function meetingPreferences(state,respondentId=persona.paul) {
  const restored=new Set(state.restoredMeetingPreferences||[]);
  const active=(state.surveyAnswers||[]).filter(answer=>answer.respondentId===respondentId&&answer.preference?.kind==='avoid_topic'&&!restored.has(answer.id));
  return [...new Map(active.map(answer=>[answer.preference.topicId,{...answer.preference,answerId:answer.id}])).values()];
}
export function restoreMeetingTopic(state,respondentId,topicId) {
  const ids=(state.surveyAnswers||[]).filter(answer=>answer.respondentId===respondentId&&answer.preference?.topicId===topicId).map(answer=>answer.id);
  return {...state,restoredMeetingPreferences:[...new Set([...(state.restoredMeetingPreferences||[]),...ids])],graphRevision:(state.graphRevision||0)+1};
}
