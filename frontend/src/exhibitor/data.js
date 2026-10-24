import {persona} from '../data/pizza-expo.js';
import {isTopic} from '../data/topics.js';
export const EXHIBITOR_STORAGE_KEY='rally.pizza-exhibitor.v2';
export const activation=Object.freeze({day:'Wednesday',label:'1:00–2:00 PM'});
// Topic ids saved by earlier versions, mapped to the canonical ids.
const LEGACY_TOPICS={'pizza-sauce':'tomatoes-sauce',dough:'dough-flour',ovens:'ovens-equipment'};
const LEGACY_TARGETS={connectors:'influencers'};
// Mutti (exhibitor EX-067, booth 1128) with staff member Bassam Khoury, from data/program/exhibitors.json.
export function freshExhibitorState(){return {version:4,complete:false,campaignId:crypto.randomUUID(),vendorId:'EX-067',company:'Mutti',booth:'1128',contact:{id:persona.luca,name:'Bassam Khoury',role:'Sales Specialist'},context:'Italian tomato products for independent pizzerias.',product:'New pizza sauce launch',offer:'Private tasting + 20% off your first order',topicId:'tomatoes-sauce',target:'both'};}
function canonical(state,fallback){
  const topicId=LEGACY_TOPICS[state.topicId]||state.topicId;
  const target=LEGACY_TARGETS[state.target]||state.target;
  return {...state,topicId:isTopic(topicId)?topicId:fallback.topicId,target:['experts','influencers','both'].includes(target)?target:fallback.target};
}
export function loadExhibitorState(){
  const fallback=freshExhibitorState();
  try{
    const saved=JSON.parse(localStorage.getItem(EXHIBITOR_STORAGE_KEY));
    if(!saved||![2,3,4].includes(saved.version))return fallback;
    const contact=saved.contact||saved.team?.[0];
    if(!saved.company?.trim()||!saved.booth?.trim()||!contact?.name?.trim())return fallback;
    if(saved.version===4)return canonical({...fallback,...saved,contact:{...fallback.contact,...contact}},fallback);
    // Preserve identity; the new launch demo deliberately starts with profile setup.
    return {...fallback,company:saved.company,booth:saved.booth,contact:{...fallback.contact,id:contact.id,name:contact.name}};
  }catch{return fallback;}
}
