const fs = require('fs');
const path = require('path');

const OPEN_METEO =
  'https://api.open-meteo.com/v1/forecast';

const OPEN_METEO_ELEVATION =
  'https://api.open-meteo.com/v1/elevation';

const NOMINATIM =
  'https://nominatim.openstreetmap.org';

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL ||
  'http://localhost:8000';

const GRID_STEP = 0.30;
const WEATHER_BATCH_SIZE = 50;
const ELEVATION_BATCH_SIZE = 90;
const MONITOR_INTERVAL = 60 * 1000;

const NER_BOUNDS = {
  minLat: 21.8,
  maxLat: 29.7,
  minLng: 88.0,
  maxLng: 97.6
};

const NORTHEAST_STATES = [
  'Assam',
  'Arunachal Pradesh',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Sikkim',
  'Tripura'
];

const GSI_FILES = [
  path.join(
    __dirname,
    '..',
    'data',
    'gsi_landslide_clean.csv'
  ),

  path.join(
    __dirname,
    '..',
    'data',
    'gsi_landslide_inventory.csv'
  ),

  path.join(
    __dirname,
    '..',
    '..',
    'ml',
    'data',
    'gsi_landslide_clean.csv'
  ),

  path.join(
    __dirname,
    '..',
    '..',
    'ml',
    'data',
    'gsi_landslide_inventory.csv'
  )
];

let historicalRecords = [];

let monitoringLocations = [];

let lastMonitoringStartedAt = null;
let lastMonitoringCompletedAt = null;

let monitoringRunning = false;
let monitoringTimer = null;

const terrainCache = new Map();
const geocodeCache = new Map();

function clamp(
  value,
  min = 0,
  max = 100
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}

function parseCSVLine(line) {
  const result = [];

  let value = '';
  let quoted = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char = line[i];

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  result.push(value);

  return result;
}

function normalizeState(value) {
  return String(value || '')
    .trim()
    .replace(/^"|"$/g, '');
}

function loadHistoricalRecords() {
  const file =
    GSI_FILES.find(
      candidate =>
        fs.existsSync(candidate)
    );

  if (!file) {
    console.warn(
      'GSI inventory not found.'
    );

    historicalRecords = [];

    return;
  }

  const text =
    fs.readFileSync(
      file,
      'utf8'
    );

  const lines =
    text
      .split(/\r?\n/)
      .filter(Boolean);

  if (lines.length < 2) {
    historicalRecords = [];
    return;
  }

  const headers =
    parseCSVLine(
      lines[0]
    ).map(
      value =>
        String(value)
          .trim()
          .replace(/^"|"$/g, '')
    );

  historicalRecords =
    lines
      .slice(1)
      .map(line => {
        const values =
          parseCSVLine(line);

        const row = {};

        headers.forEach(
          (header, index) => {
            row[header] =
              String(
                values[index] ?? ''
              )
                .trim()
                .replace(
                  /^"|"$/g,
                  ''
                );
          }
        );

        const latitude =
          Number(
            row.latitude
          );

        const longitude =
          Number(
            row.longitude
          );

        if (
          !Number.isFinite(
            latitude
          ) ||
          !Number.isFinite(
            longitude
          )
        ) {
          return null;
        }

        return {
          ...row,
          latitude,
          longitude,
          state:
            normalizeState(
              row.state
            )
        };
      })
      .filter(Boolean)
      .filter(record =>
        NORTHEAST_STATES.some(
          state =>
            record.state
              .toLowerCase()
              .includes(
                state.toLowerCase()
              )
        )
      );

  console.log(
    `GiriDrishti: loaded ${historicalRecords.length} GSI records`
  );
}

