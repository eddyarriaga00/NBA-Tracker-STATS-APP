import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTeams } from '../api/espn';
import { useNickname } from '../components/Comments';
import { PillButton, UserAvatar } from '../components/People';
import { BackButton, Card, Empty, SectionTitle, TeamLogo } from '../components/ui';
import { getProfileStats } from '../lib/account';
import { addFriend, answerFriend, friendStatus, getProfile, removeFriend, saveProfile, uploadAvatar, isUserId } from '../lib/social';
import { currentUserId } from '../lib/supabase';
import { toast } from '../lib/toast';
import { useData } from '../lib/useData';

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <div className="num font-display text-[20px] font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-label-2">{label}</div>
    </div>
  );
}

function Teams({ keys }) {
  const { data } = useData(() => Promise.all(['nba', 'nfl'].map((lg) => getTeams(lg).catch(() => []))), ['teams-both']);
  const lookup = {};
  ['nba', 'nfl'].forEach((lg, i) =>
    (data?.[i] ?? []).forEach((c) => c.divisions.forEach((d) => d.teams.forEach((t) => (lookup[`${lg}:${t.id}`] = t))))
  );
  return (
    <Card className="flex flex-wrap gap-2 p-3">
      {keys.map((k) => {
        const [lg, id] = k.split(':');
        const t = lookup[k];
        return (
          <Link key={k} to={`/${lg}/team/${id}`} className="flex items-center gap-1.5 rounded-full bg-fill py-1 pl-1.5 pr-3 text-[13px] font-semibold active:opacity-60">
            <TeamLogo abbr={t?.abbr} size={22} league={lg} />
            {t?.abbr ?? '…'}
          </Link>
        );
      })}
    </Card>
  );
}

const field = 'w-full rounded-xl bg-fill px-3.5 py-2.5 text-[16px] outline-none placeholder:text-label-3';

function EditProfile({ p, onDone }) {
  const [, setNick] = useNickname();
  const [display, setDisplay] = useState(p.display_name);
  const [username, setUsername] = useState(p.username);
  const [bio, setBio] = useState(p.bio);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef(null);
  const [photo, setPhoto] = useState(p);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setErr('');
    try { setPhoto(await uploadAvatar(f)); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const saved = await saveProfile({ display: display.trim(), username: username.trim().replace(/^@/, ''), bio: bio.trim() });
      setNick(saved.display_name); // chat and picks use the same name
      onDone(saved);
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3.5">
        <UserAvatar profile={photo} size={64} />
        <div className="flex flex-wrap gap-2">
          <PillButton tone="soft" disabled={busy} onClick={() => file.current?.click()}>{photo.avatar_url ? 'Change photo' : 'Add photo'}</PillButton>
          {photo.avatar_url && (
            <PillButton tone="soft" disabled={busy} onClick={async () => { setBusy(true); try { setPhoto(await saveProfile({ avatar: '' })); } catch (x) { setErr(x.message); } setBusy(false); }}>
              Remove
            </PillButton>
          )}
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      </div>
      <form onSubmit={save} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block px-1 text-[12.5px] font-semibold text-label-2">Name</span>
          <input value={display} maxLength={24} onChange={(e) => setDisplay(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-[12.5px] font-semibold text-label-2">Username</span>
          <input value={username} maxLength={20} autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(e.target.value.toLowerCase())} className={field} />
          <span className="mt-1 block px-1 text-[12px] text-label-3">Friends can find you with this. Letters, numbers and underscores.</span>
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-[12.5px] font-semibold text-label-2">Bio</span>
          <textarea value={bio} maxLength={160} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="Your team, your takes…" className={`${field} resize-none`} />
          <span className="mt-0.5 block px-1 text-right text-[11px] text-label-3">{160 - bio.length}</span>
        </label>
        {err && <div className="px-1 text-[13px] text-live">{err}</div>}
        <div className="flex justify-end gap-2">
          <PillButton tone="soft" onClick={(e) => { e.preventDefault(); onDone(photo); }}>Cancel</PillButton>
          <button disabled={busy || !display.trim()} className="rounded-full bg-accent px-5 py-1.5 text-[14px] font-semibold text-white disabled:opacity-40">Save</button>
        </div>
      </form>
    </Card>
  );
}

function FriendActions({ p }) {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => friendStatus(p.user_id).then((s) => alive && setState(s)).catch(() => alive && setState('none'));
    load();
    window.addEventListener('social', load);
    return () => { alive = false; window.removeEventListener('social', load); };
  }, [p.user_id]);
  const run = (fn, done) => async () => {
    try { await fn(); if (done) toast({ title: done }); } catch (e) { toast({ title: e.message }); }
  };
  if (!state) return <div className="h-[34px]" />;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {state === 'friends' && (
        <>
          <PillButton onClick={() => navigate(`/dm/${p.user_id}`)}>Message</PillButton>
          <PillButton tone="soft" onClick={() => window.confirm(`Remove ${p.display_name} from your friends?`) && run(() => removeFriend(p.user_id))()}>Friends ✓</PillButton>
        </>
      )}
      {state === 'none' && <PillButton onClick={run(() => addFriend(p.user_id), `Request sent to ${p.display_name}`)}>Add friend</PillButton>}
      {state === 'outgoing' && <PillButton tone="soft" onClick={run(() => removeFriend(p.user_id))}>Requested · Cancel</PillButton>}
      {state === 'incoming' && (
        <>
          <PillButton onClick={run(() => answerFriend(p.user_id, true), `You and ${p.display_name} are now friends`)}>Accept request</PillButton>
          <PillButton tone="soft" onClick={run(() => answerFriend(p.user_id, false))}>Decline</PillButton>
        </>
      )}
    </div>
  );
}

