type PlanetName =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

export const ZODIAC_SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

export type ZodiacSign = typeof ZODIAC_SIGNS[number];

export type AstrologyInput = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timezoneOffset: string; // +00:00 / -05:00 / Z
  location: string;
  latitude: number; // north positive
  longitude: number; // east positive
};

export type AstrologyPlacement = {
  body: PlanetName;
  longitude: number;
  sign: ZodiacSign;
  degreeInSign: number;
  house: number;
  retrograde: boolean;
};

export type AstrologyAngle = {
  longitude: number;
  sign: ZodiacSign;
  degreeInSign: number;
};

export type AstrologyHouse = {
  house: number;
  sign: ZodiacSign;
  cuspLongitude: number;
};

export type AstrologyChart = {
  input: AstrologyInput;
  utcIso: string;
  julianDay: number;
  ascendant: AstrologyAngle;
  midheaven: AstrologyAngle;
  placements: AstrologyPlacement[];
  houses: AstrologyHouse[];
  bigThree: {
    sun: ZodiacSign;
    moon: ZodiacSign;
    rising: ZodiacSign;
  };
};

type OrbitalElements = {
  N: number;
  i: number;
  w: number;
  a: number;
  e: number;
  M: number;
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function generateAstrologyChart(input: AstrologyInput): AstrologyChart {
  validateInput(input);
  const utcDate = parseBirthToUtc(input.date, input.time, input.timezoneOffset);
  const jd = toJulianDay(utcDate);
  const d = jd - 2451543.5;
  const t = (jd - 2451545.0) / 36525.0;

  const sun = calculateSun(d);
  const moonLon = calculateMoonLongitude(d, sun.meanAnomaly, sun.meanLongitude);
  const mercuryLon = calculatePlanetLongitude(d, sun, mercuryElements);
  const venusLon = calculatePlanetLongitude(d, sun, venusElements);
  const marsLon = calculatePlanetLongitude(d, sun, marsElements);
  const jupiterLon = calculatePlanetLongitude(d, sun, jupiterElements);
  const saturnLon = calculatePlanetLongitude(d, sun, saturnElements);
  const uranusLon = calculatePlanetLongitude(d, sun, uranusElements);
  const neptuneLon = calculatePlanetLongitude(d, sun, neptuneElements);
  const plutoLon = calculatePlanetLongitude(d, sun, plutoElements);

  const asc = calculateAscendant(jd, input.latitude, input.longitude, t);
  const mc = calculateMidheaven(jd, input.longitude, t);
  const ascSignIndex = signIndexFromLongitude(asc);

  const placements: AstrologyPlacement[] = [
    toPlacement('Sun', sun.longitude, ascSignIndex, false),
    toPlacement('Moon', moonLon, ascSignIndex, false),
    toPlacement(
      'Mercury',
      mercuryLon,
      ascSignIndex,
      isRetrograde(mercuryLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), mercuryElements))
    ),
    toPlacement(
      'Venus',
      venusLon,
      ascSignIndex,
      isRetrograde(venusLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), venusElements))
    ),
    toPlacement(
      'Mars',
      marsLon,
      ascSignIndex,
      isRetrograde(marsLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), marsElements))
    ),
    toPlacement(
      'Jupiter',
      jupiterLon,
      ascSignIndex,
      isRetrograde(jupiterLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), jupiterElements))
    ),
    toPlacement(
      'Saturn',
      saturnLon,
      ascSignIndex,
      isRetrograde(saturnLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), saturnElements))
    ),
    toPlacement(
      'Uranus',
      uranusLon,
      ascSignIndex,
      isRetrograde(uranusLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), uranusElements))
    ),
    toPlacement(
      'Neptune',
      neptuneLon,
      ascSignIndex,
      isRetrograde(neptuneLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), neptuneElements))
    ),
    toPlacement(
      'Pluto',
      plutoLon,
      ascSignIndex,
      isRetrograde(plutoLon, calculatePlanetLongitude(d + 1 / 24, calculateSun(d + 1 / 24), plutoElements))
    ),
  ];

  const houses = generateWholeSignHouses(ascSignIndex);

  return {
    input,
    utcIso: utcDate.toISOString(),
    julianDay: jd,
    ascendant: toAngle(asc),
    midheaven: toAngle(mc),
    placements,
    houses,
    bigThree: {
      sun: placements[0].sign,
      moon: placements[1].sign,
      rising: toAngle(asc).sign,
    },
  };
}

