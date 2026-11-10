import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, LiveBadge, TeamLogo } from './ui';
import { Icon } from './icons';
import FootballField from './FootballField';
import { gameHeat } from '../lib/excitement';
import { useSpoilers } from '../lib/settings';
import { nextLabel, useCardExtras, usePregame } from '../lib/cardExtras';

const lastName = (n = '') => n.split(' ').slice(1).join(' ') || n;

function Streak({ s }) {
  return <span className={`font-semibold ${s[0] === 'W' ? 'text-[#30a46c]' : s[0] === 'L' ? 'text-live' : ''}`}>{s}</span>;
}

const md = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : `${x.getMonth() + 1}/${x.getDate()}`;
};

function Form({ form }) {
  return (
    <span className="inline-flex items-start gap-[3px] pt-[4px]">
      {form.map((f, i) => (
        <span
          key={i}
          title={`${md(f.date)} ${f.r} ${f.atVs ?? ''} ${f.opp ?? ''} ${f.score ?? ''}`.replace(/\s+/g, ' ').trim()}
          className="flex w-[24px] flex-col items-center gap-[2px]"
        >
          <span className={`h-[7px] w-[7px] rounded-full ${f.r === 'W' ? 'bg-[#30a46c]' : 'border-[1.5px] border-live'}`} />
          <span className="text-[8.5px] leading-none text-label-3 num">{md(f.date)}</span>
        </span>
      ))}
    </span>
  );
}

function Injuries({ inj }) {
  const outs = inj.out ?? [];
  const gtd = inj.gtd ?? [];
  const list = outs.length ? outs : gtd;
  if (!list.length) return null;
  const out = outs.length > 0;
  const label = list.length === 1 ? `${lastName(list[0].name)} ${out ? 'out' : 'GTD'}` : `${list.length} ${out ? 'out' : 'GTD'}`;
  const all = [...outs.map((i) => `${i.name}: ${i.status}`), ...gtd.map((i) => `${i.name}: ${i.status}`)].join('\n');
  return (
    <span title={all} className="flex max-w-[45%] shrink-0 items-center gap-1 text-[11px] font-semibold text-label-2">
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${out ? 'bg-live' : 'bg-[#ff9f0a]'}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function TeamRow({ t, state, dim, hasBall, redZone, hide, extra }) {
  const showScore = state !== 'pre' && t.score != null && !hide;
  return (
    <div className="flex items-center gap-3">
      <TeamLogo abbr={t.abbr} size={26} className="md:h-[30px] md:w-[30px]" />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 truncate text-[15px] font-semibold leading-tight md:text-[17px] ${dim ? 'text-label-2' : ''}`}>
          {t.name}
          {hasBall && (
            <span
              title="Possession"
              className={`inline-block h-[9px] w-[14px] rounded-[50%] ${redZone ? 'bg-live' : 'bg-[#8b5a2b]'}`}
            />
          )}
        </div>
        {/* Records update after a game ends, so they'd spoil the result. */}
        <div className={`flex gap-1.5 truncate text-[11px] text-label-2 num md:text-[12px] ${extra?.form?.length ? 'items-start' : 'items-center'}`}>
          {hide ? '\u00a0' : (
            <>
              <span>{t.record}</span>
              {extra?.streak && <><span className="text-label-3">·</span><Streak s={extra.streak} /></>}
              {extra?.form?.length > 0 && <Form form={extra.form} />}
              {extra?.next && <><span className="text-label-3">·</span><span className="truncate">Next {nextLabel(extra.next)}</span></>}
            </>
          )}
        </div>
      </div>
      {state === 'pre' && extra?.inj && <Injuries inj={extra.inj} />}
      {showScore && (
        <div className="flex items-center gap-1.5">
          <span
            key={state === 'in' ? t.score : undefined}
            className={`num font-display text-[22px] font-bold leading-none tracking-tight md:text-[26px] ${
              dim ? 'text-label-3' : ''
            } ${state === 'in' ? 'score-flash' : ''}`}
          >
            {t.score}
          </span>
          <span
            className={`h-0 w-0 border-y-[5px] border-r-[6px] border-y-transparent ${
              state === 'post' && t.winner ? 'border-r-label' : 'border-r-transparent'
            }`}
          />
        </div>
      )}
    </div>
  );
}

// "in 2h 15m" next to the start time, for games later today.
function useNow(ms) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function countdownText(start, now) {
  const left = start - now;
  if (left <= 60_000) return 'Starting soon';
  const mins = Math.ceil(left / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `in ${h}h${m ? ` ${m}m` : ''}` : `in ${m}m`;
}

function Countdown({ g }) {
  const now = useNow(20_000);
  const start = Date.parse(g.date);
  if (!start || g.timeValid === false || g.status.postponed) return null;
  if (new Date(start).toDateString() !== new Date(now).toDateString()) return null; // today only
  if (start - now < -30 * 60_000) return null; // long overdue: the status will update soon
  const soon = start - now <= 15 * 60_000;
  return (
    <span
      className={`num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        soon ? 'bg-accent/15 text-accent' : 'bg-fill text-label-2'
      }`}
    >
      {countdownText(start, now)}
    </span>
  );
}

export function HeatBadge({ g }) {
  const heat = gameHeat(g);
  if (!heat) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        heat.hot ? 'bg-[#ff9f0a]/15 text-[#c26a00] dark:text-[#ffb340]' : 'bg-fill text-label-2'
      }`}
    >
      {heat.hot && <span aria-hidden>🔥</span>}
      {heat.label}
    </span>
  );
}

