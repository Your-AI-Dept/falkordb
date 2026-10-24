import React, { useEffect, useRef, useState } from 'react';
import { ATTENDEE_STORAGE_KEY, capabilities, EXHIBITOR_STORAGE_KEY, freshExhibitorState, loadExhibitorState, makeBoothPlan, activation } from './data.js';
import './exhibitor.css';

function Icon({ name, size = 22 }) {
  const paths = {
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    back: <path d="M19 12H4m5-5-5 5 5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    leaf: <><path d="M20 4C9 2 3 7 4 14c1 5 7 7 11 3 3-3 4-7 5-13ZM4 21 15 9" /><path d="m9 16-1-5m5 1 4 1" /></>,
    oven: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.1m4 0h.1m4 0h2M7 13h10v4H7z" /></>,
    shop: <><path d="M3 9h18l-2-5H5L3 9Zm1 0v11h16V9M8 20v-7h5v7" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}

function PizzaMark() {
  return <svg width="31" height="34" viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M16 32 3 8c8-6 18-6 26 0L16 32Z" fill="currentColor" opacity=".11" /><path d="M16 32 3 8c8-6 18-6 26 0L16 32Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M5 12c7-5 15-5 22 0" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="15" r="2" fill="currentColor" /><circle cx="21" cy="16" r="2" fill="currentColor" /><circle cx="16" cy="23" r="2" fill="currentColor" /></svg>;
}

function Header({ complete, onEdit }) {
  return <header className="ex-header"><a className="ex-brand" href="?view=exhibitor" aria-label="Pizza Expo exhibitor home"><PizzaMark /><span>Pizza Expo</span></a><div className="ex-header-actions">{complete && <button type="button" className="ex-text-button" onClick={onEdit}>Edit setup</button>}<a className="ex-attendee-link" href="?view=attendee">Attendee view <Icon name="arrow" size={15} /></a></div></header>;
}

function Setup({ state, setState, onComplete, onCancel }) {
  const category = capabilities.find(item => item.id === state.capability) || capabilities[0];
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  return <main className="ex-setup">
    <div className="ex-setup-title"><h1 ref={titleRef} tabIndex={-1}>Your booth</h1></div>
    <form onSubmit={event => { event.preventDefault(); onComplete(); }}>
      <div className="ex-fields-row"><label className="ex-field ex-field-wide" htmlFor="ex-company"><span>Company</span><input id="ex-company" value={state.company} maxLength={65} autoComplete="organization" required pattern=".*\S.*" title="Enter a company name" onChange={event => setState(previous => ({ ...previous, company: event.target.value }))} /></label><label className="ex-field ex-field-booth" htmlFor="ex-booth"><span>Booth</span><input id="ex-booth" value={state.booth} maxLength={15} required pattern=".*\S.*" title="Enter a booth number" onChange={event => setState(previous => ({ ...previous, booth: event.target.value }))} /></label></div>
      <div className="ex-contact-row"><label className="ex-field ex-contact-field" htmlFor="ex-contact"><span>Booth contact</span><input id="ex-contact" value={state.contact.name} maxLength={60} autoComplete="name" required pattern=".*\S.*" title="Enter a booth contact" onChange={event => setState(previous => ({ ...previous, contact: { ...previous.contact, name: event.target.value } }))} /></label><div className="ex-activation"><Icon name="clock" size={21}/><div><strong>Booth activation</strong><span>{activation.day} · {activation.label}</span></div></div></div>
      <fieldset className="ex-fieldset"><legend>What do you offer?</legend><div className="ex-capabilities">{capabilities.map(item => <button type="button" key={item.id} className={`ex-capability ${state.capability === item.id ? 'ex-selected' : ''}`} aria-pressed={state.capability === item.id} onClick={() => setState(previous => ({ ...previous, capability: item.id, focus: item.focuses[0].id }))}><span className="ex-capability-top"><Icon name={item.icon} size={28} /><span className="ex-radio-dot">{state.capability === item.id && <span />}</span></span><strong>{item.title}</strong></button>)}</div></fieldset>
      <fieldset className="ex-fieldset ex-context-question" key={category.id}><legend>{category.question}</legend><div className="ex-chips">{category.focuses.map(focus => <button key={focus.id} type="button" aria-pressed={state.focus === focus.id} className={`ex-chip ${state.focus === focus.id ? 'ex-selected' : ''}`} onClick={() => setState(previous => ({ ...previous, focus: focus.id }))}>{state.focus === focus.id && <Icon name="check" size={16} />}{focus.label}</button>)}</div></fieldset>
      <div className="ex-form-footer">{state.complete&&<button className="ex-back-button" type="button" onClick={onCancel}>Back to agenda</button>}<button className="ex-primary" type="submit">View agenda<Icon name="arrow" size={19} /></button></div>
    </form>
  </main>;
}

function Session({ session, booth }) {
  const assigned = session.guests.filter(guest => guest.status === 'assigned').length;
  const unavailable = session.guests.filter(guest => guest.status === 'unavailable').length;
  const checkedIn = session.guests.filter(guest => guest.checkedInAt).length;
  const responseSummary = [unavailable ? `${unavailable} unavailable` : '', checkedIn ? `${checkedIn} checked in` : 'No check-ins yet'].filter(Boolean).join(' · ');
  return <article className="ex-session"><div className="ex-time-column"><strong>{session.window.hour}</strong><span>to {session.window.end}</span><span className="ex-time-line" /></div><div className="ex-session-card"><div className="ex-session-top"><span className="ex-location"><Icon name="pin" size={15} />Booth {booth}</span></div><h2>{session.title}</h2><div className="ex-session-host"><span className="ex-contact-avatar">{session.contact.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span><div><strong>{session.contact.name}</strong><span>Booth contact</span></div></div>
      <div className="ex-attendance"><div className="ex-avatar-stack">{session.guests.slice(0, 3).map(guest => <span key={guest.id} className={`ex-guest-avatar ex-${guest.color}`}>{guest.initials}</span>)}</div><div><strong>{assigned} scheduled</strong><span>{responseSummary}</span></div></div>
      {session.guests.length>0&&<ul className="ex-visitors">{session.guests.map(guest => <li key={guest.id}><span className={`ex-guest-avatar ex-${guest.color}`}>{guest.initials}</span><div><strong>{guest.name} <span>· {guest.company}</span></strong><p>{guest.need}</p>{guest.appointment && <span className="ex-guest-appointment">{guest.appointment}</span>}</div><span className={`ex-guest-status ${guest.status === 'assigned' ? 'ex-status-accepted' : ''}`}>{guest.checkedInAt ? 'Checked in' : { assigned: 'Scheduled', unavailable: 'Unavailable' }[guest.status]}</span></li>)}</ul>}
    </div></article>;
}

function Agenda({ state }) {
  const sessions = makeBoothPlan(state);
  const assigned = sessions.flatMap(session => session.guests).filter(guest => guest.status === 'assigned').length;
  return <main className="ex-agenda"><div className="ex-agenda-heading"><div><p className="ex-eyebrow">{state.company} · BOOTH {state.booth}</p><h1>Booth agenda</h1></div><div className="ex-agenda-stamp"><span className="ex-stamp-icon"><Icon name="people" size={27} /></span><strong>{assigned}</strong><span>Scheduled</span></div></div><div className="ex-agenda-day"><div><span className="ex-calendar-icon"><span>DAY</span><strong>01</strong></span><div><h2>{activation.day}</h2><p>Booth activation · {activation.label}</p></div></div></div><div className="ex-sessions">{sessions.map(session => <Session key={session.id} session={session} booth={state.booth} />)}</div></main>;
}

export default function ExhibitorApp() {
  const [state, setState] = useState(loadExhibitorState);
  const [editing, setEditing] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [, refreshAttendee] = useState(0);
  useEffect(() => {
    const refresh = () => refreshAttendee(value => value + 1);
    const storageChange = event => { if (!event.key || event.key === ATTENDEE_STORAGE_KEY) refresh(); };
    window.addEventListener('storage', storageChange);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', storageChange); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(EXHIBITOR_STORAGE_KEY, JSON.stringify(state)); setStorageBlocked(false); }
    catch { setStorageBlocked(true); }
  }, [state]);
  const setupOpen = !state.complete || editing;
  function editSetup() { setEditing(true); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function completeSetup() {
    setState(previous => ({ ...previous, company: previous.company.trim() || freshExhibitorState().company, booth: previous.booth.trim() || freshExhibitorState().booth, contact: { ...previous.contact, name: previous.contact.name.trim() }, complete: true }));
    setEditing(false); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return <div className="ex-app"><Header complete={state.complete && !editing} onEdit={() => editSetup()} />{setupOpen ? <Setup state={state} setState={setState} onComplete={completeSetup} onCancel={() => setEditing(false)} /> : <Agenda state={state} />}{storageBlocked && <p className="ex-storage-notice" role="status">Changes are available for this visit. This browser couldn’t save them.</p>}</div>;
}
