const GameCard = ({ status, time, arena, homeScore, awayScore }) => {
  return (
    <div className="rounded-lg border p-4 mb-3 shadow-sm bg-white dark:bg-gray-800 dark:text-white">
      <div className="flex justify-between items-center text-sm font-medium mb-2">
        <span className={`px-2 py-1 rounded-full ${
          status === "LIVE" ? "bg-red-100 text-red-600" :
          status === "FINAL" ? "bg-gray-100 text-gray-600" :
          "bg-blue-100 text-blue-600"
        }`}>{status}</span>
        <span className="text-xs">{time}</span>
      </div>
      <div className="text-center text-xl font-bold py-2">
        {homeScore} - {awayScore}
      </div>
      <div className="text-center text-sm text-gray-500">
        📍 {arena}
      </div>
    </div>
  );
};

export default GameCard;
