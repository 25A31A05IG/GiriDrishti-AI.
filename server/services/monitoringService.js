const fs = require('fs');
const path = require('path');
const axios = require('axios');

const MonitoringSnapshot =
  require('../models/MonitoringSnapshot');

const GeneratedAlert =
  require('../models/GeneratedAlert');

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL ||
  'http://localhost:8000';

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
    'gsi_ner_inventory.csv'
  ),
  path.join(
    __dirname,
    '..',
    '..',
    'ml',
    'data',
    'gsi_landslide_clean.csv'
  )
];

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

let historicalRecords = [];
let monitoringRunning = false;
let monitoringTimer = null;

const WEATHER_CACHE = new Map();
const ELEVATION_CACHE = new Map();
const GEOCODE_CACHE = new Map();

const WEATHER_CACHE_MS =
  55 * 1000;

const ELEVATION_CACHE_MS =
  24 * 60 * 60 * 1000;

const GEOCODE_CACHE_MS =
  24 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? '')
    .trim()
    .replace(/^"|"$/g, '');
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (
      char === ',' &&
      !insideQuotes
    ) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
}

function loadHistoricalData() {
  const file = GSI_FILES.find(
    item => fs.existsSync(item)
  );

  if (!file) {
    console.warn(
      'GSI landslide inventory not found.'
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
    parseCSVLine(lines[0]).map(clean);

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
              clean(values[index]);
          }
        );

        const lat =
          Number(row.latitude);

        const lng =
          Number(row.longitude);

        const state =
          row.state || '';

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return null;
        }

        return {
          ...row,
          latitude: lat,
          longitude: lng,
          state
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
    `Loaded ${historicalRecords.length} Northeast GSI records.`
  );
}

function normalizeCoordinate(value) {
  return Number(
    Number(value).toFixed(3)
  );
}

function makeLocationKey(
  lat,
  lng
) {
  return `${normalizeCoordinate(
    lat
  )}_${normalizeCoordinate(lng)}`;
}

function distanceKm(
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
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLng / 2) ** 2;

  return (
    2 *
    R *
    Math.asin(
      Math.sqrt(a)
    )
  );
}

function getHistoricalEvidence(
  lat,
  lng
) {
  const radiusKm = 15;

  let nearby = 0;

  for (const record of historicalRecords) {
    const distance =
      distanceKm(
        lat,
        lng,
        record.latitude,
        record.longitude
      );

    if (distance <= radiusKm) {
      nearby++;
    }
  }

  if (nearby === 0) {
    return {
      nearby,
      score: 0
    };
  }

  const score = Math.min(
    100,
    Math.round(
      20 +
        nearby * 8
    )
  );

  return {
    nearby,
    score
  };
}

function buildMonitoringPoints() {
  if (!historicalRecords.length) {
    return [];
  }

  const cells = new Map();

  for (const record of historicalRecords) {
    const lat =
      Math.round(
        record.latitude * 10
      ) / 10;

    const lng =
      Math.round(
        record.longitude * 10
      ) / 10;

    const key =
      `${lat.toFixed(
        1
      )}_${lng.toFixed(1)}`;

    if (!cells.has(key)) {
      cells.set(key, {
        lat,
        lng,
        records: []
      });
    }

    cells
      .get(key)
      .records.push(record);
  }

  return Array.from(
    cells.values()
  ).map(cell => {
    const states =
      cell.records
        .map(x => x.state)
        .filter(Boolean);

    const state =
      states.length
        ? states.sort(
            (a, b) =>
              states.filter(
                x => x === b
              ).length -
              states.filter(
                x => x === a
              ).length
          )[0]
        : '';

    return {
      id: `cell-${cell.lat}-${cell.lng}`,
      lat: cell.lat,
      lng: cell.lng,
      state
    };
  });
}

async function fetchJSON(
  url,
  options = {}
) {
  const response =
    await axios.get(
      url,
      {
        timeout:
          options.timeout ||
          15000,
        headers: {
          Accept:
            'application/json',
          'User-Agent':
            'GiriDrishti-AI/1.0'
        }
      }
    );

  return response.data;
}

