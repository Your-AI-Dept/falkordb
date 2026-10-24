import {mapSurvey,mapTopics,mapRanking,meetingCoordinates,mapAudience,mapMeetingWhy,mapAudienceExplanation} from './backend-adapter.js';
// Live graph routes (backend/openapi.json). Fixture mode builds the same payloads in demo-graph.js.
export function createGraphClient(request){
  async function audienceRequest(topicId,target){
    const topic=encodeURIComponent(topicId);
    const [experts,influencers]=await Promise.all([request(`/topics/${topic}/experts?limit=5`),target==='experts'?Promise.resolve({influencers:[]}):request(`/topics/${topic}/influencers`)]);
    return {items:mapAudience(experts,influencers,target),explanation:target==='experts'?null:mapAudienceExplanation(influencers)};
  }
  async function surveyRequest(meetingId,respondentId,options,answer){
    const coordinates=meetingCoordinates(meetingId);
    if(!coordinates.participants.includes(respondentId))throw new Error('Choose a participant in this meeting.');
    const partner=coordinates.participants.find(id=>id!==respondentId);
    const path=coordinates.kind==='date'
      ?`/sessions/${coordinates.session}/dates/${coordinates.date}/meetings/${encodeURIComponent(respondentId)}`
      :`/checkins/${encodeURIComponent(respondentId)}/${encodeURIComponent(partner)}`;
    const respondent=await request('/attendees/'+encodeURIComponent(respondentId),{signal:options.signal});
    const raw=await request(path+(answer?'/answers':'/questions'),answer?{signal:options.signal,method:'POST',body:JSON.stringify({answers:[{question_id:answer.questionId,value:answer.answerKey}]})}:options);
    if(coordinates.kind==='date'&&raw.meeting_id!==meetingId)throw new Error('The API returned a different meeting.');
    return mapSurvey(raw,respondent);
  }
  return {
    survey:(id,respondent,options={})=>surveyRequest(id,respondent,options),
    answerSurvey:(id,respondent,answer,options={})=>surveyRequest(id,respondent,options,answer),
    topics:async(options={})=>mapTopics(await request('/topics',options)),
    rankings:async(topicId,limit,options={})=>mapRanking(await request('/topics/'+encodeURIComponent(topicId)+'/experts?limit='+limit,options)),
    audience:async(topicId,target)=>(await audienceRequest(topicId,target)).items,
    /** The audience plus "Why these people?" (null when micro-influencers aren't part of it). */
    audienceDetails:audienceRequest,
    /** "Why we matched you": GET /sessions/{s}/dates/{d}/meetings/{rater}/why. Dates only. */
    meetingWhy:async(meetingId,respondentId,options={})=>{
      const coordinates=meetingCoordinates(meetingId);
      if(coordinates.kind!=='date'||!coordinates.participants.includes(respondentId))throw new Error('Choose a planned date for this attendee.');
      const why=mapMeetingWhy(await request(`/sessions/${coordinates.session}/dates/${coordinates.date}/meetings/${encodeURIComponent(respondentId)}/why`,options));
      if(why.meetingId!==meetingId)throw new Error('The API returned a different meeting.');
      return why;
    },
  };
}
