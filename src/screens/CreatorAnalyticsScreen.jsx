
import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { getCreatorAnalytics } from '../services/creatorAnalytics';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const periods = ['7 days', '30 days', '90 days'];

const emptyMetrics = { views: null, likes: null, comments: null, shares: null, followers: null, engagement: null };

const topVideos = [];

export default function CreatorAnalyticsScreen({ navigation }) {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('7 days');
  const [snapshot, setSnapshot] = useState(null);
  const [notice, setNotice] = useState('');
  // Never render another account/period's stale totals while a request settles.
  const current = snapshot?.userId === user?.id && snapshot?.period === selectedPeriod;
  const data = current ? snapshot.data : emptyMetrics;
  useEffect(() => {
    let active = true;
    setNotice('Loading recorded analytics…');
    if (!user?.id) return () => { active = false; };
    getCreatorAnalytics(supabase, user.id, Number.parseInt(selectedPeriod, 10)).then(result => {
      if (!active) return;
      setSnapshot({ userId: user.id, period: selectedPeriod, data: result.data });
      setNotice(result.unavailable.length ? `Some recorded counts are unavailable: ${result.unavailable.join(', ')}.` : 'Counts reflect current recorded likes, comments and follows created during this period. Removed activity is excluded.');
    }).catch(() => { if (active) { setSnapshot(null); setNotice('Analytics could not load. Choose a period to retry.'); } });
    return () => { active = false; };
  }, [user?.id, selectedPeriod]);

  const metricCards = [
    { title: 'Video views', value: data.views, icon: '👁' },
    { title: 'Likes', value: data.likes, icon: '❤️' },
    { title: 'Comments', value: data.comments, icon: '💬' },
    { title: 'Shares', value: data.shares, icon: '↗️' },
    { title: 'New followers', value: data.followers, icon: '👥' },
    { title: 'Engagement', value: data.engagement, icon: '📊' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Creator Analytics</Text>

        <Text style={styles.headerIcon}>📈</Text>
      </View>

      <View style={styles.intro}>
        <Text style={styles.introTitle}>Understand your growth</Text>
        <Text style={styles.introDescription}>
          Track how your KONNEKT content performs and discover
          what your audience enjoys.
        </Text>
      </View>

      <View style={styles.periodRow}>
        {periods.map(period => (
          <TouchableOpacity
            key={period}
            onPress={() => setSelectedPeriod(period)}
            style={[
              styles.periodButton,
              selectedPeriod === period && styles.activePeriod,
            ]}
          >
            <Text
              style={[
                styles.periodText,
                selectedPeriod === period && styles.activePeriodText,
              ]}
            >
              {period}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Performance overview</Text>

      <View style={styles.metricsGrid}>
        {metricCards.map(metric => (
          <View key={metric.title} style={styles.metricCard}>
            <Text style={styles.metricIcon}>{metric.icon}</Text>
            <Text accessibilityLabel={`${metric.title}: ${metric.value ?? 'unavailable'}`} style={styles.metricValue}>{metric.value ?? '—'}</Text>
            <Text style={styles.metricTitle}>{metric.title}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Audience growth</Text>

      <View style={styles.growthCard}>
        <View>
          <Text style={styles.growthLabel}>New followers</Text>
          <Text style={styles.growthValue}>{data.followers ?? '—'}</Text>
          <Text style={styles.growthCaption}>
            During the selected period
          </Text>
        </View>

        <Text style={styles.growthIcon}>📈</Text>
      </View>

      <Text style={styles.sectionTitle}>Top-performing videos</Text>
      <Text style={styles.footer}>Top-video ranking is not connected yet.</Text>

      {topVideos.map(video => (
        <View key={video.id} style={styles.videoCard}>
          <View style={styles.videoThumbnail}>
            <Text style={styles.videoEmoji}>{video.emoji}</Text>
          </View>

          <View style={styles.videoInfo}>
            <Text style={styles.videoTitle}>{video.title}</Text>
            <Text style={styles.videoStats}>
              👁 {video.views} views
            </Text>
            <Text style={styles.videoStats}>
              ❤️ {video.likes} likes
            </Text>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Live-stream analytics</Text>

      <View style={styles.liveCard}>
        <Text style={styles.liveIcon}>🔴</Text>

        <View style={styles.liveInfo}>
          <Text style={styles.liveTitle}>Live performance</Text>
          <Text style={styles.liveDescription}>
            Live viewers, watch time, comments and gifts will
            appear here after live-stream analytics are connected.
          </Text>
        </View>
      </View>

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>💡 Creator tip</Text>
        <Text style={styles.tipText}>
          Study which videos receive the most engagement.
          Experiment with different topics and posting times
          to learn what your audience enjoys.
        </Text>
      </View>

      <Text style={styles.footer}>
        {notice} Views, shares and view-based engagement are unavailable until verified measurement is connected.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05030A',
  },
  content: {
    paddingBottom: 30,
  },
  header: {
    backgroundColor: '#FFC107',
    paddingTop: 43,
    padding: 17,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    color: '#181025',
    fontSize: 13,
  },
  headerTitle: {
    color: '#181025',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerIcon: {
    fontSize: 19,
  },
  intro: {
    backgroundColor: '#181025',
    margin: 14,
    padding: 16,
    borderRadius: 12,
  },
  introTitle: {
    color: '#FAF8FF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  introDescription: {
    color: '#CBBBD9',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  periodRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    backgroundColor: '#181025',
    padding: 5,
    borderRadius: 9,
  },
  periodButton: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    borderRadius: 7,
  },
  activePeriod: {
    backgroundColor: '#FFC107',
  },
  periodText: {
    color: '#CBBBD9',
    fontSize: 10,
    fontWeight: 'bold',
  },
  activePeriodText: {
    color: '#181025',
  },
  sectionTitle: {
    color: '#FAF8FF',
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 15,
    marginTop: 22,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 9,
  },
  metricCard: {
    width: '46%',
    margin: '2%',
    padding: 14,
    backgroundColor: '#181025',
    borderRadius: 11,
  },
  metricIcon: {
    fontSize: 21,
  },
  metricValue: {
    color: '#FFC107',
    fontSize: 19,
    fontWeight: 'bold',
    marginTop: 9,
  },
  metricTitle: {
    color: '#CBBBD9',
    fontSize: 10,
    marginTop: 4,
  },
  growthCard: {
    marginHorizontal: 14,
    backgroundColor: '#181025',
    padding: 17,
    borderRadius: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  growthLabel: {
    color: '#CBBBD9',
    fontSize: 10,
  },
  growthValue: {
    color: '#FFC107',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 5,
  },
  growthCaption: {
    color: '#B5A5C5',
    fontSize: 9,
    marginTop: 4,
  },
  growthIcon: {
    fontSize: 38,
  },
  videoCard: {
    marginHorizontal: 14,
    marginBottom: 9,
    padding: 11,
    backgroundColor: '#181025',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoThumbnail: {
    width: 58,
    height: 58,
    backgroundColor: '#21132F',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoEmoji: {
    fontSize: 27,
  },
  videoInfo: {
    marginLeft: 12,
    flex: 1,
  },
  videoTitle: {
    color: '#FAF8FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  videoStats: {
    color: '#CBBBD9',
    fontSize: 9,
    marginTop: 5,
  },
  liveCard: {
    marginHorizontal: 14,
    padding: 15,
    backgroundColor: '#181025',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveIcon: {
    fontSize: 30,
    marginRight: 12,
  },
  liveInfo: {
    flex: 1,
  },
  liveTitle: {
    color: '#FAF8FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  liveDescription: {
    color: '#CBBBD9',
    fontSize: 9,
    lineHeight: 15,
    marginTop: 5,
  },
  tipCard: {
    backgroundColor: '#21132F',
    margin: 14,
    padding: 15,
    borderRadius: 10,
  },
  tipTitle: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tipText: {
    color: '#FAF8FF',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 7,
  },
  footer: {
    color: '#B5A5C5',
    fontSize: 9,
    textAlign: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    lineHeight: 15,
  },
});