async function getWeather(
  lat,
  lng
) {
  const key =
    makeLocationKey(
      lat,
      lng
    );

  const cached =
    WEATHER_CACHE.get(key);

  if (
    cached &&
    Date.now() -
      cached.time <
      WEATHER_CACHE_MS
  ) {
    return cached.data;
  }

  const url =
    'https://api.open-meteo.com/v1/forecast';

  const data =
    await fetchJSON(
      url +
        `?latitude=${encodeURIComponent(
          lat
        )}` +
        `&longitude=${encodeURIComponent(
          lng
        )}` +
        '&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_moisture_0_to_1cm' +
        '&hourly=precipitation,soil_moisture_0_to_1cm' +
        '&past_days=1' +
        '&forecast_days=1' +
        '&timezone=auto'
    );

  const current =
    data.current || {};

  const hourly =
    data.hourly || {};

  const times =
    Array.isArray(
      hourly.time
    )
      ? hourly.time
      : [];

  const precipitation =
    Array.isArray(
      hourly.precipitation
    )
      ? hourly.precipitation
      : [];

  const soil =
    Array.isArray(
      hourly[
        'soil_moisture_0_to_1cm'
      ]
    )
      ? hourly[
          'soil_moisture_0_to_1cm'
        ]
      : [];

  const now =
    new Date(
      current.time ||
        Date.now()
    ).getTime();

  let rainfallLastHour =
    Number(
      current.precipitation
    );

  let rainfallLast24h = 0;

  for (
    let i = 0;
    i < times.length;
    i++
  ) {
    const timestamp =
      new Date(
        times[i]
      ).getTime();

    if (
      Number.isFinite(timestamp) &&
      timestamp <= now &&
      timestamp >=
        now -
          24 *
            60 *
            60 *
            1000
    ) {
      rainfallLast24h +=
        Number(
          precipitation[i] || 0
        );
    }
  }

  const currentSoil =
    Number(
      current[
        'soil_moisture_0_to_1cm'
      ]
    );

  const weatherTime =
    current.time
      ? new Date(
          current.time
        )
      : null;

  const result = {
    rainfall:
      Number.isFinite(
        Number(
          current.precipitation
        )
      )
        ? Number(
            current.precipitation
          )
        : null,

    rainfallLastHour:
      Number.isFinite(
        rainfallLastHour
      )
        ? rainfallLastHour
        : null,

    rainfallLast24h:
      Number.isFinite(
        rainfallLast24h
      )
        ? Number(
            rainfallLast24h.toFixed(
              2
            )
          )
        : null,

    soilMoisture:
      Number.isFinite(
        currentSoil
      )
        ? currentSoil
        : null,

    temperature:
      Number.isFinite(
        Number(
          current.temperature_2m
        )
      )
        ? Number(
            current.temperature_2m
          )
        : null,

    humidity:
      Number.isFinite(
        Number(
          current.relative_humidity_2m
        )
      )
        ? Number(
            current.relative_humidity_2m
          )
        : null,

    windSpeed:
      Number.isFinite(
        Number(
          current.wind_speed_10m
        )
      )
        ? Number(
            current.wind_speed_10m
          )
        : null,

    weatherDataTime:
      weatherTime,

    weatherSource:
      'Open-Meteo'
  };

  WEATHER_CACHE.set(
    key,
    {
      time: Date.now(),
      data: result
    }
  );

  return result;
}

