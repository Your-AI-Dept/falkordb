import {people,boothInvitation,persona} from './data/pizza-expo.js';
import {topicName} from './data/topics.js';

// One speed-dating session = 4 planned 15-minute dates (design doc §0). Sessions and dates are
// numbered from 0 in data and shown 1-based ("Date 1 of 4").
export const speedSession=Object.freeze({id:'session-0',session:0,title:'Speed networking',day:'Wednesday',time:'12:00–1:00 PM',location:'Meeting tables · Hall A'});
/** The backend's meeting id: one id per pair and date, shared by both participants' surveys. */
export function meetingId(session,date,a,b){const [lo,hi]=[a,b].sort();return `s${session}-d${date}-${lo}-${hi}`;}
const lineup=[[persona.theo,'12:00–12:15 PM','supply-chain-packaging'],[persona.maya,'12:15–12:30 PM','tomatoes-sauce'],[persona.elena,'12:30–12:45 PM','dough-flour'],[persona.samir,'12:45–1:00 PM','supply-chain-packaging']];
/** Demo meeting ids by persona key, e.g. demoMeetings.theo. */
export const demoMeetings=Object.freeze(Object.fromEntries(Object.entries(persona).flatMap(([key,id])=>{const date=lineup.findIndex(([partner])=>partner===id);return date<0?[]:[[key,meetingId(speedSession.session,date,persona.paul,id)]];})));
// All four matches are revealed together and stay fixed for the entire session.
export function plannedStops(state){
  const stops=lineup.map(([personId,time,topicId],date)=>({id:meetingId(speedSession.session,date,persona.paul,personId),kind:'meeting',sessionId:speedSession.id,session:speedSession.session,date,round:date+1,personId,time:'Wednesday · '+time,location:'Meeting table 4',topic:topicName(topicId),topicId,reason:people.find(person=>person.id===personId).offering}));
  // Preserve existing booth history, but never fabricate a new promo invitation from a goal.
  if(state.boothVisit||state.boothInvitationStatus){
    stops.push({id:boothInvitation.id,kind:'booth',personId:boothInvitation.personId,time:boothInvitation.time,location:boothInvitation.location,topic:boothInvitation.topic,topicId:boothInvitation.topicId});
  }
  for(const progress of Object.values(state.agendaProgress||{}))if(progress.stop&&!stops.some(stop=>stop.id===progress.stop.id))stops.push(progress.stop);
  return stops;
}
export function sessionProgress(agenda,session=speedSession){
  const meetings=agenda.filter(stop=>stop.sessionId===session.id);
  const resolved=meetings.filter(stop=>['completed','missed'].includes(stop.status)).length;
  return {...session,meetingIds:meetings.map(stop=>stop.id),resolved,total:meetings.length,ready:meetings.length===4&&resolved===4};
}
