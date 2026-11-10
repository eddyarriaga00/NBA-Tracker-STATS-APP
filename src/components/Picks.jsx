import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Avatar, NamePrompt, useNickname } from './Comments';
import { Card, Segmented, Skeleton, TeamLogo } from './ui';
import { Icon } from './icons';
import { useLeague } from '../lib/league';
import { useSocialBadge } from '../lib/social';
import { useSpoilers } from '../lib/settings';
import { useTheme } from '../lib/theme';
import { visibleColor } from '../lib/color';
import { PERIODS, isLocked, picksEnabled, useLeaderboard, usePicks } from '../lib/picks';

/** Pick'em | Chat switch shown at the top of both friend pages. */
export function FriendsTabs() {
  const league = useLeague();
  const badge = useSocialBadge();
  const tab = (to, label) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative z-10 rounded-[8px] px-3 py-[6px] text-center text-[13px] font-semibold transition ${
          isActive ? 'bg-card text-label shadow-[0_3px_8px_rgba(0,0,0,0.12)] dark:bg-[#636366]' : 'text-label-2 hover:text-label'
        }`
      }
    >
      {label}
    </NavLink>
  );
  return (
    <div className="mb-3 grid grid-cols-3 rounded-[10px] bg-fill p-[2px] md:max-w-sm">
      {tab('/chat', 'Chat')}
      {tab('/friends', badge ? `Friends · ${badge}` : 'Friends')}
      {tab(`/${league}/picks`, 'Pick’em')}
    </div>
  );
}

const RESULT = {
  win: { label: 'Correct', cls: 'bg-win/15 text-win', icon: '✓' },
  loss: { label: 'Wrong', cls: 'bg-live/15 text-live', icon: '✗' },
  push: { label: 'Push', cls: 'bg-fill text-label-2', icon: '=' },
  void: { label: 'Void', cls: 'bg-fill text-label-2', icon: '–' },
};

function ResultChip({ result }) {
  const r = RESULT[result];
  if (!r) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.cls}`}>
      <span aria-hidden>{r.icon}</span>
      {r.label}
    </span>
  );
}

function Pickers({ rows, max = 4 }) {
  if (!rows.length) return <div className="text-[11.5px] text-label-3">No picks</div>;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {rows.slice(0, max).map((r) => (
        <span key={r.user_id} className="flex min-w-0 items-center gap-1 text-[12px] text-label-2">
          <Avatar name={r.nickname} size={16} />
          <span className="max-w-[80px] truncate">{r.nickname}</span>
        </span>
      ))}
      {rows.length > max && <span className="text-[12px] text-label-3">+{rows.length - max}</span>}
    </div>
  );
}

function TeamButton({ t, picked, locked, onClick, score, won, color, share }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      aria-pressed={picked}
      className={`relative flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.98] disabled:active:scale-100 ${
        picked ? 'bg-accent/12 ring-2 ring-accent' : 'bg-fill/70 hover:bg-fill'
      }`}
    >
      <TeamLogo abbr={t.abbr} size={30} />
      <div className="min-w-0 flex-1">
        {/* With a score showing there's only room for the short name on phones. */}
        <div className={`truncate text-[15px] font-semibold leading-tight ${won === false ? 'text-label-2' : ''}`}>
          {score != null ? (
            <>
              <span className="sm:hidden">{t.abbr}</span>
              <span className="hidden sm:inline">{t.name}</span>
            </>
          ) : (
            t.name
          )}
        </div>
        <div className="truncate text-[11px] text-label-2 num">{share != null ? `${share}%${score != null ? '' : ' picked'}` : t.record}</div>
      </div>
      {score != null && <span className={`num font-display text-[20px] font-bold ${won === false ? 'text-label-3' : ''}`}>{score}</span>}
      {picked && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white shadow">
          <Icon.Check className="h-3 w-3" />
        </span>
      )}
      {color && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-full" style={{ background: color }} />}
    </button>
  );
}

