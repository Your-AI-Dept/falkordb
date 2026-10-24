import React,{useEffect,useState} from 'react';
import {promotions} from '../promotion-store.js';
import {viewerId} from '../api.js';
import {Button,Icon,Modal} from './ui.jsx';

export default function PromotionInbox({participant=viewerId()}){
  const [invitations,setInvitations]=useState([]),[open,setOpen]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    const refresh=()=>{try{const next=promotions.invitations(participant);setInvitations(next);const due=next.find(item=>item.status==='feedback_due');if(due)setOpen(due.campaignId);}catch(failure){setError(failure.message);}};
    const unsubscribe=promotions.subscribe(refresh);refresh();return unsubscribe;
  },[participant]);
  const invitation=invitations.find(item=>item.campaignId===open);
  function action(kind){try{promotions.respond(open,participant,kind);setError('');}catch(failure){setError(failure.message);}}
  function feedback(value){try{promotions.feedback(open,participant,value);setError('');}catch(failure){setError(failure.message);}}
  if(!invitations.length)return null;
  const status={invited:'You’re invited',accepted:'You’re going',declined:'Declined',checked_in:'Checked in',feedback_due:'Feedback required',completed:'Visit complete'};
  return <section className="promotion-inbox"><h2>Booth invitations</h2>{invitations.map(item=><button className="promotion-inbox-card" key={item.campaignId} onClick={()=>{setOpen(item.campaignId);setError('');}}><span className="promo-inbox-icon"><Icon name="spark" size={24}/></span><span><small>{status[item.status]} · {item.promotion.company}</small><strong>{item.promotion.product}</strong><span>{item.promotion.offer}</span><small>{item.promotion.time} · Booth {item.promotion.booth}</small></span><Icon name="arrow" size={20}/></button>)}
    {invitation&&<Modal title={invitation.promotion.product} close={()=>setOpen(null)} dismissible={invitation.status!=='feedback_due'} blockedMessage="Complete your visit feedback before leaving." error={error}><div className="invitation-preview"><span className="eyebrow">{invitation.promotion.company} · {invitation.person.name.toUpperCase()}’S INVITATION</span><p>{invitation.promotion.offer}</p><p><Icon name="clock" size={17}/>{invitation.promotion.time}</p><p><Icon name="pin" size={17}/>Booth {invitation.promotion.booth} · {invitation.promotion.contact.name}</p></div>
      {invitation.status==='invited'?<div className="modal-actions"><Button variant="text" onClick={()=>action('decline')}>Not this time</Button><Button onClick={()=>action('accept')}>I’ll be there<Icon name="check" size={17}/></Button></div>:<div className="request-status" role="status"><Icon name="check"/><strong>{status[invitation.status]}</strong></div>}
      {invitation.status==='accepted'&&<Button variant="full" onClick={()=>action('check_in')}>Check in at the booth<Icon name="pin" size={17}/></Button>}
      {invitation.status==='checked_in'&&<Button variant="full" onClick={()=>action('finish')}>Finish visit<Icon name="arrow" size={17}/></Button>}
      {invitation.status==='feedback_due'&&<fieldset className="visit-feedback"><legend>Booth feedback: was the visit useful?</legend><div className="feedback-choices">{[['yes','Yes'],['somewhat','Somewhat'],['no','Not really']].map(([id,label])=><button className="feedback-choice" key={id} onClick={()=>feedback(id)}>{label}</button>)}</div></fieldset>}
      {['completed','declined'].includes(invitation.status)&&<Button variant="full" onClick={()=>setOpen(null)}>Back to my day<Icon name="arrow" size={17}/></Button>}
    </Modal>}
  </section>;
}
