import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './index.css';
import { LEAGUES } from './api/espn';
import { leagueFromPath } from './lib/league';
import { ThemeProvider } from './lib/theme';
import Shell from './components/Shell';
import Scores from './pages/Scores';
import Game from './pages/Game';
import Standings from './pages/Standings';
import Leaders from './pages/Leaders';
import Player from './pages/Player';
import Team from './pages/Team';
import Teams from './pages/Teams';
import Chat from './pages/Chat';

// Only "nba" and "nfl" are valid league segments; anything else goes home.
function LeagueGuard({ children }) {
  const { lg } = useParams();
  return LEAGUES[lg] ? children : <Home />;
}
const guard = (el) => <LeagueGuard>{el}</LeagueGuard>;
const Home = () => <Navigate to={`/${leagueFromPath('/')}`} replace />;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="chat" element={<Chat />} />
            <Route path=":lg" element={guard(<Scores />)} />
            <Route path=":lg/game/:id" element={guard(<Game />)} />
            <Route path=":lg/standings" element={guard(<Standings />)} />
            <Route path=":lg/leaders" element={guard(<Leaders />)} />
            <Route path=":lg/player/:id" element={guard(<Player />)} />
            <Route path=":lg/teams" element={guard(<Teams />)} />
            <Route path=":lg/team/:id" element={guard(<Team />)} />
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
