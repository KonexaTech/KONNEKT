import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { sendCallSignal, updateCall, watchCall, getKonnektIceServers } from '../services/calls';
import { Alert } from '../components/Alert';
import { ringingTimeLeft } from '../services/callInvitations';

export default function CallScreen({navigation,route}){
 const {user}=useAuth();const {callId,callType='voice',contact={}}=route?.params||{};
 const [status,setStatus]=useState('Preparing call…');const [seconds,setSeconds]=useState(0);const [muted,setMuted]=useState(false);const [cameraOff,setCameraOff]=useState(callType!=='video');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(true);const [switchingCamera,setSwitchingCamera]=useState(false);
 const pcRef=useRef(null);const localRef=useRef(null);const remoteRef=useRef(null);const remoteVideo=useRef(null);const remoteAudio=useRef(null);const localVideo=useRef(null);const queuedIce=useRef([]);const remoteReady=useRef(false);const handled=useRef(new Set());const callerRef=useRef(false);
 const ringTimer=useRef(null);const ending=useRef(false);
 const clearRing=useCallback(()=>{clearTimeout(ringTimer.current);ringTimer.current=null;},[]);
 const cleanup=useCallback(()=>{
  clearRing();try{pcRef.current?.close();}catch{}pcRef.current=null;
  localRef.current?.getTracks?.().forEach(t=>t.stop());localRef.current=null;
  remoteRef.current?.getTracks?.().forEach(t=>t.stop());remoteRef.current=null;
  for(const element of [localVideo.current,remoteVideo.current,remoteAudio.current])if(element)element.srcObject=null;
 },[clearRing]);
 const processSignal=useCallback(async signal=>{
  if(!signal||ending.current||signal.sender_id===user?.id||handled.current.has(signal.id))return;handled.current.add(signal.id);const pc=pcRef.current;if(!pc)return;
  const current=()=>pcRef.current===pc&&!ending.current;
  try{
   if(signal.signal_type==='offer'&&!callerRef.current){await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));if(!current())return;remoteReady.current=true;for(const c of queuedIce.current){if(!current())return;await pc.addIceCandidate(new RTCIceCandidate(c));}queuedIce.current=[];const answer=await pc.createAnswer();if(!current())return;await pc.setLocalDescription(answer);if(!current())return;await sendCallSignal(callId,'answer',pc.localDescription.toJSON());if(!current())return;await updateCall(callId,{status:'accepted',answered_at:new Date().toISOString()});if(current())setStatus('Connected');}
   else if(signal.signal_type==='answer'&&callerRef.current){await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));if(!current())return;remoteReady.current=true;clearRing();for(const c of queuedIce.current){if(!current())return;await pc.addIceCandidate(new RTCIceCandidate(c));}queuedIce.current=[];if(current())setStatus('Connected');}
   else if(signal.signal_type==='ice-candidate'){if(remoteReady.current)await pc.addIceCandidate(new RTCIceCandidate(signal.payload));else queuedIce.current.push(signal.payload);}
   else if(signal.signal_type==='hangup'){ending.current=true;setStatus('Call ended');cleanup();navigation.goBack();}
  }catch(e){if(current())setNotice(e.message||'Call connection failed.');}
 },[callId,clearRing,cleanup,navigation,user?.id]);
 useEffect(()=>{
  let active=true;let unsubscribe=null;let timer=null;
  ending.current=false;remoteReady.current=false;queuedIce.current=[];handled.current.clear();
  (async()=>{try{
   if(!callId||!user?.id)throw new Error('Call details are missing. Start a call from a member profile.');
   if(!globalThis.navigator?.mediaDevices?.getUserMedia||!globalThis.RTCPeerConnection)throw new Error('Voice and video calls require a supported browser or app over HTTPS.');
   const {data:call,error}=await supabase.from('call_sessions').select('*').eq('id',callId).single();if(!active)return;if(error)throw error;if(['ended','declined','rejected','missed','failed'].includes(call.status))throw new Error('This call is no longer active.');
   if(call.caller_id!==user.id&&call.callee_id!==user.id)throw new Error('You are not a participant in this call.');
   callerRef.current=call.caller_id===user.id;
   if(call.status==='ringing'){
    const remaining=ringingTimeLeft(call);if(!remaining)throw new Error('This call was not answered in time. Start a new call.');
    if(callerRef.current)ringTimer.current=setTimeout(()=>{
     if(!active||ending.current||remoteReady.current)return;
     ending.current=true;cleanup();Alert.alert('Call not answered','The call was not answered. You can try again.');navigation.goBack();
     void updateCall(callId,{status:'missed',ended_at:new Date().toISOString()}).catch(()=>console.warn('Call ended locally; server update could not be confirmed.'));
    },remaining);
   }
   const stream=await globalThis.navigator.mediaDevices.getUserMedia({audio:true,video:call.call_type==='video'});if(!active){stream.getTracks().forEach(t=>t.stop());return;}localRef.current=stream;
   const iceServers=await getKonnektIceServers();if(!active)return;const pc=new RTCPeerConnection({iceServers});pcRef.current=pc;stream.getTracks().forEach(track=>pc.addTrack(track,stream));
   pc.onicecandidate=e=>{if(active&&pcRef.current===pc&&e.candidate)sendCallSignal(callId,'ice-candidate',e.candidate.toJSON()).catch(err=>{if(active)setNotice(err.message);});};
   pc.ontrack=e=>{if(!active||pcRef.current!==pc)return;remoteRef.current=e.streams?.[0]||null;if(remoteVideo.current&&remoteRef.current)remoteVideo.current.srcObject=remoteRef.current;if(remoteAudio.current&&remoteRef.current)remoteAudio.current.srcObject=remoteRef.current;};
   pc.onconnectionstatechange=()=>{if(!active||pcRef.current!==pc)return;if(pc.connectionState==='connected'){clearRing();setStatus('Connected');}if(pc.connectionState==='failed')setNotice('Connection failed. Configure TURN relay settings and retry.');if(pc.connectionState==='disconnected')setStatus('Reconnecting…');};
   unsubscribe=watchCall(callId,signal=>{if(active)void processSignal(signal);},session=>{if(!active||ending.current)return;if(['ended','declined','rejected','missed','failed'].includes(session.status)){ending.current=true;setStatus(['declined','rejected'].includes(session.status)?'Call declined':session.status==='failed'?'Call failed':'Call ended');cleanup();navigation.goBack();}else if(session.status==='accepted'){clearRing();setStatus('Connecting…');}});
   const {data:signals,error:signalError}=await supabase.from('call_signals').select('*').eq('call_id',callId).order('created_at',{ascending:true});if(!active)return;if(signalError)throw signalError;for(const signal of signals||[])await processSignal(signal);if(!active||pcRef.current!==pc)return;
   if(callerRef.current){const offer=await pc.createOffer();if(!active||pcRef.current!==pc)return;await pc.setLocalDescription(offer);if(!active||pcRef.current!==pc)return;await sendCallSignal(callId,'offer',pc.localDescription.toJSON());if(!active||pcRef.current!==pc)return;setStatus('Ringing…');}
   else setStatus('Incoming call · connecting…');
   timer=setInterval(()=>setSeconds(v=>v+1),1000);setBusy(false);
  }catch(e){if(active){setNotice(e.message||'Could not start the call.');setBusy(false);cleanup();}}})();
  return()=>{active=false;if(timer)clearInterval(timer);unsubscribe?.();cleanup();};
 },[callId,clearRing,cleanup,navigation,processSignal,user?.id]);
 useEffect(()=>{if(localVideo.current&&localRef.current)localVideo.current.srcObject=localRef.current;},[busy]);
 const end=async()=>{
  if(ending.current)return;ending.current=true;cleanup();navigation.goBack();
  let failed=false;
  try{await sendCallSignal(callId,'hangup',{});}catch{failed=true;}
  try{await updateCall(callId,{status:'ended',ended_at:new Date().toISOString()});}catch{failed=true;}
  if(failed)console.warn('Call ended locally; server update could not be confirmed.');
 };
 const toggleMute=()=>{const next=!muted;setMuted(next);localRef.current?.getAudioTracks().forEach(t=>t.enabled=!next);};
 const toggleCamera=()=>{const next=!cameraOff;setCameraOff(next);localRef.current?.getVideoTracks().forEach(t=>t.enabled=!next);};
 const switchCamera=async()=>{
  if(switchingCamera||callType!=='video'||!localRef.current||!pcRef.current)return;
  const originalStream=localRef.current,originalPeer=pcRef.current;let replacement,adopted=false;
  const current=()=>localRef.current===originalStream&&pcRef.current===originalPeer;
  setSwitchingCamera(true);setNotice('');
  try{
   const devices=await navigator.mediaDevices.enumerateDevices();if(!current())return;
   const cameras=devices.filter(device=>device.kind==='videoinput');if(cameras.length<2)throw new Error('No second camera is available on this device.');
   const oldTrack=originalStream.getVideoTracks()[0];const currentId=oldTrack?.getSettings?.().deviceId;const next=cameras.find(device=>device.deviceId!==currentId)||cameras[0];
   replacement=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:next.deviceId}},audio:false});if(!current())return;
   const track=replacement.getVideoTracks()[0],sender=originalPeer.getSenders().find(item=>item.track?.kind==='video');if(!track||!sender)throw new Error('Could not switch the active camera.');
   track.enabled=false;await sender.replaceTrack(track);if(!current())return;
   track.enabled=oldTrack?oldTrack.enabled:!cameraOff;
   if(oldTrack){originalStream.removeTrack(oldTrack);oldTrack.stop();}originalStream.addTrack(track);adopted=true;
   for(const extra of replacement.getTracks())if(extra!==track)extra.stop();
   if(localVideo.current)localVideo.current.srcObject=originalStream;
  }catch(error){if(current())setNotice(error.message||'Could not switch camera.');}
  finally{if(!adopted)replacement?.getTracks().forEach(track=>track.stop());setSwitchingCamera(false);}
 };
 const time=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 return <View style={s.page}><Text style={s.kind}>{callType==='video'?'VIDEO CALL':'VOICE CALL'}</Text><Text style={s.name}>{contact.name||contact.full_name||'KONNEKT member'}</Text><Text style={s.status}>{status}</Text><Text style={s.timer}>{time}</Text>{callType==='video'&&<View style={s.videos}><video ref={remoteVideo} autoPlay playsInline style={{width:'100%',height:260,background:'#02050B',borderRadius:14,objectFit:'cover'}}/><video ref={localVideo} autoPlay muted playsInline style={{width:110,height:145,position:'absolute',right:12,bottom:12,background:'#241630',borderRadius:10,objectFit:'cover'}}/></View>}{callType==='voice'&&<audio ref={remoteAudio} autoPlay/>}<View style={s.controls}><TouchableOpacity accessibilityRole="button" style={s.control} disabled={busy||!localRef.current} onPress={toggleMute}><Text style={s.controlText}>{muted?'Unmute':'Mute'}</Text></TouchableOpacity>{callType==='video'&&<><TouchableOpacity accessibilityRole="button" style={s.control} disabled={busy||!localRef.current} onPress={toggleCamera}><Text style={s.controlText}>{cameraOff?'Camera on':'Camera off'}</Text></TouchableOpacity><TouchableOpacity style={s.control} onPress={switchCamera} disabled={busy||switchingCamera||!localRef.current}><Text style={s.controlText}>{switchingCamera?'Switching…':'Switch camera'}</Text></TouchableOpacity></>}<TouchableOpacity accessibilityRole="button" style={s.end} onPress={end}><Text style={s.controlText}>End call</Text></TouchableOpacity></View>{busy&&<ActivityIndicator color="#6A0DAD"/>}{!!notice&&<Text style={s.notice}>{notice}</Text>}</View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#05030A',padding:22,alignItems:'center',justifyContent:'center'},kind:{color:'#D8B8F5',letterSpacing:2,fontWeight:'800'},name:{color:'#FFF',fontSize:29,fontWeight:'900',marginTop:22},status:{color:'#CBBBD9',fontSize:13,marginTop:12},timer:{color:'#FFF',fontSize:22,fontWeight:'700',marginTop:8},videos:{width:'100%',marginTop:24,position:'relative'},controls:{flexDirection:'row',gap:12,flexWrap:'wrap',justifyContent:'center',marginTop:30},control:{backgroundColor:'#271239',borderWidth:1,borderColor:'#68408A',padding:16,borderRadius:24},end:{backgroundColor:'#D93450',padding:15,borderRadius:24},controlText:{color:'#FFF',fontWeight:'800'},notice:{color:'#FFB6C0',textAlign:'center',marginTop:18,lineHeight:20}});
