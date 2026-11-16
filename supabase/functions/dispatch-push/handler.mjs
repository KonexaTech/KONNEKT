const STAGING='https://oiwtfkgrnpzirghbsvim.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALIAS=/^ks_[a-f0-9]{64}$/;
const categories=new Set(['messages','calls','social','security']);
const json=(status,result)=>new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function matchesSecret(input,expected){
  if(!input||input.length>512)return false;
  const bytes=new TextEncoder(),key=await crypto.subtle.importKey('raw',bytes.encode(expected),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const digest=await crypto.subtle.sign('HMAC',key,bytes.encode(expected));
  return crypto.subtle.verify('HMAC',key,digest,bytes.encode(input));
}
async function limitedBody(request){
  if(Number(request.headers.get('Content-Length'))>8192)throw Error();
  const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error();chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(all));
}
// Real network calls only in the thin runtime adapter; injection permits failure tests.
export function createPushHandler({projectUrl,appId,apiKey,webhookSecret,resolveDelivery,fetchProvider=fetch}){
  const configured=projectUrl===STAGING&&UUID.test(appId||'')&&typeof apiKey==='string'&&apiKey.length>=16&&typeof webhookSecret==='string'&&webhookSecret.length>=32;
  return async request=>{
    if(!configured)return json(503,{status:'not_configured'});
    if(request.method!=='POST')return json(405,{status:'method_not_allowed'});
    if(!await matchesSecret(request.headers.get('Authorization')?.replace(/^Bearer /,''),webhookSecret))return json(401,{status:'unauthorized'});
    let event;
    try{event=await limitedBody(request);}catch{return json(400,{status:'invalid_event'});}
    if(event?.type!=='INSERT'||event.schema!=='public'||event.table!=='notifications'||!UUID.test(event.record?.id||''))return json(400,{status:'invalid_event'});
    let delivery;
    try{delivery=await resolveDelivery(event.record.id);}catch{return json(503,{status:'lookup_unavailable'});}
    // Re-read trusted rows; never use webhook-supplied recipients, body or aliases.
    if(!delivery||!Array.isArray(delivery.aliases))return json(503,{status:'invalid_lookup'});
    if(!delivery.aliases.length)return json(200,{status:'skipped'});
    if(!categories.has(delivery.category)||delivery.aliases.length>100||!delivery.aliases.every(alias=>ALIAS.test(alias))||!Number.isInteger(delivery.ttl)||delivery.ttl<1||delivery.ttl>3600)return json(503,{status:'invalid_lookup'});
    const payload={app_id:appId,include_aliases:{external_id:[...new Set(delivery.aliases)].sort()},target_channel:'push',
      idempotency_key:event.record.id,headings:{en:'KONNEKT'},contents:{en:delivery.category==='calls'?'Incoming KONNEKT call.':'Open KONNEKT to view new activity.'},
      data:{screen:'Notifications'},ttl:delivery.ttl};
    try{
      const response=await fetchProvider('https://api.onesignal.com/notifications',{method:'POST',headers:{Authorization:'Key '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return json(503,{status:'provider_unavailable'});
      const body=await response.json();
      if(!UUID.test(body?.id||''))return json(503,{status:'provider_not_accepted'});
      // Provider acceptance is not evidence that a physical phone displayed it.
      return json(200,{status:'accepted'});
    }catch{return json(503,{status:'provider_unavailable'});}
  };
}
