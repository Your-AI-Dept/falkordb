import React from 'react';
import {Button,Icon} from './ui.jsx';
import {attendeeLink} from '../navigation.js';
import {viewerId} from '../api.js';
import {configuredVisualizationUrl} from '../graph-link.js';

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
