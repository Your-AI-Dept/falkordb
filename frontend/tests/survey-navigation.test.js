import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,completeProfile,agendaFor} from '../src/demo.js';
import {demoSurvey,answerDemoSurvey} from '../src/demo-graph.js';
import {demoMeetings} from '../src/demo-agenda.js';
import {persona as P} from '../src/data/pizza-expo.js';
import {meetingPreferences,restoreMeetingTopic} from '../src/meeting-preferences.js';
import {homeLink,attendeeLink} from '../src/navigation.js';
import {reconcileSurvey} from '../src/graph-contract.js';
const id=demoMeetings.theo;
function attendee(){const state=freshState();return completeProfile(state,{...state.profile,goals:['suppliers'],focus:'tomatoes-sauce'});}
function answer(state,respondent,key,extra={}){
  const survey=demoSurvey(state,id,respondent),q=survey.currentQuestion;
  return answerDemoSurvey(state,id,respondent,{questionId:q.id,questionVersion:q.version,surveyRevision:survey.surveyRevision,answerKey:key,...extra});
}
function revise(state,respondent,questionId,key){
  const survey=demoSurvey(state,id,respondent),q=survey.questions.find(item=>item.id===questionId);
  return answerDemoSurvey(state,id,respondent,{questionId:q.id,questionVersion:q.version,surveyRevision:survey.surveyRevision,answerKey:key},{revise:true});
}
const all=(state,respondent)=>{while(!demoSurvey(state,id,respondent).complete)state=answer(state,respondent,demoSurvey(state,id,respondent).currentQuestion.choices[0].id);return state;};

test('reviewing does not mutate answers; revising one answer changes only that rater’s answer',()=>{
  let state=all(all(attendee(),P.paul),P.theo);
  const original=JSON.stringify(state),before=demoSurvey(state,id,P.paul);
  assert.equal(before.questions.length,7);assert.equal(before.complete,true);
  assert.equal(before.questions[1].choices.find(choice=>choice.id==='skip').label,'Didn’t come up');
  assert.equal(JSON.stringify(state),original);
  const otherAnswers=demoSurvey(state,id,P.theo).answers;
  const updated=revise(state,P.paul,'t0a','skip');
  assert.equal(demoSurvey(updated,id,P.paul).answers.find(a=>a.questionId==='t0a').answerKey,'skip');
  assert.equal(demoSurvey(updated,id,P.paul).answers.length,7);
  assert.deepEqual(demoSurvey(updated,id,P.theo).answers,otherAnswers);
  assert.equal(demoSurvey(updated,id,P.paul).surveyRevision,before.surveyRevision+1);
  assert.strictEqual(revise(updated,P.paul,'t0a','skip'),updated);
});
test('switching to “We didn’t meet” completes the survey and keeps the lineup',()=>{
  let state=answer(answer(attendee(),P.paul,'yes'),P.paul,'true');
  assert.equal(demoSurvey(state,id,P.paul).complete,false);
  state=revise(state,P.paul,'met','no');
  assert.equal(demoSurvey(state,id,P.paul).complete,true);
  assert.equal(agendaFor(state).find(stop=>stop.id===id).status,'missed');
  assert.deepEqual(agendaFor(state).map(stop=>stop.id),[demoMeetings.theo,demoMeetings.maya,demoMeetings.elena,demoMeetings.samir]);
});
test('written answers are not part of the backend survey',()=>{
  assert.throws(()=>answer(attendee(),P.paul,'yes',{answerText:'Hiring a kitchen manager'}),/Written answers/);
});
test('topic pauses saved by earlier versions can still be turned back on',()=>{
  const legacy={...attendee(),surveyAnswers:[{id:'old',meetingId:id,respondentId:P.paul,subjectId:P.theo,questionId:'next-priority',questionVersion:1,prompt:'Next?',answerKey:'no_similar',answerLabel:'No more meetups',preference:{kind:'avoid_topic',topicId:'tomatoes-sauce',topicLabel:'Tomatoes & Sauce'}}]};
  assert.deepEqual(meetingPreferences(legacy).map(item=>item.topicId),['tomatoes-sauce']);
  assert.equal(meetingPreferences(legacy,P.theo).length,0);
  assert.equal(meetingPreferences(restoreMeetingTopic(legacy,P.paul,'tomatoes-sauce')).length,0);
});
test('a revised answer from another tab replaces the displayed survey',()=>{
  const state=answer(attendee(),P.paul,'yes');
  const displayed=demoSurvey(state,id,P.paul);
  const changed=demoSurvey(revise(state,P.paul,'met','no'),id,P.paul);
  const merged=reconcileSurvey(displayed,changed);
  assert.equal(merged.complete,true);assert.equal(merged.currentQuestion,null);
});
test('home navigation keeps the attendee and exhibitor context without carrying survey routes',()=>{
  assert.equal(homeLink(`?view=survey&meeting=${id}&participant=${P.theo}`),`?view=attendee&participant=${P.theo}`);
  assert.equal(homeLink('?view=exhibitor'),'?view=exhibitor');
  assert.equal(homeLink(`?view=rankings&participant=${P.paul}`),'?view=attendee');
  assert.equal(attendeeLink('rankings',P.theo),`?view=rankings&participant=${P.theo}`);
});
