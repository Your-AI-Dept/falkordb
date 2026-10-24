import {PROMOTION_STORAGE_KEY,freshPromotions,inviteAudience,updatePromoResponse,savePromoFeedback,promoInvitations,exhibitorCampaign} from './demo-promotions.js';
// Invitation delivery remains browser-local; audience identities can come from the live graph.
const localOnly=()=>{};
function read(){try{const saved=JSON.parse(localStorage.getItem(PROMOTION_STORAGE_KEY));if(saved?.version===1&&Array.isArray(saved.campaigns))return saved;}catch{}return freshPromotions();}
function write(next){localStorage.setItem(PROMOTION_STORAGE_KEY,JSON.stringify(next));window.dispatchEvent(new Event('rally-promotions'));return next;}
export const promotions={
  campaign:id=>{localOnly();return exhibitorCampaign(read(),id);},
  invitations:participant=>{localOnly();return promoInvitations(read(),participant);},
  invite:(draft,ids,audience)=>{localOnly();return exhibitorCampaign(write(inviteAudience(read(),draft,ids,audience)),draft.campaignId);},
  respond:(id,participant,action)=>{localOnly();write(updatePromoResponse(read(),id,participant,action));},
  feedback:(id,participant,value)=>{localOnly();write(savePromoFeedback(read(),id,participant,value));},
  subscribe:callback=>{
    const storage=event=>{if(!event.key||event.key===PROMOTION_STORAGE_KEY)callback();};
    window.addEventListener('storage',storage);window.addEventListener('rally-promotions',callback);window.addEventListener('focus',callback);
    return()=>{window.removeEventListener('storage',storage);window.removeEventListener('rally-promotions',callback);window.removeEventListener('focus',callback);};
  },
};
