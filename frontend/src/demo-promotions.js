import {people,persona} from './data/pizza-expo.js';
import {topics,topicOptions} from './data/topics.js';
import {mapAudience,AUDIENCE_TARGETS} from './backend-adapter.js';

export const PROMOTION_STORAGE_KEY='rally-pizza-promotions-v1';
// Fixture audiences exist for these canonical topics; live mode offers all 10.
export const promoTopics=topicOptions.filter(topic=>['tomatoes-sauce','dough-flour','ovens-equipment'].includes(topic.id));
export {AUDIENCE_TARGETS};
// Seeded sample observations shaped like GET /topics/{id}/experts and /topics/{id}/influencers.
const sample={
  'tomatoes-sauce':{experts:[['maya',6,0.81],['theo',5,0.78]],influencers:[['maya',2.4,0.74],['samir',1.9,0.69]]},
  'dough-flour':{experts:[['elena',7,0.84],['maya',3,0.66]],influencers:[['maya',1.6,0.71]]},
  'ovens-equipment':{experts:[['nia',6,0.8],['theo',4,0.72]],influencers:[['nia',2.1,0.76]]},
};
const ref=person=>({id:person.id,name:person.name,company:person.company,title:person.role});
function payloads(topicId){
  const topic=topics.find(item=>item.id===topicId),data=sample[topicId];
  const person=key=>people.find(item=>item.id===persona[key]);
  const experts={topic:{id:topic.id,idx:topic.idx,name:topic.name,description:topic.description},limit:5,graph_revision:0,status:'ready',items:data.experts.map(([key,m,comp],index)=>({rank:index+1,person:ref(person(key)),comp,comp_unc:Math.round(2/(2+m)*1000)/1000,m,reason:`People they met at the show rate them highly on ${topic.name} (${m} conversations)`,evidence:[{label:`Compared notes on ${topic.name} with ${m} people at the show`,kind:'peer_votes'}]}))};
  const influencers={event:{kind:'topic',id:topic.id,name:topic.name,profile:{[topic.id]:1}},n_targets:40,expected_reach:data.influencers.reduce((sum,[,gain])=>sum+gain,0),influencers:data.influencers.map(([key,gain,like])=>({person:ref(person(key)),marginal_reach:gain,comp_x:0.7,m:4,like,like_n:8,tribe:0,broker:0.1,reach:12,top_targets:[]}))};
  return {experts,influencers};
}
export function promoAudience(topicId,target='both'){
  if(!sample[topicId]||!AUDIENCE_TARGETS.some(item=>item.id===target))throw new Error('Choose a topic and audience.');
  const {experts,influencers}=payloads(topicId);
  return mapAudience(experts,influencers,target,'sample_graph').map(item=>({...item,person:{...people.find(person=>person.id===item.id),...item.person}}));
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
