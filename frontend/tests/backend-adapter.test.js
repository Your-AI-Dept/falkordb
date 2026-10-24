import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSurvey,mapTopics,mapRanking,mapAudience,meetingCoordinates,didntMeet,AUDIENCE_TARGETS} from '../src/backend-adapter.js';
test('backend completion skips remaining questions when participants did not meet; revisions and reviews survive',()=>{
 const raw={meeting_id:'s0-d0-PE27-00001-PE27-00002',rater_id:'PE27-00001',partner:{id:'PE27-00002',name:'B Person',title:'Owner'},graph_revision:4,survey_revision:2,complete:true,current_question_id:null,questions:[{question_id:'met',version:1,kind:'met',text:'Met?',required:true,options:[{value:'yes',label:'Yes, we met'},{value:'no',label:'We didn’t meet'}]},{question_id:'act',version:1,kind:'act',text:'Act?',required:true,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}],answers:{met:'no'}};
 const s=mapSurvey(raw,{id:'PE27-00001',name:'A'});assert.equal(s.complete,true);assert.equal(s.queuedQuestions.length,0);assert.equal(s.answers[0].answerLabel,'We didn’t meet');assert.equal(s.subject.role,'Owner');assert.equal(s.subject.initials,'BP');assert.equal(s.canRevise,true);assert.equal(s.graphRevision,4);assert.throws(()=>mapSurvey(raw,{id:'other',name:'Other'}),/another attendee/);
 assert.equal(didntMeet(s),true);
 assert.deepEqual(meetingCoordinates(raw.meeting_id),{kind:'date',session:0,date:0,participants:['PE27-00001','PE27-00002']});
 assert.deepEqual(meetingCoordinates('c12-PE27-00001-PE27-00002'),{kind:'checkin',tick:12,participants:['PE27-00001','PE27-00002']});
 assert.throws(()=>meetingCoordinates('meet-theo'),/current session/);
});
test('topic and ranking mapping preserves backend IDs, order and evidence',()=>{
 const topic={id:'tomatoes-sauce',name:'Tomatoes & Sauce'};assert.equal(mapTopics([topic]).topics[0].label,topic.name);
 const person={id:'PE27-00001',name:'A',title:'Owner'},raw={topic,limit:5,graph_revision:2,status:'ready',items:[{rank:1,person,comp:.8,m:3,reason:'Peer comparisons',evidence:[{label:'3 partners',kind:'peer_votes'}]}]};
 assert.equal(mapRanking(raw).items[0].person.role,'Owner');
 const audience=mapAudience(raw,{influencers:[{person,m:3,comp_x:.8,like:.7,like_n:6,marginal_reach:2.4}]},'both');assert.equal(audience.length,1);assert.equal(audience[0].marginalReach,2.4);assert.deepEqual(audience[0].kinds,['expert','micro_influencer']);assert.equal(audience[0].source,'backend_graph');
});
test('exhibitor audiences are topic experts, micro-influencers, or both',()=>{
 assert.deepEqual(AUDIENCE_TARGETS.map(item=>item.id),['experts','influencers','both']);
 const topic={id:'dough-flour',name:'Dough & Flour'},a={id:'PE27-00001',name:'Expert',title:'Owner'},b={id:'PE27-00002',name:'Connector',title:'Chef'};
 const experts={topic,limit:5,graph_revision:0,status:'ready',items:[{rank:1,person:a,comp:.8,m:4,reason:'r',evidence:[{label:'e',kind:'peer_votes'}]}]};
 const influencers={influencers:[{person:b,m:2,comp_x:.6,like:.9,like_n:5,marginal_reach:1.5}]};
 assert.deepEqual(mapAudience(experts,influencers,'experts').map(item=>item.id),[a.id]);
 const only=mapAudience(experts,influencers,'influencers');
 assert.deepEqual(only.map(item=>item.id),[b.id]);assert.deepEqual(only[0].kinds,['micro_influencer']);assert.match(only[0].evidenceLabels[1],/Liked by 90% of 5/);
 assert.throws(()=>mapAudience(experts,influencers,'connectors'),/audience/);
});