async function getElevation(
  lat,
  lng
) {
  const key =
    makeLocationKey(
      lat,
      lng
    );

  const cached =
    ELEVATION_CACHE.get(key);

  if (
    cached &&
    Date.now() -
      cached.time <
      ELEVATION_CACHE_MS
  ) {
    return cached.data;
  }

  const offsets = [
    [0, 0],
    [0.01, 0],
    [-0.01, 0],
    [0, 0.01],
    [0, -0.01],
    [0.01, 0.01],
    [0.01, -0.01],
    [-0.01, 0.01],
    [-0.01, -0.01]
  ];

  const latitudes =
    offsets.map(
      offset =>
        lat + offset[0]
    );

  const longitudes =
    offsets.map(
      offset =>
        lng + offset[1]
    );

  const data =
    await fetchJSON(
      'https://api.open-meteo.com/v1/elevation' +
        `?latitude=${latitudes.join(
          ','
        )}` +
        `&longitude=${longitudes.join(
          ','
        )}`
    );

  const elevations =
    Array.isArray(
      data.elevation
    )
      ? data.elevation.map(
          Number
        )
      : [];

  const center =
    Number(
      elevations[0]
    );

  let maxSlope = 0;

  for (
    let i = 1;
    i < elevations.length;
    i++
  ) {
    if (
      !Number.isFinite(
        elevations[i]
      ) ||
      !Number.isFinite(
        center
      )
    ) {
      continue;
    }

    const distance =
      distanceKm(
        lat,
        lng,
        latitudes[i],
        longitudes[i]
      ) * 1000;

    if (
      distance <= 0
    ) {
      continue;
    }

    const rise =
      Math.abs(
        elevations[i] -
          center
      );

    const slope =
      Math.atan(
        rise / distance
      ) *
      (180 / Math.PI);

    maxSlope =
      Math.max(
        maxSlope,
        slope
      );
  }

  const result = {
    elevation:
      Number.isFinite(center)
        ? Number(
            center.toFixed(2)
          )
        : null,

    slope:
      Number.isFinite(
        maxSlope
      )
        ? Number(
            Math.min(
              70,
              maxSlope
            ).toFixed(2)
          )
        : null,

    source:
      'Open-Meteo Elevation DEM'
  };

  ELEVATION_CACHE.set(
    key,
    {
      time: Date.now(),
      data: result
    }
  );

  return result;
}

async function reverseGeocode(
  lat,
  lng
) {
  const key =
    makeLocationKey(
      lat,
      lng
    );

  const cached =
    GEOCODE_CACHE.get(key);

  if (
    cached &&
    Date.now() -
      cached.time <
      GEOCODE_CACHE_MS
  ) {
    return cached.data;
  }

  const data =
    await fetchJSON(
      'https://nominatim.openstreetmap.org/reverse' +
        `?format=jsonv2` +
        `&lat=${encodeURIComponent(
          lat
        )}` +
        `&lon=${encodeURIComponent(
          lng
        )}` +
        '&zoom=14' +
        '&addressdetails=1' +
        '&accept-language=en'
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
      address.county ||
      'Area unavailable',

    district:
      address.county ||
      address.state_district ||
      '',

    state:
      address.state ||
      '',

    displayName:
      data.display_name ||
      ''
  };

  GEOCODE_CACHE.set(
    key,
    {
      time: Date.now(),
      data: result
    }
  );

  return result;
}

async function getMLPrediction(
  features
) {
  try {
    const response =
      await axios.post(
        `${ML_SERVICE_URL}/predict`,
        features,
        {
          timeout: 20000,
          headers: {
            'Content-Type':
              'application/json'
          }
        }
      );

    return response.data;
  } catch (error) {
    console.error(
      'ML prediction failed:',
      error.message
    );

    return null;
  }
}

function fallbackRisk(
  rainfall24,
  soilMoisture,
  slope,
  historicalRisk
) {
  const rain =
    Math.min(
      100,
      (Number(
        rainfall24 || 0
      ) /
        100) *
        100
    );

  const soil =
    Math.min(
      100,
      (Number(
        soilMoisture || 0
      ) /
        0.5) *
        100
    );

  const terrain =
    Math.min(
      100,
      (Number(
        slope || 0
      ) /
        45) *
        100
    );

  return Math.round(
    rain * 0.30 +
      soil * 0.25 +
      terrain * 0.20 +
      Number(
        historicalRisk || 0
      ) *
        0.25
  );
}

function determineLevel(
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
  data
) {
  const reasons = [];

  if (
    Number(
      data.rainfallLast24h
    ) >= 50
  ) {
    reasons.push(
      'High rainfall accumulation in the last 24 hours'
    );
  } else if (
    Number(
      data.rainfallLast24h
    ) >= 25
  ) {
    reasons.push(
      'Increasing rainfall accumulation'
    );
  }

  if (
    Number(
      data.soilMoisture
    ) >= 0.40
  ) {
    reasons.push(
      'High soil moisture'
    );
  }

  if (
    Number(
      data.slope
    ) >= 35
  ) {
    reasons.push(
      'Steep terrain'
    );
  }

  if (
    Number(
      data.nearbyHistoricalSlides
    ) > 0
  ) {
    reasons.push(
      `${data.nearbyHistoricalSlides} historical landslide records nearby`
    );
  }

  if (
    !reasons.length
  ) {
    reasons.push(
      'Multiple environmental and terrain indicators evaluated'
    );
  }

  return reasons;
}