export function formatAstrologyIdentityImprint(chart: AstrologyChart): string {
  const bigThree = `Sun ${chart.bigThree.sun}, Moon ${chart.bigThree.moon}, Rising ${chart.bigThree.rising}`;
  const bodies = chart.placements
    .map((p) => `${p.body} ${p.sign} ${p.degreeInSign.toFixed(1)}° (House ${p.house}${p.retrograde ? ', retrograde' : ''})`)
    .join('; ');
  const houses = chart.houses
    .map((h) => `H${h.house}:${h.sign}`)
    .join(' ');

  return [
    `Astrology imprint from birth coordinates (${chart.input.location}; lat ${chart.input.latitude.toFixed(4)}, lon ${chart.input.longitude.toFixed(4)}).`,
    `Big Three: ${bigThree}.`,
    `Angles: Ascendant ${chart.ascendant.sign} ${chart.ascendant.degreeInSign.toFixed(1)}°, Midheaven ${chart.midheaven.sign} ${chart.midheaven.degreeInSign.toFixed(1)}°.`,
    `Placements: ${bodies}.`,
    `Whole-sign houses: ${houses}.`,
  ].join(' ');
}

function validateInput(input: AstrologyInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error('Birth date must use YYYY-MM-DD.');
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    throw new Error('Birth time must use HH:MM (24h).');
  }
  if (!isValidTimezoneOffset(input.timezoneOffset)) {
    throw new Error('Birth timezone offset must be Z or ±HH:MM.');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new Error('Birth latitude must be between -90 and 90.');
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error('Birth longitude must be between -180 and 180.');
  }
}

function parseBirthToUtc(date: string, time: string, timezoneOffset: string): Date {
  const tz = normalizeTimezoneOffset(timezoneOffset);
  const iso = `${date}T${time}:00${tz}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid birth timestamp: ${iso}`);
  }
  return parsed;
}

function normalizeTimezoneOffset(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === 'UTC' || trimmed === 'GMT' || trimmed === 'Z') {
    return 'Z';
  }
  return trimmed;
}

function isValidTimezoneOffset(value: string): boolean {
  const normalized = normalizeTimezoneOffset(value);
  if (normalized === 'Z') {
    return true;
  }
  return /^[+-](0\d|1[0-4]):[0-5]\d$/.test(normalized);
}

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function normalizeDegrees(deg: number): number {
  let value = deg % 360;
  if (value < 0) value += 360;
  return value;
}

function signedDeltaDegrees(delta: number): number {
  let value = ((delta + 540) % 360) - 180;
  if (value < -180) value += 360;
  return value;
}

function sinDeg(deg: number): number {
  return Math.sin(deg * DEG2RAD);
}

function cosDeg(deg: number): number {
  return Math.cos(deg * DEG2RAD);
}

function tanDeg(deg: number): number {
  return Math.tan(deg * DEG2RAD);
}

function atan2Deg(y: number, x: number): number {
  return normalizeDegrees(Math.atan2(y, x) * RAD2DEG);
}

function solveKeplerEquation(meanAnomalyDeg: number, eccentricity: number): number {
  let E = meanAnomalyDeg + RAD2DEG * eccentricity * sinDeg(meanAnomalyDeg) * (1 + eccentricity * cosDeg(meanAnomalyDeg));
  for (let i = 0; i < 7; i++) {
    const numerator = E - RAD2DEG * eccentricity * sinDeg(E) - meanAnomalyDeg;
    const denominator = 1 - eccentricity * cosDeg(E);
    E = E - numerator / denominator;
  }
  return E;
}

