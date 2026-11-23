import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

/**
 * One uniform tile: every photo in the feed crops to the same box so rows
 * stay equal. Tapping opens the fullscreen viewer, which shows the whole
 * photo uncropped.
 */
function Tile({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  return (
    <Image
      source={{ uri }}
      style={[stylesPhoto.photo, { width, height }]}
      resizeMode="cover"
    />
  );
}

const stylesPhoto = StyleSheet.create({
  photo: { borderRadius: radius.m, backgroundColor: '#00000010' },
});

export function PhotoCarousel({
  uris,
  height = 220,
  onPress,
}: {
  uris: string[];
  height?: number;
  onPress?: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { width: screenWidth } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const interval = Math.max(0, width - 56) + 8;
    if (interval <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / interval);
    setIndex(Math.max(0, Math.min(uris.length - 1, next)));
  }

  function handleTap(i: number) {
    if (onPress) {
      onPress();
      return;
    }
    setViewerIndex(i);
  }

  if (uris.length === 0) return null;

  const gap = 8;
  const itemWidth = Math.max(0, width - 56);
  const single = uris.length === 1;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {single ? (
        <Pressable onPress={() => handleTap(0)}>
          {width > 0 ? (
            <Tile uri={uris[0]} width={width} height={height} />
          ) : (
            <View style={[styles.placeholder, { height }]} />
          )}
        </Pressable>
      ) : (
        <>
          <FlatList
            data={uris}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            horizontal
            decelerationRate="fast"
            snapToInterval={itemWidth > 0 ? itemWidth + gap : undefined}
            snapToAlignment="start"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            contentContainerStyle={styles.track}
            renderItem={({ item, index: i }) => (
              <Pressable
                onPress={() => handleTap(i)}
                style={{ marginRight: gap }}
              >
                {itemWidth > 0 ? (
                  <Tile uri={item} width={itemWidth} height={height} />
                ) : (
                  <View style={[styles.placeholder, { height }]} />
                )}
              </Pressable>
            )}
          />
          <View style={styles.footer}>
            <View style={styles.dots}>
              {uris.map((uri, i) => (
                <View
                  key={`${uri}-${i}`}
                  style={[styles.dot, i === index && styles.dotActive]}
                />
              ))}
            </View>
            <Text style={styles.counter}>
              {index + 1}/{uris.length}
            </Text>
          </View>
        </>
      )}
      <Modal
        visible={viewerIndex !== null}
        transparent
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.viewer}>
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerIndex(null)}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          {viewerIndex !== null && (
            <FlatList
              data={uris}
              keyExtractor={(uri, i) => `full-${uri}-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={viewerIndex}
              getItemLayout={(_, i) => ({
                length: screenWidth,
                offset: screenWidth * i,
                index: i,
              })}
              onMomentumScrollEnd={(e) => {
                const next = Math.round(
                  e.nativeEvent.contentOffset.x / screenWidth,
                );
                setViewerIndex(Math.max(0, Math.min(uris.length - 1, next)));
              }}
              renderItem={({ item }) => (
                <View style={[styles.viewerPage, { width: screenWidth }]}>
                  <Image
                    source={{ uri: item }}
                    style={styles.viewerImage}
                    resizeMode="contain"
                  />
                </View>
              )}
            />
          )}
          {uris.length > 1 && viewerIndex !== null && (
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1}/{uris.length}
            </Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginTop: 10 },
    track: { paddingRight: 48 },
    placeholder: {
      borderRadius: radius.m,
      backgroundColor: c.bg,
      width: '100%',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingHorizontal: 4,
    },
    dots: { flexDirection: 'row', gap: 6 },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.border,
    },
    dotActive: { backgroundColor: c.ink, width: 18 },
    counter: { fontSize: 12, color: c.subtext, fontWeight: '700' },
    viewer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
    },
    viewerClose: {
      position: 'absolute',
      top: 48,
      right: 20,
      zIndex: 1,
    },
    viewerPage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    viewerImage: { width: '100%', height: '85%' },
    viewerCounter: {
      position: 'absolute',
      bottom: 40,
      alignSelf: 'center',
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });
}
