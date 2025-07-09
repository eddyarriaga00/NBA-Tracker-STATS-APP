const WeekNavigator = ({ currentWeek, onPrev, onNext }) => {
  return (
    <div className="flex items-center justify-between w-full max-w-md mx-auto my-4 text-sm font-medium">
      <button
        onClick={onPrev}
        className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-black dark:text-white"
      >
        ←
      </button>
      <span className="text-gray-700 dark:text-gray-200">{currentWeek}</span>
      <button
        onClick={onNext}
        className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-black dark:text-white"
      >
        →
      </button>
    </div>
  );
};

export default WeekNavigator;
