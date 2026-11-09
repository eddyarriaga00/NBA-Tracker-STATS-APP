import { Link } from 'react-router-dom';
import { Card, LiveBadge, TeamLogo } from './ui';
import { Icon } from './icons';

function TeamRow({ t, state, dim, hasBall, redZone }) {
  const showScore = state !== 'pre' && t.score != null;
  return (
    <div className="flex items-center gap-3">
      <TeamLogo abbr={t.abbr} size={30} />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 truncate text-[17px] font-semibold leading-tight ${dim ? 'text-label-2' : ''}`}>
          {t.name}
          {hasBall && (
            <span
              title="Possession"
              className={`inline-block h-[9px] w-[14px] rounded-[50%] ${redZone ? 'bg-live' : 'bg-[#8b5a2b]'}`}
            />
          )}
        </div>
        <div className="text-[12px] text-label-2 num">{t.record}</div>
      </div>
      {showScore && (
        <div className="flex items-center gap-1.5">
          <span
            key={state === 'in' ? t.score : undefined}
            className={`num font-display text-[26px] font-bold leading-none tracking-tight ${
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

export default function GameCard({ g, index = 0, comments = 0 }) {
  const { status, home, away, situation } = g;
  const final = status.state === 'post';
  const live = status.state === 'in';
  const poss = live ? situation?.possession : null;

  let footer = null;
  if (live && situation?.downDistance) {
    const team = poss === home.id ? home.abbr : poss === away.id ? away.abbr : '';
    footer = (
      <span className={situation.redZone ? 'font-semibold text-live' : ''}>
        {team && <span className="font-semibold text-label">{team} ball · </span>}
        {situation.full || situation.downDistance}
      </span>
    );
  } else if (status.state !== 'pre' && g.leaders.length) {
    footer = (
      <div className={`grid gap-x-3 gap-y-0.5 ${g.league === 'nba' && g.leaders.length > 1 ? 'grid-cols-2' : ''}`}>
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
      <Card className="overflow-hidden transition hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)] dark:hover:bg-card-2">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 text-[13px]">
          {live ? (
            <LiveBadge label={status.label} />
          ) : (
            <span className={`shrink-0 font-semibold ${final ? 'text-label' : 'text-label-2'}`}>
              {status.postponed ? status.label || 'Postponed' : status.label}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-2 text-label-2">
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
        <div className="space-y-3 px-4 pb-3.5 pt-3">
          <TeamRow t={away} state={status.state} dim={final && !away.winner} hasBall={poss && poss === away.id} redZone={situation?.redZone} />
          <TeamRow t={home} state={status.state} dim={final && !home.winner} hasBall={poss && poss === home.id} redZone={situation?.redZone} />
        </div>
        {footer && <div className="border-t border-sep px-4 py-2.5 text-[12px] text-label-2">{footer}</div>}
      </Card>
    </Link>
  );
}
