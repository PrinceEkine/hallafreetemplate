import {
  Calendar,
  CheckCircle2,
  Circle,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatEventDate } from '../data/store';
import type { EventItem } from '../types';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function EventsView() {
  const { state, setState, showToast } = useApp();
  const [subTab, setSubTab] = useState<'events' | 'todo'>('events');
  const [expandedCal, setExpandedCal] = useState(false);
  const [selectedIso, setSelectedIso] = useState<string>(toIso(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const [newEventOpen, setNewEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(toIso(new Date()));
  const [evTime, setEvTime] = useState('10:00 AM');
  const [evLoc, setEvLoc] = useState('');

  const [todoTitle, setTodoTitle] = useState('');
  const [todoTime, setTodoTime] = useState('');

  const commEvents = state.events
    .filter((e) => e.communityId === state.selectedCommunityId)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  const eventDates = new Set(commEvents.map((e) => e.isoDate));
  const todoDates = new Set(state.personalTodos.map((t) => t.eventDate));

  const anchorDate = new Date(`${selectedIso}T00:00:00`);
  const monthLabel = anchorDate
    .toLocaleString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  // Build week strip around selected date
  const weekStart = new Date(anchorDate);
  weekStart.setDate(anchorDate.getDate() - anchorDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Build 42-day grid for expanded month view
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1 - firstOfMonth.getDay());
  const monthGrid = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const upcomingBanner =
    commEvents.find((e) => e.highlight) ?? commEvents[0] ?? null;

  function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitle.trim()) return;
    const item: EventItem = {
      id: `ev-${Date.now()}`,
      communityId: state.selectedCommunityId,
      title: evTitle.trim().toUpperCase(),
      date: formatEventDate(evDate),
      time: evTime.trim() || '9:00 AM',
      isoDate: evDate,
      highlight: false,
      location: evLoc.trim() || undefined,
    };
    setState((prev) => ({ ...prev, events: [...prev.events, item] }));
    setEvTitle('');
    setEvLoc('');
    setNewEventOpen(false);
    showToast('Event added');
  }

  function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!todoTitle.trim()) return;
    setState((prev) => ({
      ...prev,
      personalTodos: [
        ...prev.personalTodos,
        {
          id: `todo-${Date.now()}`,
          title: todoTitle.trim(),
          eventDate: selectedIso,
          eventTime: todoTime.trim() || undefined,
          done: false,
        },
      ],
    }));
    setTodoTitle('');
    setTodoTime('');
  }

  return (
    <div className="p-4 space-y-4">
      {/* Month Header & Today */}
      <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setExpandedCal((v) => !v)}
            className="font-heading text-base font-bold tracking-wide text-[var(--ink)] flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>{monthLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedIso(toIso(new Date()))}
            className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-extrabold text-[var(--ink)] cursor-pointer"
          >
            Go To Today
          </button>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((wd) => (
            <span
              key={wd}
              className="text-[10px] font-extrabold text-[var(--subtext)]"
            >
              {wd}
            </span>
          ))}
        </div>

        {/* Week strip or 6-week month grid */}
        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {(expandedCal ? monthGrid : weekDays).map((d) => {
            const iso = toIso(d);
            const isSelected = iso === selectedIso;
            const hasDot = eventDates.has(iso) || todoDates.has(iso);
            const outMonth =
              expandedCal && d.getMonth() !== anchorDate.getMonth();
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedIso(iso)}
                className={`mx-auto w-9 h-9 rounded-full flex flex-col items-center justify-center text-xs font-bold cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : outMonth
                      ? 'text-[var(--subtext)]/45 hover:bg-[var(--bg)]'
                      : 'text-[var(--text)] hover:bg-[var(--bg)]'
                }`}
              >
                <span>{d.getDate()}</span>
                {hasDot ? (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-[#3EE6C4]' : 'bg-[var(--ink)]'
                    }`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming Event Banner */}
      {upcomingBanner ? (
        <div className="rounded-2xl bg-[#000000] text-white p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold tracking-widest text-[#3EE6C4]">
              UPCOMING EVENT
            </div>
            <div className="font-heading text-[16px] font-bold truncate mt-0.5">
              {upcomingBanner.title}
            </div>
            <div className="text-xs text-white/70 mt-0.5">
              {upcomingBanner.date} • {upcomingBanner.time}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedEvent(upcomingBanner)}
            className="px-3 py-1.5 rounded-lg bg-[#3EE6C4] text-black text-xs font-extrabold shrink-0 cursor-pointer"
          >
            DETAILS
          </button>
        </div>
      ) : null}

      {/* Sub Tabs */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('events')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
              subTab === 'events'
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'bg-[var(--paper)] border border-[var(--border)] text-[var(--subtext)]'
            }`}
          >
            EVENTS
          </button>
          <button
            type="button"
            onClick={() => setSubTab('todo')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
              subTab === 'todo'
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : 'bg-[var(--paper)] border border-[var(--border)] text-[var(--subtext)]'
            }`}
          >
            TO DO LIST
          </button>
        </div>

        {subTab === 'events' && state.userRole === 'admin' ? (
          <button
            type="button"
            onClick={() => setNewEventOpen((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>EVENT</span>
          </button>
        ) : null}
      </div>

      {subTab === 'events' ? (
        <div className="space-y-3">
          {newEventOpen ? (
            <form
              onSubmit={createEvent}
              className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-2.5"
            >
              <input
                required
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                placeholder="Event title"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={evDate}
                  onChange={(e) => setEvDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
                />
                <input
                  value={evTime}
                  onChange={(e) => setEvTime(e.target.value)}
                  placeholder="10:00 AM"
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
                />
              </div>
              <input
                value={evLoc}
                onChange={(e) => setEvLoc(e.target.value)}
                placeholder="Location (optional)"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewEventOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--subtext)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          ) : null}

          <div className="space-y-2.5">
            {commEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setSelectedEvent(ev)}
                className="w-full text-left bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 flex items-start gap-3 hover:border-[var(--ink)]/40 cursor-pointer"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--ink)] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-[15px] font-bold text-[var(--ink)]">
                    {ev.title}
                  </div>
                  <div className="text-xs font-semibold text-[var(--subtext)] mt-0.5">
                    {ev.date} • {ev.time}
                  </div>
                  {ev.location ? (
                    <div className="text-xs text-[var(--subtext)] mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{ev.location}</span>
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <form
            onSubmit={addTodo}
            className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3 flex items-center gap-2"
          >
            <input
              required
              value={todoTitle}
              onChange={(e) => setTodoTitle(e.target.value)}
              placeholder={`Add personal to-do for ${formatEventDate(selectedIso)}`}
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)] outline-none"
            />
            <input
              value={todoTime}
              onChange={(e) => setTodoTime(e.target.value)}
              placeholder="Time"
              className="w-20 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)] outline-none"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
            >
              Add
            </button>
          </form>

          <div className="space-y-2">
            {state.personalTodos.map((t) => (
              <div
                key={t.id}
                className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      personalTodos: prev.personalTodos.map((item) =>
                        item.id === t.id ? { ...item, done: !item.done } : item,
                      ),
                    }))
                  }
                  className="flex items-center gap-3 text-left flex-1 cursor-pointer"
                >
                  {t.done ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-[var(--subtext)] shrink-0" />
                  )}
                  <div>
                    <div
                      className={`text-sm font-bold ${
                        t.done
                          ? 'line-through text-[var(--subtext)]'
                          : 'text-[var(--ink)]'
                      }`}
                    >
                      {t.title}
                    </div>
                    <div className="text-[11px] text-[var(--subtext)]">
                      {formatEventDate(t.eventDate)}
                      {t.eventTime ? ` • ${t.eventTime}` : ''}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      personalTodos: prev.personalTodos.filter(
                        (item) => item.id !== t.id,
                      ),
                    }))
                  }
                  className="p-1.5 text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-lg font-bold text-[var(--ink)]">
                  {selectedEvent.title}
                </h3>
                <div className="text-xs font-semibold text-[var(--subtext)] mt-0.5">
                  {selectedEvent.date} • {selectedEvent.time}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {selectedEvent.location ? (
              <div className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>{selectedEvent.location}</span>
              </div>
            ) : null}
            <p className="text-sm text-[var(--text)] leading-relaxed">
              {selectedEvent.description ?? 'Scheduled community event.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
