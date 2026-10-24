import {people,persona} from './data/pizza-expo.js';
import {topics,topicOptions} from './data/topics.js';
import {mapAudience,mapAudienceExplanation,AUDIENCE_TARGETS} from './backend-adapter.js';

export const PROMOTION_STORAGE_KEY='rally-pizza-promotions-v1';
// Fixture audiences exist for these canonical topics; live mode offers all 10.
export const promoTopics=topicOptions.filter(topic=>['tomatoes-sauce','dough-flour','ovens-equipment'].includes(topic.id));
export {AUDIENCE_TARGETS};
// Seeded sample observations shaped like GET /topics/{id}/experts and /topics/{id}/influencers.
// Influencers: [persona, expected additional attendees, likability, interested attendees who trust them, of whom only they reach].
// Runner-up: [persona, expected additional attendees if added, the pick whose circle overlaps theirs].
const sample={
  'tomatoes-sauce':{experts:[['maya',6,0.81],['theo',5,0.78]],influencers:[['maya',2.4,0.74,9,7],['samir',1.9,0.69,8,6]],runnerUp:['theo',0.3,'maya']},
  'dough-flour':{experts:[['elena',7,0.84],['maya',3,0.66]],influencers:[['maya',1.6,0.71,7,7]],runnerUp:['elena',0.4,'maya']},
  'ovens-equipment':{experts:[['nia',6,0.8],['theo',4,0.72]],influencers:[['nia',2.1,0.76,8,8]],runnerUp:['theo',0.2,'nia']},
};
const pct=x=>Math.round(x*10)/10;
const ref=person=>({id:person.id,name:person.name,company:person.company,title:person.role});
function payloads(topicId){
  const topic=topics.find(item=>item.id===topicId),data=sample[topicId];
  const person=key=>people.find(item=>item.id===persona[key]);
  const experts={topic:{id:topic.id,idx:topic.idx,name:topic.name,description:topic.description},limit:5,graph_revision:0,status:'ready',items:data.experts.map(([key,m,comp],index)=>({rank:index+1,person:ref(person(key)),comp,comp_unc:Math.round(2/(2+m)*1000)/1000,m,reason:`People they met at the show rate them highly on ${topic.name} (${m} conversations)`,evidence:[{label:`Compared notes on ${topic.name} with ${m} people at the show`,kind:'peer_votes'}]}))};
  const interested=40,likeN=8;
  const picks=data.influencers.map(([key,gain,like,direct,unique],index)=>{
    const comp=data.experts.find(([expert])=>expert===key)?.[2]??0.7,m=data.experts.find(([expert])=>expert===key)?.[1]??4;
    const competence=pct(99-6*index-(0.8-comp)*20),likability=pct(Math.min(97,like*115)),yes=Math.round(like*likeN);
    return {person:ref(person(key)),marginal_reach:gain,comp_x:comp,m,like,like_n:likeN,tribe:index,broker:0.1,reach:12,top_targets:[],
      why:{pick_order:index+1,competence_percentile:competence,likability_percentile:likability,direct_targets:direct,unique_targets:unique,reasons:[
        {kind:'competent',title:`Top ${Math.max(1,Math.round(100-competence))}% on ${topic.name}`,detail:`${m} people they met say they learned from them`,weight:null},
        {kind:'liked',title:'Well liked',detail:`${yes} of ${likeN} people they met would meet them again`,weight:null},
        {kind:'reach',title:`Reaches ${direct} interested attendees`,detail:unique===direct?'No other pick reaches them':`${unique} of them no other pick reaches`,weight:gain},
      ]}};
  });
  const covered=data.influencers.reduce((sum,[, , ,direct,unique],index)=>sum+(index?unique:direct),0);
  const [runnerKey,runnerGain,overlapKey]=data.runnerUp;
  const runner=person(runnerKey),overlap=person(overlapKey);
  const influencers={event:{kind:'topic',id:topic.id,name:topic.name,profile:{[topic.id]:1}},n_targets:interested,expected_reach:data.influencers.reduce((sum,[,gain])=>sum+gain,0),influencers:picks,
    audience:{interested,covered,coverage_share:Math.round(covered/interested*1000)/1000,expected_attendees:data.influencers.reduce((sum,[,gain])=>sum+gain,0),tribes:picks.length,method:'Picked one at a time, each time the person who adds the most new expected attendees.'},
    runners_up:[{person:ref(runner),comp_x:data.experts.find(([expert])=>expert===runnerKey)?.[2]??0.7,like:0.64,marginal_reach:runnerGain,reason:`Their circle overlaps ${overlap.name.split(' ')[0]}’s: most of the people they’d invite already get a ticket`}],
    evidence_queries:[
      {label:`People interested in ${topic.name}`,cypher:`MATCH (v:Attendee) WHERE v.interest[${topic.idx}] >= 0.4\nRETURN count(v) AS interested`},
      {label:'Who trusts each pick',cypher:`MATCH (u:Attendee)-[t:POS_TIE]->(v:Attendee)\nWHERE u.id IN $picks AND v.interest[${topic.idx}] >= 0.4\nRETURN u.name, count(v) AS reaches, avg(t.p_pos) AS trust`},
      {label:`Competence on ${topic.name}`,cypher:`MATCH (l:Attendee)-[:LEARNED_FROM_T${topic.idx}]->(x:Attendee)\nWHERE x.id IN $picks\nRETURN x.name, x.comp[${topic.idx}] AS comp, count(DISTINCT l) AS peers`},
    ]};
  return {experts,influencers};
}
export function promoAudience(topicId,target='both'){
  if(!sample[topicId]||!AUDIENCE_TARGETS.some(item=>item.id===target))throw new Error('Choose a topic and audience.');
  const {experts,influencers}=payloads(topicId);
  return mapAudience(experts,influencers,target,'sample_graph').map(item=>({...item,person:{...people.find(person=>person.id===item.id),...item.person}}));
}
/** The audience plus the "Why these people?" explanation (null when micro-influencers aren't part of it). */
export function promoAudienceDetails(topicId,target='both'){
  const items=promoAudience(topicId,target);
  return {items,explanation:target==='experts'?null:mapAudienceExplanation(payloads(topicId).influencers)};
}
export function freshPromotions(){return {version:1,campaigns:[]};}
export function inviteAudience(store,draft,recipientIds,audience=null){
  if(!draft.campaignId||!draft.company?.trim()||!draft.booth?.trim()||!draft.contact?.name?.trim()||!draft.product?.trim()||!draft.offer?.trim())throw new Error('Complete your profile and promotion first.');
  const eligible=audience||promoAudience(draft.topicId,draft.target);
  const ids=[...new Set(recipientIds)];
  if(!ids.length||ids.some(id=>!eligible.some(item=>item.id===id)))throw new Error('Choose at least one person from this audience.');
  const existing=store.campaigns.find(item=>item.id===draft.campaignId);
  const configuration={company:draft.company,booth:draft.booth,contact:draft.contact,product:draft.product,offer:draft.offer,topicId:draft.topicId,target:draft.target,time:'Wednesday · 1:00–2:00 PM'};
  if(existing&&JSON.stringify(existing.configuration)!==JSON.stringify(configuration))throw new Error('Start a new promotion to change a sent invitation.');
  const invitations=[...(existing?.invitations||[])];
  for(const id of ids)if(!invitations.some(invite=>invite.person.id===id))invitations.push({person:eligible.find(item=>item.id===id).person,evidence:eligible.find(item=>item.id===id),status:'invited',invitedAt:new Date().toISOString()});
  const campaign={id:draft.campaignId,configuration,invitations};
  return {...store,campaigns:[...store.campaigns.filter(item=>item.id!==campaign.id),campaign]};
}
export function updatePromoResponse(store,campaignId,participant,action){
  const campaign=store.campaigns.find(item=>item.id===campaignId);
  const invite=campaign?.invitations.find(item=>item.person.id===participant);
  if(!invite)throw new Error('This invitation is not addressed to you.');
  const transitions={accept:['invited','accepted'],decline:['invited','declined'],check_in:['accepted','checked_in'],finish:['checked_in','feedback_due']};
  const transition=transitions[action];
  if(!transition)throw new Error('Choose a valid invitation action.');
  if(invite.status===transition[1])return store;
  if(invite.status!==transition[0])throw new Error('This invitation has already been updated.');
  const updated={...invite,status:transition[1],updatedAt:new Date().toISOString()};
  if(action==='check_in')updated.checkedInAt=updated.updatedAt;
  return {...store,campaigns:store.campaigns.map(item=>item.id===campaignId?{...item,invitations:item.invitations.map(entry=>entry.person.id===participant?updated:entry)}:item)};
}
export function savePromoFeedback(store,campaignId,participant,usefulness){
  const campaign=store.campaigns.find(item=>item.id===campaignId),invite=campaign?.invitations.find(item=>item.person.id===participant);
  if(!invite||!['feedback_due','completed'].includes(invite.status))throw new Error('Finish the booth visit before giving feedback.');
  if(!['yes','somewhat','no'].includes(usefulness))throw new Error('Choose how the visit went.');
  return {...store,campaigns:store.campaigns.map(item=>item.id===campaignId?{...item,invitations:item.invitations.map(entry=>entry.person.id===participant?{...entry,status:'completed',feedback:{usefulness,submittedAt:new Date().toISOString()}}:entry)}:item)};
}
export function promoInvitations(store,participant){return store.campaigns.flatMap(campaign=>campaign.invitations.filter(invite=>invite.person.id===participant).map(invite=>({...invite,campaignId:campaign.id,promotion:campaign.configuration})));}
export function exhibitorCampaign(store,id){
  const campaign=store.campaigns.find(item=>item.id===id);
  return campaign?{...campaign,invitations:campaign.invitations.map(({feedback:_feedback,...invite})=>invite)}:null;
}