async function createOrUpdateAlert(
  location
) {
  const level =
    String(
      location.riskLevel
    ).toUpperCase();

  const key =
    location.locationKey;

  if (
    level !== 'HIGH' &&
    level !== 'CRITICAL'
  ) {
    await GeneratedAlert.updateMany(
      {
        locationKey: key,
        status: 'ACTIVE'
      },
      {
        $set: {
          status: 'RESOLVED',
          resolvedAt:
            new Date()
        }
      }
    );

    return;
  }

  const existing =
    await GeneratedAlert.findOne(
      {
        locationKey: key,
        status: 'ACTIVE'
      }
    ).sort({
      generatedAt: -1
    });

  const reasons =
    buildReasons(
      location
    );

  const message =
    `${level} landslide risk detected at ${location.areaName}. ` +
    `Current AI risk score is ${location.riskScore}%.`;

  if (existing) {
    existing.riskScore =
      location.riskScore;

    existing.riskLevel =
      level;

    existing.rainfallLast24h =
      location.rainfallLast24h;

    existing.soilMoisture =
      location.soilMoisture;

    existing.slope =
      location.slope;

    existing.historicalRisk =
      location.historicalRisk;

    existing.nearbyHistoricalSlides =
      location.nearbyHistoricalSlides;

    existing.reasons =
      reasons;

    existing.message =
      message;

    await existing.save();

    return existing;
  }

  const alert =
    await GeneratedAlert.create({
      locationKey: key,
      areaName:
        location.areaName,
      district:
        location.district,
      state:
        location.state,
      lat: location.lat,
      lng: location.lng,
      riskScore:
        location.riskScore,
      riskLevel:
        level,
      rainfallLast24h:
        location.rainfallLast24h,
      soilMoisture:
        location.soilMoisture,
      slope:
        location.slope,
      historicalRisk:
        location.historicalRisk,
      nearbyHistoricalSlides:
        location.nearbyHistoricalSlides,
      message,
      reasons,
      status: 'ACTIVE',
      generatedAt:
        new Date()
    });

  return alert;
}

async function evaluateLocation(
  point
) {
  const now =
    new Date();

  let weather = null;
  let terrain = null;
  let geo = null;

  try {
    weather =
      await getWeather(
        point.lat,
        point.lng
      );
  } catch (error) {
    console.error(
      'Weather failed:',
      point.lat,
      point.lng,
      error.message
    );
  }

  try {
    terrain =
      await getElevation(
        point.lat,
        point.lng
      );
  } catch (error) {
    console.error(
      'Terrain failed:',
      point.lat,
      point.lng,
      error.message
    );
  }

  try {
    geo =
      await reverseGeocode(
        point.lat,
        point.lng
      );
  } catch (error) {
    console.error(
      'Geocoding failed:',
      point.lat,
      point.lng,
      error.message
    );
  }

  const historical =
    getHistoricalEvidence(
      point.lat,
      point.lng
    );

  const rainfall =
    weather?.rainfall ??
    null;

  const rainfallLast24h =
    weather?.rainfallLast24h ??
    null;

  const soilMoisture =
    weather?.soilMoisture ??
    null;

  const temperature =
    weather?.temperature ??
    null;

  const windSpeed =
    weather?.windSpeed ??
    null;

  const elevation =
    terrain?.elevation ??
    null;

  const slope =
    terrain?.slope ??
    null;

  const hasCoreData =
    rainfallLast24h !== null ||
    soilMoisture !== null ||
    elevation !== null;

  const mlInput = {
    rainfall:
      rainfallLast24h ??
      rainfall ??
      0,

    soilMoisture:
      soilMoisture ??
      0,

    slope:
      slope ??
      0,

    elevation:
      elevation ??
      0,

    historicalRisk:
      historical.score,

    latitude:
      point.lat,

    longitude:
      point.lng
  };

  const prediction =
    hasCoreData
      ? await getMLPrediction(
          mlInput
        )
      : null;

  let aiScore =
    Number(
      prediction?.aiScore
    );

  let riskScore =
    Number(
      prediction?.riskScore
    );

  if (
    !Number.isFinite(
      aiScore
    )
  ) {
    aiScore = null;
  }

  if (
    !Number.isFinite(
      riskScore
    )
  ) {
    riskScore =
      fallbackRisk(
        rainfallLast24h,
        soilMoisture,
        slope,
        historical.score
      );
  }

  riskScore =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          riskScore
        )
      )
    );

  const riskLevel =
    determineLevel(
      riskScore
    );

  const result = {
    id:
      point.id,

    locationKey:
      makeLocationKey(
        point.lat,
        point.lng
      ),

    lat:
      point.lat,

    lng:
      point.lng,

    areaName:
      geo?.areaName ||
      'Area unavailable',

    district:
      geo?.district ||
      '',

    state:
      geo?.state ||
      point.state ||
      '',

    displayName:
      geo?.displayName ||
      '',

    riskPointName:
      'AI Risk Assessment',

    pointName:
      'AI Risk Assessment',

    rainfall,
    rainfallLastHour:
      weather?.rainfallLastHour ??
      null,

    rainfallLast24h,

    soilMoisture,

    temperature,

    humidity:
      weather?.humidity ??
      null,

    windSpeed,

    elevation,

    slope,

    historicalRisk:
      historical.score,

    nearbyHistoricalSlides:
      historical.nearby,

    probability:
      Number.isFinite(
        Number(
          prediction?.probability
        )
      )
        ? Number(
            prediction.probability
          )
        : riskScore / 100,

    aiScore,

    riskScore,

    riskLevel,

    dataStatus:
      hasCoreData
        ? 'LIVE'
        : 'UNAVAILABLE',

    weatherDataTime:
      weather?.weatherDataTime ??
      null,

    weatherSource:
      weather?.weatherSource ||
      'Open-Meteo',

    terrainSource:
      terrain?.source ||
      'Open-Meteo Elevation DEM',

    historicalSource:
      'Geological Survey of India landslide inventory',

    checkedAt:
      now,

    updatedAt:
      now,

    source:
      'Open-Meteo + DEM + GSI'
  };

  await MonitoringSnapshot.findOneAndUpdate(
    {
      locationKey:
        result.locationKey
    },
    result,
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert:
        true
    }
  );

  await createOrUpdateAlert(
    result
  );

  return result;
}