function calculateSun(d: number): { longitude: number; xs: number; ys: number; meanAnomaly: number; meanLongitude: number } {
  const w = normalizeDegrees(282.9404 + 4.70935e-5 * d);
  const e = 0.016709 - 1.151e-9 * d;
  const M = normalizeDegrees(356.047 + 0.9856002585 * d);
  const E = solveKeplerEquation(M, e);

  const xv = cosDeg(E) - e;
  const yv = Math.sqrt(1 - e * e) * sinDeg(E);
  const v = atan2Deg(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const lon = normalizeDegrees(v + w);

  return {
    longitude: lon,
    xs: r * cosDeg(lon),
    ys: r * sinDeg(lon),
    meanAnomaly: M,
    meanLongitude: normalizeDegrees(M + w),
  };
}

function calculateMoonLongitude(d: number, sunMeanAnomaly: number, sunMeanLongitude: number): number {
  const N = normalizeDegrees(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = normalizeDegrees(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = normalizeDegrees(115.3654 + 13.0649929509 * d);
  const E = solveKeplerEquation(M, e);

  const xv = a * (cosDeg(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sinDeg(E);
  const v = atan2Deg(yv, xv);
  let r = Math.sqrt(xv * xv + yv * yv);

  const xh = r * (cosDeg(N) * cosDeg(v + w) - sinDeg(N) * sinDeg(v + w) * cosDeg(i));
  const yh = r * (sinDeg(N) * cosDeg(v + w) + cosDeg(N) * sinDeg(v + w) * cosDeg(i));
  const zh = r * (sinDeg(v + w) * sinDeg(i));

  let lon = atan2Deg(yh, xh);
  let lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * RAD2DEG;

  const Lm = normalizeDegrees(M + w + N);
  const D = normalizeDegrees(Lm - sunMeanLongitude);
  const F = normalizeDegrees(Lm - N);
  const Mm = M;
  const Ms = sunMeanAnomaly;

  lon += -1.274 * sinDeg(Mm - 2 * D)
    + 0.658 * sinDeg(2 * D)
    - 0.186 * sinDeg(Ms)
    - 0.059 * sinDeg(2 * Mm - 2 * D)
    - 0.057 * sinDeg(Mm - 2 * D + Ms)
    + 0.053 * sinDeg(Mm + 2 * D)
    + 0.046 * sinDeg(2 * D - Ms)
    + 0.041 * sinDeg(Mm - Ms)
    - 0.035 * sinDeg(D)
    - 0.031 * sinDeg(Mm + Ms)
    - 0.015 * sinDeg(2 * F - 2 * D)
    + 0.011 * sinDeg(Mm - 4 * D);

  lat += -0.173 * sinDeg(F - 2 * D)
    - 0.055 * sinDeg(Mm - F - 2 * D)
    - 0.046 * sinDeg(Mm + F - 2 * D)
    + 0.033 * sinDeg(F + 2 * D)
    + 0.017 * sinDeg(2 * Mm + F);

  r += -0.58 * cosDeg(Mm - 2 * D) - 0.46 * cosDeg(2 * D);
  void lat;
  void r;
  return normalizeDegrees(lon);
}

function calculatePlanetLongitude(
  d: number,
  sun: { xs: number; ys: number },
  elementsFn: (d: number) => OrbitalElements
): number {
  const elements = elementsFn(d);
  const helio = toHeliocentric(elements);
  const xg = helio.x + sun.xs;
  const yg = helio.y + sun.ys;
  return atan2Deg(yg, xg);
}

function toHeliocentric(elements: OrbitalElements): { x: number; y: number; z: number } {
  const N = normalizeDegrees(elements.N);
  const i = normalizeDegrees(elements.i);
  const w = normalizeDegrees(elements.w);
  const M = normalizeDegrees(elements.M);
  const E = solveKeplerEquation(M, elements.e);

  const xv = elements.a * (cosDeg(E) - elements.e);
  const yv = elements.a * Math.sqrt(1 - elements.e * elements.e) * sinDeg(E);
  const v = atan2Deg(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);

  return {
    x: r * (cosDeg(N) * cosDeg(v + w) - sinDeg(N) * sinDeg(v + w) * cosDeg(i)),
    y: r * (sinDeg(N) * cosDeg(v + w) + cosDeg(N) * sinDeg(v + w) * cosDeg(i)),
    z: r * (sinDeg(v + w) * sinDeg(i)),
  };
}

function calculateAscendant(jd: number, latitude: number, longitude: number, t: number): number {
  const lst = localSiderealDegrees(jd, longitude, t);
  const obliquity = meanObliquityDegrees(t);
  const asc = Math.atan2(
    -cosDeg(lst),
    sinDeg(lst) * cosDeg(obliquity) + tanDeg(latitude) * sinDeg(obliquity)
  ) * RAD2DEG;
  return normalizeDegrees(asc);
}

function calculateMidheaven(jd: number, longitude: number, t: number): number {
  const lst = localSiderealDegrees(jd, longitude, t);
  const obliquity = meanObliquityDegrees(t);
  const mc = Math.atan2(
    sinDeg(lst),
    cosDeg(lst) * cosDeg(obliquity)
  ) * RAD2DEG;
  return normalizeDegrees(mc);
}

function localSiderealDegrees(jd: number, longitude: number, t: number): number {
  const gmst = normalizeDegrees(
    280.46061837
      + 360.98564736629 * (jd - 2451545.0)
      + 0.000387933 * t * t
      - (t * t * t) / 38710000
  );
  return normalizeDegrees(gmst + longitude);
}

function meanObliquityDegrees(t: number): number {
  return 23.439291 - 0.0130042 * t;
}

function signIndexFromLongitude(longitude: number): number {
  return Math.floor(normalizeDegrees(longitude) / 30) % 12;
}

function toSign(longitude: number): ZodiacSign {
  return ZODIAC_SIGNS[signIndexFromLongitude(longitude)] as ZodiacSign;
}

function toAngle(longitude: number): AstrologyAngle {
  const normalized = normalizeDegrees(longitude);
  const signIndex = signIndexFromLongitude(normalized);
  return {
    longitude: normalized,
    sign: ZODIAC_SIGNS[signIndex],
    degreeInSign: normalized - signIndex * 30,
  };
}

function toPlacement(
  body: PlanetName,
  longitude: number,
  ascSignIndex: number,
  retrograde: boolean
): AstrologyPlacement {
  const normalized = normalizeDegrees(longitude);
  const signIndex = signIndexFromLongitude(normalized);
  return {
    body,
    longitude: normalized,
    sign: ZODIAC_SIGNS[signIndex],
    degreeInSign: normalized - signIndex * 30,
    house: ((signIndex - ascSignIndex + 12) % 12) + 1,
    retrograde,
  };
}

function generateWholeSignHouses(ascSignIndex: number): AstrologyHouse[] {
  const houses: AstrologyHouse[] = [];
  for (let i = 0; i < 12; i++) {
    const signIndex = (ascSignIndex + i) % 12;
    houses.push({
      house: i + 1,
      sign: ZODIAC_SIGNS[signIndex],
      cuspLongitude: signIndex * 30,
    });
  }
  return houses;
}

function isRetrograde(currentLongitude: number, futureLongitude: number): boolean {
  return signedDeltaDegrees(futureLongitude - currentLongitude) < 0;
}

function mercuryElements(d: number): OrbitalElements {
  return {
    N: 48.3313 + 3.24587e-5 * d,
    i: 7.0047 + 5e-8 * d,
    w: 29.1241 + 1.01444e-5 * d,
    a: 0.387098,
    e: 0.205635 + 5.59e-10 * d,
    M: 168.6562 + 4.0923344368 * d,
  };
}

function venusElements(d: number): OrbitalElements {
  return {
    N: 76.6799 + 2.4659e-5 * d,
    i: 3.3946 + 2.75e-8 * d,
    w: 54.891 + 1.38374e-5 * d,
    a: 0.72333,
    e: 0.006773 - 1.302e-9 * d,
    M: 48.0052 + 1.6021302244 * d,
  };
}

function marsElements(d: number): OrbitalElements {
  return {
    N: 49.5574 + 2.11081e-5 * d,
    i: 1.8497 - 1.78e-8 * d,
    w: 286.5016 + 2.92961e-5 * d,
    a: 1.523688,
    e: 0.093405 + 2.516e-9 * d,
    M: 18.6021 + 0.5240207766 * d,
  };
}

function jupiterElements(d: number): OrbitalElements {
  return {
    N: 100.4542 + 2.76854e-5 * d,
    i: 1.303 - 1.557e-7 * d,
    w: 273.8777 + 1.64505e-5 * d,
    a: 5.20256,
    e: 0.048498 + 4.469e-9 * d,
    M: 19.895 + 0.0830853001 * d,
  };
}

function saturnElements(d: number): OrbitalElements {
  return {
    N: 113.6634 + 2.3898e-5 * d,
    i: 2.4886 - 1.081e-7 * d,
    w: 339.3939 + 2.97661e-5 * d,
    a: 9.55475,
    e: 0.055546 - 9.499e-9 * d,
    M: 316.967 + 0.0334442282 * d,
  };
}

function uranusElements(d: number): OrbitalElements {
  return {
    N: 74.0005 + 1.3978e-5 * d,
    i: 0.7733 + 1.9e-8 * d,
    w: 96.6612 + 3.0565e-5 * d,
    a: 19.18171 - 1.55e-8 * d,
    e: 0.047318 + 7.45e-9 * d,
    M: 142.5905 + 0.011725806 * d,
  };
}

function neptuneElements(d: number): OrbitalElements {
  return {
    N: 131.7806 + 3.0173e-5 * d,
    i: 1.77 - 2.55e-7 * d,
    w: 272.8461 - 6.027e-6 * d,
    a: 30.05826 + 3.313e-8 * d,
    e: 0.008606 + 2.15e-9 * d,
    M: 260.2471 + 0.005995147 * d,
  };
}

function plutoElements(d: number): OrbitalElements {
  return {
    N: 110.30347,
    i: 17.14175,
    w: 113.76329,
    a: 39.48168677,
    e: 0.24880766,
    M: 14.53 + 0.003975709 * d,
  };
}
