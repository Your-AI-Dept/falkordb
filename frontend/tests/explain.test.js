import test from 'node:test';
import assert from 'node:assert/strict';
import {mapMeetingWhy,mapInfluencerWhy,mapAudienceExplanation,mapAudience,mapReason,TIE_LABELS} from '../src/backend-adapter.js';
import {createGraphClient} from '../src/graph-api.js';
import {demoMeetingWhyPayload,demoMeetingWhy} from '../src/demo-explain.js';
import {promoAudienceDetails} from '../src/demo-promotions.js';
import {demoMeetings} from '../src/demo-agenda.js';
import {freshState} from '../src/demo.js';
import {persona} from '../src/data/pizza-expo.js';

const a={id:'PE27-00001',name:'Ana Ruiz',company:'Ruiz Pizza',title:'Owner'},b={id:'PE27-00002',name:'Sam Lee',company:'Mill Co',title:'Rep'},c={id:'PE27-00003',name:'Kim Park',company:'X',title:'Chef'};
const meetingWhy=(overrides={})=>({
  meeting_id:'s0-d1-PE27-00001-PE27-00002',session:0,date_no:1,rater:a,partner:b,headline:'Sam can teach you about Dough & Flour.',
  score:{value_for_you:0.82,value_for_them:0.74,pair_score:0.74,date_floor:0.61,components:{learn:0.41,enjoy:0.31,new_circle:0.2,already_connected:0,explore:0.09}},
  reasons:[{kind:'learn_from_them',title:'Learn about Dough & Flour',detail:'Top 5%',weight:0.41,topic_id:'dough-flour'},{kind:'brand_new_kind',title:'Something new',detail:'Still renders'}],
  path:[{person:a,via:'LINKEDIN'},{person:c,via:'POS_TIE'},{person:b,via:null}],
  evidence_queries:[{label:'Shortest social path',cypher:'MATCH p=... RETURN p'},{label:'',cypher:'dropped'}],
  ...overrides,
});
// Keys of backend/app/models.py MeetingWhy (and nested shapes) that the UI relies on.
const MEETING_WHY_KEYS=['meeting_id','session','date_no','rater','partner','headline','score','reasons','path','evidence_queries'];

test('MeetingWhy maps to the UI shape: ranked reasons, labelled path, queries',()=>{
  const why=mapMeetingWhy(meetingWhy());
  assert.equal(why.meetingId,'s0-d1-PE27-00001-PE27-00002');
  assert.equal(why.date,1);
  assert.equal(why.partner.role,'Rep');
  assert.equal(why.score.pairScore,0.74);
  assert.equal(why.score.dateFloor,0.61);
  assert.equal(why.reasons[0].topicId,'dough-flour');
  assert.deepEqual(why.reasons[1],{kind:'brand_new_kind',title:'Something new',detail:'Still renders',weight:null,topicId:null},'unknown kinds still render');
  assert.deepEqual(why.path.map(step=>step.viaLabel),['LinkedIn','trusts their advice',null]);
  assert.equal(TIE_LABELS.ADHOC,'met at the show');
  assert.deepEqual(why.evidenceQueries,[{label:'Shortest social path',cypher:'MATCH p=... RETURN p'}],'incomplete queries are dropped');
});

test('MeetingWhy: no social path is null; malformed payloads are rejected',()=>{
  assert.equal(mapMeetingWhy(meetingWhy({path:null})).path,null);
  assert.equal(mapMeetingWhy(meetingWhy({path:[]})).path,null);
  assert.throws(()=>mapMeetingWhy(meetingWhy({headline:''})),/unsupported match explanation/);
  assert.throws(()=>mapMeetingWhy(meetingWhy({reasons:null})),/unsupported/);
  assert.throws(()=>mapReason({kind:'x'}),/unsupported explanation/);
});

test('influencer explanations: per-person why, audience summary and runners-up',()=>{
  assert.equal(mapInfluencerWhy(undefined),null,'missing why stays null');
  const experts={topic:{id:'dough-flour',name:'Dough & Flour'},limit:5,graph_revision:0,status:'ready',items:[]};
  const why={pick_order:1,competence_percentile:97.5,likability_percentile:81,direct_targets:9,unique_targets:7,reasons:[{kind:'competent',title:'Top 3% on Dough & Flour',detail:'4 peers',weight:null}]};
  const influencers={influencers:[{person:a,m:4,comp_x:0.8,like:0.62,like_n:6,marginal_reach:0.68,why},{person:b,m:2,comp_x:0.6,like:0.7,like_n:3,marginal_reach:0.3}],
    audience:{interested:438,covered:31,coverage_share:0.071,expected_attendees:3.1,tribes:3,method:'Picked one at a time.'},
    runners_up:[{person:c,comp_x:0.84,like:0.7,marginal_reach:0.12,reason:'Their circle overlaps Ana’s'}],evidence_queries:[{label:'q',cypher:'MATCH (n) RETURN n'}]};
  const items=mapAudience(experts,influencers,'influencers');
  assert.equal(items[0].why.pickOrder,1);
  assert.equal(items[0].why.uniqueTargets,7);
  assert.equal(items[0].why.reasons[0].title,'Top 3% on Dough & Flour');
  assert.equal(items[1].why,null);
  const explanation=mapAudienceExplanation(influencers);
  assert.equal(explanation.covered,31);
  assert.equal(explanation.tribes,3);
  assert.equal(explanation.runnersUp[0].person.name,'Kim Park');
  assert.equal(explanation.picks,2);
  assert.equal(mapAudienceExplanation({influencers:[]}),null,'older payloads without an audience summary');
});

