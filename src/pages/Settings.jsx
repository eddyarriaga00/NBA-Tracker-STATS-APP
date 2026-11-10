import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeams } from '../api/espn';
import { Avatar, NamePrompt, useNickname } from '../components/Comments';
import { Icon } from '../components/icons';
import { PageTitle, Segmented, TeamLogo } from '../components/ui';
import { accountsEnabled, deleteAccount, getProfileStats, openAccount, sendTestAlert, signOut, useAccount } from '../lib/account';
import { useFavorites } from '../lib/favorites';
import { SORTS, useGameSort } from '../lib/gameSort';
import { isIOS, isStandalone, pushConfigured, pushSupported, usePushStatus } from '../lib/push';
import { useSetting } from '../lib/settings';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';

// ---------- building blocks (iOS-style grouped lists) ----------

function Group({ title, footer, children }) {
  return (
    <section className="mt-6">
      {title && <h2 className="mb-1.5 px-4 text-[12.5px] font-semibold uppercase tracking-wide text-label-2">{title}</h2>}
      <div className="divide-y divide-sep overflow-hidden rounded-2xl bg-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12px] leading-snug text-label-2">{footer}</p>}
    </section>
  );
}

function Row({ label, sub, right, onClick, to, danger, children }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15.5px] ${danger ? 'text-live' : ''}`}>{label}</span>
        {sub && <span className="mt-0.5 block text-[12px] leading-snug text-label-2">{sub}</span>}
      </span>
      {right}
      {(onClick || to) && !right && <Icon.ChevronRight className="h-4 w-4 shrink-0 text-label-3" />}
    </>
  );
  const cls = 'flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left';
  if (to) return <Link to={to} className={`${cls} active:bg-fill`}>{body}</Link>;
  if (onClick) return <button onClick={onClick} className={`${cls} active:bg-fill`}>{body}</button>;
  return (
    <div className={cls}>
      {body}
      {children}
    </div>
  );
}

function Switch({ on, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${on ? 'bg-win' : 'bg-fill-strong'}`}
    >
      <span className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-[left] duration-200" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

/** A label with a choice control: stacked on phones, side by side on wider screens. */
function Choice({ label, children }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[15.5px]">{label}</span>
      <div className="sm:w-[260px]">{children}</div>
    </div>
  );
}

// ---------- profile ----------

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <div className="num font-display text-[20px] font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-label-2">{label}</div>
    </div>
  );
}