export default function GameCard({ g, index = 0, comments = 0, favorite = false }) {
  const { status, home, away, situation } = g;
  const spoilers = useSpoilers();
  const hide = spoilers.hidden(g);
  const final = status.state === 'post' && !hide;
  const live = status.state === 'in';
  const poss = live && !hide ? situation?.possession : null;
  const ctx = useCardExtras();
  const pre = usePregame(g, !!ctx);
  const extraFor = (t) =>
    ctx && !hide
      ? {
          streak: ctx.streaks?.[t.id],
          form: pre?.[t.id]?.form,
          inj: pre?.[t.id],
          next: status.state === 'post' ? ctx.next?.[t.id] : null,
        }
      : null;

  let footer = null;
  if (hide) {
    footer = (
      <span className="flex items-center justify-between gap-2">
        <span>Score hidden</span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); spoilers.reveal(g); }}
          className="rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold text-accent active:scale-95"
        >
          Reveal
        </button>
      </span>
    );
  } else if (live && situation?.downDistance) {
    const team = poss === home.id ? home.abbr : poss === away.id ? away.abbr : '';
    footer = (
      <span className={situation.redZone ? 'font-semibold text-live' : ''}>
        {team && <span className="font-semibold text-label">{team} ball · </span>}
        {situation.full || situation.downDistance}
      </span>
    );
  } else if (status.state !== 'pre' && g.leaders.length) {
    footer = (
      <div className={`grid gap-x-3 gap-y-0.5 ${g.league === 'nba' && g.leaders.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {g.leaders.map((l, i) => (
          <div key={i} className="truncate">
            <span className="font-semibold text-label">{l.primary}</span> · {l.secondary}
          </div>
        ))}
      </div>
    );
  } else if (g.venue) {
    footer = <span className="block truncate">{g.venue}</span>;
  }

  return (
    <Link
      to={`/${g.league}/game/${g.id}`}
      className="rise block transition active:scale-[0.985]"
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      <Card className={`overflow-hidden transition hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)] dark:hover:bg-card-2 ${favorite ? 'ring-1 ring-[#ff9f0a]/60' : ''}`}>
        <div className="flex items-center justify-between gap-3 px-3.5 pt-2.5 text-[12px] md:px-4 md:pt-3 md:text-[13px]">
          {live ? (
            <span className="flex min-w-0 items-center gap-2">
              <LiveBadge label={status.label} />
              {!hide && situation?.stoppage && situation.stoppage.label !== 'Halftime' && (
                <span className={`truncate rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${situation.stoppage.kind === 'injury' ? 'bg-live/12 text-live' : 'bg-[#ff9f0a]/15 text-[#c26a00] dark:text-[#ffb340]'}`}>{situation.stoppage.icon} {situation.stoppage.label}</span>
              )}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-2">
              <span className={`shrink-0 font-semibold ${final ? 'text-label' : 'text-label-2'}`}>
                {status.postponed ? status.label || 'Postponed' : status.label}
              </span>
              {status.state === 'pre' && <Countdown g={g} />}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-2 text-label-2">
            <HeatBadge g={g} />
            {favorite && <Icon.Star filled className="h-3.5 w-3.5 shrink-0 text-[#ff9f0a]" />}
            <span className="truncate">{g.broadcast}</span>
            {comments > 0 && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-label-2">
                <Icon.Chat className="h-3 w-3" />
                {comments}
              </span>
            )}
          </span>
        </div>
        {g.note && <div className="truncate px-4 pt-1 text-[12px] font-medium text-accent">{g.note}</div>}
        <div className="space-y-2 px-3.5 pb-3 pt-2.5 md:space-y-3 md:px-4 md:pb-3.5 md:pt-3">
          <TeamRow t={away} state={status.state} dim={final && !away.winner} hasBall={poss && poss === away.id} redZone={situation?.redZone} hide={hide} extra={extraFor(away)} />
          <TeamRow t={home} state={status.state} dim={final && !home.winner} hasBall={poss && poss === home.id} redZone={situation?.redZone} hide={hide} extra={extraFor(home)} />
        </div>
        {live && !hide && g.league === 'nfl' && situation && (
          <div className="px-3.5 pb-2.5 md:px-4">
            <FootballField situation={situation} home={home} away={away} size="sm" />
          </div>
        )}
        {footer && <div className="border-t border-sep px-3.5 py-2 text-[11.5px] text-label-2 md:px-4 md:py-2.5 md:text-[12px]">{footer}</div>}
      </Card>
    </Link>
  );
}
