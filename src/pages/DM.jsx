import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Composer } from '../components/Comments';
import { UserAvatar } from '../components/People';
import { Card } from '../components/ui';
import { deleteMessage, friendStatus, getProfile, isUserId, loadMessages, markRead, sendMessage, watchSocial } from '../lib/social';
import { useData } from '../lib/useData';

const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function DM() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p } = useData(() => getProfile(id), ['profile', id]);
  const [me, setMe] = useState(null);
  const [messages, setMessages] = useState(null);
  const [friends, setFriends] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);
  const scroller = useRef(null);
  const count = useRef(0);

  const load = useCallback(() => {
    // A link that isn't a real person: say so, and don't ask the server about it.
    if (!isUserId(id)) { setError('We couldn’t find that person.'); return; }
    loadMessages(id)
      .then((r) => {
        setMe(r.me);
        setMessages(r.messages);
        setError('');
        if (r.messages.some((m) => m.recipient === r.me && !m.read_at) && document.visibilityState === 'visible') markRead(id).catch(() => {});
      })
      .catch(() => setError('Couldn’t load messages. Check your connection and try again.'));
    friendStatus(id).then((s) => setFriends(s === 'friends')).catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
    let stop;
    let alive = true;
    watchSocial(load).then((s) => (alive ? (stop = s) : s())).catch(() => {});
    const vis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; stop?.(); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && (messages?.length ?? 0) !== count.current) el.scrollTop = el.scrollHeight;
    count.current = messages?.length ?? 0;
  }, [messages]);

  const send = async (body) => {
    const temp = { id: `tmp-${Date.now()}`, sender: me, recipient: id, body, created_at: new Date().toISOString(), pending: true };
    setMessages((m) => [...(m ?? []), temp]);
    try {
      const row = await sendMessage(id, body);
      setMessages((m) => [...m.filter((x) => x.id !== temp.id && x.id !== row.id), row]);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      throw e;
    }
  };
  const remove = async (mid) => {
    setActive(null);
    setMessages((m) => m.filter((x) => x.id !== mid));
    deleteMessage(mid).catch(load);
  };

  const lastMine = [...(messages ?? [])].reverse().find((m) => m.sender === me && !m.pending);

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="flex h-[calc(100dvh-160px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[380px] flex-col overflow-hidden lg:h-[calc(100dvh-130px)]">
        <div className="flex items-center gap-2 border-b border-sep px-2 py-2">
          <button aria-label="Back" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/friends'))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent active:bg-fill">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <Link to={`/u/${id}`} className="flex min-w-0 flex-1 items-center gap-2.5 active:opacity-60">
            <UserAvatar profile={p} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold leading-tight">{p?.display_name ?? ' '}</span>
              {p && <span className="block truncate text-[12px] text-label-2">@{p.username}</span>}
            </span>
          </Link>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 pt-1">
          {!messages && !error && <div className="py-10 text-center text-[14px] text-label-2">Loading…</div>}
          {error && !messages && <div className="py-10 text-center text-[14px] text-label-2">{error}</div>}
          {messages?.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <UserAvatar profile={p} size={64} />
              <div className="text-[14px] text-label-2">This is the start of your chat with {p?.display_name ?? 'them'}.</div>
            </div>
          )}
          {messages?.map((m, i) => {
            const prev = messages[i - 1];
            const mine = m.sender === me;
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const gap = !prev || prev.sender !== m.sender || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60_000;
            return (
              <div key={m.id}>
                {newDay && <div className="mb-1 mt-3 text-center text-[11.5px] font-semibold text-label-3">{dayLabel(m.created_at)}</div>}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${gap ? 'mt-2.5' : 'mt-0.5'}`}>
                  <div className={`flex max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <button
                      onClick={() => setActive(active === m.id ? null : m.id)}
                      className={`whitespace-pre-wrap break-words rounded-[18px] px-3 py-1.5 text-left text-[15px] leading-snug [overflow-wrap:anywhere] ${
                        mine ? 'bg-accent text-white' : 'bg-fill text-label'
                      } ${m.pending ? 'opacity-60' : ''}`}
                    >
                      {m.body}
                    </button>
                    {active === m.id && !m.pending && (
                      <div className="mt-0.5 flex items-center gap-2 px-1 text-[11.5px] text-label-3">
                        {clock(m.created_at)}
                        {mine && <button onClick={() => window.confirm('Delete this message?') && remove(m.id)} className="font-semibold text-live">Delete</button>}
                      </div>
                    )}
                    {mine && lastMine?.id === m.id && active !== m.id && (
                      <div className="mt-0.5 px-1 text-[11px] text-label-3">{m.read_at ? 'Seen' : 'Sent'}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-sep">
          {friends ? (
            <Composer onSend={send} placeholder={`Message ${p?.display_name ?? ''}…`} />
          ) : (
            <div className="px-4 py-4 text-center text-[13.5px] text-label-2">
              You can message {p?.display_name ?? 'them'} once you’re friends.{' '}
              <Link to={`/u/${id}`} className="font-semibold text-accent">View profile</Link>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
