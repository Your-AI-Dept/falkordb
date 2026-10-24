// Live mode (VITE_DATA_MODE=live): builds the same Dashboard shape the original attendee flow reads,
// from the backend's real attendees, session plans and surveys. Identity is an attendee picker
// standing in for authentication. What the backend doesn't store yet (profile/goal edits, saved
// connections list, check-in/finish progress) stays in this browser, per attendee.
import {event,goals} from './data/pizza-expo.js';
import {topicName} from './data/topics.js';
import {personFromBackend,didntMeet} from './backend-adapter.js';
import {meetingId,sessionProgress} from './demo-agenda.js';

const IDENTITY_KEY='rally-live-identity';
const stateKey=id=>'rally-live-attendee-v1:'+id;
const businessType=raw=>/pizzeria|franchisee|operator|chain/i.test(raw||'')?'pizzeria':/supplier|manufacturer/i.test(raw||'')?'supplier':/distributor/i.test(raw||'')?'distributor':'other';

export function liveIdentity(){
  const fromUrl=new URLSearchParams(globalThis.location?.search||'').get('participant');
  if(fromUrl?.startsWith('PE27-'))return fromUrl;
  try{return localStorage.getItem(IDENTITY_KEY)||'';}catch{return '';}
}
export function setLiveIdentity(id){try{localStorage.setItem(IDENTITY_KEY,id);}catch{/* memory only */}}
export function clearLiveIdentity(){try{localStorage.removeItem(IDENTITY_KEY);}catch{/* memory only */}}

function readLocal(id,detail){
  try{const saved=JSON.parse(localStorage.getItem(stateKey(id)));if(saved?.version===2&&saved.profile)return saved;}catch{/* fresh */}
  return {version:2,onboardingComplete:false,profile:{name:detail.name,role:detail.title||'',company:detail.company||'',businessType:businessType(detail.business_type),context:[detail.title,detail.company].filter(Boolean).join(' at ')||detail.business_type||'Pizza Expo attendee',linkedin:'',goals:[],focus:'',intention:''},encounters:[],feedback:null,requestedIds:[],dismissedIds:[],agendaProgress:{}};
}
function writeLocal(id,state){try{localStorage.setItem(stateKey(id),JSON.stringify(state));}catch{/* memory only */}return state;}

/** The session to show: the open one this attendee is in, else their latest closed one, else their next one. */
export function pickSession(sessions,attending){
  const mine=sessions.filter(item=>attending.includes(item.session));
  return mine.find(item=>item.state==='open')||[...mine].reverse().find(item=>item.state==='closed')||mine.find(item=>item.state==='planned')||null;
}
function dateTime(slot,date){
  const [h,m]=slot.start.split(':').map(Number),start=h*60+m+date*15;
  const fmt=n=>{const hh=Math.floor(n/60),mm=String(n%60).padStart(2,'0');return `${(hh+11)%12+1}:${mm} ${hh<12?'AM':'PM'}`;};
  return `Day ${slot.day} · ${fmt(start)}–${fmt(start+15)}`;
}

