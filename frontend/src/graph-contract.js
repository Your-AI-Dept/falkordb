// Validate the data-driven UI boundary; do not infer live questions or rankings locally.
const text=value=>typeof value==='string'&&Boolean(value.trim());
const revision=value=>Number.isSafeInteger(value)&&value>=0;
function fail(message){throw new Error(message);}
function question(value){
  if(!value||!text(value.id)||!revision(value.version)||!text(value.prompt)||typeof value.required!=='boolean'||!Array.isArray(value.choices)||value.choices.length<2||value.choices.some(choice=>!text(choice.id)||!text(choice.label))||new Set(value.choices.map(choice=>choice.id)).size!==value.choices.length)fail('The API returned an unsupported survey question.');
}
export function validateSurvey(value) {
  if(!value||!text(value.meetingId)||!text(value.respondent?.id)||!text(value.respondent?.name)||!text(value.subject?.id)||!text(value.subject?.name)||value.respondent.id===value.subject.id||!revision(value.graphRevision)||!revision(value.surveyRevision)||typeof value.complete!=='boolean'||!Array.isArray(value.queuedQuestions)||!Array.isArray(value.answers))fail('The API returned an unsupported survey.');
  if(value.answers.some(answer=>!answer||!text(answer.questionId)||!revision(answer.questionVersion)||!text(answer.prompt)||!text(answer.answerLabel)))fail('The API returned unsupported saved answers.');
  if(value.currentQuestion)question(value.currentQuestion);
  if(value.questions!==undefined){if(!Array.isArray(value.questions))fail('The API returned unsupported review questions.');value.questions.forEach(question);}
  if(!value.complete&&!value.currentQuestion)fail('Your next question is not available yet. Please try again.');
  value.queuedQuestions.forEach(question);
  if(value.complete&&(value.currentQuestion||value.queuedQuestions.some(question=>question.required)))fail('The API returned an incomplete survey as complete.');
  return value;
}
export function validateTopics(value) {
  if(!value||!Array.isArray(value.topics)||value.topics.some(topic=>!text(topic.id)||!text(topic.label))||new Set(value.topics.map(topic=>topic.id)).size!==value.topics.length)fail('The API returned an unsupported topic list.');
  return value;
}
export function validateRanking(value,topicId,limit) {
  if(!value||value.topic?.id!==topicId||!text(value.topic.label)||value.limit!==limit||!revision(value.graphRevision)||!['ready','updating'].includes(value.status)||!Array.isArray(value.items)||value.items.length>limit||value.items.some((item,index)=>item.rank!==index+1||!text(item.person?.id)||!text(item.person?.name)||!text(item.reason))||new Set(value.items.map(item=>item.person.id)).size!==value.items.length)fail('The API returned unsupported ranked results.');
  if(value.items.some(item=>item.evidence!==undefined&&(!Array.isArray(item.evidence)||item.evidence.some(evidence=>!evidence||!text(evidence.label)))))fail('The API returned unsupported ranking evidence.');
  return value;
}
export function reconcileSurvey(current,incoming,{afterAnswer=false}={}) {
  if(!current)return incoming;
  if(current.meetingId!==incoming.meetingId||current.respondent.id!==incoming.respondent.id) return current;
  if(incoming.surveyRevision<current.surveyRevision||incoming.graphRevision<current.graphRevision)return current;
  if(afterAnswer||current.complete)return incoming;
  // An explicit edit to an earlier answer can invalidate its dependent prompt.
  const edited=current.answers.some(saved=>!incoming.answers.some(answer=>answer.questionId===saved.questionId&&answer.questionVersion===saved.questionVersion&&answer.answerKey===saved.answerKey&&answer.answerLabel===saved.answerLabel));
  if(edited)return incoming;
  const active=current.currentQuestion;
  // Do not move a question under someone’s pointer when another participant answers.
  const answered=active&&incoming.answers.some(answer=>answer.questionId===active.id&&answer.questionVersion===active.version);
  if(answered)return incoming;
  return {...incoming,complete:false,currentQuestion:active,queuedQuestions:[incoming.currentQuestion,...incoming.queuedQuestions].filter(question=>question&&(question.id!==active?.id||question.version!==active?.version))};
}
