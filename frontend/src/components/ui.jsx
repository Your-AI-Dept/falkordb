import React, { useEffect, useRef, useState } from 'react';
import {homeLink} from '../navigation.js';

const shapes = {
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
  leaf: <><path d="M20 3C9 2 3 8 5 15c7 4 15-1 15-12ZM4 21 15 10"/></>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/></>,
  growth: <><path d="m3 17 7-7 4 4 7-9M15 5h6v6"/></>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  scan: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M2 12h20"/><path d="M7 7h3v3H7zm7 7h3v3h-3z"/></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Z"/></>,
  spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>,
  pizza: <><path d="m12 3 9 17H3L12 3ZM5 16h14"/><circle cx="12" cy="9" r=".6"/><circle cx="10" cy="13" r=".6"/><circle cx="15" cy="14" r=".6"/></>,
  link: <><path d="m9 15 6-6m-7 9-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/></>,
};
export function Icon({name, size=20}) { return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{shapes[name] || shapes.spark}</svg>; }
function initials(name) { return name.trim().split(/\s+/).map(s => s[0]).slice(0,2).join('').toUpperCase(); }
export function Avatar({person, size=''}) { return <span className={'avatar '+(person.color || 'peach')+' '+size} aria-hidden="true">{person.initials || initials(person.name)}</span>; }
export function Button({children, variant='', ...props}) { return <button type="button" className={'button '+variant} {...props}>{children}</button>; }
export function Logo({href=homeLink(window.location.search)}) { return <a href={href} className="wordmark" aria-label="Rally home"><span className="brand-mark"><i/><i/><i/></span>rally<span className="brand-period">.</span></a>; }
export function Modal({title, close, children, error='', dismissible=true, blockedMessage=''}) {
  const ref=useRef();
  const [closeAttempted,setCloseAttempted]=useState(false);
  function requestClose(){if(dismissible)close();else setCloseAttempted(true);}
  useEffect(() => { const previous=document.activeElement; ref.current.showModal(); return () => { if(previous?.isConnected) previous.focus(); }; },[]);
  return <dialog ref={ref} className="modal" aria-labelledby="dialog-title" onCancel={e=>{e.preventDefault();requestClose();}} onClick={e=>{if(e.target===e.currentTarget)requestClose();}}><div className="modal-inner"><div className="modal-top"><span className="eyebrow">PIZZA EXPO · RALLY</span><button type="button" className="icon-button" disabled={!dismissible&&!blockedMessage} onClick={requestClose} aria-label="Close dialog"><Icon name="close"/></button></div><h2 id="dialog-title">{title}</h2>{closeAttempted&&!dismissible&&blockedMessage&&<p className="feedback-required" role="alert">{blockedMessage}</p>}{children}{error&&<p className="error" role="alert">{error}</p>}</div></dialog>;
}
