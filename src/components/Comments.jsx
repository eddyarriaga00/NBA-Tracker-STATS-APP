import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { commentsEnabled, currentUserId, ensureUser, getClient } from '../lib/supabase';
import { Icon } from './icons';

export const EMOJIS = ['🔥', '😂', '💀', '👍', '👎', '🐐'];
const PAGE = 150;

// ---------- nickname ----------

const readName = () => {
  try { return localStorage.getItem('nickname') || ''; } catch { return ''; }
};

export function useNickname() {
  const [name, setName] = useState(readName);
  useEffect(() => {
    const on = () => setName(readName());
    window.addEventListener('nickname', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('nickname', on); window.removeEventListener('storage', on); };
  }, []);
  const save = (n) => {
    try { localStorage.setItem('nickname', n); } catch { /* ignore */ }
    window.dispatchEvent(new Event('nickname'));
  };
  return [name, save];
}

// ---------- helpers ----------

const PALETTE = ['#ff6a13', '#007aff', '#34c759', '#af52de', '#ff2d55', '#5ac8fa', '#ff9f0a', '#30b0c7', '#5856d6', '#a2845e'];
function colorFor(name = '') {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ name, size = 28 }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.42 }}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

// ---------- comment counts for game cards ----------

export function useCommentCounts(rooms) {
  const key = rooms.join(',');
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!commentsEnabled || !rooms.length) return;
    let alive = true;
    getClient()
      .then((supabase) => supabase
      .from('comments')
      .select('room')
      .in('room', rooms)
      .limit(5000)
      .then(({ data }) => {
        if (!alive || !data) return;
        const c = {};
        for (const r of data) c[r.room] = (c[r.room] ?? 0) + 1;
        setCounts(c);
      }))
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return counts;
}

// ---------- the thread ----------

