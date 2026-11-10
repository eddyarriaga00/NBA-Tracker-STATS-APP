import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NamePrompt, SetupNotice, useNickname } from '../components/Comments';
import { PersonRow, PillButton, UserAvatar } from '../components/People';
import { FriendsTabs } from '../components/Picks';
import { Card, PageTitle, SectionTitle } from '../components/ui';
import { addFriend, answerFriend, loadFriends, loadInbox, removeFriend, searchProfiles, socialEnabled, useMyProfile, watchSocial } from '../lib/social';
import { toast } from '../lib/toast';

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function useFriends() {
  const [data, setData] = useState(null);
  const [inbox, setInbox] = useState({});
  const [error, setError] = useState('');
  const load = useCallback(() => {
    Promise.all([loadFriends(), loadInbox()])
      .then(([f, i]) => { setData(f); setInbox(i); setError(''); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    let stop;
    let alive = true;
    watchSocial(load).then((s) => (alive ? (stop = s) : s())).catch(() => {});
    const vis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('social', load);
    return () => { alive = false; stop?.(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('social', load); };
  }, [load]);
  return { data, inbox, error, reload: load };
}

function FindPeople({ me, known }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [sent, setSent] = useState({});
  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (term.length < 2) { setResults(null); return; }
    let alive = true;
    const t = setTimeout(() => searchProfiles(term).then((r) => alive && setResults(r)).catch(() => alive && setResults([])), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const add = async (p) => {
    try {
      const st = await addFriend(p.user_id);
      setSent((s) => ({ ...s, [p.user_id]: st }));
      toast({ title: st === 'accepted' ? `You and ${p.display_name} are now friends` : `Request sent to ${p.display_name}` });
    } catch (e) {
      toast({ title: e.message });
    }
  };
  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find people by name or @username"
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full rounded-xl bg-card px-4 py-2.5 text-[16px] outline-none placeholder:text-label-3"
      />
      {results && (
        <Card className="mt-2 divide-y divide-sep overflow-hidden">
          {results.filter((p) => p.user_id !== me).length === 0 && (
            <div className="px-4 py-6 text-center text-[14px] text-label-2">Nobody found for “{q.trim()}”.</div>
          )}
          {results.filter((p) => p.user_id !== me).map((p) => {
            const state = sent[p.user_id] ?? known[p.user_id];
            return (
              <PersonRow
                key={p.user_id}
                p={p}
                right={
                  state === 'friends' || state === 'accepted' ? <span className="text-[13px] text-label-2">Friends</span>
                  : state === 'outgoing' || state === 'pending' ? <span className="text-[13px] text-label-2">Requested</span>
                  : <PillButton onClick={() => add(p)}>{state === 'incoming' ? 'Accept' : 'Add'}</PillButton>
                }
              />
            );
          })}
        </Card>
      )}
    </>
  );
}

export default function Friends() {
  const [name, setName] = useNickname();
  const profile = useMyProfile();
  const { data, inbox, error } = useFriends();
  if (!socialEnabled) return <Card><SetupNotice /></Card>;

  const act = (fn, done) => async () => {
    try { await fn(); if (done) toast({ title: done }); } catch (e) { toast({ title: e.message }); }
  };
  const known = {};
  for (const p of data?.friends ?? []) known[p.user_id] = 'friends';
  for (const p of data?.incoming ?? []) known[p.user_id] = 'incoming';
  for (const p of data?.outgoing ?? []) known[p.user_id] = 'outgoing';
  // People you've talked to most recently come first.
  const friends = [...(data?.friends ?? [])].sort((a, b) => (inbox[b.user_id]?.last.created_at ?? '').localeCompare(inbox[a.user_id]?.last.created_at ?? ''));

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        eyebrow="Friends"
        right={profile && (
          <Link to={`/u/${profile.user_id}`} aria-label="Your profile" className="active:opacity-60">
            <UserAvatar profile={profile} size={34} />
          </Link>
        )}
      >
        Friends
      </PageTitle>
      <FriendsTabs />
      {!name ? (
        <Card>
          <div className="px-4 pt-3 text-[13px] text-label-2">Pick a nickname to add friends and message them.</div>
          <NamePrompt onSave={setName} />
        </Card>
      ) : (
        <>
          <FindPeople me={data?.me} known={known} />
          {error && !data && <Card className="mt-3 px-4 py-8 text-center text-[14px] text-label-2">Couldn’t load your friends. {error}</Card>}

          {data?.incoming.length > 0 && (
            <>
              <SectionTitle>Friend requests</SectionTitle>
              <Card className="divide-y divide-sep overflow-hidden">
                {data.incoming.map((p) => (
                  <PersonRow
                    key={p.user_id}
                    p={p}
                    right={
                      <span className="flex gap-1.5">
                        <PillButton onClick={act(() => answerFriend(p.user_id, true), `You and ${p.display_name} are now friends`)}>Accept</PillButton>
                        <PillButton tone="soft" onClick={act(() => answerFriend(p.user_id, false))}>Decline</PillButton>
                      </span>
                    }
                  />
                ))}
              </Card>
            </>
          )}

          <SectionTitle>{friends.length ? `Your friends · ${friends.length}` : 'Your friends'}</SectionTitle>
          <Card className="divide-y divide-sep overflow-hidden">
            {!data && !error && <div className="skeleton h-[120px]" />}
            {data && friends.length === 0 && (
              <div className="px-5 py-9 text-center">
                <div className="text-[16px] font-semibold">No friends yet</div>
                <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-label-2">Search for someone above, or tap a name in the chat to see their profile and add them.</p>
              </div>
            )}
            {friends.map((p) => {
              const box = inbox[p.user_id];
              return (
                <PersonRow
                  key={p.user_id}
                  p={p}
                  to={`/dm/${p.user_id}`}
                  sub={box ? `${box.last.sender === data.me ? 'You: ' : ''}${box.last.body}` : 'Say hi'}
                  right={
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {box && <span className="text-[12px] text-label-3">{ago(box.last.created_at)}</span>}
                      {box?.unread > 0 && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11.5px] font-bold text-white">{box.unread}</span>}
                    </span>
                  }
                />
              );
            })}
          </Card>

          {data?.outgoing.length > 0 && (
            <>
              <SectionTitle>Requests you sent</SectionTitle>
              <Card className="divide-y divide-sep overflow-hidden">
                {data.outgoing.map((p) => (
                  <PersonRow key={p.user_id} p={p} right={<PillButton tone="soft" onClick={act(() => removeFriend(p.user_id))}>Cancel</PillButton>} />
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
