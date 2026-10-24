export const EXHIBITOR_STORAGE_KEY='rally.pizza-exhibitor.v2';
export const activation=Object.freeze({day:'Wednesday',label:'1:00–2:00 PM'});
export function freshExhibitorState(){return {version:4,complete:false,campaignId:crypto.randomUUID(),company:'Terra Rossa',booth:'412',contact:{id:'luca',name:'Luca Rinaldi',role:'Founder'},context:'We make Italian tomato products for independent pizzerias.',product:'New pizza sauce launch',offer:'Private tasting + 20% off your first order',topicId:'pizza-sauce',target:'both'};}
export function loadExhibitorState(){
  const fallback=freshExhibitorState();
  try{
    const saved=JSON.parse(localStorage.getItem(EXHIBITOR_STORAGE_KEY));
    if(!saved||![2,3,4].includes(saved.version))return fallback;
    const contact=saved.contact||saved.team?.[0];
    if(!saved.company?.trim()||!saved.booth?.trim()||!contact?.name?.trim())return fallback;
    if(saved.version===4)return {...fallback,...saved,contact:{...fallback.contact,...contact}};
    // Preserve identity; the new launch demo deliberately starts with profile setup.
    return {...fallback,company:saved.company,booth:saved.booth,contact:{...fallback.contact,id:contact.id,name:contact.name}};
  }catch{return fallback;}
}
