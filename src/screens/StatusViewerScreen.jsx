import React, { useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_URL } from '../lib_supabase';
import { resolveSocialMedia } from '../services/socialMedia';
import { useExpiryTime } from '../services/useExpiryTime';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
export default function StatusViewerScreen({ navigation, route }) {
  const item = route?.params?.status;
  const now = useExpiryTime([item?.expires_at]);
  const video = useRef(null);
  const [media, setMedia] = useState({ source: null, url: '', error: '' });
  const available = !!item && Date.parse(item.expires_at) > now;
  useEffect(() => {
    if (!available || !item.media_url) return undefined;
    let cancelled = false;
    const resolve = async () => {
      try {
        const url = await resolveSocialMedia(supabase, SUPABASE_URL, item.media_url, { expiresAt: item.expires_at });
        if (!cancelled) setMedia({ source: item.media_url, url, error: '' });
      } catch {
        if (!cancelled) setMedia({ source: item.media_url, url: '', error: 'This media could not be loaded. Close and reopen the status to retry.' });
      }
    };
    resolve();
    const timer = setInterval(resolve, 240000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [available, item?.media_url, item?.expires_at]);
  const mediaUrl = available && media.source === item?.media_url ? media.url : '';
  useEffect(() => { const player = video.current; if (player && mediaUrl) { player.src = mediaUrl; player.load(); } return () => { if (player) { player.pause(); player.removeAttribute('src'); player.load(); } }; }, [mediaUrl]);
  if (!available) return <View style={s.root}><Text style={s.text}>This status is no longer available.</Text><TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>Go back</Text></TouchableOpacity></View>;
  const name = item.profile?.full_name || (item.profile?.username ? `@${item.profile.username}` : 'KONNEKT member');
  return <View style={s.root}>
    <TouchableOpacity onPress={() => navigation.goBack()} style={s.close}><Text style={s.back}>‹ Close</Text></TouchableOpacity>
    <View style={s.progress}><View style={s.progressFill}/></View>
    <Text style={s.name}>{name}</Text>
    <Text style={s.created}>{new Date(item.created_at).toLocaleString()}</Text>
    <View style={s.mediaBox}>{item.media_url ? (!mediaUrl ? <Text style={s.text}>{media.error || 'Loading media…'}</Text> : item.media_type === 'image' ? <Image source={{ uri: mediaUrl }} style={s.media} resizeMode="contain"/> : <video ref={video} src={mediaUrl} controls autoPlay playsInline style={{ width:'100%', height:'100%', objectFit:'contain', backgroundColor:'#000' }}/>) : <Text style={s.text}>{item.text_content || 'Shared a moment'}</Text>}</View>
    {!!item.media_url && !!item.text_content && <Text style={s.caption}>{item.text_content}</Text>}
    <Text style={s.time}>Expires {new Date(item.expires_at).toLocaleString()}</Text>
  </View>;
}
const s=StyleSheet.create({root:{flex:1,minHeight:0,backgroundColor:'#05030A',padding:18},close:{marginTop:15},back:{color:'#FFC107',fontSize:16,fontWeight:'800'},progress:{height:3,backgroundColor:'#39244B',borderRadius:3,marginTop:18,marginBottom:20},progressFill:{height:3,width:'100%',backgroundColor:'#6A0DAD',borderRadius:3},name:{color:'#FFF',fontSize:22,fontWeight:'900'},created:{color:'#BBA9CC',fontSize:11,marginTop:4},mediaBox:{flex:1,minHeight:200,marginTop:18,backgroundColor:'#000',borderRadius:14,overflow:'hidden',alignItems:'center',justifyContent:'center'},media:{width:'100%',height:'100%'},text:{color:'#FFF',fontSize:24,fontWeight:'800',textAlign:'center',padding:24},caption:{color:'#FFF',fontSize:16,textAlign:'center',marginTop:14},time:{color:'#BBA9CC',textAlign:'center',marginTop:14,fontSize:11}});
