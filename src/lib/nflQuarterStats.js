// Builds NFL box scores for a single quarter (or overtime) from play-by-play.
//
// ESPN only publishes full-game box scores. Its detailed play feed names the
// players on each play (passer, receiver, rusher, tackler, ...); the yards come
// from the play's own text, which stays right when a penalty is added on.

const idOf = (p) => p.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1] ?? null;

const blank = () => ({
  cmp: 0, att: 0, pyds: 0, ptd: 0, int: 0, sk: 0, skyds: 0,
  car: 0, ryds: 0, rtd: 0, rlong: null,
  rec: 0, tgt: 0, recyds: 0, rectd: 0, reclong: null,
  tot: 0, solo: 0, sacks: 0, pd: 0, dint: 0, ff: 0,
  fgm: 0, fga: 0, fglong: 0, xpm: 0, xpa: 0,
  punts: 0, puntyds: 0, puntlong: 0,
});

/** Yards gained on the first action described in the text. */
function yards(text) {
  const m = text.match(/for (-?\d+) yards?|for no gain/);
  return m ? Number(m[1] ?? 0) : null;
}

const NAME = "[A-Z][A-Za-z]*\\.\\s?[A-Z][A-Za-z'-]+";
const POS = /\b([A-Z]{2,3}) (\d{1,2})\b/g;

/**
 * A flag on the offense can pull a gain back to the spot of the foul.
 * Returns how many of the play's yards are lost that way.
 */
function pulledBack(body, text, y, nullifiedTd) {
  if (y == null || y <= 0) return 0;
  const flag = text.match(/PENALTY on [\s\S]*?enforced at ([A-Z]{2,3}) (\d{1,2})/);
  if (!flag) return 0;
  let dist;
  if (nullifiedTd) dist = Number(flag[2]);
  else {
    const spots = [...body.matchAll(POS)];
    const end = spots[spots.length - 1];
    if (!end) return 0;
    const at = (side, n) => (side === end[1] ? Number(n) : 100 - Number(n));
    dist = Math.abs(at(end[1], end[2]) - at(flag[1], flag[2]));
  }
  return dist > 0 && dist < y ? dist : 0;
}

/**
 * @param items  raw plays from ESPN's core play feed
 * @returns { periods: number[], stats: { [period]: { [athleteId]: line } }, livePeriod }
 */
