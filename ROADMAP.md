# Roadmap

Where the app stands, what has to happen before a public release, and what could come after.
Last updated: November 26, 2026.

Live today: https://eddyarriaga00.github.io/NBA-Tracker-STATS-APP/ (a web app you can add to the Home Screen).

---

## 1. Done

**Scores and games**
- NBA by day, NFL by week, live games first; seasons back to the 1980s for history, 2017 for most stats
- Live scores pushed from ESPN's Fastcast feed (about a second behind), with polling as a fallback
- Game pages: score by quarter, one lead / win-probability chart, player of the game, box scores for both teams (NFL grouped so both teams' passers, rushers and receivers sit together), quarter-by-quarter player stats, plays and drives, NBA shot charts, injuries, previews, venue and TV
- Cards show records, streaks, last 5, injuries, broadcast, a "thriller" tag, and a team-colour edge on the winner
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

---

## 2. Needed before a public release

These are the things that could hurt you, the app or its users if it went public as it is. Ordered by importance.

### Must do

| # | What | Why |
|---|------|-----|
| 1 | **Rename the app** (no "NBA" or "NFL" in the name or icon) | Both are registered trademarks. A public app named "NBA Tracker" is likely to get a takedown, and the App Store rejects it outright. Team logos have the same issue: fine for a personal app, riskier for a public one. |
| 2 | **Decide on the data source** | Everything comes from ESPN's unofficial, undocumented feeds. They have no terms allowing this use, can change without notice (the summary feed already broke once), and can block the app. For a real release, either accept the risk knowingly or budget for a licensed feed (Sportradar, SportsDataIO, API-Sports, etc.). |
| 3 | **Privacy policy and terms of use** | The app stores accounts, emails, messages and push subscriptions. A privacy policy is legally required in most places and by both app stores. |
| 4 | **Moderation for chat, comments and messages** | Report a message, block a user, a word filter, and a way for you to remove content and ban accounts. Required by the App Store for any app with user content, and needed anyway once strangers join. |
| 5 | **Delete my account** | Users must be able to delete their account and data from inside the app (App Store rule, and GDPR/CCPA). |
| 6 | **Security review of the database rules** | Check every Supabase table's row-level security so nobody can read other people's messages or edit other people's picks. Add rate limits on comments, messages and friend requests. |
| 7 | **Real-device testing** | Most testing so far was in a desktop browser at phone and tablet sizes. Needs a pass on a real iPhone, an Android phone and an iPad, especially: alerts, transitions, pull to refresh, sign-in, offline. |
| 8 | **Test during live games** | Rolling scores, Fastcast updates for NFL, and alert speed haven't been watched end to end during a live game yet. |

### Should do

| # | What | Why |
|---|------|-----|
| 9 | **Error reporting** (e.g. Sentry, free tier) | Today you only find out about a crash if someone tells you. |
| 10 | **Basic analytics** (privacy-friendly, e.g. Plausible or PostHog) | To know which pages people use and where they drop off. |
| 11 | **Automated tests and CI** | There are no tests. A few checks on the ESPN data parsing and a build check on every push would catch most regressions. |
| 12 | **Supabase plan** | The free plan pauses a project after a week without activity and has limits on realtime connections and function calls. A public launch needs the paid plan (about $25/month) or a close eye on usage. |
| 13 | **Own domain** | A custom domain (e.g. yourapp.com) instead of github.io looks more trustworthy and keeps the app's address if hosting changes. |
| 14 | **GitHub sign-in** | Half set up: needs a GitHub OAuth app and `scripts/enable-github-login.sh`. Or drop it; Google and email are enough. |
| 15 | **Accessibility pass** | Screen-reader labels, contrast in light mode, larger text support. |
| 16 | **Speed** | The main bundle is about 490 KB; splitting it would make the first load faster on slow connections. |

### Decide

- **Web app only, or the app stores too?** The web app works today with no review. App Store / Play Store means wrapping it (e.g. Capacitor), a $99/year Apple developer account, and passing review: items 1–5 become hard requirements.
- **Free, ads, or paid?** Any money involved raises the stakes on items 1 and 2.

---

## 3. Suggested order

1. **Week 1:** new name and icon, privacy policy and terms, delete-account button
2. **Week 2:** report / block / word filter, database security review, rate limits
3. **Week 3:** error reporting, analytics, real-device and live-game testing, fix what turns up
4. **Week 4:** own domain, Supabase plan, soft launch to friends, then wider

---

## 4. Ideas for after launch

- NBA box score with both teams side by side, like NFL
- Head-to-head history between two teams
- A player's games against a specific opponent
- Playoff odds and a "what if" playoff predictor
- Fantasy-style stat alerts for chosen players
- Group Pick'em leagues with invites and season standings
- Home Screen widgets (needs the app-store version)
- More leagues (college football and basketball, MLB, NHL); no WNBA
