// "Follow live": the text of the one score notification that keeps updating.
// Plain JavaScript so the server (Deno) and local tests (Node) share it.
import { players } from './big.js';
import { lastPlay, stoppage } from './stoppage.js';

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
// An iPhone Lock Screen shows 4 lines of about 40 characters under the title.
// Everything is written to fit that, so nothing is cut off mid-word.
const LINE = 40;
const MAX_LINES = 4;
function shortPlay(text) {
  let t = text
    // NFL: formations, tacklers and officials' notes aren't needed at a glance.
    .replace(/\((?:No Huddle, )?Shotgun\)\s*|\(No Huddle\)\s*/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .split(/(?<=[a-z]{3})\.(?=[A-Z])|\.(?:\s|$)/)[0] // first sentence ("C.Wentz" keeps its dot)
    .replace(/PENALTY on ([A-Z]{2,4})-[^,]+, ([^,]+).*/, 'Penalty on $1: $2')
    .replace(/, Center-.*$/, '').replace(/ from [A-Z]{2,4} \d+ to .*$/, '')
    .replace(/scrambles (?:left|right) (?:end|tackle|guard)|scrambles up the middle/i, 'scrambles')
    .replace(/ (?:pushed|ran) ob at [A-Z]{2,4} \d+/i, '')
    .replace(/pass incomplete (?:short|deep) (?:left|right|middle) (?:to|intended for)/i, 'incomplete to')
    .replace(/pass incomplete (?:short|deep) (?:left|right|middle)/i, 'pass incomplete')
    .replace(/pass (?:short|deep) (?:left|right|middle) to/i, 'pass to')
    .replace(/(?:left|right) (?:end|tackle|guard)|up the middle/i, 'run')
    .replace(/ (?:to|at) [A-Z]{2,4} \d+ for (-?\d+) yards?/i, ', $1 yds')
    .replace(/ to (?:[A-Z]{2,4} )?\d+ for no gain/i, ', no gain')
    .replace(/ for (-?\d+) yards?/i, ', $1 yds')
    .replace(/, TOUCHDOWN/i, ' TD').replace(/TOUCHDOWN/i, 'TD')
    .replace(/extra point is GOOD/i, 'XP good').replace(/field goal is GOOD/i, 'FG good')
    // NBA
    .replace(/ makes /, ': ').replace(/ misses /, ': missed ').replace(/three point/gi, '3PT').replace(/(\d+)-foot/gi, '$1-ft')
    .replace(/jump ?shot/gi, 'jumper').replace(/step back/gi, 'step-back').replace(/, i(?:n|nside).*$/, '').replace(/free throw (\d) of (\d)/gi, 'FT $1 of $2').replace(/driving /gi, '')
    .replace(/\s+/g, ' ').trim();
  // Still too long? A long NBA name goes down to the last name.
  if (t.length > LINE - 2) t = t.replace(/^\S+ ([^:]+: )/, '$1');
  // Or stop at the last comma that fits, so it ends on a whole thought.
  const comma = t.lastIndexOf(',', LINE - 2);
  if (t.length > LINE - 2 && comma > 12) t = t.slice(0, comma);
  return clip(t, LINE - 2);
}
const last = (name) => name.split(' ').slice(1).join(' ') || name; // "L. Doncic" -> "Doncic"

function teamStat(summary, abbr /* team id */, name) {
  const t = (summary.boxscore?.teams ?? []).find((x) => String(x.team?.id) === String(abbr));
  return (t?.statistics ?? []).find((s) => s.name === name)?.displayValue ?? '';
}

function nbaLines(g, summary) {
  const lines = [];
  const scoring = (summary.plays ?? []).filter((p) => p.scoringPlay);
  const play = scoring[scoring.length - 1];
  if (play?.text) lines.push(`▸ ${shortPlay(play.text)}`);
  const people = players(summary);
  for (const t of [g.away, g.home]) {
    const top = people.filter((p) => p.teamId === String(t.id) && p.stats.points > 0).sort((a, b) => b.stats.points - a.stats.points).slice(0, 2);
    if (!top.length) continue;
    const one = (p, full) => {
      const s = p.stats;
      const extra = full ? [s.rebounds >= 4 && `${s.rebounds} REB`, s.assists >= 4 && `${s.assists} AST`].filter(Boolean).join(' ') : '';
      return `${last(p.short)} ${s.points}${full ? ' PTS' : ''}${extra ? ` ${extra}` : ''}`;
    };
    const both = `${t.abbr}: ${one(top[0], true)}${top[1] ? `, ${one(top[1], false)}` : ''}`;
    lines.push(both.length > LINE + 2 ? `${t.abbr}: ${one(top[0], true)}` : both);
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
  // A timeout or quarter break is shown as a stoppage, not as the last play.
  if (playText && !/^(timeout|official timeout|two-minute|end )/i.test(playText.trim())) lines.push(`▸ ${shortPlay(playText)}`);
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
    // Drop the last name on the list until it fits one line.
    while (parts.length > 1 && `${t.abbr}: ${parts.join(', ')}`.length > LINE + 2) parts.pop();
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
  // The play-by-play can be a few seconds behind the score. A "last basket"
  // that doesn't add up to this score would be wrong, so leave it out.
  const feed = summary?.header?.competitions?.[0]?.competitors ?? [];
  const feedTotal = feed.reduce((n, c) => n + (Number(c.score) || 0), 0);
  const behind = feed.length > 0 && feedTotal !== g.home.score + g.away.score;
  if ((final || behind) && lines[0]?.startsWith('▸')) lines.shift(); // nor is the last play news once it's over
  // Play stopped (timeout, injury, review, break)? Say so first.
  const paused = lastPlay(summary);
  const stop = g.state === 'in' && !g.half ? stoppage(paused) : null;
  // A quarter break is already in the title ("End of 3rd"); the rest get the first line.
  if (stop && stop.kind !== 'break') lines.unshift(`${stop.icon} ${clip(stop.label, LINE - 3)}`);
  // Too many lines? NFL gives up "who has the ball" first; then whatever is last (team stats).
  if (lines.length > MAX_LINES && lg === 'nfl') {
    const i = lines.findIndex((l) => / ball\b/.test(l) && !l.startsWith('▸'));
    if (i >= 0) lines.splice(i, 1);
  }
  lines.length = Math.min(lines.length, MAX_LINES);
  for (let i = 0; i < lines.length; i++) lines[i] = clip(lines[i], LINE + 2);
  const gap = Math.abs(g.home.score - g.away.score);
  const late = g.period >= 4 && g.state === 'in';
  return {
    title: `${score} · ${when}`,
    body: lines.join('\n'),
    // A new stoppage is news too; play resuming is not (the next score will say so).
    sig: `${g.away.score}-${g.home.score}|${final ? 'F' : g.half ? 'H' : g.period}${stop ? `|${paused?.id ?? stop.label}` : ''}`,
    stopped: !!stop,
    urgent: final || g.half || stop?.kind === 'injury' || (late && gap <= (lg === 'nfl' ? 8 : 6)),
  };
}
