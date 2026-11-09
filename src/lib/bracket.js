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

/** NBA: series by round; NFL: single games. Returns the same shape as buildBracket, with results. */
export function buildActualBracket(lg, confs, games) {
  const byId = {};
  for (const c of confs) for (const t of c.teams) byId[t.id] = { ...t };
  const slotFor = (id, value, seedOverride) =>
    byId[id] ? { team: { ...byId[id], seed: seedOverride ?? byId[id].seed }, value } : { label: 'TBD' };

  // Group into matchups: NBA series (many games) or NFL single games.
  const matchups = {};
  for (const g of games) {
    if (g.teams.length !== 2) continue;
    const [x, y] = g.teams;
    // "East 1st Round - Game 3" -> series name. ESPN mixes dash styles (- – —), so accept any.
    const round = g.round.replace(/\s*[-\u2013\u2014]\s*Game\s*\d+\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase(); // labels vary in case too
    const key = `${round}|${pairKey(x.id, y.id)}`;
    const m = (matchups[key] ??= { round, ids: [x.id, y.id], wins: { [x.id]: 0, [y.id]: 0 }, scores: {}, live: false, played: 0 });
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
    const need = single ? 1 : needed;
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
      const r1 = order.map((ids) => game(find(new RegExp(`${tag} 1st Round`, 'i'), ids.filter(Boolean)), seedOf) ?? tbd());
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