function Profile() {
  const acct = useAccount();
  const [name, setName] = useNickname();
  const [editing, setEditing] = useState(false);
  const { favs } = useFavorites();
  const signedIn = acct && !acct.guest;
  const { data: stats } = useData(() => (acct?.id ? getProfileStats(acct.id) : Promise.resolve(null)), [acct?.id]);

  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-3.5 p-4">
        {signedIn && acct.avatar ? (
          <img src={acct.avatar} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <Avatar name={name || '?'} size={56} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[21px] font-bold leading-tight tracking-tight">{name || 'No nickname yet'}</div>
          <div className="truncate text-[13px] text-label-2">
            {signedIn ? `${acct.email} · ${acct.provider}` : 'Guest on this device'}
          </div>
        </div>
        <button onClick={() => setEditing((e) => !e)} className="shrink-0 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold text-accent">
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>
      {editing && (
        <div className="border-t border-sep">
          <NamePrompt
            initial={name}
            onSave={(n) => {
              setName(n);
              setEditing(false);
            }}
          />
        </div>
      )}
      {acct?.id && name && !editing && (
        <Link to={`/u/${acct.id}`} className="flex items-center gap-3 border-t border-sep px-4 py-3 active:bg-fill">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Your profile</span>
            <span className="block text-[12px] text-label-2">Photo, username and bio. This is what friends see.</span>
          </span>
          <Icon.ChevronRight className="h-4 w-4 shrink-0 text-label-3" />
        </Link>
      )}
      {stats && (
        <div className="grid grid-cols-4 border-t border-sep px-2 py-3">
          <Stat value={`${stats.w}-${stats.l}`} label="Pick’em" />
          <Stat value={stats.picks} label="Picks" />
          <Stat value={stats.comments} label="Comments" />
          <Stat value={favs.length} label="Following" />
        </div>
      )}
      {acct && !signedIn && (
        <button onClick={openAccount} className="flex w-full items-center gap-3 border-t border-sep bg-accent/10 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-accent">Sign in with Google or email</span>
            <span className="block text-[12px] text-label-2">Keep your picks, comments, teams and settings on every device.</span>
          </span>
          <Icon.ChevronRight className="h-4 w-4 text-accent" />
        </button>
      )}
    </div>
  );
}

// ---------- followed teams ----------

function FollowedTeams() {
  const { favs, toggle } = useFavorites();
  const { data } = useData(
    () => Promise.all(['nba', 'nfl'].map((lg) => getTeams(lg).catch(() => []))),
    ['teams-both']
  );
  const lookup = {};
  ['nba', 'nfl'].forEach((lg, i) =>
    (data?.[i] ?? []).forEach((c) => c.divisions.forEach((d) => d.teams.forEach((t) => (lookup[`${lg}:${t.id}`] = t))))
  );
  return (
    <Group title="Followed teams" footer="Followed teams show first on Scores, and their games get your “My teams” alerts.">
      {favs.length === 0 && <Row label="You’re not following any teams yet" sub="Tap ☆ on a team to follow it." />}
      {favs.map((k) => {
        const [lg, id] = k.split(':');
        const t = lookup[k];
        return (
          <div key={k} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
            <Link to={`/${lg}/team/${id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <TeamLogo abbr={t?.abbr} size={28} league={lg} />
              <span className="min-w-0">
                <span className="block truncate text-[15.5px]">{t?.name ?? 'Loading…'}</span>
                <span className="block text-[11.5px] uppercase text-label-2">{lg}</span>
              </span>
            </Link>
            <button onClick={() => toggle(lg, id)} aria-label={`Unfollow ${t?.name ?? 'team'}`} className="grid h-8 w-8 place-items-center rounded-full bg-fill text-label-2">
              <Icon.X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <Row label="Add NBA teams" to="/nba/teams" />
      <Row label="Add NFL teams" to="/nfl/teams" />
    </Group>
  );
}

// ---------- alerts ----------

function pushNote(status) {
  if (!pushConfigured || !pushSupported()) return 'Alerts show while the app is open.';
  if (status?.reason === 'on') return '✓ Alerts reach this device even when the app is closed.';
  if (status?.reason === 'ios-home-screen' || (isIOS() && !isStandalone()))
    return 'On iPhone: tap Share → Add to Home Screen, open the app from there, then turn alerts on.';
  if (status?.reason === 'denied') return 'Notifications are blocked. Allow them for this app in your phone or browser settings.';
  if (status?.reason === 'save-failed' || status?.reason === 'error') return 'Couldn’t turn on closed-app alerts right now. In-app alerts still work.';
  return 'Turn an alert on to get notified even when the app is closed.';
}

function Alerts() {
  const [start, setStart] = useSetting('alertsStartFor');
  const [half, setHalf] = useSetting('alertsHalfFor');
  const [final, setFinal] = useSetting('alertsFinalFor');
  const [close, setClose] = useSetting('alertsClose');
  const [big, setBig] = useSetting('alertsBig');
  const { favs } = useFavorites();
  const status = usePushStatus();
  const [test, setTest] = useState('');
  const enable = (setter) => (v) => {
    setter(v);
    // iPhone only allows the permission prompt straight from a tap.
    if (v && v !== 'off' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
        .then(() => window.dispatchEvent(new Event('notification-permission')))
        .catch(() => {});
    }
  };
  const runTest = async () => {
    setTest('Sending…');
    try {
      const r = await sendTestAlert();
      setTest(r?.sent ? 'Sent! It should pop up in a few seconds.' : 'No devices signed up for alerts yet.');
    } catch (e) {
      setTest(e.message);
    }
  };
  const FOR = [
    { value: 'off', label: 'Off' },
    { value: 'teams', label: 'My teams' },
    { value: 'all', label: 'All games' },
  ];
  const needsTeams = [start, half, final].includes('teams') && favs.length === 0;
  return (
    <Group title="Alerts" footer={pushNote(status)}>
      <Choice label="Game starts">
        <Segmented value={start} onChange={enable(setStart)} options={FOR} />
      </Choice>
      <Choice label="Halftime score">
        <Segmented value={half} onChange={enable(setHalf)} options={FOR} />
      </Choice>
      <Choice label="Final scores">
        <Segmented value={final} onChange={enable(setFinal)} options={FOR} />
      </Choice>
      {needsTeams && <Row label="You don’t follow any teams yet" sub="“My teams” alerts need followed teams. Add some below." />}
      <Row label="Close games" sub="Any game that’s close late, or goes to overtime" right={<Switch on={close} onChange={enable(setClose)} label="Close game alerts" />} />
      <Row
        label="Big performances"
        sub="Any player, any game: 15+ in a quarter, 30/40/50-point nights, triple-doubles, 8+ threes, 400-yard passers, 150-yard receivers and more"
        right={<Switch on={big} onChange={enable(setBig)} label="Big performance alerts" />}
      />
      {status?.reason === 'on' && <Row label="Send a test alert" sub={test || 'Check alerts reach this device'} onClick={runTest} />}
    </Group>
  );
}

// ---------- preferences ----------

function Preferences() {
  const { pref, setPref } = useTheme();
  const [spoiler, setSpoiler] = useSetting('spoilerFree');
  const [league, setLeague] = useSetting('defaultLeague');
  const [sort, setSort] = useGameSort();
  return (
    <>
      <Group title="Appearance">
        <div className="px-4 py-3">
          <Segmented
            value={pref}
            onChange={setPref}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </Group>
      <Group title="Scores">
        <Choice label="Open the app to">
          <Segmented
            value={league}
            onChange={setLeague}
            options={[
              { value: 'last', label: 'Last used' },
              { value: 'nba', label: 'NBA' },
              { value: 'nfl', label: 'NFL' },
            ]}
          />
        </Choice>
        <Choice label="Order games by">
          <Segmented value={sort} onChange={setSort} options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} />
        </Choice>
        <Row label="Spoiler-free" sub="Hide scores and results until you tap Reveal" right={<Switch on={spoiler} onChange={setSpoiler} label="Spoiler-free" />} />
      </Group>
    </>
  );
}

// ---------- app ----------

const builtAt = () => {
  const t = Number(typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 0);
  return t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'dev';
};

function AppSection() {
  const [update, setUpdate] = useState('');
  const [size, setSize] = useState(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setSize(e.usage)).catch(() => {});
  }, [cleared]);

  const checkUpdate = async () => {
    setUpdate('Checking…');
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      const { id } = await r.json();
      if (typeof __BUILD_ID__ !== 'undefined' && id !== __BUILD_ID__) {
        setUpdate('Updating…');
        location.reload();
      } else setUpdate('You’re on the latest version.');
    } catch {
      setUpdate('Couldn’t check right now.');
    }
  };
  const clear = async () => {
    try {
      for (const k of await caches.keys()) if (k.startsWith('espn') || k.startsWith('img')) await caches.delete(k);
    } catch {
      /* not supported */
    }
    setCleared(true);
  };
  const mb = size != null ? `${(size / 1024 / 1024).toFixed(1)} MB saved for offline use` : 'Scores and logos saved for offline use';

  return (
    <Group title="App" footer="Scores, stats and news from ESPN. Made for you and your friends.">
      <Row label="About" sub="The vision, and who made it" to="/about" />
      {isIOS() && !isStandalone() && (
        <Row label="Add to Home Screen" sub="In Safari tap Share → Add to Home Screen. It opens full screen and can send alerts." />
      )}
      <Row label="Check for updates" sub={update || `Version from ${builtAt()}`} onClick={checkUpdate} />
      <Row label="Clear saved data" sub={cleared ? 'Cleared. Fresh data loads as you browse.' : mb} onClick={clear} />
    </Group>
  );
}

// ---------- account ----------

function AccountActions() {
  const acct = useAccount();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!acct || acct.guest) return null;
  const remove = async () => {
    const ok = window.confirm(
      'Delete your account?\n\nThis permanently removes your picks, comments and reactions, and stops alerts. It can’t be undone.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAccount();
      location.hash = '#/';
      location.reload();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <Group
      title="Account"
      footer={err || 'Signed in: your followed teams and settings sync to every device you sign in on. Alerts are set per device.'}
    >
      <Row label="Sign out" onClick={() => signOut()} />
      <Row label={busy ? 'Deleting…' : 'Delete account'} danger onClick={busy ? undefined : remove} />
    </Group>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl pb-6">
      <PageTitle>Settings</PageTitle>
      {accountsEnabled && <Profile />}
      <Alerts />
      <FollowedTeams />
      <Preferences />
      <AppSection />
      <AccountActions />
    </div>
  );
}