export default function Profile() {
  const { id } = useParams();
  const [me, setMe] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(null);
  useEffect(() => { currentUserId().then(setMe).catch(() => setMe(null)); }, []);
  const { data, loading, error } = useData(() => getProfile(id), ['profile', id]);
  const { data: stats } = useData(() => (isUserId(id) ? getProfileStats(id) : Promise.resolve(null)), ['profile-stats', id]);
  const p = saved?.user_id === id ? saved : data;
  const mine = me === id;

  if (loading && !p) return <div className="skeleton mt-2 h-[260px] rounded-2xl" />;
  if (!p) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackButton fallback="/friends" />
        <Empty title={error ? 'Couldn’t load this profile' : 'No profile here'} subtitle={error ? 'Check your connection and try again.' : 'This person hasn’t set up a profile yet.'} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl pb-6">
      <BackButton fallback="/friends" />
      {editing ? (
        <EditProfile p={p} onDone={(x) => { setSaved(x); setEditing(false); }} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center px-5 pb-4 pt-6 text-center">
            <UserAvatar profile={p} size={92} />
            <h1 className="mt-3 max-w-full truncate font-display text-[25px] font-bold leading-tight tracking-tight">{p.display_name}</h1>
            <div className="text-[14px] text-label-2">@{p.username}</div>
            {p.bio && <p className="mt-2.5 max-w-sm whitespace-pre-wrap text-[14.5px] leading-snug [overflow-wrap:anywhere]">{p.bio}</p>}
            <div className="mt-1.5 text-[12px] text-label-3">
              Joined {new Date(p.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </div>
            <div className="mt-4">
              {mine ? <PillButton tone="soft" onClick={() => setEditing(true)}>Edit profile</PillButton> : me !== undefined && <FriendActions p={p} />}
            </div>
          </div>
          <div className="grid grid-cols-4 border-t border-sep px-2 py-3">
            <Stat value={stats ? `${stats.w}-${stats.l}` : '–'} label="Pick’em" />
            <Stat value={stats ? (stats.w + stats.l ? `${Math.round((stats.w / (stats.w + stats.l)) * 100)}%` : '–') : '–'} label="Correct" />
            <Stat value={stats?.comments ?? '–'} label="Comments" />
            <Stat value={p.teams.length} label="Teams" />
          </div>
        </Card>
      )}
      {!editing && p.teams.length > 0 && (
        <>
          <SectionTitle>{mine ? 'Teams you follow' : `${p.display_name}’s teams`}</SectionTitle>
          <Teams keys={p.teams} />
        </>
      )}
      {!editing && mine && (
        <p className="mt-3 px-4 text-center text-[12px] text-label-3">This is what other people see. Your followed teams update on their own.</p>
      )}
    </div>
  );
}
