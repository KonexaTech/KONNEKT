// Keep only a short-lived generic intent. Provider data is never route authority.
export function createNotificationOpener({now=Date.now}={}) {
  let session={userId:null,ready:false,loading:true},pending=null;
  const listeners=new Set();
  const flush=()=>{
    if(!pending)return;
    if(now()-pending.at>60000||(pending.owner&&pending.owner!==session.userId)){pending=null;return;}
    if(!session.ready||session.loading||!session.userId||!listeners.size)return;
    pending=null;
    for(const listener of listeners)listener();
  };
  return {
    receive(event){
      if(event?.notification?.additionalData?.screen!=='Notifications'||(!session.loading&&!session.userId))return false;
      pending={at:now(),owner:session.userId};flush();return true;
    },
    setSession(next){
      if(session.userId&&session.userId!==next.userId)pending=null;
      session=next;
      if(!next.loading&&!next.userId)pending=null;
      flush();
    },
    subscribe(listener){listeners.add(listener);flush();return()=>listeners.delete(listener);}
  };
}
export const notificationOpener=createNotificationOpener();