function pointInPolygon(
  lat,
  lng,
  polygon
) {
  let inside = false;

  for (
    let i = 0,
      j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const yi =
      polygon[i][0];

    const xi =
      polygon[i][1];

    const yj =
      polygon[j][0];

    const xj =
      polygon[j][1];

    const intersect =
      yi > lat !==
        yj > lat &&
      lng <
        ((xj - xi) *
          (lat - yi)) /
          ((yj - yi) ||
            0.000001) +
          xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

const NER_POLYGON = [
  [21.95, 88.75],
  [22.50, 89.10],
  [23.00, 89.70],
  [23.30, 90.60],
  [24.00, 91.00],
  [24.10, 92.00],
  [23.60, 92.70],
  [23.50, 93.40],
  [24.10, 94.00],
  [24.60, 94.80],
  [25.10, 95.20],
  [25.70, 95.70],
  [26.30, 96.10],
  [27.00, 96.60],
  [27.70, 97.20],
  [28.40, 97.45],
  [29.40, 97.10],
  [29.70, 96.20],
  [29.30, 95.20],
  [29.00, 94.20],
  [28.70, 93.20],
  [28.40, 92.30],
  [28.10, 91.40],
  [27.70, 90.60],
  [27.30, 89.70],
  [26.70, 89.00],
  [25.80, 88.50],
  [24.80, 88.30],
  [23.80, 88.20],
  [22.80, 88.30],
  [21.95, 88.75]
];

function generateMonitoringGrid() {
  const points = [];

  for (
    let lat =
      NER_BOUNDS.minLat;
    lat <=
    NER_BOUNDS.maxLat;
    lat += GRID_STEP
  ) {
    for (
      let lng =
        NER_BOUNDS.minLng;
      lng <=
      NER_BOUNDS.maxLng;
      lng += GRID_STEP
    ) {
      const latitude =
        Number(
          lat.toFixed(4)
        );

      const longitude =
        Number(
          lng.toFixed(4)
        );

      if (
        pointInPolygon(
          latitude,
          longitude,
          NER_POLYGON
        )
      ) {
        points.push({
          id:
            `GRID-${latitude}-${longitude}`,

          lat: latitude,
          lng: longitude
        });
      }
    }
  }

  return points;
}

function makeKey(
  lat,
  lng
) {
  return `${Number(
    lat
  ).toFixed(4)},${Number(
    lng
  ).toFixed(4)}`;
}

async function requestJSON(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        ...options,
        headers: {
          Accept:
            'application/json',
          'User-Agent':
            'GiriDrishti-AI/1.0',
          ...(options.headers || {})
        }
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `${response.status}: ${text.slice(
        0,
        300
      )}`
    );
  }

  return response.json();
}

function getCurrentValue(
  array,
  index
) {
  const value =
    Number(array?.[index]);

  return Number.isFinite(value)
    ? value
    : null;
}

async function fetchWeatherBatch(
  points
) {
  if (!points.length) {
    return new Map();
  }

  const latitude =
    points
      .map(point => point.lat)
      .join(',');

  const longitude =
    points
      .map(point => point.lng)
      .join(',');

  const url =
    `${OPEN_METEO}` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_gusts_10m,weather_code,soil_moisture_0_1cm' +
    '&hourly=precipitation,rain,soil_moisture_0_1cm' +
    '&past_hours=24' +
    '&forecast_hours=1' +
    '&timezone=auto';

  const data =
    await requestJSON(url);

  const responses =
    Array.isArray(data)
      ? data
      : [data];

  const result =
    new Map();

  responses.forEach(
    (weather, index) => {
      const point =
        points[index];

      if (!point) {
        return;
      }

      const current =
        weather.current ||
        {};

      const hourly =
        weather.hourly ||
        {};

      const precipitation =
        Array.isArray(
          hourly.precipitation
        )
          ? hourly.precipitation
          : [];

      const rain =
        Array.isArray(
          hourly.rain
        )
          ? hourly.rain
          : [];

      const hourlyTimes =
        Array.isArray(
          hourly.time
        )
          ? hourly.time
          : [];

      const currentTime =
        current.time
          ? new Date(
              current.time
            ).getTime()
          : Date.now();

      let rainfall24h = 0;

      for (
        let i = 0;
        i < hourlyTimes.length;
        i++
      ) {
        const timestamp =
          new Date(
            hourlyTimes[i]
          ).getTime();

        if (
          Number.isFinite(
            timestamp
          ) &&
          timestamp <=
            currentTime
        ) {
          const value =
            getCurrentValue(
              precipitation,
              i
            );

          const rainValue =
            getCurrentValue(
              rain,
              i
            );

          rainfall24h +=
            value ??
            rainValue ??
            0;
        }
      }

      const soil =
        getCurrentValue(
          [
            current[
              'soil_moisture_0_1cm'
            ]
          ],
          0
        );

      result.set(
        makeKey(
          point.lat,
          point.lng
        ),
        {
          rainfall:
            getCurrentValue(
              [
                current.precipitation
              ],
              0
            ),

          currentRain:
            getCurrentValue(
              [current.rain],
              0
            ),

          rainfallLast24h:
            Number(
              rainfall24h.toFixed(
                2
              )
            ),

          soilMoisture:
            soil === null
              ? null
              : Number(
                  soil.toFixed(
                    4
                  )
                ),

          humidity:
            getCurrentValue(
              [
                current.relative_humidity_2m
              ],
              0
            ),

          temperature:
            getCurrentValue(
              [
                current.temperature_2m
              ],
              0
            ),

          windSpeed:
            getCurrentValue(
              [
                current.wind_speed_10m
              ],
              0
            ),

          windGust:
            getCurrentValue(
              [
                current.wind_gusts_10m
              ],
              0
            ),

          weatherCode:
            current.weather_code ??
            null,

          weatherDataTime:
            current.time
              ? new Date(
                  current.time
                )
              : null,

          source:
            'Open-Meteo'
        }
      );
    }
  );

  return result;
}

