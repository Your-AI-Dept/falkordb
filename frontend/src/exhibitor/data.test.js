import test from 'node:test';
import assert from 'node:assert/strict';
import {freshExhibitorState,loadExhibitorState} from './data.js';
import {freshPromotions,promoAudience,inviteAudience,updatePromoResponse,savePromoFeedback,promoInvitations,exhibitorCampaign} from '../demo-promotions.js';

test('older exhibitor identity migrates into profile setup without fabricated scheduled guests',context=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({version:3,complete:true,company:'Saved Company',booth:'500',contact:{id:'luca',name:'Saved Name'}})}});
  context.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
  const state=loadExhibitorState();
  assert.equal(state.company,'Saved Company');assert.equal(state.contact.name,'Saved Name');assert.equal(state.complete,false);assert.equal(state.version,4);
  assert.equal(state.topicId,'pizza-sauce');assert.equal('team' in state,false);
  assert.equal(exhibitorCampaign(freshPromotions(),state.campaignId),null);
});
test('expertise and relevant connections are separate audience filters with explicit sample provenance',()=>{
  const experts=promoAudience('pizza-sauce','experts'),connectors=promoAudience('pizza-sauce','connectors');
  assert.deepEqual(experts.map(item=>item.id),['maya','theo']);
  assert.deepEqual(connectors.map(item=>item.id),['maya','samir']);
  assert.ok(experts.every(item=>item.source==='sample_graph'&&item.reports>=4));
  assert.throws(()=>promoAudience('unknown'),/topic/);
});
test('invitations are explicit, scoped, and idempotent; profile goals do not fabricate acceptance',()=>{
  const draft=freshExhibitorState(),initial=freshPromotions();
  assert.deepEqual(promoInvitations(initial,'maya'),[]);
  const sent=inviteAudience(initial,draft,['maya','samir']);
  assert.equal(sent.campaigns[0].invitations.length,2);
  assert.equal(promoInvitations(sent,'maya')[0].status,'invited');
  assert.equal(promoInvitations(sent,'paul').length,0);
  assert.equal(inviteAudience(sent,draft,['maya']).campaigns[0].invitations.length,2);
  assert.throws(()=>inviteAudience(initial,draft,['nia']),/audience/);
  assert.throws(()=>inviteAudience(sent,{...draft,offer:'Changed offer'},['theo']),/new promotion/);
});
test('acceptance, check-in, finish, and required private feedback remain distinct',()=>{
  const draft=freshExhibitorState();let state=inviteAudience(freshPromotions(),draft,['maya']);
  assert.throws(()=>updatePromoResponse(state,draft.campaignId,'paul','accept'),/addressed to you/);
  assert.throws(()=>updatePromoResponse(state,draft.campaignId,'maya','check_in'),/already/);
  state=updatePromoResponse(state,draft.campaignId,'maya','accept');
  assert.equal(promoInvitations(state,'maya')[0].checkedInAt,undefined);
  assert.strictEqual(updatePromoResponse(state,draft.campaignId,'maya','accept'),state);
  state=updatePromoResponse(state,draft.campaignId,'maya','check_in');
  assert.ok(promoInvitations(state,'maya')[0].checkedInAt);
  assert.throws(()=>savePromoFeedback(state,draft.campaignId,'maya','yes'),/Finish/);
  state=updatePromoResponse(state,draft.campaignId,'maya','finish');
  assert.equal(promoInvitations(state,'maya')[0].status,'feedback_due');
  state=savePromoFeedback(state,draft.campaignId,'maya','no');
  assert.equal(promoInvitations(state,'maya')[0].status,'completed');
  const publicGuest=exhibitorCampaign(state,draft.campaignId).invitations[0];
  assert.equal('feedback' in publicGuest,false);assert.ok(publicGuest.checkedInAt);
});
test('a decline does not become attendance and a new campaign keeps previous invitations intact',()=>{
  const first=freshExhibitorState(),second=freshExhibitorState();
  let state=inviteAudience(freshPromotions(),first,['maya']);
  state=updatePromoResponse(state,first.campaignId,'maya','decline');
  assert.throws(()=>updatePromoResponse(state,first.campaignId,'maya','check_in'),/already/);
  state=inviteAudience(state,second,['theo']);
  assert.equal(state.campaigns.length,2);assert.equal(promoInvitations(state,'maya')[0].status,'declined');
  assert.equal(promoInvitations(state,'theo')[0].status,'invited');
});
