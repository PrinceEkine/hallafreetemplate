import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ElementRef,
  useMemo,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { EventBanner } from '../../components/EventBanner';
import { OfflineBanner } from '../../components/OfflineBanner';
import { fonts, radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  deletePersonalEvent,
  isCommunityAdmin,
  listMyTasks,
  listPersonalEvents,
  purgeStaleEvents,
  setPersonalEventDone,
  setTaskStatus,
  type PersonalEvent,
  type TaskItem,
} from '../../lib/communityContent';
import { events as mockEvents, type EventItem } from '../../lib/mock';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/uploads';
import {
  resolveSelectedCommunityId,
  useSelectedCommunityId,
} from '../../lib/selectedCommunity';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso(): string {
  return isoOf(new Date());
}

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setDate(d.getDate() - ((d.getDay() - 5 + 7) % 7));
  s.setHours(0, 0, 0, 0);
  return s;
}

const TAB_KEY = '@ophixe:events_tab_v2';

function shortTitle(title: string): string {
  return title.length > 50 ? `${title.slice(0, 50)}…` : title;
}

function formatEventDate(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  const day = d.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'ST'
      : day === 2 || day === 22
        ? 'ND'
        : day === 3 || day === 23
          ? 'RD'
          : 'TH';
  return `${day}${suffix} ${MONTH_NAMES[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

type EventRow = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  banner_url: string | null;
  banner_kind: string | null;
};

export default function Events() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const demo = !isSupabaseConfigured();
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  function onRefresh() {
    if (demo) return;
    setRefreshing(true);
    setNonce((n) => n + 1);
  }
  const [items, setItems] = useState<EventItem[] | null>(
    demo ? mockEvents : null,
  );
  const [query, setQuery] = useState('');
  const [admin, setAdmin] = useState(demo);
  const [myTasks, setMyTasks] = useState<TaskItem[]>([]);
  const [personal, setPersonal] = useState<PersonalEvent[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedIso, setSelectedIso] = useState<string | null>(todayIso());
  const [expanded, setExpanded] = useState(false);
  const [gridMonth, setGridMonth] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [tab, setTab] = useState(0);
  const pagerRef = useRef<ElementRef<typeof ScrollView> | null>(null);
  const bannerRef = useRef<ElementRef<typeof ScrollView> | null>(null);
  const bannerIndexRef = useRef(0);
  const lastBannerTouch = useRef(0);
  const [bannerIndex, setBannerIndex] = useState(0);
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const bannerWidth = width - 32;

  function goTab(next: 0 | 1) {
    setTab(next);
    AsyncStorage.setItem(TAB_KEY, String(next)).catch(() => {});
    pagerRef.current?.scrollTo({ x: next * width, animated: true });
  }

  useEffect(() => {
    AsyncStorage.getItem(TAB_KEY)
      .then((saved) => {
        const next = saved === '1' ? 1 : 0;
        setTab(next);
        pagerRef.current?.scrollTo({ x: next * width, animated: false });
      })
      .catch(() => {});
  }, [width]);

  const selectedId = useSelectedCommunityId();

  useFocusEffect(
    useCallback(() => {
      if (demo) return;
      (async () => {
        const scoped = await resolveSelectedCommunityId();
      const personalPage = await listPersonalEvents(scoped).catch(() => ({
        items: [],
        unsupported: true,
      }));
      setPersonal(personalPage.items.filter((p) => !p.done));
      if (!scoped) {
        setItems([]);
        setAdmin(false);
        setMyTasks([]);
        setRefreshing(false);
        return;
      }
      setAdmin(await isCommunityAdmin(scoped));
      // Sweep events 5+ working days past (also runs nightly server-side).
      void purgeStaleEvents();
      const mine = await listMyTasks(scoped).catch(() => ({
        tasks: [],
        unsupported: true,
      }));
      setMyTasks(mine.tasks);
      // Saved events render instantly; the network refreshes underneath.
      const { value } = await resolveWithCache<EventItem[]>(
        `events:${scoped}`,
        async () => {
          const runList = (columns: string) =>
            supabase
              .from('events')
              .select(columns)
              .eq('community_id', scoped)
              .order('event_date', { ascending: true })
              .limit(60);
          let { data, error } = await runList(
            'id,title,event_date,event_time,banner_url,banner_kind',
          );
          if (error && /banner_kind/.test(String(error.message ?? ''))) {
            // Stale backend: reread without the kind; all its banners
            // are images.
            ({ data, error } = await runList(
              'id,title,event_date,event_time,banner_url',
            ));
          }
          if (error || !data) return [];
          const rows = data as unknown as EventRow[];
          const now = todayIso();
          const firstUpcoming = rows.findIndex(
            (r) => String(r.event_date).slice(0, 10) >= now,
          );
          return rows.map((row, index) => ({
            id: String(row.id),
            title: String(row.title).toUpperCase(),
            date: formatEventDate(String(row.event_date)),
            time: String(row.event_time ?? ''),
            highlight: index === (firstUpcoming === -1 ? 0 : firstUpcoming),
            isoDate: String(row.event_date).slice(0, 10),
            bannerUrl: row.banner_url
              ? publicUrl('post-media', String(row.banner_url))
              : undefined,
            bannerKind: row.banner_kind === 'video' ? 'video' : 'image',
          }));
        },
        { ttlMs: CACHE_TTL.events },
      );
      setItems(value ?? []);
      setRefreshing(false);
    })();
    }, [demo, nonce, selectedId]),
  );

  function goToToday() {
    const now = new Date();
    setCursor(now);
    setSelectedIso(isoOf(now));
  }

  function moveWeek(delta: 1 | -1) {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta * 7);
      return next;
    });
  }

  function moveMonth(delta: 1 | -1) {
    setGridMonth((prev) => {
      const next = new Date(prev.y, prev.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  }

  function toggleDay(iso: string) {
    setSelectedIso((prev) => (prev === iso ? null : iso));
  }

  async function handleTaskDone(task: TaskItem) {
    try {
      await setTaskStatus(task.id, 'done');
      setMyTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      // keep the row on failure
    }
  }

  async function handlePersonalDone(item: PersonalEvent) {
    try {
      await setPersonalEventDone(item.id, true);
      setPersonal((prev) => prev.filter((p) => p.id !== item.id));
    } catch {
      // keep the row on failure
    }
  }

  async function handlePersonalDelete(item: PersonalEvent) {
    try {
      await deletePersonalEvent(item.id);
      setPersonal((prev) => prev.filter((p) => p.id !== item.id));
    } catch {
      // keep the row on failure
    }
  }

  const weekStart = startOfWeek(cursor);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  // The down button opens a full month calendar below the strip. The grid
  // keeps its own month so picking a day never yanks it elsewhere.
  const gridStart = startOfWeek(new Date(gridMonth.y, gridMonth.m, 1));
  const gridDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const gridWeeks = [0, 1, 2, 3, 4, 5].map((w) =>
    gridDays.slice(w * 7, w * 7 + 7),
  );
  const now = todayIso();
  const eventDates = new Set(
    (items ?? []).map((e) => e.isoDate).filter((v): v is string => !!v),
  );
  const needle = query.trim().toLowerCase();
  const filtered = (items ?? []).filter(
    (e) =>
      (!selectedIso || !e.isoDate || e.isoDate === selectedIso) &&
      (!needle ||
        e.title.toLowerCase().includes(needle) ||
        e.date.toLowerCase().includes(needle)),
  );
  // The top banner carousel starts at the closest upcoming event, no
  // matter which day is selected in the strip below; with nothing upcoming
  // it falls back to the most recent past events instead of going blank.
  const upcoming = (items ?? []).filter((e) => (e.isoDate ?? now) >= now);
  const past = (items ?? [])
    .filter((e) => (e.isoDate ?? now) < now)
    .reverse();
  const bannerList = (upcoming.length > 0 ? upcoming : past).slice(0, 8);
  const bannerPast = upcoming.length === 0;
  const bannerEvent =
    bannerList[Math.min(bannerIndex, bannerList.length - 1)] ?? null;

  useEffect(() => {
    bannerIndexRef.current = 0;
    setBannerIndex(0);
  }, [items]);

  // Auto-scroll the banner carousel; a recent manual swipe pauses it.
  useEffect(() => {
    if (bannerList.length < 2) return;
    const timer = setInterval(() => {
      if (Date.now() - lastBannerTouch.current < 6000) return;
      const next = (bannerIndexRef.current + 1) % bannerList.length;
      bannerIndexRef.current = next;
      setBannerIndex(next);
      bannerRef.current?.scrollTo({ x: next * bannerWidth, animated: true });
    }, 4000);
    return () => clearInterval(timer);
  }, [bannerList.length, bannerWidth]);

  function bannerSubtitle(e: EventItem): string {
    return e.time ? `${e.date} • ${e.time}` : e.date;
  }

  function openBannerEvent(e: EventItem) {
    lastBannerTouch.current = Date.now();
    router.push({
      pathname: '/event/[id]',
      params: { id: e.id },
    });
  }

  function renderDay(d: Date) {
    const iso = isoOf(d);
    const selected = selectedIso === iso;
    return (
      <Pressable
        key={iso}
        style={[styles.dayCell, narrow && styles.dayCellNarrow]}
        onPress={() => {
          toggleDay(iso);
          // The strip follows the selection, so collapsing after picking
          // a day in a lower row keeps that week visible.
          setCursor(d);
        }}
      >
        <Text style={[styles.dayName, narrow && styles.dayNameNarrow]}>
          {DAY_NAMES[d.getDay()]}
        </Text>
        <View
          style={[
            styles.dayNum,
            narrow && styles.dayNumNarrow,
            iso === now && styles.dayNumToday,
            selected && styles.dayNumActive,
          ]}
        >
          <Text
            style={[
              styles.dayNumText,
              narrow && styles.dayNumTextNarrow,
              (iso === now || selected) && styles.dayNumTextActive,
            ]}
          >
            {d.getDate()}
          </Text>
        </View>
        {eventDates.has(iso) && <View style={styles.dot} />}
      </Pressable>
    );
  }

  function renderGridDay(d: Date) {
    const iso = isoOf(d);
    const selected = selectedIso === iso;
    const inMonth = d.getMonth() === gridMonth.m;
    return (
      <Pressable
        key={iso}
        style={styles.gridCell}
        onPress={() => {
          toggleDay(iso);
          setCursor(d);
        }}
        accessibilityLabel={`${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`}
      >
        <View
          style={[
            styles.gridNum,
            iso === now && styles.dayNumToday,
            selected && styles.dayNumActive,
          ]}
        >
          <Text
            style={[
              styles.gridNumText,
              !inMonth && styles.gridNumTextDim,
              (iso === now || selected) && styles.dayNumTextActive,
            ]}
          >
            {d.getDate()}
          </Text>
        </View>
        {eventDates.has(iso) && <View style={styles.dot} />}
      </Pressable>
    );
  }

  return (
    <View style={styles.page}>
      <OfflineBanner />
      <View style={styles.monthRow}>
        <View>
          <Text style={styles.month}>
            {MONTH_NAMES[cursor.getMonth()]?.slice(0, 1) +
              MONTH_NAMES[cursor.getMonth()]?.slice(1).toLowerCase()}
          </Text>
          <Text style={styles.year}>{cursor.getFullYear()}</Text>
        </View>
        <View style={styles.searchBox}>
          <TextInput
            placeholder="SEARCH EVENT"
            placeholderTextColor={c.subtext}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <Ionicons name="search" size={22} color={c.ink} />
        {admin ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/event/new',
                params: selectedId ? { communityId: selectedId } : {},
              })
            }
            hitSlop={8}
          >
            <Ionicons name="add" size={26} color={c.ink} />
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={goToToday} hitSlop={8} style={styles.todayWrap}>
        <Text style={styles.todayLink}>Go To Today</Text>
      </Pressable>
      <View style={styles.weekRow}>
        <Pressable onPress={() => moveWeek(-1)} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={c.subtext} />
        </Pressable>
        <View style={styles.week}>{week.map((d) => renderDay(d))}</View>
        <Pressable onPress={() => moveWeek(1)} hitSlop={8}>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={c.subtext}
          />
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          if (!expanded) {
            setGridMonth({ y: cursor.getFullYear(), m: cursor.getMonth() });
          }
          setExpanded((v) => !v);
        }}
        hitSlop={8}
        style={styles.expandWrap}
        accessibilityLabel={expanded ? 'Collapse calendar' : 'Expand calendar'}
      >
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={c.subtext}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.monthCard}>
          <View style={styles.monthHead}>
            <Pressable onPress={() => moveMonth(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={c.subtext} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTH_NAMES[gridMonth.m]?.slice(0, 1) +
                MONTH_NAMES[gridMonth.m]?.slice(1).toLowerCase()}{' '}
              {gridMonth.y}
            </Text>
            <Pressable onPress={() => moveMonth(1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={c.subtext} />
            </Pressable>
          </View>
          <View style={styles.gridWeek}>
            {(gridWeeks[0] ?? []).map((d) => (
              <Text key={d.getDay()} style={styles.gridHeadText}>
                {DAY_NAMES[d.getDay()]}
              </Text>
            ))}
          </View>
          {gridWeeks.map((days, w) => (
            <View key={w} style={styles.gridWeek}>
              {days.map((d) => renderGridDay(d))}
            </View>
          ))}
        </View>
      ) : null}
      {bannerEvent ? (
        <View style={styles.bannerWrap}>
          {bannerList.length < 2 ? (
            <EventBanner
              uri={bannerEvent.bannerUrl ?? null}
              title={bannerEvent.title}
              kind={bannerEvent.bannerKind ?? 'image'}
              kicker={bannerPast ? 'PAST EVENT' : 'UPCOMING EVENT'}
              subtitle={bannerSubtitle(bannerEvent)}
              onPress={() =>
                router.push({
                  pathname: '/event/[id]',
                  params: { id: bannerEvent.id },
                })
              }
            />
          ) : (
            <>
              <ScrollView
                ref={bannerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onTouchStart={() => {
                  lastBannerTouch.current = Date.now();
                }}
                onMomentumScrollEnd={(e) => {
                  const next = Math.round(
                    e.nativeEvent.contentOffset.x / bannerWidth,
                  );
                  const clamped = Math.max(
                    0,
                    Math.min(bannerList.length - 1, next),
                  );
                  bannerIndexRef.current = clamped;
                  setBannerIndex(clamped);
                  lastBannerTouch.current = Date.now();
                }}
              >
                {bannerList.map((e) => (
                  <View key={e.id} style={{ width: bannerWidth }}>
                    <EventBanner
                      uri={e.bannerUrl ?? null}
                      title={e.title}
                      kind={e.bannerKind ?? 'image'}
                      kicker={bannerPast ? 'PAST EVENT' : 'UPCOMING EVENT'}
                      subtitle={bannerSubtitle(e)}
                      onPress={() => openBannerEvent(e)}
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.bannerDots}>
                {bannerList.map((e, i) => (
                  <Pressable
                    key={e.id}
                    hitSlop={8}
                    onPress={() => {
                      bannerIndexRef.current = i;
                      setBannerIndex(i);
                      lastBannerTouch.current = Date.now();
                      bannerRef.current?.scrollTo({
                        x: i * bannerWidth,
                        animated: true,
                      });
                    }}
                    accessibilityLabel={`Show ${e.title}`}
                  >
                    <View
                      style={[
                        styles.bannerDot,
                        i === bannerIndex && styles.bannerDotActive,
                      ]}
                    />
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => goTab(0)}
          hitSlop={8}
          style={styles.tab}
        >
          <Text
            style={[styles.tabLabel, tab === 0 && styles.tabLabelActive]}
          >
            EVENTS{filtered.length > 0 ? ` (${filtered.length})` : ''}
          </Text>
          {tab === 0 && <View style={styles.tabDash} />}
        </Pressable>
        <Pressable
          onPress={() => goTab(1)}
          hitSlop={8}
          style={styles.tab}
        >
          <Text
            style={[styles.tabLabel, tab === 1 && styles.tabLabelActive]}
          >
            TO DO LIST{personal.length > 0 ? ` (${personal.length})` : ''}
          </Text>
          {tab === 1 && <View style={styles.tabDash} />}
        </Pressable>
      </View>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const next =
            Math.round(e.nativeEvent.contentOffset.x / width) === 1 ? 1 : 0;
          setTab(next);
          AsyncStorage.setItem(TAB_KEY, String(next)).catch(() => {});
        }}
        style={styles.pager}
      >
        <View style={{ width }}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.pageList}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListHeaderComponent={
              items === null ? (
                <ActivityIndicator
                  style={styles.loader}
                  color={c.ink}
                />
              ) : undefined
            }
            ListEmptyComponent={
              items !== null ? (
                <Text style={styles.empty}>
                  {selectedIso
                    ? 'No events on this day. Tap the day again to see all upcoming events.'
                    : selectedId
                      ? 'No upcoming events in this community yet.'
                      : 'No upcoming events. New events from your community will appear here.'}
                </Text>
              ) : undefined
            }
            renderItem={({ item, index }) => (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/event/[id]',
                    params: { id: item.id },
                  })
                }
              >
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.timelineDot,
                      item.highlight && styles.timelineDotHighlight,
                    ]}
                  />
                  {index < filtered.length - 1 && (
                    <View style={styles.line} />
                  )}
                </View>
                <View
                  style={[styles.card, item.highlight && styles.cardHighlight]}
                >
                  {item.title ? (
                    <Text
                      style={[
                        styles.cardTitle,
                        item.highlight && styles.cardTitleHighlight,
                      ]}
                    >
                      {shortTitle(item.title)}
                    </Text>
                  ) : null}
                  <View style={styles.cardFooter}>
                    <Text
                      style={[
                        styles.cardDate,
                        item.highlight && styles.cardTitleHighlight,
                      ]}
                    >
                      {item.date}
                    </Text>
                    <Text
                      style={[
                        styles.cardTime,
                        item.highlight && styles.cardTitleHighlight,
                      ]}
                    >
                      {item.time}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </View>
        <View style={{ width }}>
          <FlatList
            data={personal}
            keyExtractor={(p) => p.id}
            style={styles.pageList}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListHeaderComponent={
              <View>
                {myTasks.length > 0 && (
                  <View style={styles.taskSection}>
                    <Text style={styles.subSectionTitle}>MY TASKS</Text>
                    {myTasks.map((t) => (
                      <View key={t.id} style={styles.todoRow}>
                        <Pressable
                          hitSlop={8}
                          onPress={() => handleTaskDone(t)}
                        >
                          <Ionicons
                            name="ellipse-outline"
                            size={22}
                            color={c.primary}
                          />
                        </Pressable>
                        <View style={styles.todoMid}>
                          <Text style={styles.todoTitle}>{t.title}</Text>
                          <Text style={styles.todoMeta}>
                            {t.due_date ? `Due ${t.due_date}` : 'No due date'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.subSectionHead}>
                  <Text style={styles.subSectionTitle}>TO DO LIST</Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => router.push('/event/personal-new')}
                  >
                    <Text style={styles.subSectionLink}>+ TO DO</Text>
                  </Pressable>
                </View>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.todoHint}>
                Private to-do events only you can see.
              </Text>
            }
            renderItem={({ item: p }) => (
              <View style={styles.todoRow}>
                <Pressable hitSlop={8} onPress={() => handlePersonalDone(p)}>
                  <Ionicons
                    name="ellipse-outline"
                    size={22}
                    color={c.primary}
                  />
                </Pressable>
                <View style={styles.todoMid}>
                  {p.title ? (
                    <Text style={styles.todoTitle}>{p.title}</Text>
                  ) : null}
                  <Text style={styles.todoMeta}>
                    {p.event_date}
                    {p.event_time ? ` • ${p.event_time}` : ''}
                  </Text>
                </View>
                <Pressable hitSlop={8} onPress={() => handlePersonalDelete(p)}>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={c.danger}
                  />
                </Pressable>
              </View>
            )}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  month: { fontFamily: fonts.heading, fontSize: 20, color: c.text },
  year: { fontSize: 13, color: c.subtext, fontWeight: '600' },
  searchBox: {
    flex: 1,
    backgroundColor: c.paper,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    height: 40,
    fontSize: 13,
    color: c.text,
    textAlign: 'center',
  },
  todayWrap: { alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -8 },
  todayLink: { fontSize: 13, fontWeight: '700', color: c.subtext },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: 8,
  },
  week: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', gap: 4, minWidth: 36 },
  dayCellNarrow: { minWidth: 30, gap: 2 },
  dayName: { fontSize: 11, color: c.subtext, fontWeight: '600' },
  dayNameNarrow: { fontSize: 10 },
  dayNum: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumNarrow: { width: 28, height: 28, borderRadius: 14 },
  dayNumToday: { borderWidth: 2, borderColor: c.primary },
  dayNumActive: { backgroundColor: c.ink },
  dayNumText: { fontSize: 14, fontWeight: '700', color: c.text },
  dayNumTextNarrow: { fontSize: 12 },
  dayNumTextActive: { color: c.paper },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.primary,
  },
  expandWrap: { alignItems: 'center', paddingVertical: 4 },
  monthCard: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    padding: 8,
  },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monthTitle: { fontSize: 15, fontWeight: '800', color: c.text },
  gridWeek: { flexDirection: 'row' },
  gridHeadText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: c.subtext,
    paddingVertical: 6,
  },
  gridCell: { flex: 1, alignItems: 'center', paddingVertical: 5, gap: 2 },
  gridNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridNumText: { fontSize: 13, fontWeight: '700', color: c.text },
  gridNumTextDim: { color: c.subtext, fontWeight: '400' },
  bannerWrap: { paddingHorizontal: 16, paddingTop: 8 },
  bannerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.border,
  },
  bannerDotActive: { backgroundColor: c.ink },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    marginTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tabDash: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.ink,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
  },
  tabLabelActive: { color: c.text },
  pager: { flex: 1 },
  pageList: { flex: 1 },
  taskSection: { marginTop: 4, marginBottom: 12 },
  subSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: c.text,
    letterSpacing: 1,
    marginBottom: 4,
  },
  subSectionLink: { fontSize: 12, fontWeight: '800', color: c.primary },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  todoMid: { flex: 1 },
  todoTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  todoMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  todoHint: { fontSize: 13, color: c.subtext },
  list: { padding: 16, gap: 4 },
  loader: { marginTop: 16 },
  row: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 16 },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: c.ink,
    backgroundColor: c.paper,
    marginTop: 10,
  },
  timelineDotHighlight: { backgroundColor: c.ink },
  line: { width: 2, flex: 1, backgroundColor: c.border },
  card: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: radius.m,
    padding: 10,
    marginBottom: 8,
  },
  cardHighlight: { backgroundColor: c.ink },
  cardTitle: { fontFamily: fonts.headingSemi, fontSize: 13, color: c.text },
  cardTitleHighlight: { color: c.paper },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardDate: { fontSize: 10, color: c.subtext, fontWeight: '600' },
  cardTime: { fontSize: 11, color: c.text, fontWeight: '700' },
  empty: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 22,
    paddingHorizontal: 32,
  },
});
}
