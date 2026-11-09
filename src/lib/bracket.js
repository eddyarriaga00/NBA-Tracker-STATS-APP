// "If the playoffs started today" brackets from current standings seeds.
// A slot is { team } (a real team with .seed) or { label } (a placeholder).
// With `advance`, the better seed wins every game so the whole bracket fills in.

const T = (team) => ({ team });
const L = (label) => ({ label });
const better = (a, b) => (!a?.team ? b : !b?.team ? a : a.team.seed <= b.team.seed ? a : b);
const worse = (a, b) => (better(a, b) === a ? b : a);
// Across conferences, seeds aren't comparable; use win percentage, then seed.
const pct = (t) => parseFloat(t?.pct) || 0;
const betterRecord = (a, b) => (!a?.team ? b : !b?.team ? a : pct(a.team) > pct(b.team) || (pct(a.team) === pct(b.team) && a.team.seed <= b.team.seed) ? a : b);

function seedMap(conf) {
  const m = {};
  for (const t of conf.teams) if (t.seed < 99) m[t.seed] = t;
  return m;
}

function nbaConference(conf, advance) {
  const s = seedMap(conf);
  const has = (n) => !!s[n];
  const short = conf.short ?? conf.name;

  // Play-In: 7v8 (winner is the 7 seed), 9v10, then loser(7v8) v winner(9v10) for the 8 seed.
  const pi1 = { a: T(s[7]), b: T(s[8]), note: 'Winner is the 7 seed' };
  const pi2 = { a: T(s[9]), b: T(s[10]), note: 'Loser is out' };
  const seed7 = advance ? better(pi1.a, pi1.b) : L('Play-In #7');
  const pi3 = advance
    ? { a: worse(pi1.a, pi1.b), b: better(pi2.a, pi2.b), note: 'Winner is the 8 seed' }
    : { a: L('Loser 7/8'), b: L('Winner 9/10'), note: 'Winner is the 8 seed' };
  const seed8 = advance ? better(pi3.a, pi3.b) : L('Play-In #8');

  const r1 = [
    { a: T(s[1]), b: seed8 },
    { a: T(s[4]), b: T(s[5]) },
    { a: T(s[3]), b: T(s[6]) },
    { a: T(s[2]), b: seed7 },
  ];
  const w = (g, label) => (advance ? better(g.a, g.b) : L(label));
  const r2 = [
    { a: w(r1[0], 'Winner 1/8'), b: w(r1[1], 'Winner 4/5') },
    { a: w(r1[2], 'Winner 3/6'), b: w(r1[3], 'Winner 2/7') },
  ];
  const cf = [{ a: w(r2[0], 'Semi winner'), b: w(r2[1], 'Semi winner') }];
  const champ = advance ? better(cf[0].a, cf[0].b) : L(`${short} champ`);

  return {
    name: conf.name,
    short,
    complete: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(has),
    rounds: [
      { name: 'Play-In Tournament', games: [pi1, pi2, pi3] },
      { name: 'First Round', games: r1 },
      { name: 'Conference Semifinals', games: r2 },
      { name: 'Conference Finals', games: cf },
    ],
    champ,
  };
}

