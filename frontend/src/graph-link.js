// Links into the graph view (graph-view/, port 5174), focused on an attendee.
/** Graph view link focused on an attendee, only when VITE_VISUALIZATION_URL is configured. */
export function configuredGraphLink(participant){
  return import.meta.env.VITE_VISUALIZATION_URL?.trim()?configuredVisualizationUrl(participant):null;
}

export function configuredVisualizationUrl(participant){
  try{
    const url=new URL(import.meta.env.VITE_VISUALIZATION_URL?.trim()||'http://127.0.0.1:5174/');
    if(participant?.startsWith('PE27-'))url.searchParams.set('attendee',participant);
    return ['http:','https:'].includes(url.protocol)?url.href:null;
  }catch{return null;}
}
