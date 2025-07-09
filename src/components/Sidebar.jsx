import DarkModeToggle from './DarkModeToggle';

const Sidebar = ({ onOpenSettings }) => {
  return (
    <nav className="w-full max-w-md mx-auto py-4 sticky top-0 z-50 bg-transparent backdrop-blur-md">
      <div className="flex justify-between items-center px-2">
        {/* Left side: Settings Button */}
        <button
          onClick={onOpenSettings}
          className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400"
        >
          ⚙️ Settings
        </button>

        {/* Center Nav Links */}
        <ul className="flex gap-4 text-sm font-medium text-gray-700 dark:text-gray-300">
          <li><a href="#games" className="hover:text-blue-500">🏀 Games</a></li>
          <li><a href="#players" className="hover:text-blue-500">👤 Players</a></li>
          <li><a href="#teams" className="hover:text-blue-500">🏆 Teams</a></li>
          <li><a href="#stats" className="hover:text-blue-500">📊 Stats</a></li>
        </ul>

        {/* Right side: Dark Mode Toggle */}
        <DarkModeToggle />
      </div>
    </nav>
  );
};

export default Sidebar;
