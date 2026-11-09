import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './index.css';
import { LEAGUES } from './api/espn';
import { leagueFromPath } from './lib/league';
import { ThemeProvider } from './lib/theme';
import { registerServiceWorker } from './lib/push';
import { loadPage, watchForUpdates } from './lib/update';

registerServiceWorker(); // lets alerts arrive when the app is closed
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
const Home = () => <Navigate to={`/${leagueFromPath('/')}`} replace />;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="chat" element={<Chat />} />
            {import.meta.env.DEV && <Route path="dev/field" element={<DevField />} />}
            <Route path=":lg" element={guard(<Scores />)} />
            <Route path=":lg/game/:id" element={guard(<Keyed Page={Game} />)} />
            <Route path=":lg/standings" element={guard(<Standings />)} />
            <Route path=":lg/leaders" element={guard(<Leaders />)} />
            <Route path=":lg/player/:id" element={guard(<Keyed Page={Player} />)} />
            <Route path=":lg/teams" element={guard(<Teams />)} />
            <Route path=":lg/compare" element={guard(<Compare />)} />
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