export function createLiveSource(request,graph){
  let summaries=null;
  async function people(){
    if(!summaries)summaries=(await request('/attendees')).map(p=>({...personFromBackend(p),category:p.business_type,topics:p.top_interests,badge:p.id,bio:'',offering:'',lookingFor:''}));
    return summaries;
  }
  async function agenda(viewerId,detail,local){
    const sessions=await request('/sessions');
    const slot=pickSession(sessions,detail.sessions||[]);
    if(!slot)return {agenda:[],session:null};
    const plan=await request('/sessions/'+slot.session);
    const all=await people();
    const stops=[];
    for(const date of plan.dates){
      const pair=date.pairs.find(p=>p.a.id===viewerId||p.b.id===viewerId);
      if(!pair)continue;
      const partner=pair.a.id===viewerId?pair.b:pair.a;
      const complete=pair.a.id===viewerId?pair.complete_a:pair.complete_b;
      const known=all.find(p=>p.id===partner.id);
      const shared=(known?.topics||[]).find(t=>(detail.top_interests||[]).includes(t))||known?.topics?.[0];
      const id=meetingId(slot.session,date.date_no,pair.a.id,pair.b.id);
      let status=local.agendaProgress?.[id]?.status||'scheduled';
      if(complete){
        const survey=await graph.survey(id,viewerId).catch(()=>null);
        status=survey&&didntMeet(survey)?'missed':'completed';
      }else if(date.state==='closed')status='missed';  // answers after a date closes no longer reach the graph
      stops.push({id,kind:'meeting',sessionId:'session-'+slot.session,session:slot.session,date:date.date_no,dateState:date.state,round:date.date_no+1,personId:partner.id,time:dateTime(slot,date.date_no),location:'Meeting tables',topic:shared?topicName(shared):'Speed date',topicId:shared||null,reason:'',status,person:known||personFromBackend(partner)});
    }
    const session={id:'session-'+slot.session,session:slot.session,title:'Speed networking · Session '+(slot.session+1),day:'Day '+slot.day,time:`${slot.start}–${slot.end}`,location:'Meeting tables'};
    return {agenda:stops,session:stops.length?sessionProgress(stops,session):null};
  }
  async function dashboard(viewerId){
    if(!viewerId)throw Object.assign(new Error('Choose who you are to see your day.'),{code:'identity_required'});
    const detail=await request('/attendees/'+encodeURIComponent(viewerId));
    const local=readLocal(viewerId,detail);
    const [{agenda:stops,session},all]=await Promise.all([agenda(viewerId,detail,local),people()]);
    return {event,graphRevision:0,viewerId,state:local,people:all,agenda:stops,session,recommendations:[],viewer:{badgeToken:viewerId},meeting:null,meetingRequests:[],invitation:null,goals};
  }
  function update(viewerId,change){return readLocalCached(viewerId).then(state=>writeLocal(viewerId,change(state)));}
  async function readLocalCached(viewerId){return readLocal(viewerId,await request('/attendees/'+encodeURIComponent(viewerId)));}
  return {
    dashboard,
    people,
    saveProfile:(viewerId,profile)=>update(viewerId,state=>({...state,onboardingComplete:true,profile,dismissedIds:[]})),
    /** QR scan: POST /checkins creates the ADHOC tie and prompts both people with 2–3 questions. */
    async scan(viewerId,input){
      let token=input.trim();
      if(/^https?:\/\//i.test(token)){try{token=new URL(token).searchParams.get('badge')||'';}catch{token='';}}
      token=token.toUpperCase();
      if(token===viewerId)throw new Error('That is your own badge. Try another attendee’s badge.');
      const result=await request('/checkins',{method:'POST',body:JSON.stringify({scanner_id:viewerId,scanned_id:token})});
      const survey=result.scanner_questions;
      await update(viewerId,state=>state.encounters.some(e=>e.personId===token)?state:{...state,encounters:[...state.encounters,{id:survey.meeting_id,personId:token,kind:'chosen_qr_connection',meetingId:survey.meeting_id,createdAt:new Date().toISOString()}]});
      return {person:personFromBackend(survey.partner),duplicate:result.count>1,meetingId:survey.meeting_id};
    },
    async assignment(viewerId,id,action){
      const data=await dashboard(viewerId);
      const stop=data.agenda.find(item=>item.id===id);
      if(!stop)throw new Error('This stop is no longer on your schedule.');
      if(stop.dateState==='planned'&&action==='check_in')throw new Error('This date hasn’t started yet. The organizer opens each date in turn.');
      const status={check_in:'checked_in',finish:'feedback_due',miss:'missed'}[action];
      if(!status)throw new Error('Choose a valid schedule action.');
      await update(viewerId,state=>({...state,agendaProgress:{...state.agendaProgress,[id]:{status,updatedAt:new Date().toISOString()}}}));
    },
    reset:viewerId=>{try{localStorage.removeItem(stateKey(viewerId));}catch{/* memory only */}},
  };
}
