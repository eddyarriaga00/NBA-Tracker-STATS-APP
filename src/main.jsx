import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './index.css';
import { LEAGUES } from './api/espn';
import { leagueFromPath } from './lib/league';
import { ThemeProvider } from './lib/theme';
import { clearAlertBadgeOnOpen, openAlertTargets, registerServiceWorker } from './lib/push';
import { loadPage, watchForUpdates } from './lib/update';

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

// Scores is the landing page; everything else loads when first opened.
const Game = lazy(loadPage(() => import('./pages/Game')));
const Standings = lazy(loadPage(() => import('./pages/Standings')));
const Leaders = lazy(loadPage(() => import('./pages/Leaders')));
const Player = lazy(loadPage(() => import('./pages/Player')));
const Team = lazy(loadPage(() => import('./pages/Team')));
const Teams = lazy(loadPage(() => import('./pages/Teams')));
const Chat = lazy(loadPage(() => import('./pages/Chat')));
const Compare = lazy(loadPage(() => import('./pages/Compare')));
const Picks = lazy(loadPage(() => import('./pages/Picks')));
const Moves = lazy(loadPage(() => import('./pages/Moves')));
const Settings = lazy(loadPage(() => import('./pages/Settings')));
const About = lazy(loadPage(() => import('./pages/About')));
const Friends = lazy(loadPage(() => import('./pages/Friends')));
const Profile = lazy(loadPage(() => import('./pages/Profile')));
const DM = lazy(loadPage(() => import('./pages/DM')));
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
const Home = () => <Navigate to={`/${leagueFromPath('/')}`} replace />;

// iPhone ignores the page's zoom settings in Safari; its own pinch gesture has to be declined here.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <Routes>
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
            <Route path=":lg/game/:id" element={guard(<Keyed Page={Game} />)} />
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
        </Routes>
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
);

function LegacyGame() {
  const { id } = useParams();
  return <Navigate to={`/nba/game/${id}`} replace />;
}
