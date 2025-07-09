const API_BASE = "https://www.balldontlie.io/api/v1";

/**
 * Fetches NBA games for a specific date.
 * @param {string} dateStr - Date in YYYY-MM-DD format.
 */
export async function fetchGamesByDate(dateStr) {
  try {
    const res = await fetch(`${API_BASE}/games?dates[]=${dateStr}&per_page=100`);
    const data = await res.json();
    return data.data;
  } catch (error) {
    console.error("Error fetching games:", error);
    return [];
  }
}
