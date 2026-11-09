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