async function fetchElevationBatch(
  points
) {
  const result =
    new Map();

  if (!points.length) {
    return result;
  }

  for (
    let start = 0;
    start < points.length;
    start +=
      ELEVATION_BATCH_SIZE
  ) {
    const batch =
      points.slice(
        start,
        start +
          ELEVATION_BATCH_SIZE
      );

    const latitude =
      batch
        .map(point => point.lat)
        .join(',');

    const longitude =
      batch
        .map(point => point.lng)
        .join(',');

    try {
      const data =
        await requestJSON(
          `${OPEN_METEO_ELEVATION}?latitude=${latitude}&longitude=${longitude}`
        );

      const elevations =
        Array.isArray(
          data.elevation
        )
          ? data.elevation
          : [];

      batch.forEach(
        (point, index) => {
          const elevation =
            Number(
              elevations[index]
            );

          if (
            Number.isFinite(
              elevation
            )
          ) {
            result.set(
              makeKey(
                point.lat,
                point.lng
              ),
              elevation
            );
          }
        }
      );
    } catch (error) {
      console.error(
        'Elevation batch failed:',
        error.message
      );
    }
  }

  return result;
}

function calculateSlopeFromNeighborhood(
  center,
  elevationMap
) {
  const offsets = [
    [0.01, 0],
    [-0.01, 0],
    [0, 0.01],
    [0, -0.01],
    [0.01, 0.01],
    [0.01, -0.01],
    [-0.01, 0.01],
    [-0.01, -0.01]
  ];

  const centerElevation =
    elevationMap.get(
      makeKey(
        center.lat,
        center.lng
      )
    );

  if (
    !Number.isFinite(
      centerElevation
    )
  ) {
    return null;
  }

  let maximumSlope = 0;

  for (
    const [dLat, dLng] of offsets
  ) {
    const lat =
      Number(
        (
          center.lat +
          dLat
        ).toFixed(4)
      );

    const lng =
      Number(
        (
          center.lng +
          dLng
        ).toFixed(4)
      );

    const elevation =
      elevationMap.get(
        makeKey(
          lat,
          lng
        )
      );

    if (
      !Number.isFinite(
        elevation
      )
    ) {
      continue;
    }

    const distance =
      haversineKm(
        center.lat,
        center.lng,
        lat,
        lng
      ) * 1000;

    if (
      distance <= 0
    ) {
      continue;
    }

    const rise =
      Math.abs(
        elevation -
          centerElevation
      );

    const slope =
      Math.atan(
        rise / distance
      ) *
      (180 / Math.PI);

    maximumSlope =
      Math.max(
        maximumSlope,
        slope
      );
  }

  return Number(
    clamp(
      maximumSlope,
      0,
      70
    ).toFixed(2)
  );
}

