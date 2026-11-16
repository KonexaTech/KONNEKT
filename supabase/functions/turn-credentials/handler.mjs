const STAGING='https://oiwtfkgrnpzirghbsvim.supabase.co';
const ORIGINS=new Set(['http://127.0.0.1:5280','https://localhost','capacitor://localhost','https://siboniisozulu-alt.github.io']);
function validRelay(value){
 const match=/^(turn|turns):([a-z0-9.-]+|\[[a-f0-9:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i.exec(value||'');
 return !!match&&(!match[3]||(Number(match[3])>=1&&Number(match[3])<=65535));
}
export function createTurnHandler({projectUrl,relayUrls,secret,authorize,now=Date.now,nonce=()=>crypto.randomUUID()}){
 const configured=projectUrl===STAGING&&typeof secret==='string'&&secret.length>=32&&Array.isArray(relayUrls)&&relayUrls.length>0&&relayUrls.length<=4&&relayUrls.every(validRelay);
 return async request=>{
  const origin=request.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&ORIGINS.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type';headers['Access-Control-Allow-Methods']='GET,OPTIONS';}
  const reply=(status,body)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
  if(origin&&!ORIGINS.has(origin))return reply(403,{status:'origin_denied'});
  if(request.method==='OPTIONS')return reply(204,null);
  if(request.method!=='GET')return reply(405,{status:'method_not_allowed'});
  if(!configured)return reply(503,{status:'turn_not_configured'});
  const authorization=request.headers.get('Authorization');
  if(!authorization||!/^Bearer \S+$/.test(authorization)||authorization.length>8192)return reply(401,{status:'unauthorized'});
  try{if(!await authorize(authorization))return reply(401,{status:'unauthorized'});}catch{return reply(503,{status:'authorization_unavailable'});}
  try{
   const id=nonce();if(!/^[a-z0-9_-]{16,128}$/i.test(id))throw Error();
   const ttlSeconds=300,username=String(Math.floor(now()/1000)+ttlSeconds)+':'+id;
   const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
   const digest=await crypto.subtle.sign('HMAC',key,encoder.encode(username));
   const credential=btoa(String.fromCharCode(...new Uint8Array(digest)));
   return reply(200,{ttlSeconds,iceServers:[{urls:relayUrls,username,credential}]});
  }catch{return reply(503,{status:'credentials_unavailable'});}
 };
}