function useThread(room) {
  const [comments, setComments] = useState([]);
  const [reactions, setReactions] = useState([]); // rows {comment_id,user_id,emoji}
  const [status, setStatus] = useState('loading'); // loading | live | offline | error
  const [me, setMe] = useState(null);
  const [supabase, setClient] = useState(null);
  useEffect(() => {
    let alive = true;
    let sub;
    getClient()
      .then((c) => {
        if (!alive || !c) return;
        setClient(c);
        // Stay in sync when you sign in from another tab or the session refreshes,
        // so your own messages always show as yours.
        sub = c.auth.onAuthStateChange((_event, session) => setMe(session?.user?.id ?? null)).data.subscription;
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [c, r] = await Promise.all([
      supabase.from('comments').select('*').eq('room', room).order('created_at', { ascending: false }).limit(PAGE),
      supabase.from('comment_reactions').select('comment_id,user_id,emoji').eq('room', room).limit(5000),
    ]);
    if (c.error) throw c.error;
    setComments((c.data ?? []).reverse());
    setReactions(r.data ?? []);
  }, [room, supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    currentUserId().then((id) => alive && setMe(id));
    setComments([]);
    setReactions([]);
    setStatus('loading');
    load().catch(() => alive && setStatus('error'));

    const channel = supabase
      .channel(`room:${room}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `room=eq.${room}` }, ({ new: row }) =>
        setComments((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev.filter((x) => !(x.pending && x.body === row.body && x.user_id === row.user_id)), row]))
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, ({ old }) =>
        setComments((prev) => prev.filter((x) => x.id !== old.id))
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comment_reactions', filter: `room=eq.${room}` }, ({ new: row }) =>
        setReactions((prev) =>
          prev.some((x) => x.comment_id === row.comment_id && x.user_id === row.user_id && x.emoji === row.emoji) ? prev : [...prev, row]
        )
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comment_reactions' }, ({ old }) =>
        setReactions((prev) => prev.filter((x) => !(x.comment_id === old.comment_id && x.user_id === old.user_id && x.emoji === old.emoji)))
      )
      .subscribe((s) => {
        if (!alive) return;
        if (s === 'SUBSCRIBED') {
          setStatus('live');
          load().catch(() => {}); // catch up on anything missed while reconnecting
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
      });

    const onVisible = () => document.visibilityState === 'visible' && load().catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      supabase.removeChannel(channel);
    };
  }, [room, load, supabase]);

  const post = async (author, body) => {
    const user = await ensureUser();
    setMe(user.id);
    const temp = { id: `tmp-${Date.now()}`, room, user_id: user.id, author, body, created_at: new Date().toISOString(), pending: true };
    setComments((prev) => [...prev, temp]);
    const { data, error } = await supabase.from('comments').insert({ room, author, body }).select().single();
    if (error) {
      setComments((prev) => prev.filter((x) => x.id !== temp.id));
      throw new Error(error.message.includes('Slow down') ? 'Slow down! Try again in a few seconds.' : error.message);
    }
    setComments((prev) => {
      const without = prev.filter((x) => x.id !== temp.id);
      return without.some((x) => x.id === data.id) ? without : [...without, data];
    });
  };

  const remove = async (id) => {
    const before = comments;
    setComments((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) setComments(before);
  };

  const toggleReaction = async (commentId, emoji) => {
    const user = await ensureUser();
    setMe(user.id);
    const mine = reactions.some((r) => r.comment_id === commentId && r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => prev.filter((r) => !(r.comment_id === commentId && r.user_id === user.id && r.emoji === emoji)));
      await supabase.from('comment_reactions').delete().match({ comment_id: commentId, user_id: user.id, emoji });
    } else {
      setReactions((prev) => [...prev, { comment_id: commentId, user_id: user.id, emoji }]);
      const { error } = await supabase.from('comment_reactions').insert({ comment_id: commentId, emoji, room });
      if (error && !error.message.includes('duplicate')) {
        setReactions((prev) => prev.filter((r) => !(r.comment_id === commentId && r.user_id === user.id && r.emoji === emoji)));
      }
    }
  };

  return { comments, reactions, status, me, post, remove, toggleReaction };
}

function NamePrompt({ onSave, initial = '', onCancel }) {
  const [v, setV] = useState(initial);
  const ok = v.trim().length >= 1 && v.trim().length <= 24;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (ok) onSave(v.trim()); }}
      className="flex items-center gap-2 p-3"
    >
      <input
        autoFocus
        value={v}
        maxLength={24}
        onChange={(e) => setV(e.target.value)}
        placeholder="Pick a nickname to join in"
        className="min-w-0 flex-1 rounded-full bg-fill px-4 py-2 text-[16px] outline-none placeholder:text-label-3"
      />
      {onCancel && (
        <button type="button" onClick={onCancel} className="px-2 text-[15px] text-label-2">Cancel</button>
      )}
      <button disabled={!ok} className="rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-40">
        Save
      </button>
    </form>
  );
}

function Composer({ onSend, name, onRename }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr('');
    setText('');
    try {
      await onSend(body);
    } catch (e) {
      setText(body);
      setErr(e.message || 'Could not send. Try again.');
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  return (
    <div className="p-3">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] text-label-2">
        Posting as
        <button onClick={onRename} className="font-semibold text-accent">{name}</button>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          placeholder="Say something…"
          className="min-w-0 flex-1 resize-none rounded-[20px] border border-sep bg-card px-4 py-2 text-[16px] leading-snug outline-none placeholder:text-label-3 focus:border-accent"
        />
        <button
          aria-label="Send"
          onClick={send}
          disabled={!text.trim() || sending}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition active:scale-90 disabled:opacity-30"
        >
          <Icon.Send className="h-5 w-5" />
        </button>
      </div>
      {err && <div className="mt-1.5 px-1 text-[13px] text-live">{err}</div>}
      {text.length > 800 && <div className="mt-1 px-1 text-right text-[11px] text-label-2">{1000 - text.length} left</div>}
    </div>
  );
}

function Message({ c, mine, showHead, reactions, me, active, setActive, onReact, onDelete }) {
  const grouped = useMemo(() => {
    const m = {};
    for (const r of reactions) {
      m[r.emoji] ??= { count: 0, mine: false };
      m[r.emoji].count++;
      if (r.user_id === me) m[r.emoji].mine = true;
    }
    return EMOJIS.filter((e) => m[e]).map((e) => ({ emoji: e, ...m[e] }));
  }, [reactions, me]);

  return (
    <div className={`group flex gap-2 ${mine ? 'flex-row-reverse' : ''} ${showHead ? 'mt-3' : 'mt-0.5'}`}>
      <div className="w-7 shrink-0">{!mine && showHead && <Avatar name={c.author} />}</div>
      <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showHead && (
          <div className={`mb-0.5 flex items-baseline gap-1.5 px-1 text-[12px] ${mine ? 'flex-row-reverse' : ''}`}>
            <span className="font-semibold" style={{ color: mine ? undefined : colorFor(c.author) }}>{mine ? 'You' : c.author}</span>
            <span className="text-label-3">{ago(c.created_at)}</span>
          </div>
        )}
        <div className={`relative flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={() => setActive(active ? null : c.id)}
            className={`whitespace-pre-wrap break-words rounded-[18px] px-3 py-1.5 text-left text-[14.5px] leading-snug md:px-3.5 md:py-2 md:text-[15px] [overflow-wrap:anywhere] ${
              mine ? 'bg-accent text-white' : 'bg-fill text-label'
            } ${c.pending ? 'opacity-60' : ''}`}
          >
            {c.body}
          </button>
          {!c.pending && (
            <button
              aria-label="React"
              onClick={() => setActive(active ? null : c.id)}
              className="hidden h-7 w-7 shrink-0 place-items-center rounded-full text-[14px] text-label-3 opacity-0 transition hover:bg-fill group-hover:opacity-100 md:grid"
            >
              ☺
            </button>
          )}
        </div>
        {active && !c.pending && (
          <div className="rise mt-1 flex items-center gap-0.5 rounded-full border border-sep bg-card p-1 shadow-lg">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => { onReact(c.id, e); setActive(null); }}
                className="grid h-8 w-8 place-items-center rounded-full text-[18px] transition hover:scale-125 hover:bg-fill"
              >
                {e}
              </button>
            ))}
            {mine && (
              <button
                onClick={() => { if (window.confirm('Delete this comment?')) onDelete(c.id); setActive(null); }}
                className="ml-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-live hover:bg-live/10"
              >
                Delete
              </button>
            )}
          </div>
        )}
        {grouped.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
            {grouped.map((g) => (
              <button
                key={g.emoji}
                onClick={() => onReact(c.id, g.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition active:scale-95 ${
                  g.mine ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-sep bg-card text-label-2'
                }`}
              >
                <span className="text-[13px]">{g.emoji}</span>
                {g.count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className="px-5 py-8 text-center">
      <div className="text-[16px] font-semibold">Comments aren't connected yet</div>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-label-2">
        Add your Supabase keys to <code className="rounded bg-fill px-1">.env.local</code> and run{' '}
        <code className="rounded bg-fill px-1">supabase/schema.sql</code>. The README has the 2-minute setup.
      </p>
    </div>
  );
}

export default function Comments({ room, variant = 'card', emptyText = 'No comments yet. Start the conversation.' }) {
  if (!commentsEnabled) return <SetupNotice />;
  return <Thread room={room} variant={variant} emptyText={emptyText} />;
}

function Thread({ room, variant, emptyText }) {
  const { comments, reactions, status, me, post, remove, toggleReaction } = useThread(room);
  const [name, setName] = useNickname();
  const [renaming, setRenaming] = useState(false);
  const [active, setActive] = useState(null);
  const scroller = useRef(null);
  const nearBottom = useRef(true);
  const lastCount = useRef(0);

  const byComment = useMemo(() => {
    const m = {};
    for (const r of reactions) (m[r.comment_id] ??= []).push(r);
    return m;
  }, [reactions]);

  // Stick to the bottom when new messages arrive, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const added = comments.length > lastCount.current;
    const mineJustSent = added && comments[comments.length - 1]?.user_id === me;
    if (lastCount.current === 0 || (added && (nearBottom.current || mineJustSent))) el.scrollTop = el.scrollHeight;
    lastCount.current = comments.length;
  }, [comments, me]);

  const onScroll = () => {
    const el = scroller.current;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const height = variant === 'chat' ? 'flex-1 min-h-0' : 'max-h-[460px] min-h-[140px]';

  return (
    <div className={`flex flex-col ${variant === 'chat' ? 'h-full' : ''}`}>
      <div ref={scroller} onScroll={onScroll} className={`overflow-y-auto overscroll-contain px-3 pb-2 pt-1 ${height}`}>
        {status === 'loading' && comments.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-label-2">Loading comments…</div>
        ) : status === 'error' && comments.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-label-2">Couldn't load comments. Check the Supabase setup.</div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-label-2">{emptyText}</div>
        ) : (
          comments.map((c, i) => {
            const prev = comments[i - 1];
            const showHead = !prev || prev.user_id !== c.user_id || new Date(c.created_at) - new Date(prev.created_at) > 5 * 60_000;
            return (
              <Message
                key={c.id}
                c={c}
                mine={c.user_id === me}
                showHead={showHead}
                reactions={byComment[c.id] ?? []}
                me={me}
                active={active === c.id}
                setActive={setActive}
                onReact={toggleReaction}
                onDelete={remove}
              />
            );
          })
        )}
      </div>
      {status === 'offline' && (
        <div className="px-4 py-1 text-center text-[12px] text-label-2">Reconnecting…</div>
      )}
      <div className="border-t border-sep">
        {!name || renaming ? (
          <NamePrompt
            initial={name}
            onSave={(n) => { setName(n); setRenaming(false); }}
            onCancel={name ? () => setRenaming(false) : undefined}
          />
        ) : (
          <Composer name={name} onRename={() => setRenaming(true)} onSend={(body) => post(name, body)} />
        )}
      </div>
    </div>
  );
}
