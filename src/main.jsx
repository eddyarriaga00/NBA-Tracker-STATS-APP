import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, matchPath, useParams } from 'react-router-dom';
import './index.css';
import { LEAGUES } from './api/espn';
import { leagueFromPath } from './lib/league';
import { ThemeProvider } from './lib/theme';
import { clearAlertBadgeOnOpen, openAlertTargets, registerServiceWorker } from './lib/push';
import { loadPage, watchForUpdates } from './lib/update';
import TransitionRoutes from './lib/pageTransitions';

registerServiceWorker(); // alerts when the app is closed + offline copy
clearAlertBadgeOnOpen();
openAlertTargets(); // tapping an alert opens its game
import('./lib/viewportFix').then((m) => m.startViewportFix()); // keeps the top and bottom bars pinned on iPhone
import('./lib/social').then((m) => m.startProfile()); // your profile follows your nickname and teams
import('./lib/sync').then((m) => m.startSync()); // followed teams + preferences follow your account
// Coming back from Google sign-in.
if (/[?&](code|error)=/.test(location.search) || /error_code=/.test(location.hash)) {
  import('./lib/account').then((m) => m.handleAuthRedirect());
}
watchForUpdates(); // phones pick up new versions without reinstalling
import Shell from './components/Shell';
import Scores from './pages/Scores';

// Scores is the landing page; everything else loads when first opened (and is
// fetched quietly a few seconds after the app starts, so opening a page later
// never waits on the network).
function page(load) {
  let Comp = null;
  let pending = null;
  let failed = null;
  const fetchIt = () => (pending ??= loadPage(load)().then((m) => { Comp = m.default; }, (e) => { failed = e; }));
  const Page = (props) => {
    if (failed) {
      const e = failed;
      failed = null;
      pending = null; // the next visit tries again
      throw e;
    }
    if (!Comp) throw fetchIt(); // Suspense waits for the file the first time
    return <Comp {...props} />;
  };
  Page.preload = fetchIt;
  return Page;
}
const Game = page(() => import('./pages/Game'));
const Standings = page(() => import('./pages/Standings'));
const Leaders = page(() => import('./pages/Leaders'));
const Player = page(() => import('./pages/Player'));
const Team = page(() => import('./pages/Team'));
const Teams = page(() => import('./pages/Teams'));
const Chat = page(() => import('./pages/Chat'));
const Compare = page(() => import('./pages/Compare'));
const Picks = page(() => import('./pages/Picks'));
const Moves = page(() => import('./pages/Moves'));
const Settings = page(() => import('./pages/Settings'));
const About = page(() => import('./pages/About'));
const Friends = page(() => import('./pages/Friends'));
const Profile = page(() => import('./pages/Profile'));
const DM = page(() => import('./pages/DM'));
// Which page a path opens, for loading its code before a page transition starts.
const PAGES = [
  ['/chat', Chat], ['/friends', Friends], ['/u/:id', Profile], ['/dm/:id', DM], ['/settings', Settings], ['/about', About],
  ['/:lg/game/:id', Game], ['/:lg/standings', Standings], ['/:lg/leaders', Leaders], ['/:lg/player/:id', Player],
  ['/:lg/teams', Teams], ['/:lg/compare', Compare], ['/:lg/moves', Moves], ['/:lg/picks', Picks], ['/:lg/team/:id', Team],
];
const preload = (pathname) => PAGES.find(([pattern]) => matchPath(pattern, pathname))?.[1].preload();
if (!import.meta.env.DEV) {
  const warm = () => PAGES.forEach(([, P]) => P.preload());
  setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(warm) : warm()), 2500);
}
const DevField = import.meta.env.DEV ? lazy(() => import('./pages/DevField')) : null;

// Only "nba" and "nfl" are valid league segments; anything else goes home.
function LeagueGuard({ children }) {
  const { lg } = useParams();
  return LEAGUES[lg] ? children : <Home />;
}
const guard = (el) => <LeagueGuard>{el}</LeagueGuard>;

// Remount detail pages when the team/player/game changes so tabs, seasons and
// pickers never carry over from the previous one.
function Keyed({ Page }) {
  const { lg, id } = useParams();
  return <Page key={`${lg}:${id}`} />;
}
function UserKeyed({ Page }) {
  const { id } = useParams();
  return <Page key={id} />;
}
// The game page is the exception: hopping between games along its top strip
// keeps the page (and the tab you're on) and swaps the game in place.
function GameRoute() {
  const { lg } = useParams();
  return <Game key={lg} />;
}
const Home = () => <Navigate to={`/${leagueFromPath('/')}`} replace />;

// iPhone ignores the page's zoom settings in Safari; its own pinch gesture has to be declined here.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <TransitionRoutes preload={preload}>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="chat" element={<Chat />} />
            <Route path="friends" element={<Friends />} />
            <Route path="u/:id" element={<UserKeyed Page={Profile} />} />
            <Route path="dm/:id" element={<UserKeyed Page={DM} />} />
            <Route path="settings" element={<Settings />} />
            <Route path="about" element={<About />} />
            {import.meta.env.DEV && <Route path="dev/field" element={<DevField />} />}
            <Route path=":lg" element={guard(<Scores />)} />
            <Route path=":lg/game/:id" element={guard(<GameRoute />)} />
            <Route path=":lg/standings" element={guard(<Standings />)} />
            <Route path=":lg/leaders" element={guard(<Leaders />)} />
            <Route path=":lg/player/:id" element={guard(<Keyed Page={Player} />)} />
            <Route path=":lg/teams" element={guard(<Teams />)} />
            <Route path=":lg/compare" element={guard(<Compare />)} />
            <Route path=":lg/moves" element={guard(<Moves />)} />
            <Route path=":lg/picks" element={guard(<Picks />)} />
            <Route path=":lg/team/:id" element={guard(<Keyed Page={Team} />)} />
            <Route path="game/:id" element={<LegacyGame />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </TransitionRoutes>
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
);

function LegacyGame() {
  const { id } = useParams();
  return <Navigate to={`/nba/game/${id}`} replace />;
}
