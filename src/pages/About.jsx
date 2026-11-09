import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { PageTitle } from '../components/ui';

const LINKEDIN = 'https://www.linkedin.com/in/eddy-arriaga/';

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

const PILLARS = [
  { title: 'Fast and clean', text: 'Scores, box scores and stats in a tap. No ads, no clutter, no autoplay videos.' },
  { title: 'Every stat that matters', text: 'NBA and NFL standings, leaders, player careers and team history going back to 2017.' },
  { title: 'Never miss a moment', text: 'Alerts for tip-off, halftime, finals, close games and huge performances, even with the app closed.' },
  { title: 'Better with friends', text: 'Game chat, comments and Pick’em with a leaderboard, so watching is something you do together.' },
];

export default function About() {
  return (
    <div className="mx-auto max-w-2xl pb-8">
      <Link to="/settings" className="mb-2 inline-flex items-center gap-1 px-1 text-[15px] text-accent">
        <Icon.ChevronRight className="h-4 w-4 rotate-180" />
        Settings
      </Link>
      <PageTitle>About</PageTitle>

      <section className="rounded-3xl bg-card px-5 py-6 text-center">
        <img src="./icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-sm" />
        <h2 className="mt-3 font-display text-[22px] font-bold tracking-tight">NBA Tracker</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-label-2">
          The sports app I always wanted: everything the big apps have, minus the noise, plus the people you watch with.
        </p>
      </section>

      <h2 className="mb-1.5 mt-6 px-4 text-[12.5px] font-semibold uppercase tracking-wide text-label-2">The vision</h2>
      <div className="divide-y divide-sep overflow-hidden rounded-2xl bg-card">
        {PILLARS.map((p) => (
          <div key={p.title} className="px-4 py-3">
            <div className="text-[15.5px] font-semibold">{p.title}</div>
            <p className="mt-0.5 text-[13.5px] leading-snug text-label-2">{p.text}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-1.5 mt-6 px-4 text-[12.5px] font-semibold uppercase tracking-wide text-label-2">Made by</h2>
      <section className="rounded-2xl bg-card px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent font-display text-[18px] font-bold text-white">EA</div>
          <div className="min-w-0">
            <div className="text-[17px] font-semibold">Eddy Arriaga</div>
            <div className="text-[13px] text-label-2">Designer and developer</div>
          </div>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-label-2">
          I built NBA Tracker for myself and my friends because I wanted one place to follow games, dig into stats and talk
          trash during the fourth quarter. Every feature here started as something I wished the other apps did.
        </p>
        <a
          href={LINKEDIN}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A66C2] py-2.5 text-[15px] font-semibold text-white transition active:opacity-80"
        >
          <LinkedInLogo />
          Connect on LinkedIn
        </a>
      </section>

      <p className="mt-4 px-4 text-center text-[12px] leading-snug text-label-3">
        Scores, stats and news from ESPN. Not affiliated with the NBA, the NFL or ESPN.
      </p>
    </div>
  );
}
