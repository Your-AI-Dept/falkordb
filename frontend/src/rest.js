// Transport only. Graph computation and imported data belong to the backend.
export function createRestClient({base, eventId='pizza-expo', fetcher=fetch, timeoutMs=12000}) {
  const root=base.replace(/\/$/,'')+'/v1/events/'+encodeURIComponent(eventId);
  return async function request(path, options={}) {
    const {signal, idempotencyKey, ...init}=options;
    const controller=new AbortController();
    const abort=()=>controller.abort();
    if(signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeoutMs);
    try {
      const response=await fetcher(root+path,{credentials:'include',...init,headers:{...(init.body?{'Content-Type':'application/json','Idempotency-Key':idempotencyKey||crypto.randomUUID()}:{}),...init.headers},signal:controller.signal});
      if(!response.ok){
        const body=await response.json().catch(()=>({}));
        const error=new Error(body.message||'Could not load or save that. Please try again.');
        error.status=response.status; error.survey=body.survey; throw error;
      }
      return response.status===204?null:response.json();
    } catch(error) {
      if(error.name==='AbortError'&&!signal?.aborted)throw new Error('The request timed out. Please try again.');
      throw error;
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  };
}
