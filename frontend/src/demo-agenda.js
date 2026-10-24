import {people,boothInvitation} from './data/pizza-expo.js';

export const speedSession=Object.freeze({id:'pizza-speed-1',title:'Speed networking',day:'Wednesday',time:'12:00–1:00 PM',location:'Meeting tables · Hall A'});
const lineup=[['theo','12:00–12:15 PM','Ingredient sourcing','tomatoes'],['maya','12:15–12:30 PM','Pizza sauce & ingredients','tomatoes'],['elena','12:30–12:45 PM','Flour & fermentation','flour'],['samir','12:45–1:00 PM','Distribution','distribution']];
// All four matches are revealed together and stay fixed for the entire session.
export function plannedStops(state){
  const stops=lineup.map(([personId,time,topic,topicId],index)=>({id:'meet-'+personId,kind:'meeting',sessionId:speedSession.id,round:index+1,personId,time:'Wednesday · '+time,location:'Meeting table 4',topic,topicId,reason:people.find(person=>person.id===personId).offering}));
  // Preserve existing booth history, but never fabricate a new promo invitation from a goal.
  if(state.boothVisit||state.boothInvitationStatus){
    stops.push({id:boothInvitation.id,kind:'booth',personId:boothInvitation.personId,time:boothInvitation.time,location:boothInvitation.location,topic:boothInvitation.topic});
  }
  for(const progress of Object.values(state.agendaProgress||{}))if(progress.stop&&!stops.some(stop=>stop.id===progress.stop.id))stops.push(progress.stop);
  return stops;
}
export function sessionProgress(agenda){
  const meetings=agenda.filter(stop=>stop.sessionId===speedSession.id);
  const resolved=meetings.filter(stop=>['completed','missed'].includes(stop.status)).length;
  return {...speedSession,meetingIds:meetings.map(stop=>stop.id),resolved,total:meetings.length,ready:meetings.length===4&&resolved===4};
}