export function buildNflQuarterStats(items) {
  const stats = {};
  const line = (period, id) => ((stats[period] ??= {})[id] ??= blank());
  const seen = new Set();
  const ended = new Set();

  const partsOf = (it) => (it.participants ?? []).map((p) => ({ type: p.type, id: idOf(p) })).filter((p) => p.id);

  // Some plays name a player only in the text ("intended for Z.Flowers"), so
  // learn each name's id from the plays that list both.
  const who = {};
  for (const it of items ?? []) {
    const parts = partsOf(it);
    const text = it.text ?? '';
    const rec = [...new Set(parts.filter((p) => p.type === 'receiver').map((p) => p.id))];
    const to = text.match(new RegExp(`pass [^.]*? to (${NAME})`));
    if (rec.length === 1 && to) who[to[1]] ??= rec[0];
    const run = [...new Set(parts.filter((p) => p.type === 'rusher').map((p) => p.id))];
    const by = text.replace(/\([^)]*\)\s*/g, '').replace(/^.*reported in as eligible\.\s*/, '').match(new RegExp(`^(${NAME}) `));
    if (run.length === 1 && by && !/\bpass\b|sacked/.test(text)) who[by[1]] ??= run[0];
  }

  for (const it of items ?? []) {
    const period = it.period?.number;
    if (!period) continue;
    seen.add(period);
    const type = it.type?.text ?? '';
    if (/^End (Period|of Half|of Game)/i.test(type)) ended.add(period);
    const full = it.text ?? '';
    if (/No Play/i.test(full)) continue;

    // After a review, only the corrected description counts.
    let text = full.includes('REVERSED.') ? full.slice(full.lastIndexOf('REVERSED.') + 9) : full;
    // Two-point tries don't count toward yards or attempts.
    text = text.split(/TWO-POINT CONVERSION ATTEMPT/i)[0];
    const body = text.split(/PENALTY on/)[0];
    let main = body.split(/FUMBLES|Lateral/)[0];

    const parts = partsOf(it);
    const first = (t) => parts.find((p) => p.type === t)?.id ?? null;
    const all = (t) => [...new Set(parts.filter((p) => p.type === t).map((p) => p.id))];
    const L = (id) => line(period, id);
    const named = (re) => who[main.match(re)?.[1]] ?? null;

    const passer = first('passer');
    const rusher = first('rusher');
    const kicker = first('kicker');
    const punter = first('punter');
    const nullified = /TOUCHDOWN NULLIFIED/i.test(text);
    // A bad snap the quarterback picks up and throws is still a pass attempt.
    if (passer && !rusher && !/\bpass\b|spiked|sacked/.test(main) && / pass /.test(body)) main = body.slice(body.lastIndexOf(' pass '));
    const td = /TOUCHDOWN/.test(main) && !nullified;
    const lateral = body.match(new RegExp(`Lateral to (${NAME})[^.]*? for (-?\\d+) yards?`));
    const fix = (y) => (y == null ? y : y - pulledBack(body, text, y, nullified));

    if (passer && /sacked/.test(main)) {
      const y = yards(main) ?? 0;
      L(passer).sk++;
      L(passer).skyds += Math.abs(y);
      const by = all('sackedBy');
      for (const id of by) L(id).sacks += 1 / by.length;
    } else if (passer && /\bpass\b|spiked/.test(main)) {
      const picked = /INTERCEPTED/.test(main);
      const y = fix(yards(main));
      const caught = !picked && !/incomplete|spiked/.test(main) && y != null;
      const p = L(passer);
      p.att++;
      if (picked) {
        p.int++;
        const by = first('returner') ?? first('passDefender');
        if (by) L(by).dint++;
      }
      const receiver = first('receiver') ?? named(new RegExp(`(?:intended for|to) (${NAME})`));
      if (receiver && !/spiked|thrown away/.test(main)) L(receiver).tgt++;
      if (caught) {
        p.cmp++;
        p.pyds += y;
        if (td) p.ptd++;
        if (receiver) {
          const r = L(receiver);
          r.rec++;
          r.recyds += y;
          r.reclong = Math.max(r.reclong ?? -99, y);
          if (td) r.rectd++;
        }
        // Yards after a lateral count for the passer and the player who took it.
        if (lateral) {
          p.pyds += Number(lateral[2]);
          if (who[lateral[1]]) L(who[lateral[1]]).recyds += Number(lateral[2]);
        }
      }
    } else if (rusher) {
      // A fumbled snap is a carry; the feed's own yardage covers what happened next.
      const aborted = /Aborted/.test(body);
      const y = aborted ? Number(it.statYardage) || 0 : fix(yards(main));
      if (y != null || td) {
        const r = L(rusher);
        r.car++;
        r.ryds += y ?? 0;
        r.rlong = Math.max(r.rlong ?? -99, y ?? 0);
        if (td) r.rtd++;
        if (lateral && who[lateral[1]]) L(who[lateral[1]]).ryds += Number(lateral[2]);
      }
    } else if (punter && /punts/.test(main)) {
      const y = Number(main.match(/punts (-?\d+) yards?/)?.[1] ?? 0);
      const p = L(punter);
      p.punts++;
      p.puntyds += y;
      p.puntlong = Math.max(p.puntlong, y);
    } else if (kicker && /field goal/.test(main)) {
      const y = Number(main.match(/(\d+) yard field goal/)?.[1] ?? 0);
      const k = L(kicker);
      k.fga++;
      if (/field goal is GOOD/i.test(main)) {
        k.fgm++;
        k.fglong = Math.max(k.fglong, y);
      }
    }

    // Extra points ride along on the touchdown play.
    if (kicker && /extra point/i.test(text)) {
      const k = L(kicker);
      k.xpa++;
      if (/extra point is GOOD/i.test(text)) k.xpm++;
    } else if (kicker && first('patScorer') === kicker) {
      L(kicker).xpa++;
      L(kicker).xpm++;
    }

    // Defense, on every kind of play (returns and special teams included).
    const tacklers = all('tackler');
    // "(A.Smith, B.Jones)" is a tackle by Smith with help; the feed leaves Smith unlabelled.
    if (!tacklers.length && new RegExp(`\\(${NAME}, [^)]+\\)`).test(body) && first('other')) tacklers.push(first('other'));
    for (const id of tacklers) { L(id).solo++; L(id).tot++; }
    for (const id of all('assistedBy')) L(id).tot++;
    for (const id of all('passDefender')) L(id).pd++;
    for (const id of all('forcedBy')) L(id).ff++;
  }

  const periods = [...seen].sort((a, b) => a - b);
  const last = periods[periods.length - 1];
  return { periods, stats, livePeriod: last && !ended.has(last) ? last : null };
}

