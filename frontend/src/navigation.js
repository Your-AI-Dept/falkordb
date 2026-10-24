// Demo persona stays in navigation only; live identity comes from the server session.
export function attendeeLink(view='attendee', participant='paul') {
  const params=new URLSearchParams({view});
  if(participant&&participant!=='paul')params.set('participant',participant);
  return '?'+params;
}
export function homeLink(search='') {
  const params=new URLSearchParams(search);
  return params.get('view')==='exhibitor'?'?view=exhibitor':attendeeLink('attendee',params.get('participant'));
}
