import React from 'react';
import {Button,Icon} from './ui.jsx';
import {attendeeLink} from '../navigation.js';
import {viewerId} from '../api.js';

function configuredVisualizationUrl(participant){
  try{
    const url=new URL(import.meta.env.VITE_VISUALIZATION_URL?.trim()||'http://127.0.0.1:5174/');
    if(participant?.startsWith('PE27-'))url.searchParams.set('attendee',participant);
    return ['http:','https:'].includes(url.protocol)?url.href:null;
  }catch{return null;}
}



export function VisualizationHandoff({onContinue,participant=viewerId()}){
  const visualizationUrl=configuredVisualizationUrl(participant);
  return <section className="visualization-handoff" aria-label="Explore the graph">
    {onContinue&&<Button variant="full" onClick={onContinue}>Back to my day<Icon name="arrow" size={17}/></Button>}
    {visualizationUrl?
      <a className="button secondary full" href={visualizationUrl} target="_blank" rel="noopener noreferrer">Open visualization<Icon name="link" size={17}/></a>:
      <><Button className="button full" disabled aria-describedby="visualization-link-status">Open visualization<Icon name="link" size={17}/></Button><p id="visualization-link-status">Visualization link pending</p></>}
    <a className="text-button" href={attendeeLink('rankings',participant)}>Continue to topic experts<Icon name="arrow" size={16}/></a>
  </section>;
}
