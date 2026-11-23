import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { EventBanner } from '../../components/EventBanner';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import {
  Button,
  ErrorText,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import {
  deleteEvent,
  getEvent,
  getRsvpSummary,
  isCommunityAdmin,
  setRsvp,
  type EventDetail,
} from '../../lib/communityContent';
import { CACHE_TTL, isOnline, resolveWithCache } from '../../lib/net';
import { publicUrl } from '../../lib/uploads';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [going, setGoing] = useState(0);
  const [mine, setMine] = useState(false);
  const [rsvpOn, setRsvpOn] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing event.');
      return;
    }
    try {
      const found = (
        await resolveWithCache(`event:${id}`, () => getEvent(id), {
          ttlMs: CACHE_TTL.events,
        })
      ).value;
      if (!found) {
        setError(
          isOnline()
            ? 'Event not found.'
            : 'You are offline. Open this event once online to save it.',
        );
        return;
      }
      setEvent(found);
      const summary = await getRsvpSummary(id).catch(() => ({
        going: 0,
        mine: false,
        unsupported: true,
      }));
      setGoing(summary.going);
      setMine(summary.mine);
      setRsvpOn(!summary.unsupported);
      if (found.community_id) {
        setAdmin(await isCommunityAdmin(found.community_id).catch(() => false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRsvp() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      await setRsvp(id, !mine);
      setMine(!mine);
      setGoing((g) => g + (!mine ? 1 : -1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update RSVP.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert('Delete event?', event?.title ?? '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEvent(id);
            router.replace('/events');
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Could not delete.',
            );
          }
        },
      },
    ]);
  }

  return (
    <>
      <ScreenHeader title="EVENT" />
      <OfflineBanner />
      <Screen>
        {!event ? (
          <>
            <ActivityIndicator style={{ marginTop: 40 }} />
            <ErrorText message={error} />
          </>
        ) : (
          <>
            <View style={styles.bannerWrap}>
              <EventBanner
                uri={
                  event.banner_url
                    ? publicUrl('post-media', event.banner_url)
                    : null
                }
                title={event.title}
                kind={event.banner_kind}
                onPress={
                  event.banner_url ? () => setViewerOpen(true) : null
                }
              />
            </View>
            <Modal
              visible={viewerOpen}
              transparent
              onRequestClose={() => setViewerOpen(false)}
            >
              <View style={styles.viewer}>
                <Pressable
                  style={styles.viewerClose}
                  onPress={() => setViewerOpen(false)}
                  hitSlop={12}
                >
                  <Ionicons name="close" size={28} color="#FFFFFF" />
                </Pressable>
                {event.banner_url &&
                  (event.banner_kind === 'video' ? (
                    viewerOpen && (
                      <ViewerVideo
                        uri={publicUrl('post-media', event.banner_url)}
                      />
                    )
                  ) : (
                    <Image
                      source={{
                        uri: publicUrl('post-media', event.banner_url),
                      }}
                      style={styles.viewerImage}
                      resizeMode="contain"
                    />
                  ))}
              </View>
            </Modal>
            {event.title ? <Heading>{event.title}</Heading> : null}
            <Subtext>
              {event.event_date}
              {event.event_time ? ` • ${event.event_time}` : ''}
            </Subtext>
            {event.communityName && (
              <Subtext>Hosted by {event.communityName}</Subtext>
            )}
            {rsvpOn && (
              <Subtext>
                {going} going{going === 1 ? '' : ''} •{' '}
                {mine ? 'You are in.' : 'You have not responded.'}
              </Subtext>
            )}
            <ErrorText message={error} />
            {rsvpOn && (
              <Button
                title={mine ? "Can't make it" : 'Count me in'}
                variant={mine ? 'outline' : 'dark'}
                loading={busy}
                onPress={handleRsvp}
              />
            )}
            {admin && (
              <>
                <Button
                  title="Edit event"
                  variant="outline"
                  onPress={() =>
                    router.push({
                      pathname: '/event/edit' as never,
                      params: { id: id ?? '' },
                    })
                  }
                />
                <Button
                  title="Delete event"
                  variant="outline"
                  onPress={confirmDelete}
                />
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function ViewerVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  useEffect(() => {
    player.play();
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={styles.viewerVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  bannerWrap: { marginBottom: 4 },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1,
  },
  viewerImage: { width: '100%', height: '85%' },
  viewerVideo: { width: '100%', height: '85%' },
});