async function monitorOnce() {
  if (monitoringRunning) {
    return;
  }

  monitoringRunning = true;

  try {
    if (
      !historicalRecords.length
    ) {
      loadHistoricalData();
    }

    const points =
      buildMonitoringPoints();

    console.log(
      `GiriDrishti monitoring cycle: ${points.length} locations`
    );

    const BATCH_SIZE = 8;

    for (
      let i = 0;
      i < points.length;
      i += BATCH_SIZE
    ) {
      const batch =
        points.slice(
          i,
          i + BATCH_SIZE
        );

      await Promise.all(
        batch.map(
          point =>
            evaluateLocation(
              point
            ).catch(error => {
              console.error(
                'Location monitoring error:',
                point.lat,
                point.lng,
                error.message
              );
            })
        )
      );
    }

    console.log(
      `Monitoring cycle completed at ${new Date().toISOString()}`
    );
  } catch (error) {
    console.error(
      'Monitoring cycle failed:',
      error
    );
  } finally {
    monitoringRunning = false;
  }
}

function startMonitoring() {
  if (monitoringTimer) {
    return;
  }

  loadHistoricalData();

  monitorOnce();

  monitoringTimer =
    setInterval(
      monitorOnce,
      60 * 1000
    );

  console.log(
    'GiriDrishti automatic monitoring started: every 60 seconds'
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

async function getCurrentLocations() {
  return MonitoringSnapshot.find(
    {}
  )
    .sort({
      riskScore: -1
    })
    .lean();
}

async function getLocationReport(
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
      'Invalid coordinates'
    );
  }

  const point = {
    id:
      `live-${latitude}-${longitude}`,
    lat:
      latitude,
    lng:
      longitude
  };

  return evaluateLocation(
    point
  );
}

async function getCurrentAlerts() {
  return GeneratedAlert.find({
    status: 'ACTIVE'
  })
    .sort({
      generatedAt: -1
    })
    .lean();
}

module.exports = {
  loadHistoricalData,
  buildMonitoringPoints,
  monitorOnce,
  startMonitoring,
  stopMonitoring,
  getCurrentLocations,
  getLocationReport,
  getCurrentAlerts
};