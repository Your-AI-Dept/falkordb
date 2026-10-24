import test from 'node:test';
import assert from 'node:assert/strict';
import {freshExhibitorState,loadExhibitorState} from './data.js';
import {freshPromotions,promoAudience,promoTopics,inviteAudience,updatePromoResponse,savePromoFeedback,promoInvitations,exhibitorCampaign} from '../demo-promotions.js';
import {persona as P} from '../data/pizza-expo.js';

function withStorage(context,saved){
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify(saved)}});
  context.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
}
test('older exhibitor identity migrates into profile setup without fabricated scheduled guests',context=>{
  withStorage(context,{version:3,complete:true,company:'Saved Company',booth:'500',contact:{id:P.luca,name:'Saved Name'}});
  const state=loadExhibitorState();
  assert.equal(state.company,'Saved Company');assert.equal(state.contact.name,'Saved Name');assert.equal(state.complete,false);assert.equal(state.version,4);
  assert.equal(state.topicId,'tomatoes-sauce');assert.equal('team' in state,false);
  assert.equal(exhibitorCampaign(freshPromotions(),state.campaignId),null);
});
test('saved legacy topic and audience ids map to the canonical vocabulary',context=>{
  withStorage(context,{...freshExhibitorState(),topicId:'pizza-sauce',target:'connectors'});
  const state=loadExhibitorState();
  assert.equal(state.topicId,'tomatoes-sauce');assert.equal(state.target,'influencers');
});
test('the demo exhibitor is a real exhibitor and staff member',()=>{
  const state=freshExhibitorState();
  assert.equal(state.vendorId,'EX-067');assert.equal(state.company,'Mutti');assert.equal(state.contact.id,P.luca);
  assert.deepEqual(promoTopics.map(topic=>topic.id),['tomatoes-sauce','dough-flour','ovens-equipment']);
});
test('topic experts and micro-influencers are separate audiences with explicit sample provenance',()=>{
  const experts=promoAudience('tomatoes-sauce','experts'),influencers=promoAudience('tomatoes-sauce','influencers');
  assert.deepEqual(experts.map(item=>item.id),[P.maya,P.theo]);
  assert.deepEqual(influencers.map(item=>item.id),[P.maya,P.samir]);
  assert.ok(experts.every(item=>item.source==='sample_graph'&&item.kinds.includes('expert')&&item.reports>=4));
  assert.ok(influencers.every(item=>item.marginalReach>0&&item.kinds.includes('micro_influencer')));
  assert.deepEqual(promoAudience('tomatoes-sauce','both').map(item=>item.id),[P.maya,P.theo,P.samir]);
  assert.throws(()=>promoAudience('unknown'),/topic/);
});
test('invitations are explicit, scoped, and idempotent; profile goals do not fabricate acceptance',()=>{
  const draft=freshExhibitorState(),initial=freshPromotions();
  assert.deepEqual(promoInvitations(initial,P.maya),[]);
  const sent=inviteAudience(initial,draft,[P.maya,P.samir]);
  assert.equal(sent.campaigns[0].invitations.length,2);
  assert.equal(promoInvitations(sent,P.maya)[0].status,'invited');
  assert.equal(promoInvitations(sent,P.paul).length,0);
  assert.equal(inviteAudience(sent,draft,[P.maya]).campaigns[0].invitations.length,2);
  assert.throws(()=>inviteAudience(initial,draft,[P.nia]),/audience/);
  assert.throws(()=>inviteAudience(sent,{...draft,offer:'Changed offer'},[P.theo]),/new promotion/);
});
test('a live audience can be invited when it is passed in',()=>{
  const live=[{id:'PE27-00123',person:{id:'PE27-00123',name:'Live Person'}}];
  assert.equal(inviteAudience(freshPromotions(),freshExhibitorState(),['PE27-00123'],live).campaigns[0].invitations[0].person.name,'Live Person');
});
test('acceptance, check-in, finish, and required private feedback remain distinct',()=>{
  const draft=freshExhibitorState();let state=inviteAudience(freshPromotions(),draft,[P.maya]);
  assert.throws(()=>updatePromoResponse(state,draft.campaignId,P.paul,'accept'),/addressed to you/);
  assert.throws(()=>updatePromoResponse(state,draft.campaignId,P.maya,'check_in'),/already/);
  state=updatePromoResponse(state,draft.campaignId,P.maya,'accept');
  assert.equal(promoInvitations(state,P.maya)[0].checkedInAt,undefined);
  assert.strictEqual(updatePromoResponse(state,draft.campaignId,P.maya,'accept'),state);
  state=updatePromoResponse(state,draft.campaignId,P.maya,'check_in');
  assert.ok(promoInvitations(state,P.maya)[0].checkedInAt);
  assert.throws(()=>savePromoFeedback(state,draft.campaignId,P.maya,'yes'),/Finish/);
  state=updatePromoResponse(state,draft.campaignId,P.maya,'finish');
  assert.equal(promoInvitations(state,P.maya)[0].status,'feedback_due');
  state=savePromoFeedback(state,draft.campaignId,P.maya,'no');
  assert.equal(promoInvitations(state,P.maya)[0].status,'completed');
  const publicGuest=exhibitorCampaign(state,draft.campaignId).invitations[0];
  assert.equal('feedback' in publicGuest,false);assert.ok(publicGuest.checkedInAt);
});
test('a decline does not become attendance and a new campaign keeps previous invitations intact',()=>{
  const first=freshExhibitorState(),second=freshExhibitorState();
  let state=inviteAudience(freshPromotions(),first,[P.maya]);
  state=updatePromoResponse(state,first.campaignId,P.maya,'decline');
  assert.throws(()=>updatePromoResponse(state,first.campaignId,P.maya,'check_in'),/already/);
  state=inviteAudience(state,second,[P.theo]);
  assert.equal(state.campaigns.length,2);assert.equal(promoInvitations(state,P.maya)[0].status,'declined');
  assert.equal(promoInvitations(state,P.theo)[0].status,'invited');
});
