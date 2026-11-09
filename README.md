# 🏀🏈 NBA Tracker

A clean, Apple-style sports app for NBA and NFL with live scores, box scores, player and team pages, standings, league leaders, and live comments for you and your friends. Built with **React + Vite + Tailwind CSS**.

> Designed and developed by **Eddy Arriaga-B** 💻

## Features

- **NBA and NFL**: switch leagues from the header
- **Live scores**: NBA by day, NFL by week. Live games refresh on their own. NFL shows who has the ball, down and distance, and red zone.
- **Game pages**: score by quarter, full box score, team stat comparison, NBA play-by-play, NFL drive chart and scoring plays, game leaders, venue and TV
- **Player pages**: season stats with league rank, bio, game log with chart, splits, career stats by season, latest news
- **Team pages**: record, next game, last 5, full schedule and results, roster with injuries
- **Standings**: NBA conferences with playoff and play-in lines; NFL divisions and playoff picture
- **League leaders** for every major stat
- **Search** any NBA or NFL player or team (press `/` or `⌘K`)
- **Comments**: a live thread on every game plus a general chat, with emoji reactions
- **Light and dark mode** that follows your system, or pick one
- Works great on phones (bottom tab bar) and desktop

Sports data comes from ESPN's public feeds. No API key needed.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Set up comments (about 2 minutes)

Comments are stored in a free [Supabase](https://supabase.com) database so everyone sees the same messages live.

1. Create a free project at supabase.com.
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins**. (People pick a nickname; no passwords.)
4. Open **Project Settings → API Keys** and copy the **Project URL** and the **publishable** (or **anon public**) key. Never use the secret / service_role key in the app.
5. Copy `.env.example` to `.env.local` and paste both values in.
6. Run `npm run check:comments`. It tests posting, reactions, deleting, and security, and links straight to anything that needs fixing.
7. Restart `npm run dev`.

The anon key is designed to be public. The database rules only let people post, react, and delete as themselves, and limit spam to 6 messages per 30 seconds.

## Deploy to GitHub Pages

```bash
npm run deploy
```

Your `.env.local` values are baked into the build, so comments work on the live site too.
