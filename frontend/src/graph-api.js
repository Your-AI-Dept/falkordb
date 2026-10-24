import {mapSurvey,mapTopics,mapRanking,meetingCoordinates,mapAudience} from './backend-adapter.js';
export function createGraphClient(request){
  async function surveyRequest(meetingId,respondentId,options,answer){
    const coordinates=meetingCoordinates(meetingId);
    if(!coordinates.participants.includes(respondentId))throw new Error('Choose a participant in this meeting.');
    const path=`/sessions/${coordinates.session}/dates/${coordinates.date}/meetings/${encodeURIComponent(respondentId)}`;
    const respondent=await request('/attendees/'+encodeURIComponent(respondentId),{signal:options.signal});
    const raw=await request(path+(answer?'/answers':'/questions'),answer?{signal:options.signal,method:'POST',body:JSON.stringify({answers:[{question_id:answer.questionId,value:answer.answerKey}]})}:options);
    if(raw.meeting_id!==meetingId)throw new Error('The API returned a different meeting.');
    return mapSurvey(raw,respondent);
  }
  return {
    survey:(id,respondent,options={})=>surveyRequest(id,respondent,options),
    answerSurvey:(id,respondent,answer,options={})=>surveyRequest(id,respondent,options,answer),
    topics:async(options={})=>mapTopics(await request('/topics',options)),
    rankings:async(topicId,limit,options={})=>mapRanking(await request('/topics/'+encodeURIComponent(topicId)+'/experts?limit='+limit,options)),
    audience:async(topicId,target)=>{const [experts,influencers]=await Promise.all([request('/topics/'+encodeURIComponent(topicId)+'/experts?limit=5'),target==='experts'?Promise.resolve({influencers:[]}):request('/topics/'+encodeURIComponent(topicId)+'/influencers')]);return mapAudience(experts,influencers,target);},
  };
}
