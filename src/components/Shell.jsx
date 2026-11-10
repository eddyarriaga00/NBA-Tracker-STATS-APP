import { Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LEAGUES } from '../api/espn';
import { LeagueCtx, leagueFromPath, rememberLeague } from '../lib/league';
import { useSetting } from '../lib/settings';
import { Icon } from './icons';
import ErrorBoundary from './ErrorBoundary';
import { BioProvider } from './BioSheet';
import Search from './Search';
import Toaster from './Toaster';
import { AccountSheet } from './Account';
import { useGameAlerts } from '../lib/alerts';
import { usePushSync } from '../lib/push';
import { useSocialBadge } from '../lib/social';

/** Gear button: opens the Settings page (dot = spoiler-free is on). */
function SettingsButton() {
  const [spoilerFree] = useSetting('spoilerFree');
  const { pathname } = useLocation();
  const active = pathname === '/settings' || pathname === '/about';
  return (
    <NavLink
      to="/settings"
      aria-label="Settings"
      className={`relative grid h-9 w-9 place-items-center rounded-full transition hover:bg-fill hover:text-label active:scale-95 ${active ? 'bg-fill text-label' : 'text-label-2'}`}
    >
      <Icon.Gear className="h-[20px] w-[20px]" />
      {spoilerFree && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden />}
    </NavLink>
  );
}

function LeagueSwitch({ league }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const go = (lg) => {
    if (lg === league) return;
    const section = pathname.split('/')[2];
    const keep = ['standings', 'leaders', 'teams'].includes(section) ? `/${section}` : '';
    navigate(`/${lg}${keep}`);
  };
  const ids = Object.keys(LEAGUES);
  const idx = ids.indexOf(league);
  return (
    <div className="relative grid grid-cols-2 rounded-full bg-fill p-[3px]" role="tablist" aria-label="League">
      <div
        aria-hidden
        className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc(50%-3px)] rounded-full bg-card shadow-sm transition-transform duration-300 dark:bg-[#636366]"
        style={{ transform: `translateX(${idx * 100}%)` }}
      />
      {ids.map((lg) => (
        <button
          key={lg}
          role="tab"
          aria-selected={lg === league}
          onClick={() => go(lg)}
          className={`relative z-10 px-3 py-[3px] text-[12px] font-bold tracking-wide md:px-3.5 md:py-1 md:text-[13px] transition-colors ${
            lg === league ? 'text-label' : 'text-label-2'
          }`}
        >
          {LEAGUES[lg].name}
        </button>
      ))}
    </div>
  );
}

/** Shown when there's no connection: the app keeps working from saved data. */
function OfflineNotice() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="mb-3 flex items-center justify-center gap-2 rounded-full bg-fill px-4 py-1.5 text-[12.5px] font-semibold text-label-2">
      <span className="h-2 w-2 rounded-full bg-[#ffcc00]" aria-hidden />
      Offline · showing your last saved scores
    </div>
  );
}

export default function Shell() {
  const { pathname } = useLocation();
  const league = leagueFromPath(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  useGameAlerts(); // follows your teams and close games while the app is open
  usePushSync(); // and lets the server alert this device when it's closed
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { if (LEAGUES[pathname.split('/')[1]]) rememberLeague(league); }, [league, pathname]);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName)) { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const badge = useSocialBadge();
  const tabs = [
    { to: `/${league}`, label: 'Scores', icon: Icon.Scores, end: true, match: (p) => p === `/${league}` || p.startsWith(`/${league}/game`) },
    { to: `/${league}/standings`, label: 'Standings', icon: Icon.Standings },
    { to: `/${league}/leaders`, label: 'Leaders', icon: Icon.Leaders, match: (p) => p.startsWith(`/${league}/leaders`) || p.startsWith(`/${league}/player`) },
    { to: `/${league}/teams`, label: 'Teams', icon: Icon.Teams, match: (p) => p.startsWith(`/${league}/team`) },
    { to: '/chat', label: 'Friends', icon: Icon.Chat, match: (p) => p === '/chat' || p === '/friends' || p.startsWith('/u/') || p.startsWith('/dm/') || p.startsWith(`/${league}/picks`), badge },
  ];
  const isActive = (t) => (t.match ? t.match(pathname) : pathname.startsWith(t.to));

  return (
    <LeagueCtx.Provider value={league}>
      <BioProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-sep bg-bar pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex h-12 max-w-5xl items-center gap-2.5 px-3 md:h-14 md:gap-3 md:px-4">
            <NavLink to={`/${league}`} className="flex shrink-0 items-center gap-2" aria-label="Home">
              <img src="./favicon.svg" alt="" className="h-7 w-7 md:h-8 md:w-8" />
            </NavLink>
            <LeagueSwitch league={league} />
            <nav className="mx-auto hidden items-center gap-1 lg:flex">
              {tabs.map((t) => (
                <NavLink
                  key={t.label}
                  to={t.to}
                  aria-current={isActive(t) ? 'page' : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition ${
                    isActive(t) ? 'bg-fill text-label' : 'text-label-2 hover:text-label'
                  }`}
                >
                  {t.label}
                  {t.badge > 0 && <span className="num ml-1.5 rounded-full bg-live px-1.5 py-px text-[11px] font-bold text-white">{t.badge}</span>}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1 lg:ml-0">
              <button
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-full text-label-2 transition hover:bg-fill hover:text-label active:scale-95"
              >
                <Icon.Search className="h-[20px] w-[20px]" />
              </button>
              <SettingsButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-3 pb-[calc(84px+env(safe-area-inset-bottom))] pt-3 md:px-4 md:pt-4 lg:pb-16">
          <OfflineNotice />
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<div className="skeleton mt-2 h-[240px] rounded-2xl" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sep bg-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {tabs.map((t) => (
              <NavLink
                key={t.label}
                to={t.to}
                aria-current={isActive(t) ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium transition ${
                  isActive(t) ? 'text-accent' : 'text-label-3'
                }`}
              >
                <span className="relative">
                  <t.icon className="h-[22px] w-[22px]" />
                  {t.badge > 0 && (
                    <span className="num absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] font-bold leading-none text-white">{t.badge > 9 ? '9+' : t.badge}</span>
                  )}
                </span>
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <Search open={searchOpen} onClose={closeSearch} league={league} />
        <Toaster />
        <AccountSheet />
      </div>
      </BioProvider>
    </LeagueCtx.Provider>
  );
}
