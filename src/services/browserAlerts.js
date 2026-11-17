import {readPushPreferences} from './pushRegistration.js';

export function browserAlertFor(record,{userId,storage}) {
  if(!userId||record?.recipient_id!==userId||record.read_at)return null;
  const category={message:'messages',call:'calls',group_call:'calls',follow:'social',like:'social',comment:'social',security:'security'}[record.type];
  if(!category||!readPushPreferences(storage,userId)[category])return null;
  return {title:'KONNEKT',options:{body:'You have new activity on KONNEKT.'}};
}
