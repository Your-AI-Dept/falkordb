// Serialized polling with cancellation; focus/storage signals can request an immediate refresh.
export function observeResource({load,onValue,onError,subscribe,interval=2500,visible=()=>document.visibilityState!=='hidden'}) {
  let stopped=false,controller=null,timer=null,queued=false;
  async function refresh() {
    if(stopped)return;
    clearTimeout(timer);
    if(controller){queued=true;return;}
    const active=new AbortController();controller=active;
    try{const value=await load(active.signal);if(!stopped)onValue(value);}
    catch(error){if(!stopped&&error.name!=='AbortError')onError(error);}
    finally{
      controller=null;
      if(!stopped){if(queued){queued=false;timer=setTimeout(refresh,0);}else timer=setTimeout(()=>visible()?refresh():schedule(),interval);}
    }
  }
  function schedule(){if(!stopped)timer=setTimeout(()=>visible()?refresh():schedule(),interval);}
  const unsubscribe=subscribe?.(refresh);
  refresh();
  return {refresh,stop(){stopped=true;clearTimeout(timer);controller?.abort();unsubscribe?.();}};
}
