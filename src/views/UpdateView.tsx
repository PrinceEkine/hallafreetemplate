import { Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatEventDate } from '../data/store';
import type { Announcement } from '../types';

export function UpdateView() {
  const { state, setState, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);

  const isAdmin = state.userRole === 'admin';
  const needle = query.trim().toLowerCase();

  const items = state.announcements.filter((a) => {
    if (a.communityId !== state.selectedCommunityId) return false;
    if (a.adminsOnly && !isAdmin) return false;
    if (!needle) return true;
    return (
      a.title.toLowerCase().includes(needle) ||
      a.body.toLowerCase().includes(needle)
    );
  });

  function openCreate() {
    setTitle('');
    setBody('');
    setAdminsOnly(false);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(ann: Announcement) {
    setTitle(ann.title);
    setBody(ann.body);
    setAdminsOnly(Boolean(ann.adminsOnly));
    setEditing(ann);
    setCreating(true);
    setSelected(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    const nowTime = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const todayIso = new Date().toISOString().slice(0, 10);

    if (editing) {
      setState((prev) => ({
        ...prev,
        announcements: prev.announcements.map((a) =>
          a.id === editing.id
            ? {
                ...a,
                title: title.trim(),
                body: body.trim(),
                adminsOnly,
                edited: true,
              }
            : a,
        ),
      }));
      showToast('Announcement updated');
    } else {
      const created: Announcement = {
        id: `ann-${Date.now()}`,
        communityId: state.selectedCommunityId,
        title: title.trim(),
        body: body.trim(),
        date: formatEventDate(todayIso),
        time: nowTime,
        createdAt: new Date().toISOString(),
        adminsOnly,
      };
      setState((prev) => ({
        ...prev,
        announcements: [created, ...prev.announcements],
      }));
      showToast('Announcement posted');
    }
    setCreating(false);
    setEditing(null);
  }

  function deleteAnnouncement(id: string) {
    setState((prev) => ({
      ...prev,
      announcements: prev.announcements.filter((a) => a.id !== id),
    }));
    setSelected(null);
    showToast('Announcement removed');
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--paper)]">
          <Search className="w-4 h-4 text-[var(--subtext)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search announcements"
            className="w-full text-[13px] bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--subtext)]"
          />
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={openCreate}
            className="h-[38px] px-3.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>ANNOUNCE</span>
          </button>
        ) : null}
      </div>

      {creating ? (
        <form
          onSubmit={handleSave}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-xs font-bold uppercase text-[var(--ink)]">
              {editing ? 'EDIT ANNOUNCEMENT' : 'NEW ANNOUNCEMENT'}
            </span>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm font-semibold text-[var(--text)] outline-none"
          />
          <textarea
            required
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write announcement details…"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none resize-none"
          />
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text)] cursor-pointer">
            <input
              type="checkbox"
              checked={adminsOnly}
              onChange={(e) => setAdminsOnly(e.target.checked)}
              className="accent-black"
            />
            <Lock className="w-3.5 h-3.5" />
            <span>ADMINS ONLY</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--subtext)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
            >
              {editing ? 'SAVE' : 'PUBLISH'}
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? (
        <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-8 text-center text-sm text-[var(--subtext)]">
          No announcements in this workspace.
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((ann) => (
            <button
              key={ann.id}
              type="button"
              onClick={() => setSelected(ann)}
              className="w-full text-left bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--ink)]/40 transition-colors cursor-pointer space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-extrabold text-[var(--ink)] leading-snug">
                  {ann.title}
                </h3>
                {ann.adminsOnly ? (
                  <span className="px-2 py-0.5 rounded bg-[var(--ink)] text-[var(--paper)] text-[10px] font-extrabold flex items-center gap-1 shrink-0">
                    <Lock className="w-2.5 h-2.5" />
                    ADMINS ONLY
                  </span>
                ) : null}
              </div>
              <p className="text-[13px] text-[var(--text)] line-clamp-2 leading-relaxed">
                {ann.body}
              </p>
              <div className="text-[11px] font-semibold text-[var(--subtext)] flex items-center gap-2 pt-0.5">
                <span>{ann.date}</span>
                <span>•</span>
                <span>{ann.time}</span>
                {ann.edited ? <span>• Edited</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Announcement Detail Modal */}
      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-[460px] bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                {selected.adminsOnly ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--ink)] text-[var(--paper)] text-[10px] font-extrabold mb-1.5">
                    <Lock className="w-2.5 h-2.5" />
                    ADMINS ONLY
                  </span>
                ) : null}
                <h2 className="text-lg font-extrabold text-[var(--ink)]">
                  {selected.title}
                </h2>
                <div className="text-xs font-semibold text-[var(--subtext)] mt-0.5">
                  {selected.date} • {selected.time}
                  {selected.edited ? ' • Edited' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-line">
              {selected.body}
            </p>
            {isAdmin ? (
              <div className="pt-2 border-t border-[var(--border)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteAnnouncement(selected.id)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--danger)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
