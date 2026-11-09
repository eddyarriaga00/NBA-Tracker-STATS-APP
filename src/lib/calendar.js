// Builds .ics calendar files so games can be added to Apple/Google/Outlook calendars.
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
// Lines over 75 octets must be folded per RFC 5545.
const fold = (line) => (line.length <= 73 ? line : line.match(/.{1,73}/g).join('\r\n '));

const LENGTH_MIN = { nba: 150, nfl: 195 };

/** @param games [{ id, league, date, title, location, url }] */
export function buildICS(games, calName = 'Games') {
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NBA Tracker//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const g of games) {
    const start = new Date(g.date);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + (LENGTH_MIN[g.league] ?? 180) * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${g.league}-${g.id}@nba-tracker`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(g.title)}`),
      ...(g.location ? [fold(`LOCATION:${esc(g.location)}`)] : []),
      ...(g.url ? [fold(`URL:${g.url}`), fold(`DESCRIPTION:${esc(g.url)}`)] : []),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Game starts in 30 minutes', 'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadICS(games, fileName, calName) {
  const blob = new Blob([buildICS(games, calName)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const gameUrl = (lg, id) => `${location.origin}${location.pathname}#/${lg}/game/${id}`;
