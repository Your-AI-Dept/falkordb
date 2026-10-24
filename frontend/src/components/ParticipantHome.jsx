import React,{useEffect,useState,useRef} from 'react';
import {api} from '../api.js';
import {attendeeLink} from '../navigation.js';
import {Avatar,Button,Logo} from './ui.jsx';
import {Agenda} from './Agenda.jsx';
import {MeetingSurveyDialog} from './MeetingSurvey.jsx';
import ProfileSummary from './ProfileSummary.jsx';
import PromotionInbox from './PromotionInbox.jsx';
import {observeResource} from '../observe-resource.js';

// The second attendee's demo home uses their own survey state, never Paul's profile editor.
export default function ParticipantHome({participant}){
  const [viewer,setViewer]=useState(null),[stops,setStops]=useState([]),[modal,setModal]=useState(null),[error,setError]=useState('');
  const observer=useRef();
  useEffect(()=>{
    observer.current=observeResource({
      load:async()=>{
        const data=await api.dashboard();
        const person=data.people.find(person=>person.id===participant);
        if(!person)throw new Error('This attendee is not available.');
        const ownStops=await Promise.all((data.agenda||[]).filter(stop=>stop.kind==='meeting'&&stop.personId===participant).map(async stop=>{
          const survey=await api.survey(stop.id,participant);
          const missed=survey.answers.some(answer=>answer.questionId==='usefulness'&&answer.answerKey==='didnt_meet');
          return {...stop,person:survey.subject,status:survey.complete?(missed?'missed':'completed'):survey.answers.length?'feedback_due':'scheduled'};
        }));
        return {person,ownStops};
      },
      onValue:({person,ownStops})=>{setViewer(person);setStops(ownStops);setError('');const due=ownStops.find(stop=>stop.status==='feedback_due');if(due)setModal(current=>current||due.id);},
      onError:failure=>setError(failure.message),subscribe:api.subscribe,
    });
    return()=>observer.current.stop();
  },[participant]);
  const refresh=()=>observer.current?.refresh();
  return <div className="attendee-app"><header className="app-header"><Logo href={attendeeLink('attendee',participant)}/><div className="event-brand"><span>Pizza Expo</span><small>Las Vegas</small></div>{viewer&&<button className="profile-trigger header-actions" aria-label="Open your profile" onClick={()=>setModal('profile')}><Avatar person={viewer}/></button>}</header>
    <main className="event-main guided-event"><div className="welcome-row"><div><span className="eyebrow">WEDNESDAY</span><h1>{viewer?viewer.name.split(' ')[0]+'’s day at Pizza Expo.':'Your day at Pizza Expo.'}</h1></div></div><PromotionInbox participant={participant}/>{error?<p className="error" role="alert">{error}<Button variant="text" onClick={refresh}>Try again</Button></p>:viewer?<Agenda stops={stops} openStop={setModal}/>:<p role="status">Loading your day…</p>}</main>
    <footer className="app-footer"><div><a href={attendeeLink('rankings',participant)}>Top people</a><a href="?view=attendee">Paul’s view</a><a href="?view=exhibitor">Exhibitor view</a></div></footer>
    {modal==='profile'&&<ProfileSummary profile={viewer} respondentId={participant} close={()=>setModal(null)} onPreferencesChanged={refresh}/>}
    {modal&&modal!=='profile'&&<MeetingSurveyDialog meetingId={modal} respondentId={participant} close={()=>setModal(null)} onSaved={refresh}/>}
  </div>;
}
