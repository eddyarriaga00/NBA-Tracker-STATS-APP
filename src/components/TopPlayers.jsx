const mockTopPlayers = [
  { name: "Stephen Curry", team: "GSW", pts: 34, ast: 7, reb: 5 },
  { name: "LeBron James", team: "LAL", pts: 29, ast: 9, reb: 8 },
  { name: "Jayson Tatum", team: "BOS", pts: 31, ast: 4, reb: 10 },
  { name: "Giannis Antetokounmpo", team: "MIL", pts: 27, ast: 6, reb: 12 },
  { name: "Luka Dončić", team: "DAL", pts: 32, ast: 11, reb: 6 },
];

const TopPlayers = () => {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
        Top 5 Player Stats
      </h2>
      <div className="space-y-3">
        {mockTopPlayers.map((player, index) => (
          <div
            key={index}
            className="flex justify-between items-center bg-white dark:bg-gray-800 rounded-lg p-4 shadow"
          >
            <div>
              <p className="font-bold text-sm">{player.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{player.team}</p>
            </div>
            <div className="text-xs text-right text-gray-600 dark:text-gray-300 space-y-1">
              <p>PTS: <span className="font-semibold">{player.pts}</span></p>
              <p>AST: <span className="font-semibold">{player.ast}</span></p>
              <p>REB: <span className="font-semibold">{player.reb}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopPlayers;