function nflConference(conf, advance) {
  const s = seedMap(conf);
  const short = conf.short ?? conf.name;
  const wc = [
    { a: T(s[2]), b: T(s[7]) },
    { a: T(s[3]), b: T(s[6]) },
    { a: T(s[4]), b: T(s[5]) },
  ];
  // Divisional round re-seeds: the 1 seed hosts the lowest remaining seed.
  let div;
  if (advance) {
    const winners = wc.map((g) => better(g.a, g.b)).sort((x, y) => x.team.seed - y.team.seed);
    div = [
      { a: T(s[1]), b: winners[2], note: '1 seed hosts the lowest seed left' },
      { a: winners[0], b: winners[1] },
    ];
  } else {
    div = [
      { a: T(s[1]), b: L('Lowest seed'), note: '1 seed hosts the lowest seed left' },
      { a: L('WC winner'), b: L('WC winner') },
    ];
  }
  const ccg = [{ a: advance ? better(div[0].a, div[0].b) : L('Div. winner'), b: advance ? better(div[1].a, div[1].b) : L('Div. winner') }];
  const champ = advance ? better(ccg[0].a, ccg[0].b) : L(`${short} champ`);
  return {
    name: conf.name,
    short,
    complete: [1, 2, 3, 4, 5, 6, 7].every((n) => !!s[n]),
    bye: T(s[1]),
    // Drawing order for the bracket tree (the bye sits where the 1 seed waits).
    treeFirst: [{ a: T(s[1]), b: L('Bye'), bye: true }, wc[2], wc[1], wc[0]],
    rounds: [
      { name: 'Wild Card', games: wc },
      { name: 'Divisional Round', games: div },
      { name: 'Conference Championship', games: ccg },
    ],
    champ,
  };
}

/** @param confs standings from getStandings (each with .teams having .seed) */
export function buildBracket(lg, confs, { advance = false } = {}) {
  const conferences = confs.map((c) => (lg === 'nfl' ? nflConference(c, advance) : nbaConference(c, advance)));
  const [x, y] = conferences;
  const final = {
    name: lg === 'nfl' ? 'Super Bowl' : 'NBA Finals',
    a: x?.champ ?? L('Champion'),
    b: y?.champ ?? L('Champion'),
  };
  final.winner = advance && final.a.team && final.b.team ? betterRecord(final.a, final.b) : null;
  return { conferences, final };
}

// ---------- Actual playoff results (past seasons, or playoffs in progress) ----------
// games: [{ id, date, round, state, teams: [{ id, score, winner }] }] (from getPlayoffGames)

const pairKey = (a, b) => [a, b].sort().join('-');

/**
 * Before ~2008 ESPN labels every NBA playoff game just "PLAYOFFS" (and the
 * Finals "FINALS"). Work out each series' round from the seeds instead, so the
 * bracket can be drawn the same way. First rounds were best-of-5 until 2003,
 * so a series is won by whoever won more games (these seasons are all over).
 */
function labelOldNbaRounds(confs, games) {
  if (games.some((g) => /1st round|semifinals|play-in/i.test(g.round))) return { games, need: {} };
  const series = {};
  for (const g of games) {
    if (g.teams.length !== 2) continue;
    const k = pairKey(g.teams[0].id, g.teams[1].id);
    const s = (series[k] ??= { key: k, ids: g.teams.map((t) => t.id), first: g.date, wins: {} });
    if (g.date < s.first) s.first = g.date;
    const w = g.teams.find((t) => t.winner);
    if (w) s.wins[w.id] = (s.wins[w.id] ?? 0) + 1;
  }
  // A team's first series is round 1, its second round 2, and so on.
  const byTeam = {};
  for (const s of Object.values(series)) for (const id of s.ids) (byTeam[id] ??= []).push(s);
  for (const list of Object.values(byTeam)) list.sort((a, b) => (a.first < b.first ? -1 : 1)).forEach((s, i) => (s.round = Math.max(s.round ?? 0, i + 1)));
  const confOf = (id) => confs.findIndex((c) => c.teams.some((t) => t.id === id));
  const label = {};
  const need = {};
  for (const s of Object.values(series)) {
    const [a, b] = s.ids.map(confOf);
    const tag = /east/i.test(confs[a]?.name ?? '') ? 'East' : 'West';
    label[s.key] = a !== b || s.round >= 4 ? 'NBA Finals' : `${tag} ${['1st Round', 'Semifinals', 'Finals'][s.round - 1]}`;
    // These seasons are over: whoever won more games won the series (first rounds were best-of-5 until 2003).
    need[`series|${s.key}`] = Math.max(...Object.values(s.wins), 1);
  }
  const out = games.map((g) => {
    const k = g.teams.length === 2 ? pairKey(g.teams[0].id, g.teams[1].id) : '';
    return label[k] ? { ...g, round: label[k] } : g;
  });
  return { games: out, need };
}

