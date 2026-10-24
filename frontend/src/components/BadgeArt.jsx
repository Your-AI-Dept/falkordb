import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './badge.css';

// Motion adapted from the Showdesks badge playground: strap tension, damping,
// pointer capture, keyboard impulses, and an accessible front/back flip.
export default function BadgeArt({ profile, badgeToken = 'PIZZA-PAUL' }) {
  const stage = useRef(null), world = useRef(null), hang = useRef(null), strap = useRef(null), badge = useRef(null), qr = useRef(null);
  const [back, setBack] = useState(false);
  const suppressClick = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('badge', badgeToken);
    QRCode.toCanvas(qr.current,url.toString(),{width:154,margin:1,color:{dark:'#242424',light:'#ffffff'}}).catch(()=>{});
  },[badgeToken]);
  useEffect(() => {
    const area=stage.current, card=badge.current;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const anchor={x:180,y:-45}, restY=76, length=restY-anchor.y;
    const state={x:198,y:restY,vx:0,vy:0,angle:-7,tilt:0};
    let scale=1,drag=null,frame=0,lastTime=0,visible=false,idleTime=0;
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    function render(){
      hang.current.style.transform=`translate(${state.x-96}px,${state.y}px) rotate(${state.angle}deg) rotateX(${state.tilt}deg)`;
      const slack=Math.max(0,length-Math.hypot(state.x-anchor.x,state.y-anchor.y));
      const d=`M 132 -15 Q ${132+(state.x-180)*.32-slack*.35} ${25+slack*.7} ${state.x} ${state.y} Q ${230+(state.x-180)*.4+slack*.35} ${28+slack*.7} 228 -15`;
      strap.current.querySelectorAll('path').forEach(path=>path.setAttribute('d',d));
    }
    function wake(){if(!frame&&visible&&!document.hidden){lastTime=0;frame=requestAnimationFrame(tick);}}
    function settle(){Object.assign(state,{x:180,y:restY,vx:0,vy:0,angle:0,tilt:0});render();}
    function tick(time){
      frame=0;if(!visible||document.hidden)return;
      const dt=lastTime?Math.min((time-lastTime)/1000,1/30):1/60;lastTime=time;
      if(!drag&&!reduced.matches){
        idleTime+=dt;
        for(let step=0;step<4;step++){
          const h=dt/4,dx=state.x-anchor.x,dy=state.y-anchor.y,distance=Math.hypot(dx,dy)||1,tension=Math.max(0,distance-length)*105;
          state.vx+=(-tension*dx/distance-state.vx*1.75+36*Math.sin(idleTime*1.15))*h;
          state.vy+=(850-tension*dy/distance-state.vy*3.2)*h;
          state.x+=state.vx*h;state.y+=state.vy*h;
          if(state.x<118||state.x>242){state.x=clamp(state.x,118,242);state.vx*=-.42;}
          if(state.y<28){state.y=28;state.vy=Math.abs(state.vy)*.25;}
          if(state.y>98){state.y=98;state.vy*=-.3;}
        }
      }
      const blend=1-Math.exp(-10*dt);
      state.angle+=((reduced.matches?0:clamp(-(state.x-180)*.2+state.vx*.023,-23,23))-state.angle)*blend;
      state.tilt+=((reduced.matches?0:clamp(-state.vy*.022,-9,9))-state.tilt)*blend;
      render();if(drag||!reduced.matches)frame=requestAnimationFrame(tick);
    }
    const localPoint=event=>{const rect=area.getBoundingClientRect();return{x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale};};
    function pointerDown(event){
      if(event.button!==0||drag)return;
      const point=localPoint(event);
      drag={id:event.pointerId,offsetX:point.x-state.x,offsetY:point.y-state.y,startX:event.clientX,startY:event.clientY,last:performance.now(),moved:false};
      state.vx=0;state.vy=0;suppressClick.current=false;card.setPointerCapture(event.pointerId);card.classList.add('is-grabbed');wake();
    }
    function pointerMove(event){
      if(!drag||event.pointerId!==drag.id)return;
      const point=localPoint(event),now=performance.now(),dt=Math.max((now-drag.last)/1000,.008);
      const x=clamp(point.x-drag.offsetX,118,242),y=clamp(point.y-drag.offsetY,28,98);
      state.vx=clamp((x-state.x)/dt,-900,900);state.vy=clamp((y-state.y)/dt,-700,700);
      state.x=x;state.y=y;drag.last=now;drag.moved ||= Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6;
      render();wake();
    }
    function release(event){
      if(!drag||event.pointerId!==drag.id)return;
      suppressClick.current=drag.moved||event.type==='pointercancel';
      if(performance.now()-drag.last>100){state.vx=0;state.vy=0;}
      drag=null;card.classList.remove('is-grabbed');
      if(card.hasPointerCapture(event.pointerId))card.releasePointerCapture(event.pointerId);
      if(reduced.matches)settle();else wake();
    }
    function keyDown(event){
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='Escape'||reduced.matches){settle();return;}
      state.vx+=event.key==='ArrowLeft'?-360:event.key==='ArrowRight'?360:0;
      state.vy+=event.key==='ArrowUp'?-300:event.key==='ArrowDown'?300:0;wake();
    }
    const resize=new ResizeObserver(()=>{scale=area.clientWidth/360;world.current.style.transform=`scale(${scale})`;render();});resize.observe(area);
    const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else{cancelAnimationFrame(frame);frame=0;}},{threshold:.1});intersection.observe(area);
    const motionChange=()=>{if(reduced.matches){cancelAnimationFrame(frame);frame=0;settle();}else wake();};
    const visibilityChange=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();};
    const listeners={pointerdown:pointerDown,pointermove:pointerMove,pointerup:release,pointercancel:release,lostpointercapture:release,keydown:keyDown};
    Object.entries(listeners).forEach(([event,handler])=>card.addEventListener(event,handler));
    reduced.addEventListener('change',motionChange);document.addEventListener('visibilitychange',visibilityChange);
    if(reduced.matches)settle();else render();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();intersection.disconnect();Object.entries(listeners).forEach(([event,handler])=>card.removeEventListener(event,handler));reduced.removeEventListener('change',motionChange);document.removeEventListener('visibilitychange',visibilityChange);};
  },[]);
  const name=profile.name||'Your name', initials=name.trim().split(/\s+/).map(word=>word[0]).slice(0,2).join('').toUpperCase();
  return <div className="rally-badge-stage" ref={stage}><div className="rally-badge-world" ref={world}>
    <svg className="rally-badge-strap" ref={strap} viewBox="0 0 360 380" aria-hidden="true"><path className="strap-shadow"/><path className="strap-band"/><path className="strap-stitch"/></svg>
    <div className="rally-badge-hang" ref={hang}><span className="rally-badge-clip" aria-hidden="true"/><button type="button" className="rally-badge" ref={badge} aria-pressed={back} aria-label={back?'Show front of badge. Drag to swing, or use arrow keys.':'Flip badge. Drag to swing, or use arrow keys.'} onClick={event=>{if(!suppressClick.current||event.detail===0)setBack(value=>!value);suppressClick.current=false;}}>
      <span className="rally-badge-rotator"><span className="rally-badge-face rally-badge-front" aria-hidden={back}><span className="rally-badge-slot"/><span className="rally-badge-event">PIZZA EXPO</span><span className="rally-badge-avatar">{initials}</span><strong className="rally-badge-name">{name}</strong><span className="rally-badge-company">{profile.company||'Your company'}</span><span className="rally-badge-strip"><span>{profile.role||'Attendee'}</span><span>rally.</span></span></span>
      <span className="rally-badge-face rally-badge-back" aria-hidden={!back}><span className="rally-badge-slot"/><span className="rally-badge-event">PIZZA EXPO</span><canvas ref={qr} aria-label="Your QR badge"/><strong className="rally-badge-code">{badgeToken}</strong><span className="rally-badge-company">{name}</span></span></span>
    </button></div></div></div>;
}
