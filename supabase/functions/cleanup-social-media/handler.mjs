const STAGING='https://oiwtfkgrnpzirghbsvim.supabase.co';
const ORIGINS=new Set(['http://127.0.0.1:5280','https://localhost','capacitor://localhost','https://siboniisozulu-alt.github.io']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function ownedSocialPath(path,userId){
 if(typeof path!=='string'||path.length>1024||typeof userId!=='string'||!UUID.test(userId))return false;
 const parts=path.split('/');
 return parts.length===3&&['reels','statuses','posts'].includes(parts[0])&&parts[1]===userId&&/^[A-Za-z0-9._-]+$/.test(parts[2])&&!['.','..'].includes(parts[2]);
}
async function boundedBody(request){
 const reader=request.body?.getReader();if(!reader)return{raw:''};
 const chunks=[];let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return{tooLarge:true};}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return{raw:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};
}
export function createCleanupSocialHandler({projectUrl,configured,authorize,claim,remove,verifyAbsent}){
 return async request=>{
  const origin=request.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&ORIGINS.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
  const reply=(status,body)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
  if(origin&&!ORIGINS.has(origin))return reply(403,{status:'origin_denied'});
  if(request.method==='OPTIONS')return reply(204,null);
  if(request.method!=='POST')return reply(405,{status:'method_not_allowed'});
  if(projectUrl!==STAGING||!configured)return reply(503,{status:'cleanup_not_configured'});
  const authorization=request.headers.get('Authorization');
  if(!authorization||!/^Bearer \S+$/.test(authorization)||authorization.length>8192)return reply(401,{status:'unauthorized'});
  let actor;
  try{actor=await authorize(authorization);}catch{return reply(503,{status:'authorization_unavailable'});}
  if(!actor||!UUID.test(actor.id||'')||!UUID.test(actor.sessionId||''))return reply(401,{status:'unauthorized'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply(415,{status:'json_required'});
  const declared=Number(request.headers.get('Content-Length'));
  if(Number.isFinite(declared)&&declared>2048)return reply(413,{status:'request_too_large'});
  let body;
  try{const{raw,tooLarge}=await boundedBody(request);if(tooLarge)return reply(413,{status:'request_too_large'});body=JSON.parse(raw);if(!body||Array.isArray(body)||Object.keys(body).length!==1||!ownedSocialPath(body.path,actor.id))throw Error();}
  catch{return reply(400,{status:'invalid_owned_path'});}
  const path=body.path;
  try{
   // The server-only DB claim checks all references and retires the path under
   // the same transaction lock as the publication triggers. A missing guard
   // must never degrade to a service-role SELECT followed by a raced delete.
   const permit=await claim(actor,path);
   if(!permit||permit.guardVersion!==1||permit.path!==path)throw Error();
   if(permit.claimed!==true)return reply(409,{status:'media_retained'});
   await remove(path);
   // Storage.remove can return success with no affected rows. Independently
   // verify exact-path absence using the server-only DB guard before success.
   const result=await verifyAbsent(actor,path);
   if(result?.guardVersion!==1||result.path!==path||result.absent!==true)throw Error();
   return reply(200,{removed:true,path});
  }catch{return reply(503,{status:'cleanup_unconfirmed'});}
 };
}
