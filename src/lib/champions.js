// League champions by season, as ESPN team ids. NBA seasons are named by the
// year they end (2025-26 = 2026); NFL seasons by the year they start.
// Add one entry per league each year once the title is decided.
const NBA = {
  1947: 9, 1949: 13, 1950: 13, 1951: 23, 1952: 13, 1953: 13, 1954: 13, 1955: 20, 1956: 9, 1957: 2, 1958: 1, 1959: 2,
  1960: 2, 1961: 2, 1962: 2, 1963: 2, 1964: 2, 1965: 2, 1966: 2, 1967: 20, 1968: 2, 1969: 2,
  1970: 18, 1971: 15, 1972: 13, 1973: 18, 1974: 2, 1975: 9, 1976: 2, 1977: 22, 1978: 27, 1979: 25,
  1980: 13, 1981: 2, 1982: 13, 1983: 20, 1984: 2, 1985: 13, 1986: 2, 1987: 13, 1988: 13, 1989: 8,
  1990: 8, 1991: 4, 1992: 4, 1993: 4, 1994: 10, 1995: 10, 1996: 4, 1997: 4, 1998: 4, 1999: 24,
  2000: 13, 2001: 13, 2002: 13, 2003: 24, 2004: 8, 2005: 24, 2006: 14, 2007: 24, 2008: 2, 2009: 13,
  2010: 13, 2011: 6, 2012: 14, 2013: 14, 2014: 24, 2015: 9, 2016: 5, 2017: 9, 2018: 9, 2019: 28,
  2020: 13, 2021: 15, 2022: 9, 2023: 7, 2024: 2, 2025: 25, 2026: 18,
};
// Super Bowl winners, by the season they capped (Super Bowl I was the 1966 season).
const NFL = {
  1966: 9, 1967: 9, 1968: 20, 1969: 12, 1970: 11, 1971: 6, 1972: 15, 1973: 15, 1974: 23, 1975: 23,
  1976: 13, 1977: 6, 1978: 23, 1979: 23, 1980: 13, 1981: 25, 1982: 28, 1983: 13, 1984: 25,
  1985: 3, 1986: 19, 1987: 28, 1988: 25, 1989: 25, 1990: 19, 1991: 28, 1992: 6, 1993: 6, 1994: 25,
  1995: 6, 1996: 9, 1997: 7, 1998: 7, 1999: 14, 2000: 33, 2001: 17, 2002: 27, 2003: 17, 2004: 17,
  2005: 23, 2006: 11, 2007: 19, 2008: 23, 2009: 18, 2010: 9, 2011: 19, 2012: 33, 2013: 26, 2014: 17,
  2015: 7, 2016: 17, 2017: 21, 2018: 17, 2019: 12, 2020: 27, 2021: 14, 2022: 12, 2023: 12, 2024: 21,
  2025: 26,
};

// When each franchise first played (NBA: including its BAA and ABA seasons; NFL:
// including AFL and AAFC seasons), and the name it started under if that changed.
// Keyed by ESPN team id.
const FRANCHISE = {
  nba: {
    1: [1949, 'Tri-Cities Blackhawks'], 2: [1946], 17: [1967, 'New Jersey Americans (ABA)'], 30: [1988], 4: [1966], 5: [1970],
    6: [1980], 7: [1967, 'Denver Rockets (ABA)'], 8: [1948, 'Fort Wayne Pistons'], 9: [1946, 'Philadelphia Warriors'],
    10: [1967, 'San Diego Rockets'], 11: [1967, 'Indiana Pacers (ABA)'], 12: [1970, 'Buffalo Braves'], 13: [1948, 'Minneapolis Lakers'],
    29: [1995, 'Vancouver Grizzlies'], 14: [1988], 15: [1968], 16: [1989], 3: [2002, 'New Orleans Hornets'], 18: [1946],
    25: [1967, 'Seattle SuperSonics'], 19: [1989], 20: [1949, 'Syracuse Nationals'], 21: [1968], 22: [1970],
    23: [1948, 'Rochester Royals'], 24: [1967, 'Dallas Chaparrals (ABA)'], 28: [1995], 26: [1974, 'New Orleans Jazz'], 27: [1961, 'Chicago Packers'],
  },
  nfl: {
    22: [1920, 'Chicago Cardinals'], 1: [1966], 33: [1996], 2: [1960], 29: [1995], 3: [1920, 'Decatur Staleys'], 4: [1968], 5: [1946],
    6: [1960], 7: [1960], 8: [1930, 'Portsmouth Spartans'], 9: [1921], 34: [2002], 11: [1953, 'Baltimore Colts'], 30: [1995],
    12: [1960, 'Dallas Texans'], 13: [1960, 'Oakland Raiders'], 24: [1960], 14: [1937, 'Cleveland Rams'], 15: [1966], 16: [1961],
    17: [1960, 'Boston Patriots'], 18: [1967], 19: [1925], 20: [1960, 'Titans of New York'], 21: [1933], 23: [1933, 'Pittsburgh Pirates'],
    25: [1946], 26: [1976], 27: [1976], 10: [1960, 'Houston Oilers'], 28: [1932, 'Boston Braves'],
  },
};

/** { first: year of the first season, was: the name it started under (or '') }, or null for an unknown team. */
export function franchise(lg, teamId) {
  const f = FRANCHISE[lg]?.[teamId];
  return f ? { first: f[0], was: f[1] ?? '' } : null;
}

/** Every season this team won the title, oldest first. */
export function titles(lg, teamId) {
  return Object.entries(lg === 'nba' ? NBA : NFL).filter(([, id]) => String(id) === String(teamId)).map(([y]) => Number(y));
}

/** "1959–1966, 1968, 1969": a run of three or more years in a row is written as a range. */
export function yearRuns(years) {
  const out = [];
  for (let i = 0; i < years.length; ) {
    let j = i;
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++;
    if (j - i >= 2) out.push(`${years[i]}–${years[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(years[k]));
    i = j + 1;
  }
  return out.join(', ');
}

/** True when this team won the title that season. */
export const wonTitle = (lg, year, teamId) => !!teamId && String((lg === 'nba' ? NBA : NFL)[year] ?? '') === String(teamId);
