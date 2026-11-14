import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator
} from 'react-native';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';

function iconFor(type) {
  if (type === 'message') return '💬';
  if (type === 'like') return '❤️';
  if (type === 'follow') return '👤';
  if (type === 'comment') return '💬';
  return '🔔';
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [markingId, setMarkingId] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [notice, setNotice] = useState('');
  const [pushState, setPushState] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,recipient_id,actor_id,type,body,reference_id,read_at,created_at')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setItems(data || []);
      setNotice('');
    } catch (error) {
      setNotice(`Notifications could not load: ${error?.message || 'Please try again.'}`);
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user?.id) return undefined;
    const channel = supabase.channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${user.id}`
      }, payload => {
        const incoming = payload.new;
        if (!incoming?.id) return;
        setItems(previous => previous.some(item => item.id === incoming.id)
          ? previous
          : [incoming, ...previous].slice(0, 100));
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted' &&
          document.visibilityState === 'visible'
        ) {
          try {
            new window.Notification('KONNEKT', { body: incoming.body || 'You have a new notification.' });
          } catch (_) {
            // Browser notification support varies; in-app notification remains available.
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const enableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushState('This browser does not support desktop notifications.');
      return;
    }
    try {
      const permission = await window.Notification.requestPermission();
      setPushState(permission === 'granted'
        ? 'Browser alerts are enabled while KONNEKT is open.'
        : `Browser notification permission: ${permission}.`);
    } catch (error) {
      setPushState(error?.message || 'Could not request browser notification permission.');
    }
  };

  const markRead = async id => {
    if (!user?.id || markingId) return;
    const target = items.find(item => item.id === id);
    if (!target || target.read_at) return;
    const now = new Date().toISOString();
    setMarkingId(id);
    setItems(previous => previous.map(item => item.id === id ? { ...item, read_at: now } : item));
    try {
      const { error } = await supabase.from('notifications')
        .update({ read_at: now })
        .eq('id', id)
        .eq('recipient_id', user.id);
      if (error) throw error;
    } catch (error) {
      setItems(previous => previous.map(item => item.id === id ? { ...item, read_at: null } : item));
      setNotice(`Could not mark notification as read: ${error?.message || 'Please try again.'}`);
    } finally {
      setMarkingId('');
    }
  };

  const markAllRead = async () => {
    if (!user?.id || markingAll) return;
    const unread = items.filter(item => !item.read_at);
    if (!unread.length) return;
    const now = new Date().toISOString();
    setMarkingAll(true);
    setItems(previous => previous.map(item => item.read_at ? item : { ...item, read_at: now }));
    try {
      const { error } = await supabase.from('notifications')
        .update({ read_at: now })
        .eq('recipient_id', user.id)
        .is('read_at', null);
      if (error) throw error;
      setNotice('');
    } catch (error) {
      await load();
      setNotice(`Could not mark all notifications as read: ${error?.message || 'Please try again.'}`);
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = items.filter(item => !item.read_at).length;

  return (
    <View style={s.container}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Notifications</Text>
          <Text style={s.count}>{unreadCount} unread</Text>
        </View>
        <TouchableOpacity style={[s.enable, (!unreadCount || markingAll) && s.disabled]} onPress={markAllRead} disabled={!unreadCount || markingAll}>
          <Text style={s.enableText}>{markingAll ? 'Saving…' : 'Mark all read'}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.alertRow}>
        <Text style={s.note}>Stay updated with follows, likes, comments and messages.</Text>
        <TouchableOpacity style={s.browserButton} onPress={enableBrowserAlerts}>
          <Text style={s.browserButtonText}>Browser alerts</Text>
        </TouchableOpacity>
      </View>
      {!!pushState && <Text style={s.note}>{pushState}</Text>}
      {busy
        ? <ActivityIndicator color="#6A0DAD" style={{ marginTop: 35 }} />
        : <FlatList
            data={items}
            keyExtractor={item => String(item.id)}
            onRefresh={load}
            refreshing={busy}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.item, !item.read_at && s.unread]}
                onPress={() => markRead(item.id)}
                disabled={!!item.read_at || !!markingId}
                accessibilityRole="button"
                accessibilityLabel={`${item.read_at ? 'Read' : 'Unread'} notification: ${item.body || item.type || 'KONNEKT update'}`}
              >
                <Text style={s.type}>{iconFor(item.type)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.body}>{item.body || 'You have a new notification.'}</Text>
                  <Text style={s.date}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
                </View>
                {!item.read_at && <View style={s.dot} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty}>Your notifications will appear here.</Text>}
          />}
      {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: '#10091B', padding: 18 },
  head: { marginTop: 24, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { color: '#FFF', fontSize: 27, fontWeight: 'bold' },
  count: { color: '#8EA3BB', fontSize: 11, marginTop: 4 },
  enable: { backgroundColor: '#173A5B', padding: 9, borderRadius: 9 },
  enableText: { color: '#9DD4FF', fontSize: 11, fontWeight: 'bold' },
  disabled: { opacity: 0.45 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  note: { color: '#8EA3BB', fontSize: 11, lineHeight: 17, flex: 1, marginBottom: 8 },
  browserButton: { backgroundColor: '#241630', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  browserButtonText: { color: '#C9B5E2', fontSize: 10, fontWeight: 'bold' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: '#39244B' },
  unread: { backgroundColor: '#102944' },
  type: { fontSize: 23 },
  body: { color: '#E7F1FC', lineHeight: 20 },
  date: { color: '#BBA9CC', fontSize: 10, marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6A0DAD' },
  empty: { color: '#C4B4D0', textAlign: 'center', marginTop: 55, padding: 20 },
  notice: { color: '#FF8795', marginTop: 8, fontSize: 12, lineHeight: 18 }
});
