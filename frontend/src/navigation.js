import {persona} from './data/pizza-expo.js';
// The signed-in demo attendee needs no participant parameter; others are addressed by attendee id
// (persona keys like ?participant=theo still resolve, see data/pizza-expo.js).
export function attendeeLink(view='attendee', participant=persona.paul) {
  const params=new URLSearchParams({view});
  if(participant&&participant!==persona.paul&&participant!=='paul')params.set('participant',participant);
  return '?'+params;
}
export function homeLink(search='') {
  const params=new URLSearchParams(search);
  return params.get('view')==='exhibitor'?'?view=exhibitor':attendeeLink('attendee',params.get('participant'));
}
