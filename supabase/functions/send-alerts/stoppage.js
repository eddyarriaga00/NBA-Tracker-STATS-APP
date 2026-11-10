// Is play stopped right now, and why? Read from ESPN's most recent play
// ({ type: { text }, text }). Shared by the alert server and the app.
// Returns { kind: 'timeout' | 'injury' | 'review' | 'break', icon, label } or null.

const tidy = (s) => s.replace(/\s+/g, ' ').trim();

export function stoppage(play) {
  const type = play?.type?.text ?? '';
  const text = tidy(play?.text ?? '');
  if (!type && !text) return null;

  // NFL play-by-play names the injured player: "ATL-D.Deablo was injured during the play."
  const hurt = text.match(/([A-Z]{2,4})-([A-Z][\w.' -]+?) was injured during the play/);
  if (hurt) return { kind: 'injury', icon: '🚑', label: `Injury timeout · ${hurt[2]} (${hurt[1]})` };
  if (/injur/i.test(type)) return { kind: 'injury', icon: '🚑', label: 'Injury timeout' };

  if (/two.minute warning/i.test(type + text)) return { kind: 'timeout', icon: '⏸', label: 'Two-minute warning' };
  if (/timeout/i.test(type)) {
    // "Hawks Full timeout" · "Timeout #2 by ATL at 01:19." · "Official Timeout at 07:51."
    const nfl = text.match(/Timeout #(\d) by ([A-Z]{2,4})/);
    if (nfl) return { kind: 'timeout', icon: '⏸', label: `Timeout · ${nfl[2]} (their ${['1st', '2nd', '3rd'][nfl[1] - 1] ?? `#${nfl[1]}`})` };
    if (/official/i.test(type + text)) return { kind: 'timeout', icon: '⏸', label: 'Official timeout' };
    const nba = text.match(/^(.+?)\s+(full|20 sec\w*|short)?\s*timeout/i);
    return { kind: 'timeout', icon: '⏸', label: nba ? `Timeout · ${nba[1]}` : 'Timeout' };
  }
  if (/challenge|replay|review/i.test(type)) {
    const result = type.match(/\((.+?)\)/)?.[1] ?? text.match(/CALL (OVERTURNED|STANDS|UPHELD|SUPPORTED)/i)?.[1];
    if (result) return { kind: 'review', icon: '🔍', label: `Review done · ${/overturn|reversed/i.test(result) ? 'call overturned' : 'call stands'}` };
    const who = text.match(/^(.+?)\s+coach'?s challenge/i)?.[1];
    return { kind: 'review', icon: '🔍', label: who ? `Under review · ${who} challenge` : 'Under review' };
  }
  // NFL reviews are written into the play they change.
  const nflReview = text.match(/(\w[\w .]*?) challenged the (.+?) ruling, and the play was (REVERSED|Upheld)/i);
  if (nflReview) return { kind: 'review', icon: '🔍', label: `Challenge by ${tidy(nflReview[1])} · ${/reversed/i.test(nflReview[3]) ? 'call reversed' : 'call stands'}` };
  if (/Replay Official reviewed/i.test(text)) return { kind: 'review', icon: '🔍', label: `Replay review · ${/reversed/i.test(text) ? 'call reversed' : 'call stands'}` };

  if (/^end (period|of half)/i.test(type) || /^end of the \d\w+ (quarter|half)/i.test(text)) {
    const which = text.match(/end of the (\d\w+ \w+)/i)?.[1] ?? (text.match(/END QUARTER (\d)/i) ? `${['1st', '2nd', '3rd', '4th'][text.match(/END QUARTER (\d)/i)[1] - 1]} quarter` : '');
    return { kind: 'break', icon: '⏸', label: /^2nd/i.test(which) ? 'Halftime' : which ? `End of the ${which.toLowerCase()}` : 'Break' };
  }
  if (/delay/i.test(type) && !/delay of game/i.test(type + text)) return { kind: 'break', icon: '⏸', label: 'Game delayed' };
  return null;
}

/** The most recent play in a game summary (NBA: plays; NFL: the current drive). */
export function lastPlay(summary) {
  const plays = summary?.plays;
  if (plays?.length) return plays[plays.length - 1];
  const cur = summary?.drives?.current?.plays;
  if (cur?.length) return cur[cur.length - 1];
  const prev = summary?.drives?.previous;
  const d = prev?.[prev.length - 1]?.plays;
  return d?.length ? d[d.length - 1] : summary?.situation?.lastPlay ?? null;
}
