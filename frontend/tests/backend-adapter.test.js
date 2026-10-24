import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSurvey,mapTopics,mapRanking,mapAudience,meetingCoordinates} from '../src/backend-adapter.js';
test('backend completion skips remaining questions when participants did not meet; revisions and reviews survive',()=>{
 const raw={meeting_id:'s0-d0-PE27-00001-PE27-00002',rater_id:'PE27-00001',partner:{id:'PE27-00002',name:'B',title:'Owner'},graph_revision:4,survey_revision:2,complete:true,current_question_id:null,questions:[{question_id:'met',version:1,text:'Met?',required:true,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]},{question_id:'act',version:1,text:'Act?',required:true,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}],answers:{met:'no'}};
 const s=mapSurvey(raw,{id:'PE27-00001',name:'A'});assert.equal(s.complete,true);assert.equal(s.queuedQuestions.length,0);assert.equal(s.answers[0].answerLabel,'No');assert.equal(s.subject.role,'Owner');assert.equal(s.canRevise,true);assert.equal(s.graphRevision,4);assert.throws(()=>mapSurvey(raw,{id:'other',name:'Other'}),/another attendee/);
 assert.deepEqual(meetingCoordinates(raw.meeting_id),{session:0,date:0,participants:['PE27-00001','PE27-00002']});
});
test('topic and ranking mapping preserves backend IDs, order and evidence',()=>{
 const topic={id:'tomatoes-sauce',name:'Tomatoes & Sauce'};assert.equal(mapTopics([topic]).topics[0].label,topic.name);
 const person={id:'PE27-00001',name:'A',title:'Owner'},raw={topic,limit:5,graph_revision:2,status:'ready',items:[{rank:1,person,comp:.8,m:3,reason:'Peer comparisons',evidence:[{label:'3 partners',kind:'peer_votes'}]}]};
 assert.equal(mapRanking(raw).items[0].person.role,'Owner');
 const audience=mapAudience(raw,{influencers:[{person,m:3,comp_x:.8,marginal_reach:2.4}]},'both');assert.equal(audience.length,1);assert.equal(audience[0].marginalReach,2.4);assert.equal(audience[0].connections,undefined);assert.equal(audience[0].source,'backend_graph');
});
