import Sidebar from '../components/Sidebar';
import StatsSummary from '../components/StatsSummary';
import WeekNavigator from '../components/WeekNavigator';
import GameCard from '../components/GameCard';
import DarkModeToggle from '../components/DarkModeToggle';
import SettingsModal from '../components/SettingsModal';
import TopPlayers from '../components/TopPlayers';

import { useEffect, useState } from 'react';
import { fetchGamesByDate } from '../utils/api';

const Home = () => {
  const [week, setWeek] = useState('July 7 – July 13');
  const [games, setGames] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  const goPrevWeek = () => setWeek('June 30 – July 6');
  const goNextWeek = () => setWeek('July 14 – July 20');

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetchGamesByDate(today).then((data) => setGames(data));
  }, []);

  return (
    <div className="bg-[#f7f7f8] dark:bg-[#1e1e20] min-h-screen p-4 text-gray-900 dark:text-white">
      <div className="max-w-md mx-auto">

        <Sidebar onOpenSettings={() => setShowSettings(true)} />

        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

        <div id="stats">
          <StatsSummary />
        </div>

        <div id="games" className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Live Scores & Today’s Games</h2>
          <a href="#" className="text-blue-600 text-sm hover:underline">
            View All ↗
          </a>
        </div>

        <WeekNavigator
          currentWeek={week}
          onPrev={goPrevWeek}
          onNext={goNextWeek}
        />

        {games.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No games today.</p>
        ) : (
          games.map((game) => (
            <GameCard
              key={game.id}
              status={game.status.toUpperCase()}
              time={new Date(game.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              arena={game.home_team.full_name}
              homeScore={game.home_team_score}
              awayScore={game.visitor_team_score}
            />
          ))
        )}

        <div id="players" className="mt-8">
          <TopPlayers />
        </div>

        <div id="teams" className="mt-12">
          <h2 className="text-lg font-semibold mb-2">Teams</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Team details coming soon...</p>
        </div>

      </div>
    </div>
  );
};

export default Home;
