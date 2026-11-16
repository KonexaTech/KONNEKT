import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { APP_ORIGIN,STAGING_ORIGIN } from './staging-config.mjs';

// Transport only: responses and frames come from the real staging service.
// Node uses the environment's existing CA trust; never disable certificate
// validation or mutate a shared browser trust store to run acceptance.
export async function installStagingNetwork(context,{proxy,onViolation,metrics={upstreamConnections:0}}){
  let stopping=false;
  const sockets=new Set();
  let agent;
  if(proxy){
    const url=new URL(proxy.server);
    url.username=encodeURIComponent(proxy.username||'');url.password=encodeURIComponent(proxy.password||'');
    agent=new HttpsProxyAgent(url);
  }
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(![APP_ORIGIN,STAGING_ORIGIN].includes(url.origin)){
      onViolation('Unexpected HTTP origin');return route.abort();
    }
    if(!proxy||url.origin===APP_ORIGIN)return route.continue();
    try{
      const upstream=await route.fetch({maxRedirects:0});
      await route.fulfill({response:upstream});
    }catch{
      if(!stopping)onViolation('Staging verified HTTP transport failed');
      await route.abort().catch(()=>{});
    }
  });
  await context.routeWebSocket(/.*/,socket=>{
    const url=new URL(socket.url());
    if(![APP_ORIGIN.replace('http:','ws:'),STAGING_ORIGIN.replace('https:','wss:')].includes(url.origin)){
      onViolation('Unexpected WebSocket origin');socket.close();return;
    }
    if(!proxy||url.origin.startsWith('ws:')){socket.connectToServer();return;}
    let closed=false;
    const queued=[];
    const upstream=new WebSocket(url,{agent,handshakeTimeout:15000,maxPayload:1024*1024});
    sockets.add(upstream);
    socket.onMessage(message=>{
      if(closed)return;
      if(upstream.readyState===WebSocket.OPEN)upstream.send(message);
      else if(upstream.readyState===WebSocket.CONNECTING&&queued.length<1000)queued.push(message);
      else{onViolation('Staging WebSocket cannot accept frames');upstream.terminate();}
    });
    socket.onClose(()=>{closed=true;sockets.delete(upstream);upstream.terminate();});
    upstream.on('open',()=>{metrics.upstreamConnections++;for(const frame of queued)upstream.send(frame);queued.length=0;});
    upstream.on('message',(data,binary)=>{if(!closed)socket.send(binary?data:data.toString());});
    upstream.on('error',()=>{
      if(!closed&&!stopping){onViolation('Staging verified WebSocket transport failed');socket.close({code:1011,reason:'Staging transport failed'});}
    });
    upstream.on('close',()=>{sockets.delete(upstream);if(!closed&&!stopping)socket.close({code:1000,reason:'Staging upstream closed'});});
  });
  return ()=>{stopping=true;for(const socket of sockets)socket.terminate();sockets.clear();agent?.destroy();};
}