/** NBA: series by round; NFL: single games. Returns the same shape as buildBracket, with results. */
export function buildActualBracket(lg, confs, gamesIn) {
  // Old NFL seasons number seeds across the whole league (1-16); re-rank within each conference.
  if (lg === 'nfl' && confs.some((c) => c.teams.some((t) => t.seed > 7 && t.seed < 99) && !c.teams.some((t) => t.seed === 1))) {
    confs = confs.map((c) => {
      const order = [...c.teams].sort((a, b) => a.seed - b.seed);
      return { ...c, teams: c.teams.map((t) => ({ ...t, seed: t.seed < 99 ? order.indexOf(t) + 1 : t.seed })) };
    });
  }
  const byId = {};
  for (const c of confs) for (const t of c.teams) byId[t.id] = { ...t };
  const { games, need: oldNeed } = lg === 'nba' ? labelOldNbaRounds(confs, gamesIn) : { games: gamesIn, need: {} };
  const slotFor = (id, value, seedOverride) =>
    byId[id] ? { team: { ...byId[id], seed: seedOverride ?? byId[id].seed }, value } : { label: 'TBD' };

  // Group into matchups: NBA series (many games) or NFL single games.
  const matchups = {};
  for (const g of games) {
    if (g.teams.length !== 2) continue;
    const [x, y] = g.teams;
    // "East 1st Round - Game 3" -> series name. ESPN mixes dash styles (- – —), so accept any.
    const round = g.round.replace(/\s*[-\u2013\u2014]\s*Game\s*\d+\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase() // labels vary in case too
      .replace(/\b(east|west)ern conference\b/, '$1') // 2008-16: "Eastern Conference 1st Round"
      .replace(/\bfirst round\b/, '1st round');
    // Outside the Play-In two teams meet at most once a postseason, so a series is
    // keyed by the pair alone (2007-08 changes label mid-series).
    const key = lg === 'nba' && !/play-in|place|seed game/.test(round) ? `series|${pairKey(x.id, y.id)}` : `${round}|${pairKey(x.id, y.id)}`;
    const m = (matchups[key] ??= { round, ids: [x.id, y.id], wins: { [x.id]: 0, [y.id]: 0 }, scores: {}, live: false, played: 0, need: oldNeed[key] });
    if (m.round === 'playoffs' && round !== 'playoffs') m.round = round; // keep the specific label
    if (g.state === 'post') {
      m.played++;
      const w = g.teams.find((t) => t.winner);
      if (w) m.wins[w.id] = (m.wins[w.id] ?? 0) + 1;
    }
    if (g.state === 'in') m.live = true;
    for (const t of g.teams) m.scores[t.id] = t.score;
  }
  const list = Object.values(matchups);
  const find = (re, ids) => list.find((m) => re.test(m.round) && (!ids || ids.some((id) => m.ids.includes(id))));

  const needed = lg === 'nfl' ? 1 : 4;
  const game = (m, seedOf) => {
    if (!m) return null;
    const [p, q] = m.ids;
    const sp = seedOf?.(p) ?? byId[p]?.seed ?? 99;
    const sq = seedOf?.(q) ?? byId[q]?.seed ?? 99;
    const [a, b] = sp <= sq ? [p, q] : [q, p];
    // NFL and Play-In games show the score; NBA series show games won.
    const val = (id) => (lg === 'nfl' || /play-in/i.test(m.round) ? m.scores[id] : m.wins[id]);
    const single = lg === 'nfl' || /play-in/i.test(m.round);
    const need = single ? 1 : m.need || needed;
    const done = Math.max(m.wins[a], m.wins[b]) >= need;
    const win = done ? (m.wins[a] >= need ? 'a' : 'b') : null;
    return {
      a: slotFor(a, val(a), seedOf?.(a)),
      b: slotFor(b, val(b), seedOf?.(b)),
      win,
      live: m.live,
      winnerId: win ? (win === 'a' ? a : b) : null,
    };
  };
  const tbd = (label = 'TBD') => ({ a: { label }, b: { label }, win: null });
  const winnerSlot = (g) => (g?.win ? g[g.win] : null);

  const conferences = confs.map((conf) => {
    const short = conf.short ?? conf.name;
    const tag = lg === 'nfl' ? (/american/i.test(conf.name) ? 'AFC' : 'NFC') : /east/i.test(conf.name) ? 'East' : 'West';
    const seedTeam = (n) => conf.teams.find((t) => t.seed === n)?.id;
    const inConf = (id) => conf.teams.some((t) => t.id === id);

    if (lg === 'nba') {
      // Play-In: the 7/8 winner is the 7 seed; the 8th Seed Game winner is the 8 seed.
      const pi = (re) => list.find((m) => re.test(m.round) && new RegExp(tag, 'i').test(m.round));
      const m78 = pi(/7th Place vs 8th Place/i);
      const m910 = pi(/9th Place vs 10th Place/i);
      const m8 = pi(/8th Seed Game/i);
      // Who entered the Play-In as 7/8/9/10: better regular-season record first
      // (ties fall back to ESPN's order).
      const piSeed = {};
      const rank = (m, first) => {
        if (!m) return;
        const [p, q] = [...m.ids].sort((x, y) => (parseFloat(byId[y]?.pct) || 0) - (parseFloat(byId[x]?.pct) || 0) || (byId[x]?.seed ?? 99) - (byId[y]?.seed ?? 99));
        piSeed[p] = first;
        piSeed[q] = first + 1;
      };
      rank(m78, 7);
      rank(m910, 9);
      const piSeedOf = (id) => piSeed[id];
      const g78 = game(m78, piSeedOf);
      const g910 = game(m910, piSeedOf);
      const g8 = game(m8, piSeedOf);
      const seven = g78?.winnerId;
      const eight = g8?.winnerId;
      const seedOf = (id) => (id === seven ? 7 : id === eight ? 8 : undefined);
      const order = [[seedTeam(1)], [seedTeam(4), seedTeam(5)], [seedTeam(3), seedTeam(6)], [seedTeam(2)]];
      const firstRe = new RegExp(`${tag} 1st Round`, 'i');
      const r1m = order.map((ids) => (ids.some(Boolean) ? find(firstRe, ids.filter(Boolean)) : null));
      // Old seasons can be missing seeds: place any series not found by seed in the empty slots.
      const spare = list.filter((m) => firstRe.test(m.round) && !r1m.includes(m));
      const r1 = r1m.map((m) => game(m ?? spare.shift(), seedOf) ?? tbd());
      const top = [r1[0], r1[1]].flatMap((g) => [g.a?.team?.id, g.b?.team?.id]).filter(Boolean);
      const bottom = [r1[2], r1[3]].flatMap((g) => [g.a?.team?.id, g.b?.team?.id]).filter(Boolean);
      const r2 = [
        game(find(new RegExp(`${tag} Semifinals`, 'i'), top), seedOf) ?? tbd(),
        game(find(new RegExp(`${tag} Semifinals`, 'i'), bottom), seedOf) ?? tbd(),
      ];
      const cf = game(find(new RegExp(`${tag} Finals`, 'i')), seedOf) ?? tbd();
      return {
        name: conf.name,
        short,
        complete: true,
        actual: true,
        hasPlayIn: !!(m78 || m910 || m8), // the Play-In started in 2020-21
        rounds: [
          { name: 'Play-In Tournament', games: [g78 ?? tbd(), g910 ?? tbd(), g8 ?? tbd()].map((g, i) => ({ ...g, note: ['Winner is the 7 seed', 'Loser is out', 'Winner is the 8 seed'][i] })) },
          { name: 'First Round', games: r1 },
          { name: 'Conference Semifinals', games: r2 },
          { name: 'Conference Finals', games: [cf] },
        ],
        champ: winnerSlot(cf) ?? { label: `${short} champ` },
      };
    }

    // NFL: single games; the 1 seed has a bye; divisional round re-seeds.
    const confGames = (re) => list.filter((m) => re.test(m.round) && m.ids.every(inConf));
    const wc = confGames(/wild card/i).map((m) => game(m));
    const slotWith = (seeds) => wc.find((g) => seeds.includes(g.a?.team?.seed) || seeds.includes(g.b?.team?.seed)) ?? tbd();
    const div = confGames(/divisional/i).map((m) => game(m));
    const divTop = div.find((g) => g.a?.team?.seed === 1 || g.b?.team?.seed === 1) ?? tbd();
    const divBottom = div.find((g) => g !== divTop) ?? tbd();
    const ccg = confGames(/championship/i).map((m) => game(m))[0] ?? tbd();
    const one = byId[seedTeam(1)];
    const two = byId[seedTeam(2)];
    // Before 2020, six teams made it per conference and the top two seeds had byes.
    const twoByes = wc.length === 2 && !wc.some((g) => g.a?.team?.seed === 2 || g.b?.team?.seed === 2);
    const byeGame = (t, n) => ({ a: t ? { team: t } : { label: `${n} seed` }, b: { label: 'Bye' }, bye: true });
    return {
      name: conf.name,
      short,
      complete: true,
      actual: true,
      byes: twoByes ? 2 : 1,
      bye: one ? { team: one } : { label: 'TBD' },
      treeFirst: [byeGame(one, 1), slotWith([4, 5]), slotWith([3, 6]), twoByes ? byeGame(two, 2) : slotWith([2, 7])],
      rounds: [
        { name: 'Wild Card', games: wc },
        { name: 'Divisional Round', games: [divTop, divBottom] },
        { name: 'Conference Championship', games: [ccg] },
      ],
      champ: winnerSlot(ccg) ?? { label: `${short} champ` },
    };
  });

  const finalM = lg === 'nfl' ? list.find((m) => /super bowl/i.test(m.round)) : list.find((m) => /nba finals/i.test(m.round));
  const fg = game(finalM);
  const final = {
    name: lg === 'nfl' ? 'Super Bowl' : 'NBA Finals',
    a: fg?.a ?? conferences[0]?.champ ?? { label: 'Champion' },
    b: fg?.b ?? conferences[1]?.champ ?? { label: 'Champion' },
    win: fg?.win ?? null,
    live: fg?.live,
  };
  final.winner = fg?.win ? fg[fg.win] : null;
  return { conferences, final, actual: true, started: games.some((x) => x.state !== 'pre' && x.teams.every((t) => byId[t.id])) };
}

// ---------- Plain results list (old seasons whose seeds ESPN doesn't have) ----------

/** True when an actual bracket has every spot filled and a champion. */
export function bracketComplete(lg, b) {
  if (!b?.final?.winner) return false;
  const filled = (g) => g?.bye || (g?.a?.team && g?.b?.team && g.win);
  return b.conferences.every((c) =>
    lg === 'nfl'
      ? [...c.treeFirst, ...c.rounds.slice(1).flatMap((r) => r.games)].every(filled)
      : c.rounds.filter((r) => c.hasPlayIn || !/play-in/i.test(r.name)).every((r) => r.games.every(filled))
  );
}

/**
 * Playoff results grouped by round, newest round first, without needing seeds.
 * NBA rows are series (games won); NFL rows are games (final score).
 */
export function playoffResults(lg, confs, gamesIn, season) {
  const abbrOf = {};
  for (const c of confs) for (const t of c.teams) abbrOf[t.id] = t.abbr;
  const games = (lg === 'nba' ? labelOldNbaRounds(confs, gamesIn).games : gamesIn).filter((g) => g.teams.length === 2 && g.state === 'post');
  const NFL_ROUNDS = ['Wild Card', 'Divisional Round', 'Conference Championships', 'Super Bowl'];
  // NFL rounds without a label: count weekends back from the Super Bowl.
  const weekends = [...new Set(games.map((g) => Math.floor((Date.parse(g.date) - 4 * 864e5) / (7 * 864e5))))].sort((a, b) => a - b);
  const nflRound = (g) => {
    const r = g.round;
    if (/super bowl/i.test(r)) return 'Super Bowl';
    if (/championship/i.test(r)) return 'Conference Championships';
    if (/divisional/i.test(r)) return 'Divisional Round';
    if (/wild ?card/i.test(r)) return 'Wild Card';
    const wk = Math.floor((Date.parse(g.first ?? g.date) - 4 * 864e5) / (7 * 864e5));
    return NFL_ROUNDS[NFL_ROUNDS.length - (weekends.length - weekends.indexOf(wk))] ?? 'Playoffs';
  };
  const nbaRound = (r) => {
    const x = r.toLowerCase().replace(/\b(east|west)ern conference\b/, '$1').replace(/first round/, '1st round');
    if (/nba finals|^finals?$/.test(x)) return 'NBA Finals';
    const side = /east/.test(x) ? 'East' : /west/.test(x) ? 'West' : '';
    const name = /1st round/.test(x) ? 'First Round' : /semifinal/.test(x) ? 'Semifinals' : /finals/.test(x) ? 'Conference Finals' : /play-in|place|seed game/.test(x) ? 'Play-In' : 'Playoffs';
    return { name, side };
  };
  const rows = {};
  for (const g of games) {
    const [x, y] = g.teams;
    const key = lg === 'nba' && !/play-in|place|seed game/i.test(g.round) ? pairKey(x.id, y.id) : g.id;
    const r = (rows[key] ??= { key, first: g.date, ids: [x.id, y.id], wins: { [x.id]: 0, [y.id]: 0 }, scores: {}, round: g.round, id: g.id });
    if (/^playoffs$/i.test(r.round) && !/^playoffs$/i.test(g.round)) r.round = g.round;
    if (g.date < r.first) r.first = g.date;
    const w = g.teams.find((t) => t.winner);
    if (w) r.wins[w.id]++;
    for (const t of g.teams) r.scores[t.id] = t.score;
  }
  const order = lg === 'nfl' ? NFL_ROUNDS : ['Play-In', 'First Round', 'Semifinals', 'Conference Finals', 'NBA Finals'];
  const groups = {};
  for (const r of Object.values(rows)) {
    const rn = lg === 'nfl' ? nflRound(r) : nbaRound(r.round);
    const name = typeof rn === 'string' ? rn : rn.name;
    const [p, q] = r.ids;
    const val = (id) => (lg === 'nfl' || name === 'Play-In' ? r.scores[id] : r.wins[id]);
    // A series that never reached the wins needed is missing games in ESPN's records.
    const needWins = lg === 'nfl' || name === 'Play-In' ? 1 : name === 'First Round' && season < 2003 ? 3 : 4;
    const complete = lg === 'nfl' || name === 'Play-In' || Math.max(r.wins[p], r.wins[q]) >= needWins;
    const winner = !complete || val(p) === val(q) ? null : val(p) > val(q) ? p : q;
    const [a, b] = winner === q || (!winner && (val(q) ?? 0) > (val(p) ?? 0)) ? [q, p] : [p, q];
    if (!abbrOf[a] || !abbrOf[b]) continue; // ESPN sometimes lists a game against an unknown team
    (groups[name] ??= []).push({
      key: r.key,
      gameId: r.id,
      first: r.first,
      side: typeof rn === 'string' ? '' : rn.side,
      a: { id: a, abbr: abbrOf[a] ?? '', value: val(a) },
      b: { id: b, abbr: abbrOf[b] ?? '', value: val(b) },
      won: !!winner,
      incomplete: !complete,
    });
  }
  return Object.entries(groups)
    .sort(([x], [y]) => order.indexOf(y) - order.indexOf(x))
    .map(([name, items]) => ({ name, items: items.sort((u, v) => u.side.localeCompare(v.side) || (u.first < v.first ? -1 : 1)) }));
}
