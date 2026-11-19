// SSE carries scoped invalidation hints, never queue or capacity totals.
function attach({req,res,context,queueEvents,revalidate,sampleHours,setTimer=setInterval,clearTimer=clearInterval,setBoundaryTimer=setTimeout,clearBoundaryTimer=clearTimeout}) {
  let closed=false;
  let sending=false;
  let pendingUpdate=null;
  let heartbeat;
  let boundary;
  let previousSignature;
  let unsubscribe=()=>{};
  function close() {
    if(closed)return;
    closed=true;
    clearTimer(heartbeat);
    if(boundary!==undefined)clearBoundaryTimer(boundary);
    unsubscribe();
    res.end();
  }
  async function observe(fresh) {
    if(!sampleHours)return false;
    const snapshot=await sampleHours(fresh);
    if(closed)return false;
    if(snapshot.complete===false)throw Error('The complete hours snapshot exceeded the stream work budget.');
    const changed=previousSignature!==undefined&&previousSignature!==snapshot.signature;
    previousSignature=snapshot.signature;
    if(boundary!==undefined){clearBoundaryTimer(boundary);boundary=undefined;}
    const delay=new Date(snapshot.nextChangeAt).getTime()-new Date(snapshot.observedAt).getTime();
    // The existing heartbeat is the bounded safety comparison for openings,
    // recovery and distant thresholds. Keep only one near-boundary timeout.
    if(Number.isFinite(delay)&&delay>0&&delay<=25000)
      boundary=setBoundaryTimer(()=>{boundary=undefined;void send('hours-boundary');},Math.max(1,delay));
    return changed;
  }
  async function send(event,payload) {
    if(closed)return;
    // Coalesce invalidations during authorization/DB reads to bound stream work.
    if(sending){if(event==='queue-plans-updated')pendingUpdate=payload;return;}
    sending=true;
    try {
      const fresh=await revalidate();
      if(String(fresh.tenant._id)!==String(context.tenant._id)||String(fresh.location._id)!==String(context.location._id))return close();
      if(closed)return;
      const changed=await observe(fresh);
      if(closed)return;
      if(event==='queue-plans-updated'||changed)res.write(`event: queue-plans-updated\ndata: ${JSON.stringify(event==='queue-plans-updated'?payload:{type:'queue-plans-updated',locationId:String(context.location._id)})}\n\n`);
      if(event==='heartbeat')res.write(`event: heartbeat\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {close();}
    finally {
      sending=false;
      if(pendingUpdate&&!closed){const next=pendingUpdate;pendingUpdate=null;void send('queue-plans-updated',next);}
    }
  }
  unsubscribe=queueEvents.subscribe(context.tenant.slug,payload=>void send('queue-plans-updated',payload||{locationId:String(context.location._id)}),{locationId:context.location._id});
  heartbeat=setTimer(()=>void send('heartbeat',Date.now()),25000);
  req.on('close',close);
  // Fresh authorization precedes the initial DB-clock snapshot, even though
  // the route already authorized the ready event. Reconnect always resamples.
  if(sampleHours)void send('hours-initial');
  return close;
}
module.exports={attach};