test('live client: why route for planned dates, audience details with explanation',async()=>{
  const calls=[];
  const request=async path=>{calls.push(path);if(path.endsWith('/why'))return meetingWhy();if(path.includes('/experts'))return {topic:{id:'dough-flour',name:'Dough & Flour'},limit:5,graph_revision:0,status:'ready',items:[]};return {influencers:[],audience:{interested:10,covered:4,coverage_share:0.4,expected_attendees:1.2,tribes:2,method:'m'},runners_up:[],evidence_queries:[]};};
  const graph=createGraphClient(request);
  const why=await graph.meetingWhy('s0-d1-PE27-00001-PE27-00002','PE27-00001');
  assert.equal(calls[0],'/sessions/0/dates/1/meetings/PE27-00001/why');
  assert.equal(why.headline,'Sam can teach you about Dough & Flour.');
  await assert.rejects(graph.meetingWhy('c3-PE27-00001-PE27-00002','PE27-00001'),/planned date/);
  await assert.rejects(graph.meetingWhy('s0-d1-PE27-00001-PE27-00002','PE27-00009'),/planned date/);
  await assert.rejects(createGraphClient(async()=>meetingWhy({meeting_id:'s0-d2-PE27-00001-PE27-00002'})).meetingWhy('s0-d1-PE27-00001-PE27-00002','PE27-00001'),/different meeting/);
  const details=await graph.audienceDetails('dough-flour','both');
  assert.equal(details.explanation.covered,4);
  assert.equal((await graph.audienceDetails('dough-flour','experts')).explanation,null);
});

test('fixture match explanations follow the MeetingWhy contract for every planned date',()=>{
  const state=freshState();
  for(const id of Object.values(demoMeetings)){
    const raw=demoMeetingWhyPayload(state,id);
    assert.deepEqual(Object.keys(raw).sort(),[...MEETING_WHY_KEYS].sort());
    assert.equal(raw.meeting_id,id);
    assert.equal(raw.rater.id,persona.paul);
    assert.ok(raw.reasons.length>=4&&raw.reasons.every(r=>r.kind&&r.title&&r.detail));
    assert.ok(raw.score.pair_score<=raw.score.value_for_you&&raw.score.date_floor<=raw.score.pair_score);
    assert.ok(raw.evidence_queries.every(q=>q.label&&q.cypher.includes('MATCH')));
    assert.equal(raw.path,null,'no ties yet in a fresh demo');
    assert.equal(demoMeetingWhy(state,id).meetingId,id);
  }
  assert.throws(()=>demoMeetingWhyPayload(state,'s0-d9-PE27-00001-PE27-00002'),error=>error.status===404);
});

test('fixture: a QR check-in becomes a social path and an "already know each other" reason',()=>{
  const state={...freshState(),encounters:[{id:'e1',personId:persona.maya,kind:'chosen_qr_connection',createdAt:'2026-10-24T12:00:00Z'}]};
  const why=demoMeetingWhy(state,demoMeetings.maya);
  assert.deepEqual(why.path.map(step=>[step.person.id,step.via]),[[persona.paul,'ADHOC'],[persona.maya,null]]);
  assert.ok(why.reasons.some(r=>r.kind==='already_connected'));
  // The partner's own view explains the same meeting from their side.
  assert.equal(demoMeetingWhy(state,demoMeetings.maya,persona.maya).partner.id,persona.paul);
});

test('fixture exhibitor audience carries the influencer explanation shape',()=>{
  const both=promoAudienceDetails('tomatoes-sauce','both');
  assert.ok(both.explanation.interested>=both.explanation.covered&&both.explanation.covered>0);
  assert.equal(both.explanation.runnersUp.length,1);
  assert.ok(both.explanation.evidenceQueries.length>0);
  const picks=both.items.filter(item=>item.kinds.includes('micro_influencer'));
  assert.deepEqual(picks.map(item=>item.why.pickOrder),[1,2]);
  for(const item of picks){
    assert.ok(item.why.competencePercentile>50&&item.why.likabilityPercentile>50);
    assert.ok(item.why.uniqueTargets<=item.why.directTargets);
    assert.deepEqual(item.why.reasons.map(r=>r.kind),['competent','liked','reach']);
  }
  assert.equal(both.items.find(item=>!item.kinds.includes('micro_influencer')).why,undefined);
  assert.equal(promoAudienceDetails('tomatoes-sauce','experts').explanation,null);
  assert.ok(promoAudienceDetails('dough-flour','influencers').explanation);
});
