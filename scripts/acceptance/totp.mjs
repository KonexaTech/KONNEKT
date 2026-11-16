import { createHmac } from 'node:crypto';
export function totp(secret,now=Date.now()){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=|\s/g,'')){
    const value=alphabet.indexOf(char);if(value<0)throw new Error('Invalid private authenticator setup key.');
    bits+=value.toString(2).padStart(5,'0');
  }
  const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
  const digest=createHmac('sha1',key).update(counter).digest();const offset=digest.at(-1)&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
