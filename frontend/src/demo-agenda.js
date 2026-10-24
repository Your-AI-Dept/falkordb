import {people,meeting,boothInvitation} from './data/pizza-expo.js';
import {meetingPreferences} from './meeting-preferences.js';

// Scripted demo assignments only. Live scheduling belongs to the graph backend.
export function plannedStops(state){
  const focus=state.feedback?.next||state.profile.focus;
  const topic={tomatoes:'Tomato sourcing',flour:'Flour & fermentation',equipment:'Kitchen equipment',distribution:'Distribution',growth:'Growing a pizzeria'}[focus];
  const stops=[{...meeting,kind:'meeting',topic:'Ingredient sourcing',topicId:'tomatoes'}];
  const tomatoFocus=focus==='tomatoes'||Object.values(state.profile.goalFocus||{}).includes('tomatoes');
  if(tomatoFocus||state.boothVisit||state.boothInvitationStatus){
    stops.push({id:boothInvitation.id,kind:'booth',personId:boothInvitation.personId,time:boothInvitation.time,location:boothInvitation.location,topic:boothInvitation.topic,reason:'Discuss tomato supply for your pizzerias.'});
  }
  const startedPeer=Object.values(state.agendaProgress||{}).find(progress=>progress.stop?.kind==='meeting'&&progress.stop.id!==meeting.id)?.stop;
  if(startedPeer)stops.push(startedPeer);
  else{
    const choices={tomatoes:['maya','samir'],flour:['elena','maya'],equipment:['nia','elena'],distribution:['samir','nia'],growth:['nia','samir']}[focus]||['maya','elena'];
    const person=choices.map(id=>people.find(person=>person.id===id)).find(person=>!state.encounters.some(encounter=>encounter.personId===person.id));
    const paused=meetingPreferences(state).some(preference=>preference.topicId===(focus||'operations'));
    if(person&&!paused)stops.push({id:'meet-'+person.id,kind:'meeting',personId:person.id,time:person.slot,location:person.place,topic:topic||'Pizzeria operations',topicId:focus||'operations',reason:person.offering});
  }
  // An assignment already started or marked unavailable must not disappear on a goal change.
  for(const progress of Object.values(state.agendaProgress||{}))if(progress.stop&&!stops.some(stop=>stop.id===progress.stop.id))stops.push(progress.stop);
  return stops.sort((a,b)=>{
    const minutes=stop=>{const match=stop.time.match(/(\d+):(\d+)/);return match?Number(match[1])%12*60+Number(match[2]):0;};
    return minutes(a)-minutes(b);
  });
}
