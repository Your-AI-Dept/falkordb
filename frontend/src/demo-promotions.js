import {people} from './data/pizza-expo.js';

export const PROMOTION_STORAGE_KEY='rally-pizza-promotions-v1';
export const promoTopics=[{id:'pizza-sauce',label:'Pizza sauce'},{id:'dough',label:'Dough & fermentation'},{id:'ovens',label:'Pizza ovens'}];
// Seeded graph observations for the local demo, not scraped relationships or live scores.
const evidence={
  'pizza-sauce':[
    {id:'maya',reports:6,connections:8,expertise:'Strong',reason:'Peers report learning about sauce consistency; connected to pizzeria operators.'},
    {id:'theo',reports:5,connections:6,expertise:'Strong',reason:'Peer reports on ingredient evaluation; connects operators working on sourcing.'},
    {id:'samir',reports:2,connections:14,expertise:'Developing',reason:'Connects producers and restaurant operators across the ingredient supply chain.'},
  ],
  dough:[{id:'elena',reports:7,connections:9,expertise:'Strong',reason:'Peers report learning about fermentation and dough consistency.'},{id:'maya',reports:3,connections:8,expertise:'Developing',reason:'Connected to operators comparing dough and ingredient choices.'}],
  ovens:[{id:'nia',reports:6,connections:10,expertise:'Strong',reason:'Peers report learning about oven selection and kitchen capacity.'},{id:'theo',reports:4,connections:6,expertise:'Strong',reason:'Connects operators evaluating kitchen equipment.'}],
};
export function promoAudience(topicId,target='both'){
  if(!promoTopics.some(topic=>topic.id===topicId)||!['experts','connectors','both'].includes(target))throw new Error('Choose a topic and audience.');
  return evidence[topicId].filter(item=>target==='experts'?item.reports>=4:target==='connectors'?item.connections>=8:true).map(item=>({...item,person:people.find(person=>person.id===item.id),topicId,source:'sample_graph'}));
}
export function freshPromotions(){return {version:1,campaigns:[]};}
export function inviteAudience(store,draft,recipientIds,audience){
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
