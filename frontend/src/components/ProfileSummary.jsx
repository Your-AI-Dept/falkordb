import React,{useEffect,useState} from 'react';
import {api,viewerId} from '../api.js';
import {Avatar,Button,Icon,Modal} from './ui.jsx';

export default function ProfileSummary({profile,respondentId=viewerId(),close,onEdit,onGoals,onBadge,onPreferencesChanged=()=>{}}){
  const [preferences,setPreferences]=useState([]),[pending,setPending]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;api.meetingPreferences(respondentId).then(items=>{if(active)setPreferences(items);}).catch(failure=>{if(active)setError(failure.message);});return()=>{active=false;};},[respondentId]);
  async function restore(topicId){
    setPending(true);setError('');
    try{await api.restoreMeetingTopic(topicId,respondentId);setPreferences(await api.meetingPreferences(respondentId));onPreferencesChanged();}catch(failure){setError(failure.message);}finally{setPending(false);}
  }
  return <Modal title="Your profile" close={close} dismissible={!pending} error={error}>
    <div className="detail-identity"><Avatar person={profile} size="large"/><div><strong>{profile.name}</strong><span>{profile.role} · {profile.company}</span></div></div>
    {(profile.context||profile.bio)&&<p className="profile-context">{profile.context||profile.bio}</p>}
    {profile.intention&&<section className="profile-goal"><span className="eyebrow">YOUR EVENT GOAL</span><p>{profile.intention}</p></section>}
    <div className="profile-actions">{onBadge&&<Button variant="secondary" onClick={onBadge}><Icon name="scan" size={17}/>My badge</Button>}{onEdit&&<Button variant="text" onClick={onEdit}><Icon name="edit" size={16}/>Edit profile</Button>}{onGoals&&<Button variant="text" onClick={onGoals}>Edit goals<Icon name="arrow" size={16}/></Button>}</div>
    {preferences.length>0&&<section className="profile-preferences"><h3>Paused meetups</h3>{preferences.map(item=><div key={item.topicId}><span>{item.topicLabel}</span><button className="text-button" disabled={pending} onClick={()=>restore(item.topicId)}>Turn back on</button></div>)}</section>}
  </Modal>;
}
