// Offline stand-ins for the backend's explanations. Each function builds the exact response shape
// the API returns (MeetingWhy, and the explanation fields of InfluencerResult in backend/app/models.py)
// and passes it through the same adapter as live mode (backend-adapter.js).
import {people,persona,viewer,professionalEdges} from './data/pizza-expo.js';
import {topicName,topics} from './data/topics.js';
import {plannedStops} from './demo-agenda.js';
import {mapMeetingWhy} from './backend-adapter.js';

// The demo attendee's own interests (Drita runs an independent pizzeria).
const VIEWER_TOPICS=['brick-and-mortar','tomatoes-sauce','dough-flour'];
const first=name=>name.split(' ')[0];
const round=x=>Math.round(x*1000)/1000;
const ref=person=>({id:person.id,name:person.name,company:person.company||'',title:person.role||person.title||''});
const idx=topicId=>topics.find(topic=>topic.id===topicId)?.idx??0;
// Fixture peer evidence on each person's strongest topic: [distinct partners compared with, top percent].
const evidence={[persona.theo]:[4,6],[persona.maya]:[5,4],[persona.elena]:[6,3],[persona.samir]:[3,9],[persona.luca]:[5,5],[persona.nia]:[4,7]};

function personOf(state,id){
  if(id===persona.paul)return {...viewer,name:state.profile.name,role:state.profile.role,company:state.profile.company,topics:VIEWER_TOPICS};
  return people.find(person=>person.id===id);
}
/** Shortest path over the fixture ties: QR check-ins (ADHOC) and LinkedIn connections. */
function socialPath(state,from,to){
  const ties=[...(state.encounters||[]).map(e=>[persona.paul,e.personId,'ADHOC']),...professionalEdges.map(e=>[e.from,e.to,'LINKEDIN'])];
  const previous=new Map([[from,null]]),queue=[from];
  while(queue.length){
    const at=queue.shift();
    if(at===to)break;
    for(const [a,b,via] of ties)for(const [x,y] of [[a,b],[b,a]])if(x===at&&!previous.has(y)&&previous.size<50){previous.set(y,{from:at,via});queue.push(y);}
  }
  if(!previous.has(to)||from===to)return null;
  const steps=[];
  for(let at=to,via=null;at!==null;){steps.unshift({id:at,via});const p=previous.get(at);via=p?.via??null;at=p?.from??null;}
  return steps.length>5?null:steps.map(step=>({person:ref(personOf(state,step.id)),via:step.via}));
}

/** The backend's MeetingWhy for a planned fixture date, from the rater's side. */
export function demoMeetingWhyPayload(state,meetingId,raterId=persona.paul){
  const stop=plannedStops(state).find(item=>item.kind==='meeting'&&item.id===meetingId);
  if(!stop||![persona.paul,stop.personId].includes(raterId)){const error=new Error('This date has no planned match for this attendee.');error.status=404;throw error;}
  const partnerId=raterId===persona.paul?stop.personId:persona.paul;
  const rater=personOf(state,raterId),partner=personOf(state,partnerId),name=first(partner.name);
  const topic=stop.topicId,shared=partner.topics.filter(t=>rater.topics.includes(t));
  const gap=[...partner.topics,...rater.topics].find(t=>t!==topic&&!shared.includes(t))||'chefs-culinary';
  const teach=rater.topics.find(t=>partner.topics.includes(t)&&t!==topic)||rater.topics[0];
  const path=socialPath(state,raterId,partnerId);
  const direct=path?.length===2;
  const [m,top]=evidence[partnerId]||[1,40];
  const learn=round(0.36-0.03*stop.date),enjoy=round(shared.length?0.27:0.18),newCircle=direct?0:0.12,known=direct?-0.3:0,explore=round(0.08-0.01*stop.date);
  const valueForYou=round(learn+enjoy+newCircle+known+explore),valueForThem=round(valueForYou-0.05),floor=round(valueForThem-0.12);
  const reasons=[
    {kind:'learn_from_them',title:`Learn about ${topicName(topic)}`,detail:partnerId===persona.paul?`${name}’s background suggests expertise in ${topicName(topic)}; not yet confirmed by peers`:`${name} ranks in the top ${top}% on ${topicName(topic)} (${m} people they met say they learned from them)`,weight:learn,topic_id:topic},
    {kind:'shared_interest',title:'Shared interests',detail:shared.length?`Both of you rank ${shared.slice(0,2).map(topicName).join(' and ')} highly`:`You both picked ${topicName(topic)} for this hour`,weight:enjoy},
    {kind:'learn_from_you',title:'They can learn from you',detail:`You’re strong on ${topicName(teach)}, one of ${name}’s interests`,weight:null,topic_id:teach},
    direct?{kind:'already_connected',title:'You already know each other',detail:`You and ${name} have already met at the show`,weight:known}:{kind:'new_circle',title:'A new circle',detail:`${name} is in a different community of the trust graph`,weight:newCircle},
    {kind:'explore',title:'Fills a gap in the graph',detail:`Neither of you has been compared on ${topicName(gap)} yet`,weight:explore,topic_id:gap},
    {kind:'fair_floor',title:'Fair for everyone',detail:`Every pair this date scores at least ${floor.toFixed(2)}; yours scores ${valueForThem.toFixed(2)}`,weight:null},
  ];
  return {
    meeting_id:meetingId,session:stop.session,date_no:stop.date,rater:ref(rater),partner:ref(partner),
    headline:`${name} can teach you about ${topicName(topic)}${shared.length?', and you two care about the same things':''}.`,
    score:{value_for_you:valueForYou,value_for_them:valueForThem,pair_score:Math.min(valueForYou,valueForThem),date_floor:floor,components:{learn,enjoy,new_circle:newCircle,already_connected:known,explore}},
    reasons,path,
    evidence_queries:[
      {label:'Shortest social path',cypher:`MATCH (a:Attendee {id: '${raterId}'}), (b:Attendee {id: '${partnerId}'})\nWITH shortestPath((a)-[:LINKEDIN|ADHOC|POS_TIE*1..4]-(b)) AS p\nRETURN [n IN nodes(p) | n.name], [r IN relationships(p) | type(r)]`},
      {label:`Who learned from ${name} on ${topicName(topic)}`,cypher:`MATCH (l:Attendee)-[:LEARNED_FROM_T${idx(topic)}]->(x:Attendee {id: '${partnerId}'})\nRETURN count(DISTINCT l) AS peers`},
      {label:'Your match score for this date',cypher:`MATCH (u:Attendee {id: '${raterId}'})-[e:SPEED_DATE {session: ${stop.session}, date_no: ${stop.date}}]->(v:Attendee)\nRETURN v.name, e.value, e.w`},
    ],
  };
}
export const demoMeetingWhy=(state,meetingId,raterId)=>mapMeetingWhy(demoMeetingWhyPayload(state,meetingId,raterId));