/** One game: tap a team to pick it; after tip-off everyone's picks show. */
export function PickCard({ g, rows = [], me, onPick, onClear }) {
  const { dark } = useTheme();
  const { hidden, reveal } = useSpoilers();
  const locked = isLocked(g);
  const hide = hidden(g);
  const mine = rows.find((r) => r.user_id === me);
  const side = (t) => rows.filter((r) => r.team_id === String(t.id));
  const showScores = g.status.state !== 'pre' && !hide;
  const won = (t) => (g.status.state === 'post' && !hide ? !!t.winner : undefined);
  const total = rows.length;
  const share = (t) => (locked && total ? Math.round((side(t).length / total) * 100) : null);
  const tap = (t) => {
    if (locked) return;
    if (mine?.team_id === String(t.id)) onClear(g);
    else onPick(g, t.id);
  };
  const when = new Date(g.date);
  const status =
    g.status.postponed ? g.status.label
    : g.status.state === 'pre' ? `${when.toLocaleDateString([], { weekday: 'short' })} ${g.status.label}`
    : g.status.state === 'in' ? (hide ? 'Live' : g.status.label)
    : 'Final';

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span className={`truncate text-[12px] font-semibold ${g.status.state === 'in' ? 'text-live' : 'text-label-2'}`}>
          {status}
          {g.note ? ` · ${g.note}` : ''}
        </span>
        {hide && g.status.state !== 'pre' ? (
          <button onClick={() => reveal(g)} className="text-[12px] font-semibold text-accent">Reveal</button>
        ) : mine?.result ? (
          <ResultChip result={mine.result} />
        ) : locked ? (
          <span className="text-[11.5px] text-label-3">{mine ? 'Locked in' : 'Locked'}</span>
        ) : (
          <span className="text-[11.5px] text-label-3">{mine ? 'Tap again to clear' : 'Pick a winner'}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[g.away, g.home].map((t) => (
          <TeamButton
            key={t.id}
            t={t}
            picked={mine?.team_id === String(t.id)}
            locked={locked}
            onClick={() => tap(t)}
            score={showScores ? t.score : null}
            won={won(t)}
            share={share(t)}
            color={locked && total ? visibleColor(t.color, dark, t.alt) : null}
          />
        ))}
      </div>
      {locked && (
        <div className="mt-2 grid grid-cols-2 gap-2 px-1">
          <Pickers rows={side(g.away)} />
          <Pickers rows={side(g.home)} />
        </div>
      )}
    </Card>
  );
}

/** Nickname gate: picks are shown under the same nickname as chat. */
export function NameGate({ children }) {
  const [name, setName] = useNickname();
  if (!picksEnabled) {
    return (
      <Card className="px-5 py-8 text-center text-[14px] text-label-2">Pick’em needs the Supabase connection that comments use.</Card>
    );
  }
  if (!name) {
    return (
      <Card>
        <div className="px-4 pt-4">
          <div className="text-[16px] font-semibold">Join the Pick’em league</div>
          <div className="text-[13px] text-label-2">Pick winners with your friends. Same nickname as chat.</div>
        </div>
        <NamePrompt onSave={setName} />
      </Card>
    );
  }
  return children(name);
}

/** Pick'em box on a single game's page. */
export function GamePick({ g }) {
  const { byGame, me, pick, clear, error } = usePicks(g.league, [g.id]);
  const [name, setName] = useNickname();
  if (!picksEnabled || g.home.tbd || g.away.tbd) return null;
  return (
    <div>
      {!name && !isLocked(g) ? (
        <Card>
          <div className="px-4 pt-3 text-[13px] text-label-2">Pick a nickname to make your pick.</div>
          <NamePrompt onSave={setName} />
        </Card>
      ) : (
        <PickCard g={g} rows={byGame[g.id]} me={me} onPick={(game, t) => pick(game, t, name)} onClear={clear} />
      )}
      {error && <p className="mt-1.5 px-1 text-[12px] text-live">{error}</p>}
    </div>
  );
}

function Streak({ u }) {
  if (!u.streak) return null;
  const hot = u.streakType === 'win' && u.streak >= 3;
  return (
    <span
      className={`num rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
        hot ? 'bg-[#ffd60a]/20 text-[#806000] dark:text-[#ffd60a]' : 'bg-fill text-label-2'
      }`}
    >
      {hot ? '🔥 ' : ''}
      {u.streakType === 'win' ? 'W' : 'L'}
      {u.streak}
    </span>
  );
}

export function Leaderboard({ league }) {
  const [period, setPeriod] = useState('week');
  const { rows, me, error } = useLeaderboard(league, period);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[16px] font-semibold">Leaderboard</div>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} className="w-full sm:w-[260px]" />
      </div>
      {error ? (
        <div className="px-4 pb-4 text-[13px] text-live">{error}</div>
      ) : !rows ? (
        <div className="space-y-2 px-4 pb-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : !rows.length ? (
        <div className="px-4 pb-4 text-[13px] text-label-2">
          No finished picks {period === 'week' ? 'this week' : period === 'season' ? 'this season' : 'yet'}. Make picks below; they’re scored when games end.
        </div>
      ) : (
        <ol>
          {rows.map((u, i) => (
            <li
              key={u.user_id}
              className={`flex items-center gap-3 border-t border-sep px-4 py-2.5 ${u.user_id === me ? 'bg-accent/[0.06]' : ''}`}
            >
              <span className="num w-5 text-center text-[14px] font-bold text-label-2">{i + 1}</span>
              <Avatar name={u.nickname} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Link to={`/u/${u.user_id}`} className="truncate text-[15px] font-semibold">{u.nickname}</Link>
                  {u.user_id === me && <span className="text-[11px] font-semibold text-accent">You</span>}
                </div>
                <div className="mt-0.5 flex gap-[3px]" aria-label="Last picks, newest first">
                  {u.last.map((r, k) => (
                    <span key={k} className={`h-[6px] w-[6px] rounded-full ${r === 'win' ? 'bg-win' : 'bg-live'}`} />
                  ))}
                </div>
              </div>
              <Streak u={u} />
              <div className="text-right">
                <div className="num text-[15px] font-semibold">
                  {u.w}-{u.l}
                  {u.p ? `-${u.p}` : ''}
                </div>
                <div className="num text-[11px] text-label-2">{(u.pct * 100).toFixed(0)}%</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