const avg = (y, n) => (n ? (y / n).toFixed(1) : '0.0');
const half = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);
const most = (rows, k) => rows.reduce((t, r) => Math.max(t, r[k] ?? -99), -99);

// One entry per box-score section: who belongs in it, how to sort, and the columns.
const GROUPS = [
  {
    key: 'passing', title: 'Passing', labels: ['C/ATT', 'YDS', 'TD', 'INT', 'SACKS'], highlight: 1,
    has: (s) => s.att || s.sk, sort: (s) => s.pyds,
    row: (s) => [`${s.cmp}/${s.att}`, s.pyds, s.ptd, s.int, `${s.sk}-${s.skyds}`],
    total: (r) => [`${sum(r, 'cmp')}/${sum(r, 'att')}`, sum(r, 'pyds'), sum(r, 'ptd'), sum(r, 'int'), `${sum(r, 'sk')}-${sum(r, 'skyds')}`],
  },
  {
    key: 'rushing', title: 'Rushing', labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], highlight: 1,
    has: (s) => s.car, sort: (s) => s.ryds,
    row: (s) => [s.car, s.ryds, avg(s.ryds, s.car), s.rtd, s.rlong ?? 0],
    total: (r) => [sum(r, 'car'), sum(r, 'ryds'), avg(sum(r, 'ryds'), sum(r, 'car')), sum(r, 'rtd'), most(r, 'rlong')],
  },
  {
    key: 'receiving', title: 'Receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], highlight: 1,
    has: (s) => s.rec || s.tgt, sort: (s) => s.recyds * 100 + s.tgt,
    row: (s) => [s.rec, s.recyds, avg(s.recyds, s.rec), s.rectd, s.reclong ?? 0, s.tgt],
    total: (r) => [sum(r, 'rec'), sum(r, 'recyds'), avg(sum(r, 'recyds'), sum(r, 'rec')), sum(r, 'rectd'), Math.max(0, most(r, 'reclong')), sum(r, 'tgt')],
  },
  {
    key: 'defensive', title: 'Defense', labels: ['TOT', 'SOLO', 'SACKS', 'PD', 'INT', 'FF'], highlight: 0,
    has: (s) => s.tot || s.sacks || s.pd || s.dint || s.ff, sort: (s) => s.tot * 100 + s.sacks * 10 + s.pd,
    row: (s) => [s.tot, s.solo, half(s.sacks), s.pd, s.dint, s.ff],
    total: (r) => [sum(r, 'tot'), sum(r, 'solo'), half(sum(r, 'sacks')), sum(r, 'pd'), sum(r, 'dint'), sum(r, 'ff')],
  },
  {
    key: 'kicking', title: 'Kicking', labels: ['FG', 'LONG', 'XP', 'PTS'], highlight: 3,
    has: (s) => s.fga || s.xpa, sort: (s) => s.fgm * 3 + s.xpm,
    row: (s) => [`${s.fgm}/${s.fga}`, s.fglong, `${s.xpm}/${s.xpa}`, s.fgm * 3 + s.xpm],
  },
  {
    key: 'punting', title: 'Punting', labels: ['NO', 'YDS', 'AVG', 'LONG'], highlight: 1,
    has: (s) => s.punts, sort: (s) => s.puntyds,
    row: (s) => [s.punts, s.puntyds, avg(s.puntyds, s.punts), s.puntlong],
  },
];

/**
 * One quarter's box score for one team, in the shape the game page's tables use.
 * @param lines     stats[period] from buildNflQuarterStats
 * @param athletes  that team's players from the full box score (for names and photos)
 */
export function nflQuarterGroups(lines, athletes) {
  const out = [];
  for (const g of GROUPS) {
    const mine = athletes.filter((a) => lines?.[a.id] && g.has(lines[a.id])).sort((x, y) => g.sort(lines[y.id]) - g.sort(lines[x.id]));
    if (!mine.length) continue;
    const raw = mine.map((a) => lines[a.id]);
    out.push({
      key: g.key,
      title: g.title,
      labels: g.labels,
      highlight: g.highlight,
      athletes: mine.map((a) => ({ ...a, stats: g.row(lines[a.id]).map(String) })),
      totals: g.total && mine.length > 1 ? g.total(raw).map(String) : null,
    });
  }
  return out;
}