function haversineKm(
  lat1,
  lng1,
  lat2,
  lng2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) *
      Math.PI) /
    180;

  const dLng =
    ((lng2 - lng1) *
      Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) **
      2 +
    Math.cos(
      (lat1 * Math.PI) /
        180
    ) *
      Math.cos(
        (lat2 * Math.PI) /
          180
      ) *
      Math.sin(dLng / 2) **
        2;

  return (
    2 *
    R *
    Math.asin(
      Math.sqrt(a)
    )
  );
}

function historicalEvidence(
  lat,
  lng
) {
  const radiusKm = 20;

  let nearby = 0;

  for (
    const record of historicalRecords
  ) {
    const distance =
      haversineKm(
        lat,
        lng,
        record.latitude,
        record.longitude
      );

    if (
      distance <= radiusKm
    ) {
      nearby++;
    }
  }

  const score =
    nearby === 0
      ? 0
      : clamp(
          15 +
            nearby * 5
        );

  return {
    nearby,
    score: Math.round(
      score
    )
  };
}

async function reverseGeocode(
  lat,
  lng
) {
  const key =
    makeKey(
      lat,
      lng
    );

  if (
    geocodeCache.has(key)
  ) {
    return geocodeCache.get(
      key
    );
  }

  try {
    const url =
      `${NOMINATIM}/reverse` +
      `?format=jsonv2` +
      `&lat=${encodeURIComponent(
        lat
      )}` +
      `&lon=${encodeURIComponent(
        lng
      )}` +
      '&zoom=14' +
      '&addressdetails=1' +
      '&accept-language=en';

    const data =
      await requestJSON(
        url
      );

    const address =
      data.address || {};

    const result = {
      areaName:
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.suburb ||
        address.hamlet ||
        address.locality ||
        address.county ||
        'Area unavailable',

      district:
        address.county ||
        address.state_district ||
        '',

      state:
        address.state ||
        '',

      fullAddress:
        data.display_name ||
        ''
    };

    geocodeCache.set(
      key,
      result
    );

    return result;
  } catch {
    return {
      areaName:
        'Area unavailable',
      district: '',
      state: '',
      fullAddress: ''
    };
  }
}

