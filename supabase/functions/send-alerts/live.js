// "Follow live": the text of the one score notification that keeps updating.
// Plain JavaScript so the server (Deno) and local tests (Node) share it.
import { players } from './big.js';

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const last = (name) => name.split(' ').slice(1).join(' ') || name; // "L. Doncic" -> "Doncic"

function teamStat(summary, abbr /* team id */, name) {
  const t = (summary.boxscore?.teams ?? []).find((x) => String(x.team?.id) === String(abbr));
  return (t?.statistics ?? []).find((s) => s.name === name)?.displayValue ?? '';
}

function nbaLines(g, summary) {
  const lines = [];
  const scoring = (summary.plays ?? []).filter((p) => p.scoringPlay);
  const play = scoring[scoring.length - 1];
  if (play?.text) lines.push(`▸ ${clip(play.text, 90)}`);
  const people = players(summary);
  for (const t of [g.away, g.home]) {
    const top = people.filter((p) => p.teamId === String(t.id) && p.stats.points > 0).sort((a, b) => b.stats.points - a.stats.points).slice(0, 2);
    if (!top.length) continue;
    const one = (p, full) => {
      const s = p.stats;
      const extra = full ? [s.rebounds >= 4 && `${s.rebounds} REB`, s.assists >= 4 && `${s.assists} AST`].filter(Boolean).join(' ') : '';
      return `${last(p.short)} ${s.points}${full ? ' PTS' : ''}${extra ? ` ${extra}` : ''}`;
    };
    lines.push(`${t.abbr}: ${one(top[0], true)}${top[1] ? `, ${one(top[1], false)}` : ''}`);
  }
  const pair = (name) => {
    const a = teamStat(summary, g.away.id, name);
    const h = teamStat(summary, g.home.id, name);
    return a && h ? `${a}–${h}` : '';
  };
  const fg = pair('fieldGoalPct');
  const reb = pair('totalRebounds');
  const tov = pair('turnovers');
  const stats = [fg && `FG% ${fg}`, reb && `REB ${reb}`, tov && `TO ${tov}`].filter(Boolean).join(' · ');
  if (stats) lines.push(stats);
  return lines;
}

function nflLines(g, summary) {
  const lines = [];
  const sit = summary.situation ?? {};
  const drive = summary.drives?.current;
  const abbrOf = (id) => [g.home, g.away].find((t) => String(t.id) === String(id))?.abbr;
  const ball = abbrOf(sit.possession) ?? drive?.team?.abbreviation;
  const down = sit.downDistanceText || sit.shortDownDistanceText;
  if (g.state === 'in' && (ball || down)) lines.push([ball && `${ball} ball`, down].filter(Boolean).join(' · '));
  const playText = sit.lastPlay?.text ?? drive?.plays?.[drive.plays.length - 1]?.text;
  if (playText) lines.push(`▸ ${clip(playText, 90)}`);
  const people = players(summary);
  for (const t of [g.away, g.home]) {
    const mine = people.filter((p) => p.teamId === String(t.id));
    const best = (k) => mine.filter((p) => p.stats[k] > 0).sort((a, b) => b.stats[k] - a.stats[k])[0];
    const qb = best('passingYards');
    const rb = best('rushingYards');
    const wr = best('receivingYards');
    const parts = [
      qb && `${last(qb.short)} ${qb.stats.passingYards} YDS${qb.stats.passingTouchdowns ? ` ${qb.stats.passingTouchdowns} TD` : ''}`,
      rb && `${last(rb.short)} ${rb.stats.rushingYards} rush`,
      wr && `${last(wr.short)} ${wr.stats.receivingYards} rec`,
    ].filter(Boolean);
    if (parts.length) lines.push(`${t.abbr}: ${parts.join(', ')}`);
  }
  return lines;
}

/**
 * { title, body, sig, urgent } for a game right now.
 * `sig` changes when there's something new to show; `urgent` moments skip the wait between updates.
 */
export function liveCard(lg, g, summary) {
  const score = `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr}`;
  const final = g.state === 'post';
  const when = final ? 'Final' : g.half ? 'Halftime' : g.label;
  const lines = summary ? (lg === 'nba' ? nbaLines(g, summary) : nflLines(g, summary)) : [];
  if (final) lines.shift(); // the last play isn't news once it's over
  const gap = Math.abs(g.home.score - g.away.score);
  const late = g.period >= 4 && g.state === 'in';
  return {
    title: `${score} · ${when}`,
    body: lines.join('\n'),
    sig: `${g.away.score}-${g.home.score}|${final ? 'F' : g.half ? 'H' : g.period}`,
    urgent: final || g.half || (late && gap <= (lg === 'nfl' ? 8 : 6)),
  };
}
