import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function DeferredFeatureScreen({ navigation, route }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{route.params.deferredFeature}</Text>
      <Text style={styles.heading}>Unavailable in this release</Text>
      <Text style={styles.body}>Live rooms, gifts, creator payments and paid subscriptions are not included in this release. No live session will start and no payment details will be requested.</Text>
      <Text style={styles.body}>You can continue using chats, groups, Reels, Status and Discover.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#05030A' },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: '#D8B8F5', fontSize: 16, marginTop: 12 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '800', marginTop: 24 },
  heading: { color: '#D8B8F5', fontSize: 18, fontWeight: '700', marginTop: 24 },
  body: { color: '#C4B4D0', lineHeight: 22, marginTop: 14 },
});
