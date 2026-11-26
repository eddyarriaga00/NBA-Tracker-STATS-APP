# Roadmap

Where the app stands, what's left to make it feel finished, and what could come after. A web app for me and my friends.
Last updated: November 26, 2026 (evening).

Live today: https://eddyarriaga00.github.io/NBA-Tracker-STATS-APP/ (a web app you can add to the Home Screen).

---

## 1. Done

**Scores and games**
- NBA by day, NFL by week, live games first; seasons back to the 1980s for history, 2017 for most stats
- Live scores pushed from ESPN's Fastcast feed (about a second behind), with polling as a fallback
- Game pages: score by quarter, one lead / win-probability chart, player of the game, box scores that put both teams together (NFL by passing, rushing, receiving…; NBA starters with starters and bench with bench on phones, plus a two-team totals table), quarter-by-quarter player stats, plays and drives, NBA shot charts, injuries, previews, venue and TV
- Cards show records, streaks, last 5, injuries, broadcast, a "thriller" tag, and a team-colour edge on the winner
- Betting lines (DraftKings via ESPN): spread and total on upcoming cards; spread, total and moneyline with prices, line movement, implied win chance, and after the game who covered and whether it went over; season series on every game
- Postponed, cancelled, time-TBD and score-less old games are labelled correctly

**Players and teams**
- Player pages: season stats with league rank, bio, game log, best games of the career, career table with title seasons and awards marked, Awards section, compare two players
- Team pages: record and facts, next game, last 5, schedule, roster (past seasons too), moves and trades, franchise history, titles, past seasons, comments
- Standings, playoff bracket (live and past seasons), league leaders, season awards, trades and moves for both leagues

**People**
- Nickname accounts, email sign-in and Google sign-in, profiles, friends, private messages, group chat, game and team comments, Pick'em league

**Alerts**
- Server alerts even when the app is closed: game starts, halftime, finals, close games, big performances, trades, chat; for your teams or all games
- One live score notification per game that keeps updating; the icon badge and the Friends badge start from zero each day

**App feel**
- Phone, iPad and laptop layouts; light and dark mode; offline copy of your last scores; updates itself when a new version is out
- Page transitions, pull to refresh, rolling score digits, Back keeps your place, no zooming or overscroll, a tip to add the app to the Home Screen
- Spoiler-free mode, calendar export, search for players, teams, games and people

**Trust and safety**
- Privacy page (Settings → Privacy)
- Delete account, or Delete my data for guests: removes profile, photo, messages, friends, picks, comments, reactions and alerts
- Mute someone from their profile to hide their chat and comments; delete your own comments and messages; unfriend stops private messages
- Crash reports go to an `error_log` table in Supabase (no outside service), kept 30 days
- Database rules checked: every table locked down, private messages readable only by the two people, picks locked at kick-off

---

## 2. Getting it to "finished"

The app is a web app for me and my friends, not a public or app-store release. So "finished" means polished and dependable: nothing breaks, alerts arrive, it feels great on our phones. Trademark, app-store and legal items only matter if that changes (see the end of this section).

### Make it dependable

| # | What | Why |
|---|------|-----|
| 1 | **Test on real phones during live games** | Most testing has been in a desktop browser. Needs a real iPhone (installed on the Home Screen) and an Android phone during a live NBA and NFL game: rolling scores, NFL push updates, alert speed, transitions, pull to refresh, the bottom bar. |
| 2 | **ESPN fallback** | The app depends on ESPN's unofficial feeds. When one breaks, the page should fall back to another feed or say clearly what's missing (done for game pages; extend to the rest). |
| 3 | **A few automated checks** | Tests for the ESPN data parsing and a build check on every push, so a fix in one place doesn't break another. |
| 4 | **Late Pick'em picks** | The database trusts the game time the app sends, so someone could add a pick after a game started by faking a later start. Fine among friends; fixable by checking the real start time when grading. |

### Make it polished

| # | What |
|---|------|
| 5 | Faster first load (the main bundle is about 490 KB) |
| 6 | Light-mode and larger-text pass |
| 7 | Finish GitHub sign-in or drop it (Google and email are enough) |
| 8 | Optional: own domain instead of github.io |

### Only if it ever goes public

Rename it without "NBA"/"NFL" (trademarks), terms of use, report and moderation tools, a licensed data feed, a paid Supabase plan, and app-store review if wrapped as an app.

---

## 3. Suggested order

1. **Next:** real-phone testing during live games, fix what turns up; check `error_log` now and then
2. **Then:** ESPN fallbacks on every page, a few automated checks, faster first load
3. **Ongoing:** ideas below

Supabase stays awake on its own: the alert job runs every minute.

---

## 4. Ideas

- Head-to-head history between two teams
- A player's games against a specific opponent
- Playoff odds and a "what if" playoff predictor
- Fantasy-style stat alerts for chosen players
- Group Pick'em leagues with invites and season standings
- Home Screen widgets (needs the app-store version)
- More leagues (college football and basketball, MLB, NHL); no WNBA
