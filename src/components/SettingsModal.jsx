const SettingsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-[90%] max-w-md relative shadow-lg">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 left-2 text-lg text-gray-700 dark:text-gray-300 hover:text-red-500"
        >
          ❌
        </button>

        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-white">Customize Your Tracker</h2>

        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>🔧 Theme presets coming soon</p>
          <p>🖼️ Layout style: Terminal / Modern</p>
          <p>📊 Mock Game Preview:</p>

          <div className="border dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-700">
            <p className="text-xs">Lakers 108 vs Warriors 105 — Final</p>
          </div>

          <div className="border dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-700">
            <p className="text-xs">Heat 99 vs Knicks 103 — Final</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
