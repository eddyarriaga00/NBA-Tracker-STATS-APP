const StatCard = ({ label, value, icon }) => (
  <div className="flex items-center justify-between bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-4 rounded-xl shadow mb-3">
    <div>
      <h3 className="text-sm text-gray-500 dark:text-gray-400">{label}</h3>
      <p className="text-lg font-bold">{value}</p>
    </div>
    <div className="text-2xl">{icon}</div>
  </div>
);

const StatsSummary = () => {
  return (
    <div className="w-full max-w-md mx-auto mb-6">
      <StatCard label="Total Games" value="10" icon="📅" />
      <StatCard label="Live Games" value="2" icon="📺" />
      <StatCard label="Active Players" value="50" icon="👤" />
      <StatCard label="Teams" value="30" icon="🏆" />
    </div>
  );
};

export default StatsSummary;
