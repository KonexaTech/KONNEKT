import { Alert } from '../components/Alert';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../AuthContext';
import { isConversationId } from '../services/conversationId';
import { sendEncryptedVoiceMessage } from '../services/voiceMessages';

export default function VoiceNoteScreen({ navigation, route }) {
  const { user } = useAuth();
  const conversationId = route?.params?.chatId;
  const [recording,setRecording]=useState(false); const [seconds,setSeconds]=useState(0); const [audioUrl,setAudioUrl]=useState(''); const [saving,setSaving]=useState(false); const [notice,setNotice]=useState('');
  const recorderRef=useRef(null); const streamRef=useRef(null); const chunksRef=useRef([]); const timerRef=useRef(null); const blobRef=useRef(null);
  const mounted=useRef(true), starting=useRef(false), sendLock=useRef(false), playerRef=useRef(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearInterval(timerRef.current);playerRef.current?.pause();if(recorderRef.current?.state==='recording')recorderRef.current.stop();streamRef.current?.getTracks?.().forEach(t=>t.stop());};},[]);
  useEffect(()=>()=>{playerRef.current?.pause();if(audioUrl)URL.revokeObjectURL(audioUrl);},[audioUrl]);
  const start=async()=>{
    if(starting.current||recording||sendLock.current)return;starting.current=true;
    setNotice('');setSeconds(0);setAudioUrl('');blobRef.current=null;
    try{
      if(!isConversationId(conversationId))throw new Error('Open voice notes from inside a conversation.');
      if(!globalThis.navigator?.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)throw new Error('Voice recording is not supported in this browser or device.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}streamRef.current=stream;chunksRef.current=[];
      const recorder=new MediaRecorder(stream);recorderRef.current=recorder;
      recorder.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data);};
      recorder.onstop=()=>{const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});blobRef.current=blob;if(mounted.current){const url=URL.createObjectURL(blob);setAudioUrl(url);}stream.getTracks().forEach(t=>t.stop());streamRef.current=null;};
      recorder.start(250);setRecording(true);timerRef.current=setInterval(()=>setSeconds(v=>v+1),1000);
    }catch(e){streamRef.current?.getTracks?.().forEach(t=>t.stop());if(mounted.current)setNotice(e.message||'Could not start microphone recording. Check microphone permission.');}finally{starting.current=false;}
  };
  const stop=()=>{clearInterval(timerRef.current);setRecording(false);if(recorderRef.current?.state==='recording')recorderRef.current.stop();};
  const discard=()=>{setAudioUrl('');blobRef.current=null;setSeconds(0);setNotice('');};
  const play=()=>{if(!audioUrl)return;try{playerRef.current?.pause();const player=new Audio(audioUrl);playerRef.current=player;player.play().catch(()=>setNotice('Audio playback could not start.'));}catch{setNotice('Audio playback is not supported on this device.');}};
  const send=async()=>{
    if(sendLock.current)return;
    if(!blobRef.current||!isConversationId(conversationId)||!user?.id)return setNotice('Record a voice note from an active conversation first.');
    sendLock.current=true;setSaving(true);setNotice('');
    try{
      const file=new File([blobRef.current],`voice-note-${Date.now()}.webm`,{type:(blobRef.current.type||'audio/webm').split(';')[0]});
      await sendEncryptedVoiceMessage(file,conversationId,user.id);
      Alert.alert('Voice note sent','Your voice note has been sent.',[{text:'OK',onPress:()=>navigation.goBack()}]);
    }catch(e){setNotice(e.message||'The voice note could not be sent.');}finally{sendLock.current=false;if(mounted.current)setSaving(false);}
  };
  const time=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  return <View style={s.page}><TouchableOpacity onPress={()=>navigation.goBack()}><Text style={s.back}>‹ Back</Text></TouchableOpacity><View style={s.center}><Text style={s.icon}>🎙</Text><Text style={s.title}>{recording?'Recording voice note':audioUrl?'Voice note ready':'Record a voice note'}</Text><Text style={s.sub}>{recording?'Speak clearly. Tap stop when finished.':'Use your device microphone to record an audio message.'}</Text><Text style={s.timer}>{time}</Text><View style={s.actions}>{!recording&&!audioUrl&&<TouchableOpacity style={s.primary} onPress={start}><Text style={s.primaryText}>Start recording</Text></TouchableOpacity>}{recording&&<TouchableOpacity style={[s.primary,s.stop]} onPress={stop}><Text style={s.primaryText}>Stop recording</Text></TouchableOpacity>}{!!audioUrl&&<><TouchableOpacity style={s.secondary} onPress={play}><Text style={s.secondaryText}>Play recording</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={discard}><Text style={s.secondaryText}>Discard</Text></TouchableOpacity><TouchableOpacity style={s.primary} disabled={saving} onPress={send}>{saving?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>Send voice note</Text>}</TouchableOpacity></>}</View>{!!notice&&<Text style={s.notice}>{notice}</Text>}</View></View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor: '#05030A',padding:18},back:{color:'#D8B8F5',fontSize:17,marginTop:12},center:{flex:1,alignItems:'center',justifyContent:'center',padding:18},icon:{fontSize:60,marginBottom:18},title:{color:'#FFF',fontSize:23,fontWeight:'800',textAlign:'center'},sub:{color:'#C4B4D0',textAlign:'center',lineHeight:20,marginTop:10,maxWidth:320},timer:{color:'#FFF',fontSize:34,fontWeight:'700',marginTop:25,fontVariant:['tabular-nums']},actions:{width:'100%',maxWidth:340,gap:10,marginTop:28},primary:{backgroundColor:'#6A0DAD',padding:15,borderRadius:12,alignItems:'center'},stop:{backgroundColor:'#D6455D'},primaryText:{color:'#FFF',fontWeight:'800'},secondary:{backgroundColor:'#172B43',padding:14,borderRadius:12,alignItems:'center',borderWidth:1,borderColor:'#503567'},secondaryText:{color:'#D9E8F8',fontWeight:'700'},notice:{color:'#FFB6C0',marginTop:18,textAlign:'center',lineHeight:19}});
