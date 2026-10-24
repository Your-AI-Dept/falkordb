import {validateSurvey,validateTopics,validateRanking} from './graph-contract.js';
export function createGraphClient(request){
  function forMeeting(value,meetingId){const survey=validateSurvey(value);if(survey.meetingId!==meetingId)throw new Error('The API returned a different meeting.');return survey;}
  return {
    survey: async (meetingId,options={})=>forMeeting(await request('/meetings/'+encodeURIComponent(meetingId)+'/survey',options),meetingId),
    answerSurvey: async (meetingId,answer,options={})=>{
      const result=await request('/meetings/'+encodeURIComponent(meetingId)+'/survey/answers',{...options,method:'POST',body:JSON.stringify(answer)});
      return forMeeting(result?.survey,meetingId);
    },
    topics: async (options={})=>validateTopics(await request('/topics',options)),
    rankings: async (topicId,limit,options={})=>validateRanking(await request('/rankings?'+new URLSearchParams({topicId,limit:String(limit)}),options),topicId,limit),
  };
}