async function predictBatch(
  inputs
) {
  if (!inputs.length) {
    return [];
  }

  try {
    const response =
      await fetch(
        `${ML_SERVICE_URL}/predict-batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Accept:
              'application/json'
          },
          body:
            JSON.stringify({
              features:
                inputs
            })
        }
      );

    if (!response.ok) {
      throw new Error(
        `ML ${response.status}`
      );
    }

    const data =
      await response.json();

    return Array.isArray(
      data.predictions
    )
      ? data.predictions
      : [];
  } catch (error) {
    console.warn(
      'Batch ML unavailable:',
      error.message
    );

    return inputs.map(
      calculateFallbackRisk
    );
  }
}

function calculateFallbackRisk(
  feature
) {
  const rainfall =
    clamp(
      (
        Number(
          feature.rainfallLast24h ||
            feature.rainfall ||
            0
        ) /
          100
      ) *
        100
    );

  const soil =
    clamp(
      (
        Number(
          feature.soilMoisture ||
            0
        ) /
          0.5
      ) *
        100
    );

  const slope =
    clamp(
      (
        Number(
          feature.slope ||
            0
        ) /
          45
      ) *
        100
    );

  const historical =
    clamp(
      Number(
        feature.historicalRisk ||
          0
      )
    );

  const score =
    Math.round(
      rainfall * 0.35 +
        soil * 0.25 +
        slope * 0.20 +
        historical * 0.20
    );

  return {
    probability:
      score / 100,
    aiScore:
      score,
    riskScore:
      score,
    riskLevel:
      getRiskLevel(
        score
      ),
    historicalRisk:
      historical
  };
}

function getRiskLevel(
  score
) {
  if (score >= 85) {
    return 'CRITICAL';
  }

  if (score >= 65) {
    return 'HIGH';
  }

  if (score >= 40) {
    return 'MODERATE';
  }

  return 'LOW';
}

function buildReasons(
  location
) {
  const reasons = [];

  if (
    Number(
      location.rainfallLast24h
    ) >= 50
  ) {
    reasons.push(
      'High 24-hour rainfall accumulation'
    );
  } else if (
    Number(
      location.rainfallLast24h
    ) >= 25
  ) {
    reasons.push(
      'Increasing rainfall accumulation'
    );
  }

  if (
    Number(
      location.soilMoisture
    ) >= 0.40
  ) {
    reasons.push(
      'High soil moisture'
    );
  }

  if (
    Number(
      location.slope
    ) >= 35
  ) {
    reasons.push(
      'Steep terrain'
    );
  }

  if (
    Number(
      location.nearbyHistoricalSlides
    ) > 0
  ) {
    reasons.push(
      `${location.nearbyHistoricalSlides} historical landslide records nearby`
    );
  }

  if (
    Number(
      location.windSpeed
    ) >= 35
  ) {
    reasons.push(
      'Strong wind conditions'
    );
  }

  if (!reasons.length) {
    reasons.push(
      'Environmental and terrain indicators continuously monitored'
    );
  }

  return reasons;
}

async function prepareTerrain(
  points
) {
  if (
    terrainCache.size >=
    points.length
  ) {
    return;
  }

  const terrainPoints = [];

  for (
    const point of points
  ) {
    terrainPoints.push(
      point
    );

    const offsets = [
      [0.01, 0],
      [-0.01, 0],
      [0, 0.01],
      [0, -0.01],
      [0.01, 0.01],
      [0.01, -0.01],
      [-0.01, 0.01],
      [-0.01, -0.01]
    ];

    for (
      const [
        dLat,
        dLng
      ] of offsets
    ) {
      terrainPoints.push({
        lat:
          Number(
            (
              point.lat +
              dLat
            ).toFixed(4)
          ),

        lng:
          Number(
            (
              point.lng +
              dLng
            ).toFixed(4)
          )
      });
    }
  }

  const unique =
    new Map();

  terrainPoints.forEach(
    point => {
      unique.set(
        makeKey(
          point.lat,
          point.lng
        ),
        point
      );
    }
  );

  const elevations =
    await fetchElevationBatch(
      Array.from(
        unique.values()
      )
    );

  const allElevationMap =
    new Map(
      elevations
    );

  for (
    const point of points
  ) {
    const elevation =
      allElevationMap.get(
        makeKey(
          point.lat,
          point.lng
        )
      );

    const slope =
      calculateSlopeFromNeighborhood(
        point,
        allElevationMap
      );

    terrainCache.set(
      makeKey(
        point.lat,
        point.lng
      ),
      {
        elevation:
          Number.isFinite(
            elevation
          )
            ? Number(
                elevation.toFixed(
                  2
                )
              )
            : null,

        slope,

        source:
          'Copernicus GLO-90 DEM via Open-Meteo'
      }
    );
  }
}

async function monitorCycle() {
  if (
    monitoringRunning
  ) {
    return monitoringLocations;
  }

  monitoringRunning = true;

  lastMonitoringStartedAt =
    new Date();

  try {
    if (
      !historicalRecords.length
    ) {
      loadHistoricalRecords();
    }

    const points =
      generateMonitoringGrid();

    await prepareTerrain(
      points
    );

    const weatherMap =
      new Map();

    for (
      let start = 0;
      start < points.length;
      start +=
        WEATHER_BATCH_SIZE
    ) {
      const batch =
        points.slice(
          start,
          start +
            WEATHER_BATCH_SIZE
        );

      try {
        const batchWeather =
          await fetchWeatherBatch(
            batch
          );

        for (
          const [
            key,
            value
          ] of batchWeather
        ) {
          weatherMap.set(
            key,
            value
          );
        }
      } catch (error) {
        console.error(
          'Weather batch failed:',
          error.message
        );
      }

      await sleep(50);
    }

    const rawLocations =
      points.map(
        point => {
          const key =
            makeKey(
              point.lat,
              point.lng
            );

          const weather =
            weatherMap.get(
              key
            );

          const terrain =
            terrainCache.get(
              key
            );

          const historical =
            historicalEvidence(
              point.lat,
              point.lng
            );

          return {
            id:
              point.id,

            lat:
              point.lat,

            lng:
              point.lng,

            rainfall:
              weather?.rainfall ??
              null,

            currentRain:
              weather?.currentRain ??
              null,

            rainfallLast24h:
              weather?.rainfallLast24h ??
              null,

            soilMoisture:
              weather?.soilMoisture ??
              null,

            humidity:
              weather?.humidity ??
              null,

            temperature:
              weather?.temperature ??
              null,

            windSpeed:
              weather?.windSpeed ??
              null,

            windGust:
              weather?.windGust ??
              null,

            weatherCode:
              weather?.weatherCode ??
              null,

            weatherDataTime:
              weather?.weatherDataTime ??
              null,

            elevation:
              terrain?.elevation ??
              null,

            slope:
              terrain?.slope ??
              null,

            historicalRisk:
              historical.score,

            nearbyHistoricalSlides:
              historical.nearby,

            dataStatus:
              weather &&
              terrain
                ? 'LIVE'
                : 'PARTIAL',

            weatherSource:
              weather?.source ||
              'Open-Meteo',

            terrainSource:
              terrain?.source ||
              'Copernicus GLO-90 DEM',

            historicalSource:
              'Geological Survey of India landslide inventory',

            checkedAt:
              new Date()
          };
        }
      );

    const mlInputs =
      rawLocations.map(
        location => ({
          rainfall:
            location.rainfallLast24h ??
            location.rainfall ??
            0,

          soilMoisture:
            location.soilMoisture ??
            0,

          slope:
            location.slope ??
            0,

          elevation:
            location.elevation ??
            0,

          historicalRisk:
            location.historicalRisk,

          latitude:
            location.lat,

          longitude:
            location.lng
        })
      );

    const predictions =
      await predictBatch(
        mlInputs
      );

    monitoringLocations =
      rawLocations.map(
        (
          location,
          index
        ) => {
          const prediction =
            predictions[index] ||
            calculateFallbackRisk(
              mlInputs[index]
            );

          const score =
            clamp(
              Math.round(
                Number(
                  prediction.riskScore ??
                    prediction.aiScore ??
                    0
                )
              )
            );

          const level =
            getRiskLevel(
              score
            );

          return {
            ...location,

            probability:
              Number(
                prediction.probability ??
                  score / 100
              ),

            aiScore:
              Number(
                prediction.aiScore ??
                  score
              ),

            riskScore:
              score,

            riskLevel:
              level,

            riskPointName:
              'AI Monitoring Point',

            pointName:
              'AI Monitoring Point',

            dynamic:
              true,

            automatic:
              true,

            monitoringInterval:
              '60 seconds',

            reasons:
              buildReasons({
                ...location,
                riskScore:
                  score,
                riskLevel:
                  level
              })
          };
        }
      );

    lastMonitoringCompletedAt =
      new Date();

    console.log(
      `GiriDrishti monitoring completed: ${monitoringLocations.length} locations`
    );

    return monitoringLocations;
  } catch (error) {
    console.error(
      'Monitoring cycle error:',
      error
    );

    return monitoringLocations;
  } finally {
    monitoringRunning =
      false;
  }
}

function startMonitoring() {
  if (
    monitoringTimer
  ) {
    return;
  }

  loadHistoricalRecords();

  monitorCycle();

  monitoringTimer =
    setInterval(
      monitorCycle,
      MONITOR_INTERVAL
    );

  console.log(
    'GiriDrishti automatic monitoring: ENABLED / 60 seconds'
  );
}

function stopMonitoring() {
  if (
    monitoringTimer
  ) {
    clearInterval(
      monitoringTimer
    );

    monitoringTimer =
      null;
  }
}

async function getLocations() {
  if (
    !monitoringLocations.length
  ) {
    await monitorCycle();
  }

  return monitoringLocations;
}

async function getHotspots() {
  const locations =
    await getLocations();

  return locations
    .filter(
      location =>
        location.riskLevel ===
          'HIGH' ||
        location.riskLevel ===
          'CRITICAL'
    )
    .sort(
      (a, b) =>
        b.riskScore -
        a.riskScore
    );
}

async function getExactLocation(
  lat,
  lng
) {
  const latitude =
    Number(lat);

  const longitude =
    Number(lng);

  if (
    !Number.isFinite(
      latitude
    ) ||
    !Number.isFinite(
      longitude
    )
  ) {
    throw new Error(
      'Valid coordinates are required'
    );
  }

  const point = {
    id:
      `LIVE-${latitude.toFixed(
        5
      )}-${longitude.toFixed(
        5
      )}`,

    lat:
      latitude,

    lng:
      longitude
  };

  await prepareTerrain([
    point
  ]);

  const weatherMap =
    await fetchWeatherBatch([
      point
    ]);

  const key =
    makeKey(
      latitude,
      longitude
    );

  const weather =
    weatherMap.get(key);

  const terrain =
    terrainCache.get(key);

  const historical =
    historicalEvidence(
      latitude,
      longitude
    );

  const geo =
    await reverseGeocode(
      latitude,
      longitude
    );

  const input = {
    rainfall:
      weather?.rainfallLast24h ??
      weather?.rainfall ??
      0,

    soilMoisture:
      weather?.soilMoisture ??
      0,

    slope:
      terrain?.slope ??
      0,

    elevation:
      terrain?.elevation ??
      0,

    historicalRisk:
      historical.score,

    latitude,
    longitude
  };

  const predictions =
    await predictBatch([
      input
    ]);

  const prediction =
    predictions[0] ||
    calculateFallbackRisk(
      input
    );

  const score =
    clamp(
      Math.round(
        Number(
          prediction.riskScore ??
            prediction.aiScore ??
            0
        )
      )
    );

  const riskLevel =
    getRiskLevel(
      score
    );

  return {
    id:
      point.id,

    lat:
      latitude,

    lng:
      longitude,

    areaName:
      geo.areaName,

    district:
      geo.district,

    state:
      geo.state,

    displayName:
      geo.fullAddress ||
      `${geo.areaName}, ${geo.state}`,

    fullAddress:
      geo.fullAddress,

    rainfall:
      weather?.rainfall ??
      null,

    currentRain:
      weather?.currentRain ??
      null,

    rainfallLast24h:
      weather?.rainfallLast24h ??
      null,

    soilMoisture:
      weather?.soilMoisture ??
      null,

    humidity:
      weather?.humidity ??
      null,

    temperature:
      weather?.temperature ??
      null,

    windSpeed:
      weather?.windSpeed ??
      null,

    windGust:
      weather?.windGust ??
      null,

    weatherCode:
      weather?.weatherCode ??
      null,

    elevation:
      terrain?.elevation ??
      null,

    slope:
      terrain?.slope ??
      null,

    historicalRisk:
      historical.score,

    nearbyHistoricalSlides:
      historical.nearby,

    probability:
      Number(
        prediction.probability ??
          score / 100
      ),

    aiScore:
      Number(
        prediction.aiScore ??
          score
      ),

    riskScore:
      score,

    riskLevel,

    riskPointName:
      'Live Risk Assessment',

    pointName:
      'Live Risk Assessment',

    reasons:
      buildReasons({
        rainfallLast24h:
          weather?.rainfallLast24h,
        soilMoisture:
          weather?.soilMoisture,
        slope:
          terrain?.slope,
        windSpeed:
          weather?.windSpeed,
        nearbyHistoricalSlides:
          historical.nearby
      }),

    weatherSource:
      weather?.source ||
      'Open-Meteo',

    terrainSource:
      terrain?.source ||
      'Copernicus GLO-90 DEM',

    historicalSource:
      'Geological Survey of India landslide inventory',

    weatherDataTime:
      weather?.weatherDataTime ??
      null,

    checkedAt:
      new Date(),

    automatic:
      true,

    dynamic:
      true
  };
}

function getStatus() {
  return {
    monitoring:
      true,

    automatic:
      true,

    intervalSeconds:
      60,

    locations:
      monitoringLocations.length,

    lastMonitoringStartedAt,

    lastMonitoringCompletedAt,

    monitoringRunning,

    historicalRecords:
      historicalRecords.length,

    dataSources: [
      'Open-Meteo',
      'Copernicus GLO-90 DEM',
      'Geological Survey of India',
      'OpenStreetMap Nominatim',
      'GiriDrishti AI ML Service'
    ]
  };
}

module.exports = {
  startMonitoring,
  stopMonitoring,
  monitorCycle,
  getLocations,
  getHotspots,
  getExactLocation,
  getStatus,
  loadHistoricalRecords
};