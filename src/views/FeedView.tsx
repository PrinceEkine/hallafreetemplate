import {
  Bookmark,
  Heart,
  MessageSquare,
  Plus,
  Search,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Post } from '../types';

type FeedFilter = 'all' | 'saved' | 'liked' | 'tagged';

export function FeedView() {
  const { state, setState, showToast } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [sharePost, setSharePost] = useState<Post | null>(null);

  const needle = query.trim().toLowerCase();
  const communityPosts = state.posts.filter(
    (p) => p.communityId === state.selectedCommunityId,
  );
  const visiblePosts = communityPosts.filter((p) => {
    if (filter === 'saved' && !p.savedByMe) return false;
    if (filter === 'liked' && !p.likedByMe) return false;
    if (filter === 'tagged' && !p.taggedMe) return false;
    if (!needle) return true;
    return (
      (p.title ?? '').toLowerCase().includes(needle) ||
      p.text.toLowerCase().includes(needle) ||
      p.author.toLowerCase().includes(needle)
    );
  });

  function toggleLike(postId: string) {
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => {
        if (p.id !== postId) return p;
        const nextLiked = !p.likedByMe;
        return {
          ...p,
          likedByMe: nextLiked,
          likes: Math.max(0, p.likes + (nextLiked ? 1 : -1)),
        };
      }),
    }));
  }

  function toggleSave(postId: string) {
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) =>
        p.id === postId ? { ...p, savedByMe: !p.savedByMe } : p,
      ),
    }));
  }

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    const text = newText.trim();
    const title = newTitle.trim();
    if (!text && !title) return;
    const activeComm =
      state.communities.find((c) => c.id === state.selectedCommunityId)?.name ??
      'Workspace';
    const created: Post = {
      id: `post-${Date.now()}`,
      communityId: state.selectedCommunityId,
      title: title || undefined,
      author: state.userName.toUpperCase(),
      handle: `${activeComm} • Just now`,
      time: 'Just now',
      createdAt: new Date().toISOString(),
      text,
      likes: 0,
      reposts: 0,
      commentsCount: 0,
      shares: 0,
      color: '#1C1C1E',
      isMine: true,
      commentsList: [],
    };
    setState((prev) => ({ ...prev, posts: [created, ...prev.posts] }));
    setNewTitle('');
    setNewText('');
    setComposerOpen(false);
    showToast('Post published');
  }

  function submitComment(e: React.FormEvent, postId: string) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              commentsCount: p.commentsCount + 1,
              commentsList: [
                ...p.commentsList,
                {
                  id: `c-${Date.now()}`,
                  author: prev.userName,
                  text: body,
                  time: 'Just now',
                },
              ],
            }
          : p,
      ),
    }));
    setCommentText('');
  }

  function sendPostToThread(threadId: string) {
    if (!sharePost) return;
    const nowLabel = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const text = `Shared post from ${sharePost.author}: ${
      sharePost.title ? `${sharePost.title} — ` : ''
    }${sharePost.text}`;
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) =>
        p.id === sharePost.id ? { ...p, shares: p.shares + 1 } : p,
      ),
      threads: prev.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              preview: text,
              time: nowLabel,
              messages: [
                ...t.messages,
                {
                  id: `m-${Date.now()}`,
                  senderId: 'me',
                  senderName: prev.userName,
                  text,
                  time: nowLabel,
                },
              ],
            }
          : t,
      ),
    }));
    setSharePost(null);
    showToast('Shared to chat');
  }

  return (
    <div className="p-4 space-y-3">
      {/* Search + Composer Row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--paper)]">
          <Search className="w-4 h-4 text-[var(--subtext)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts"
            className="w-full text-[13px] bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--subtext)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen((v) => !v)}
          className="h-[38px] px-3.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>POST</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'saved', label: 'Saved' },
            { id: 'liked', label: 'Liked' },
            { id: 'tagged', label: 'Tag' },
          ] as { id: FeedFilter; label: string }[]
        ).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer shrink-0 ${
                active
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'bg-[var(--paper)] border border-[var(--border)] text-[var(--subtext)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* New Post Composer */}
      {composerOpen ? (
        <form
          onSubmit={submitPost}
          className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-2.5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-xs font-bold tracking-wider uppercase text-[var(--ink)]">
              NEW STAFF POST
            </span>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm font-semibold text-[var(--text)] outline-none"
          />
          <textarea
            required={!newTitle.trim()}
            rows={3}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Share an update, win, or milestone with your community…"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold cursor-pointer"
            >
              PUBLISH
            </button>
          </div>
        </form>
      ) : null}

      {/* Posts List */}
      {visiblePosts.length === 0 ? (
        <div className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-8 text-center text-sm text-[var(--subtext)]">
          No posts match this filter yet.
        </div>
      ) : (
        visiblePosts.map((post) => {
          const commentsExpanded = activeCommentPostId === post.id;
          return (
            <article
              key={post.id}
              className="bg-[var(--paper)] border border-[var(--border)] rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full text-white font-extrabold flex items-center justify-center shrink-0 text-sm"
                    style={{ backgroundColor: post.color ?? '#000000' }}
                  >
                    {post.author.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-extrabold text-[var(--ink)] truncate">
                      {post.author}
                    </div>
                    <div className="text-[11px] text-[var(--subtext)] truncate">
                      {post.handle}
                    </div>
                  </div>
                </div>
                {post.taggedMe ? (
                  <span className="px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[10px] font-extrabold text-[var(--ink)]">
                    TAGGED
                  </span>
                ) : null}
              </div>

              {post.title ? (
                <h2 className="text-[15px] font-extrabold text-[var(--ink)] leading-snug">
                  {post.title}
                </h2>
              ) : null}
              <p className="text-[14px] text-[var(--text)] leading-relaxed whitespace-pre-line">
                {post.text}
              </p>

              <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-[var(--subtext)]">
                <button
                  type="button"
                  onClick={() => toggleLike(post.id)}
                  className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                    post.likedByMe ? 'text-[#E5484D]' : 'hover:text-[var(--ink)]'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${post.likedByMe ? 'fill-[#E5484D]' : ''}`}
                  />
                  <span>{post.likes}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveCommentPostId(commentsExpanded ? null : post.id)
                  }
                  className="flex items-center gap-1.5 text-xs font-bold hover:text-[var(--ink)] cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>{post.commentsCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSharePost(post)}
                  className="flex items-center gap-1.5 text-xs font-bold hover:text-[var(--ink)] cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{post.shares}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleSave(post.id)}
                  className={`flex items-center gap-1 text-xs font-bold cursor-pointer ${
                    post.savedByMe ? 'text-[var(--ink)]' : 'hover:text-[var(--ink)]'
                  }`}
                  aria-label="Save post"
                >
                  <Bookmark
                    className={`w-4 h-4 ${post.savedByMe ? 'fill-current' : ''}`}
                  />
                </button>
              </div>

              {commentsExpanded ? (
                <div className="pt-2 space-y-2 border-t border-[var(--border)]">
                  {post.commentsList.map((c) => (
                    <div
                      key={c.id}
                      className="bg-[var(--bg)] rounded-xl px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-[var(--ink)]">
                        <span>{c.author}</span>
                        <span className="text-[10px] text-[var(--subtext)]">{c.time}</span>
                      </div>
                      <p className="mt-0.5 text-[var(--text)]">{c.text}</p>
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => submitComment(e, post.id)}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment…"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)] outline-none"
                    />
                    <button
                      type="submit"
                      className="p-2 rounded-lg bg-[var(--ink)] text-[var(--paper)] cursor-pointer"
                      aria-label="Send comment"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })
      )}

      {/* Share to Chat Sheet */}
      {sharePost ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-[420px] bg-[var(--paper)] rounded-2xl border border-[var(--border)] p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-heading text-sm font-bold uppercase text-[var(--ink)]">
                Send Post To Chat
              </span>
              <button
                type="button"
                onClick={() => setSharePost(null)}
                className="p-1 text-[var(--subtext)] hover:text-[var(--ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[260px] overflow-y-auto divide-y divide-[var(--border)]">
              {state.threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => sendPostToThread(t.id)}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:bg-[var(--bg)] px-2 rounded-lg cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-bold text-[var(--ink)]">{t.name}</div>
                    <div className="text-[11px] text-[var(--subtext)]">
                      {t.isGroup ? 'Team channel' : 'Direct message'}
                    </div>
                  </div>
                  <Send className="w-4 h-4 text-[var(--ink)]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
