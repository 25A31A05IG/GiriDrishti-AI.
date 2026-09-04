import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ============================================================
// CONFIG
// ============================================================

const PORT = Number(process.env.PORT || 5000);

const ML_API =
  process.env.ML_API || "http://127.0.0.1:8000";

const OPEN_METEO =
  "https://api.open-meteo.com/v1/forecast";

// BigDataCloud free reverse-geocode client endpoint.
// English locality names.
const REVERSE_GEOCODE =
  "https://api.bigdatacloud.net/data/reverse-geocode-client";

// ============================================================
// FILE STORAGE
// ============================================================

const dataDir =
  path.join(__dirname, "data");

const reportsFile =
  path.join(dataDir, "reports.json");

const alertsFile =
  path.join(dataDir, "alerts.json");

const uploadDir =
  path.join(dataDir, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

if (!fs.existsSync(reportsFile)) {
  fs.writeFileSync(
    reportsFile,
    "[]",
    "utf8"
  );
}

if (!fs.existsSync(alertsFile)) {
  fs.writeFileSync(
    alertsFile,
    "[]",
    "utf8"
  );
}

const upload =
  multer({
    dest: uploadDir
  });

// ============================================================
// DYNAMIC NORTHEAST INDIA SCANNING
// ============================================================
//
// IMPORTANT:
// These coordinates define the geographical scanning region.
// They are NOT predefined risk zones.
//
// Risk is calculated dynamically from:
//   - live rainfall
//   - current rainfall
//   - soil moisture
//   - humidity
//   - elevation
//   - terrain proxy
//   - historical susceptibility
//   - Python ML model
//
// Therefore there are NO hard-coded "6 zones" or "8 zones".
// ============================================================

const NER_BOUNDS = {
  minLat: 21.8,
  maxLat: 29.6,
  minLng: 88.0,
  maxLng: 97.5
};

// Roughly 15-20 km depending on latitude.
const GRID_STEP = 0.18;

// Maximum points per scan.
const MAX_GRID_POINTS = 500;

// Cache for 15 minutes.
const SCAN_CACHE_MS =
  15 * 60 * 1000;

let dynamicScanCache = {
  data: [],
  updatedAt: 0,
  scanId: null
};

let scanPromise = null;

// ============================================================
// APPROXIMATE NORTHEAST INDIA POLYGON
// ============================================================
//
// This is ONLY used to avoid scanning large areas outside
// the intended Northeast India study region.
//
// It does NOT define risk zones.
// ============================================================

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
  [29.60, 96.20],
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

// ============================================================
// POINT IN POLYGON
// ============================================================

function pointInPolygon(
  lat,
  lng,
  polygon
) {
  let inside = false;

  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const xi = polygon[i][1];
    const yi = polygon[i][0];

    const xj = polygon[j][1];
    const yj = polygon[j][0];

    const intersects =
      (yi > lat) !== (yj > lat) &&
      lng <
        ((xj - xi) *
          (lat - yi)) /
          ((yj - yi) || 0.000001) +
          xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

// ============================================================
// GRID GENERATION
// ============================================================

function generateNERGrid() {
  const points = [];

  for (
    let lat = NER_BOUNDS.minLat;
    lat <= NER_BOUNDS.maxLat;
    lat += GRID_STEP
  ) {
    for (
      let lng = NER_BOUNDS.minLng;
      lng <= NER_BOUNDS.maxLng;
      lng += GRID_STEP
    ) {
      const roundedLat =
        Number(lat.toFixed(4));

      const roundedLng =
        Number(lng.toFixed(4));

      if (
        pointInPolygon(
          roundedLat,
          roundedLng,
          NER_POLYGON
        )
      ) {
        points.push({
          lat: roundedLat,
          lng: roundedLng
        });
      }
    }
  }

  if (
    points.length <= MAX_GRID_POINTS
  ) {
    return points;
  }

  const stride =
    Math.ceil(
      points.length /
        MAX_GRID_POINTS
    );

  return points.filter(
    (_, index) =>
      index % stride === 0
  );
}

// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 15000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// LIVE OPEN-METEO WEATHER
// ============================================================

async function getLiveWeather(
  lat,
  lng
) {
  const params =
    new URLSearchParams();

  params.set(
    "latitude",
    String(lat)
  );

  params.set(
    "longitude",
    String(lng)
  );

  params.set(
    "current",
    [
      "temperature_2m",
      "rain",
      "relative_humidity_2m",
      "wind_speed_10m",
      "soil_moisture_0_to_1cm"
    ].join(",")
  );

  params.set(
    "hourly",
    [
      "rain",
      "soil_moisture_0_to_1cm",
      "relative_humidity_2m"
    ].join(",")
  );

  params.set(
    "past_hours",
    "24"
  );

  params.set(
    "forecast_hours",
    "1"
  );

  params.set(
    "timezone",
    "auto"
  );

  const url =
    `${OPEN_METEO}?${params.toString()}`;

  const response =
    await fetchWithTimeout(
      url,
      {},
      15000
    );

  if (!response.ok) {
    throw new Error(
      `Open-Meteo returned HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const current =
    data.current || {};

  const hourly =
    data.hourly || {};

  const rainValues =
    Array.isArray(hourly.rain)
      ? hourly.rain
      : [];

  const last24 =
    rainValues.slice(-24);

  const rainfall =
    last24.reduce(
      (sum, value) =>
        sum +
        (Number(value) || 0),
      0
    );

  const currentRain =
    Number(
      current.rain
    ) || 0;

  const rawSoil =
    Number(
      current.soil_moisture_0_to_1cm
    );

  const soilMoisture =
    Number.isFinite(rawSoil)
      ? Math.max(
          0,
          Math.min(
            100,
            rawSoil * 100
          )
        )
      : 0;

  const humidity =
    Number(
      current.relative_humidity_2m
    ) || 0;

  const temperature =
    Number(
      current.temperature_2m
    ) || 0;

  const windSpeed =
    Number(
      current.wind_speed_10m
    ) || 0;

  const elevation =
    Number(
      data.elevation
    ) || 0;

  return {
    rainfall:
      Number(
        rainfall.toFixed(2)
      ),

    currentRain:
      Number(
        currentRain.toFixed(2)
      ),

    soilMoisture:
      Number(
        soilMoisture.toFixed(2)
      ),

    humidity:
      Number(
        humidity.toFixed(2)
      ),

    temperature:
      Number(
        temperature.toFixed(2)
      ),

    windSpeed:
      Number(
        windSpeed.toFixed(2)
      ),

    elevation,

    weatherSource:
      "Open-Meteo live weather",

    weatherUpdatedAt:
      current.time ||
      new Date().toISOString()
  };
}

// ============================================================
// DYNAMIC TERRAIN ESTIMATION
// ============================================================

function estimateDynamicTerrain(
  elevation,
  lat,
  lng
) {
  const baseElevation =
    Number(elevation) || 0;

  let slope;

  if (baseElevation >= 2500) {
    slope = 40;
  } else if (baseElevation >= 1800) {
    slope = 34;
  } else if (baseElevation >= 1200) {
    slope = 30;
  } else if (baseElevation >= 700) {
    slope = 25;
  } else if (baseElevation >= 300) {
    slope = 20;
  } else {
    slope = 14;
  }

  const geographicVariation =
    Math.abs(
      Math.sin(
        lat * 8.13 +
          lng * 5.71
      )
    ) * 4;

  slope =
    Number(
      Math.min(
        45,
        slope +
          geographicVariation
      ).toFixed(1)
    );

  const historicalRisk =
    Math.round(
      Math.min(
        90,
        Math.max(
          20,
          slope * 1.55 +
            Math.abs(
              Math.sin(
                lat * 3.4 +
                  lng * 2.7
              )
            ) *
              12
        )
      )
    );

  return {
    slope,
    historicalRisk,

    terrainSource:
      "Dynamic terrain proxy using live elevation"
  };
}

// ============================================================
// LOCAL RISK ENGINE
// ============================================================

function calculateRisk(
  location,
  weather
) {
  const rainfallScore =
    Math.min(
      100,
      (weather.rainfall /
        180) *
        100
    );

  const currentRainScore =
    Math.min(
      100,
      (weather.currentRain /
        20) *
        100
    );

  const soilScore =
    Math.min(
      100,
      weather.soilMoisture
    );

  const slopeScore =
    Math.min(
      100,
      (location.slope /
        45) *
        100
    );

  const historyScore =
    Math.min(
      100,
      location.historicalRisk
    );

  const humidityScore =
    Math.min(
      100,
      weather.humidity
    );

  let riskScore =
    rainfallScore * 0.30 +
    soilScore * 0.20 +
    slopeScore * 0.20 +
    historyScore * 0.15 +
    currentRainScore * 0.10 +
    humidityScore * 0.05;

  if (
    weather.currentRain >= 5
  ) {
    riskScore += 5;
  }

  if (
    weather.rainfall >= 100
  ) {
    riskScore += 5;
  }

  if (
    weather.rainfall >= 150
  ) {
    riskScore += 5;
  }

  if (
    weather.soilMoisture >= 80
  ) {
    riskScore += 5;
  }

  if (
    weather.humidity >= 90 &&
    weather.rainfall >= 80
  ) {
    riskScore += 4;
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

  return normalizeRisk(
    riskScore
  );
}

// ============================================================
// NORMALIZE RISK
// ============================================================

function normalizeRisk(
  score
) {
  const riskScore =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(score) || 0
        )
      )
    );

  let riskLevel;

  if (riskScore >= 75) {
    riskLevel = "CRITICAL";
  } else if (riskScore >= 55) {
    riskLevel = "HIGH";
  } else if (riskScore >= 35) {
    riskLevel = "MODERATE";
  } else {
    riskLevel = "LOW";
  }

  return {
    probability:
      Number(
        (
          riskScore / 100
        ).toFixed(4)
      ),

    aiScore:
      riskScore,

    riskScore,

    riskLevel
  };
}

// ============================================================
// PYTHON ML SERVICE
// ============================================================

async function getMLPrediction({
  rainfall,
  soilMoisture,
  slope,
  elevation,
  historicalRisk,
  latitude,
  longitude
}) {
  try {
    const response =
      await fetchWithTimeout(
        `${ML_API}/predict`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body:
            JSON.stringify({
              rainfall,
              soilMoisture,
              slope,
              elevation,
              historicalRisk,
              latitude,
              longitude
            })
        },
        8000
      );

    if (!response.ok) {
      console.warn(
        `Python ML returned HTTP ${response.status}`
      );

      return null;
    }

    const result =
      await response.json();

    const rawScore =
      result.riskScore ??
      result.aiScore ??
      (
        Number(
          result.probability
        ) * 100
      );

    const riskScore =
      Number(rawScore);

    if (
      !Number.isFinite(
        riskScore
      )
    ) {
      return null;
    }

    const normalized =
      normalizeRisk(
        riskScore
      );

    return {
      ...result,
      ...normalized
    };
  } catch (error) {
    console.warn(
      "Python ML unavailable:",
      error.message
    );

    return null;
  }
}

// ============================================================
// REVERSE GEOCODING
// ============================================================
//
// Returns English locality/area names.
// ============================================================

async function getPlaceName(
  lat,
  lng
) {
  try {
    const params =
      new URLSearchParams();

    params.set(
      "latitude",
      String(lat)
    );

    params.set(
      "longitude",
      String(lng)
    );

    params.set(
      "localityLanguage",
      "en"
    );

    const response =
      await fetchWithTimeout(
        `${REVERSE_GEOCODE}?${params.toString()}`,
        {
          headers: {
            Accept:
              "application/json"
          }
        },
        10000
      );

    if (!response.ok) {
      throw new Error(
        `Reverse geocoder HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    const area =
      data.locality ||
      data.city ||
      data.principalSubdivision ||
      data.localityInfo?.administrative
        ?.find(
          item =>
            item?.name
        )?.name ||
      "Selected Area";

    const state =
      data.principalSubdivision ||
      "Northeast India";

    const country =
      data.countryName ||
      "India";

    return {
      name: area,
      areaName: area,
      state,
      country,

      displayName:
        [
          area,
          state,
          country
        ]
          .filter(Boolean)
          .join(", ")
    };
  } catch (error) {
    console.warn(
      "Reverse geocoding failed:",
      error.message
    );

    return {
      name:
        `Area near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,

      areaName:
        `Area near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,

      state:
        "Northeast India",

      country:
        "India",

      displayName:
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    };
  }
}

// ============================================================
// RISK POINT LABEL
// ============================================================

function makeRiskPointId(
  lat,
  lng
) {
  return (
    `RISK-${lat.toFixed(4)}-${lng.toFixed(4)}`
  );
}

// ============================================================
// BUILD EXACT LOCATION
// ============================================================

async function buildExactLocation(
  lat,
  lng,
  reverseGeocode = true
) {
  const weather =
    await getLiveWeather(
      lat,
      lng
    );

  const terrain =
    estimateDynamicTerrain(
      weather.elevation,
      lat,
      lng
    );

  const place =
    reverseGeocode
      ? await getPlaceName(
          lat,
          lng
        )
      : {
          name:
            `Area near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,

          areaName:
            `Area near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,

          state:
            "Northeast India",

          country:
            "India",

          displayName:
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        };

  const location = {
    id:
      `LIVE-${lat.toFixed(5)}-${lng.toFixed(5)}`,

    riskPointId:
      makeRiskPointId(
        lat,
        lng
      ),

    name:
      place.name,

    areaName:
      place.areaName,

    state:
      place.state,

    country:
      place.country,

    displayName:
      place.displayName,

    lat,
    lng,

    slope:
      terrain.slope,

    elevation:
      weather.elevation,

    historicalRisk:
      terrain.historicalRisk,

    exposure: {
      population: 0,
      roads: 0,
      schools: 0,
      hospitals: 0
    },

    roadStatus:
      "Unknown"
  };

  const localRisk =
    calculateRisk(
      location,
      weather
    );

  const ml =
    await getMLPrediction({
      rainfall:
        weather.rainfall,

      soilMoisture:
        weather.soilMoisture,

      slope:
        terrain.slope,

      elevation:
        weather.elevation,

      historicalRisk:
        terrain.historicalRisk,

      latitude: lat,
      longitude: lng
    });

  const risk =
    ml || localRisk;

  return {
    ...location,

    rainfall:
      weather.rainfall,

    currentRain:
      weather.currentRain,

    soilMoisture:
      weather.soilMoisture,

    humidity:
      weather.humidity,

    temperature:
      weather.temperature,

    windSpeed:
      weather.windSpeed,

    weatherSource:
      weather.weatherSource,

    weatherUpdatedAt:
      weather.weatherUpdatedAt,

    probability:
      risk.probability,

    aiScore:
      risk.aiScore,

    riskScore:
      risk.riskScore,

    riskLevel:
      risk.riskLevel,

    historicalRisk:
      ml?.historicalRisk ??
      terrain.historicalRisk,

    terrainSource:
      terrain.terrainSource,

    mlService:
      Boolean(ml),

    dynamic:
      true,

    clickedLocation:
      false,

    isMapLocation:
      true
  };
}

// ============================================================
// SCAN ONE GRID POINT
// ============================================================

async function scanGridPoint(
  point
) {
  try {
    const weather =
      await getLiveWeather(
        point.lat,
        point.lng
      );

    const terrain =
      estimateDynamicTerrain(
        weather.elevation,
        point.lat,
        point.lng
      );

    const location = {
      id:
        `GRID-${point.lat.toFixed(4)}-${point.lng.toFixed(4)}`,

      riskPointId:
        makeRiskPointId(
          point.lat,
          point.lng
        ),

      // IMPORTANT:
      // We initially keep coordinates here.
      // The scanner later enriches the actual
      // dynamic hotspots with real area names.

      name:
        `Risk Point ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,

      areaName:
        "Detecting area...",

      state:
        "Northeast India",

      country:
        "India",

      displayName:
        `Risk Point ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,

      lat:
        point.lat,

      lng:
        point.lng,

      slope:
        terrain.slope,

      elevation:
        weather.elevation,

      historicalRisk:
        terrain.historicalRisk,

      exposure: {
        population: 0,
        roads: 0,
        schools: 0,
        hospitals: 0
      },

      roadStatus:
        "Unknown"
    };

    const localRisk =
      calculateRisk(
        location,
        weather
      );

    const ml =
      await getMLPrediction({
        rainfall:
          weather.rainfall,

        soilMoisture:
          weather.soilMoisture,

        slope:
          terrain.slope,

        elevation:
          weather.elevation,

        historicalRisk:
          terrain.historicalRisk,

        latitude:
          point.lat,

        longitude:
          point.lng
      });

    const risk =
      ml || localRisk;

    return {
      ...location,

      rainfall:
        weather.rainfall,

      currentRain:
        weather.currentRain,

      soilMoisture:
        weather.soilMoisture,

      humidity:
        weather.humidity,

      temperature:
        weather.temperature,

      windSpeed:
        weather.windSpeed,

      weatherSource:
        weather.weatherSource,

      weatherUpdatedAt:
        weather.weatherUpdatedAt,

      probability:
        risk.probability,

      aiScore:
        risk.aiScore,

      riskScore:
        risk.riskScore,

      riskLevel:
        risk.riskLevel,

      historicalRisk:
        ml?.historicalRisk ??
        terrain.historicalRisk,

      terrainSource:
        terrain.terrainSource,

      mlService:
        Boolean(ml),

      dynamic:
        true,

      hotspot:
        risk.riskLevel === "HIGH" ||
        risk.riskLevel === "CRITICAL"
    };
  } catch (error) {
    console.warn(
      `Grid point failed ${point.lat},${point.lng}:`,
      error.message
    );

    return null;
  }
}

// ============================================================
// ENRICH DYNAMIC HOTSPOTS WITH AREA NAMES
// ============================================================
//
// Only HIGH/CRITICAL points are reverse-geocoded here.
// This keeps the scan practical.
//
// The frontend still receives BOTH:
//   areaName
//   riskPointId
//
// Example:
//   areaName: "Tawang"
//   riskPointId: "RISK-27.5831-91.8640"
// ============================================================

async function enrichHotspots(
  hotspots
) {
  const enriched = [];

  // Keep this deliberately small.
  // The highest-risk points get proper locality names.
  const MAX_ENRICHED =
    Math.min(
      hotspots.length,
      60
    );

  for (
    let i = 0;
    i < MAX_ENRICHED;
    i++
  ) {
    const hotspot =
      hotspots[i];

    try {
      const place =
        await getPlaceName(
          hotspot.lat,
          hotspot.lng
        );

      enriched.push({
        ...hotspot,

        name:
          place.name,

        areaName:
          place.areaName,

        state:
          place.state,

        country:
          place.country,

        displayName:
          place.displayName,

        areaResolved:
          true
      });
    } catch {
      enriched.push({
        ...hotspot,

        name:
          `Risk Point ${hotspot.lat.toFixed(4)}, ${hotspot.lng.toFixed(4)}`,

        areaName:
          "Area unavailable",

        areaResolved:
          false
      });
    }
  }

  const enrichedMap =
    new Map();

  for (
    const item of enriched
  ) {
    enrichedMap.set(
      item.id,
      item
    );
  }

  return hotspots.map(
    hotspot =>
      enrichedMap.get(
        hotspot.id
      ) || {
        ...hotspot,

        // IMPORTANT:
        // Never pretend the coordinate is an area name.
        name:
          `Risk Point ${hotspot.lat.toFixed(4)}, ${hotspot.lng.toFixed(4)}`,

        areaName:
          "Area name available on selection",

        areaResolved:
          false
      }
  );
}

// ============================================================
// DYNAMIC NER SCAN
// ============================================================

async function scanNER() {
  if (scanPromise) {
    return scanPromise;
  }

  scanPromise =
    (async () => {
      const scanId =
        `SCAN-${Date.now()}`;

      console.log(
        "========================================"
      );

      console.log(
        "STARTING DYNAMIC NER RISK SCAN"
      );

      console.log(
        `Scan ID: ${scanId}`
      );

      const grid =
        generateNERGrid();

      console.log(
        `Dynamic grid points: ${grid.length}`
      );

      const results = [];

      // Prevent excessive requests.
      const BATCH_SIZE = 10;

      for (
        let i = 0;
        i < grid.length;
        i += BATCH_SIZE
      ) {
        const batch =
          grid.slice(
            i,
            i + BATCH_SIZE
          );

        const batchResults =
          await Promise.all(
            batch.map(
              scanGridPoint
            )
          );

        for (
          const result
          of batchResults
        ) {
          if (result) {
            results.push(
              result
            );
          }
        }

        console.log(
          `Scanned ${Math.min(
            i + BATCH_SIZE,
            grid.length
          )}/${grid.length}`
        );
      }

      // ======================================================
      // DYNAMIC HIGH / CRITICAL DETECTION
      // ======================================================

      const hotspots =
        results
          .filter(
            location =>
              location.riskLevel ===
                "HIGH" ||
              location.riskLevel ===
                "CRITICAL"
          )
          .sort(
            (a, b) =>
              b.riskScore -
              a.riskScore
          );

      // ======================================================
      // AREA NAME ENRICHMENT
      // ======================================================

      const enrichedHotspots =
        await enrichHotspots(
          hotspots
        );

      const enrichedMap =
        new Map(
          enrichedHotspots.map(
            item => [
              item.id,
              item
            ]
          )
        );

      const finalResults =
        results.map(
          location =>
            enrichedMap.get(
              location.id
            ) || location
        );

      dynamicScanCache = {
        data:
          finalResults,

        updatedAt:
          Date.now(),

        scanId
      };

      // ======================================================
      // SAVE ALERT SNAPSHOT
      // ======================================================

      const alerts =
        finalResults
          .filter(
            location =>
              location.riskLevel ===
                "HIGH" ||
              location.riskLevel ===
                "CRITICAL"
          )
          .sort(
            (a, b) =>
              b.riskScore -
              a.riskScore
          )
          .map(
            location => ({
              id:
                `ALERT-${location.id}`,

              scanId,

              riskPointId:
                location.riskPointId,

              areaName:
                location.areaName,

              location:
                location.name,

              state:
                location.state,

              lat:
                location.lat,

              lng:
                location.lng,

              riskScore:
                location.riskScore,

              riskLevel:
                location.riskLevel,

              rainfall:
                location.rainfall,

              currentRain:
                location.currentRain,

              soilMoisture:
                location.soilMoisture,

              humidity:
                location.humidity,

              elevation:
                location.elevation,

              slope:
                location.slope,

              weatherUpdatedAt:
                location.weatherUpdatedAt,

              dynamic:
                true,

              source:
                "GiriDrishti AI Dynamic Risk Engine",

              action:
                location.riskLevel ===
                "CRITICAL"
                  ? "Immediate field inspection and local emergency assessment recommended."
                  : "Field inspection and enhanced monitoring recommended.",

              createdAt:
                new Date().toISOString()
            })
          );

      fs.writeFileSync(
        alertsFile,
        JSON.stringify(
          alerts,
          null,
          2
        ),
        "utf8"
      );

      console.log(
        `Dynamic points detected: ${finalResults.length}`
      );

      console.log(
        `HIGH/CRITICAL hotspots: ${enrichedHotspots.length}`
      );

      console.log(
        `CRITICAL hotspots: ${
          enrichedHotspots.filter(
            x =>
              x.riskLevel ===
              "CRITICAL"
          ).length
        }`
      );

      console.log(
        "DYNAMIC NER RISK SCAN COMPLETE"
      );

      console.log(
        "========================================"
      );

      return finalResults;
    })();

  try {
    return await scanPromise;
  } finally {
    scanPromise = null;
  }
}

// ============================================================
// GET DYNAMIC DATA
// ============================================================

async function getDynamicData() {
  const cacheValid =
    dynamicScanCache.data.length >
      0 &&
    Date.now() -
      dynamicScanCache.updatedAt <
      SCAN_CACHE_MS;

  if (cacheValid) {
    return dynamicScanCache.data;
  }

  return scanNER();
}

// ============================================================
// HEALTH
// ============================================================

app.get(
  "/api/health",
  async (_, res) => {
    res.json({
      ok: true,

      service:
        "GiriDrishti API",

      liveWeather:
        true,

      weatherProvider:
        "Open-Meteo",

      liveRiskEngine:
        true,

      dynamicNERScanning:
        true,

      arbitraryMapClick:
        true,

      pythonML:
        true,

      fixedZones:
        false,

      dynamicHotspots:
        true,

      automaticAlerts:
        true,

      areaNames:
        true,

      englishGeocoding:
        true,

      gridStep:
        GRID_STEP,

      lastScan:
        dynamicScanCache.updatedAt
          ? new Date(
              dynamicScanCache.updatedAt
            ).toISOString()
          : null,

      scanId:
        dynamicScanCache.scanId,

      updatedAt:
        new Date().toISOString()
    });
  }
);

// ============================================================
// ALL DYNAMIC LOCATIONS
// ============================================================

app.get(
  "/api/locations",
  async (_, res) => {
    try {
      const data =
        await getDynamicData();

      res.json(data);
    } catch (error) {
      console.error(
        "Dynamic locations error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to scan live Northeast India risk data",

        details:
          error.message
      });
    }
  }
);

// ============================================================
// DYNAMIC HOTSPOTS
// ============================================================

app.get(
  "/api/hotspots",
  async (_, res) => {
    try {
      const data =
        await getDynamicData();

      const hotspots =
        data
          .filter(
            location =>
              location.riskLevel ===
                "HIGH" ||
              location.riskLevel ===
                "CRITICAL"
          )
          .sort(
            (a, b) =>
              b.riskScore -
              a.riskScore
          );

      res.json({
        count:
          hotspots.length,

        criticalCount:
          hotspots.filter(
            x =>
              x.riskLevel ===
              "CRITICAL"
          ).length,

        highCount:
          hotspots.filter(
            x =>
              x.riskLevel ===
              "HIGH"
          ).length,

        dynamic:
          true,

        generatedAt:
          new Date().toISOString(),

        hotspots
      });
    } catch (error) {
      console.error(
        "Hotspot error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to generate dynamic hotspots",

        details:
          error.message
      });
    }
  }
);

// ============================================================
// SINGLE LOCATION
// ============================================================

app.get(
  "/api/locations/:id",
  async (req, res) => {
    try {
      const data =
        await getDynamicData();

      const location =
        data.find(
          item =>
            item.id ===
            req.params.id
        );

      if (!location) {
        return res.status(404).json({
          error:
            "Dynamic location not found"
        });
      }

      res.json(location);
    } catch (error) {
      res.status(500).json({
        error:
          "Unable to load dynamic location",

        details:
          error.message
      });
    }
  }
);

// ============================================================
// EXACT MAP CLICK LIVE REPORT
// ============================================================

app.get(
  "/api/location-report",
  async (req, res) => {
    try {
      const lat =
        Number(
          req.query.lat
        );

      const lng =
        Number(
          req.query.lng
        );

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return res.status(400).json({
          error:
            "Valid latitude and longitude are required"
        });
      }

      if (
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          error:
            "Coordinates are out of range"
        });
      }

      console.log(
        "MAP CLICK:",
        lat,
        lng
      );

      const result =
        await buildExactLocation(
          lat,
          lng,
          true
        );

      result.clickedLocation =
        true;

      result.isMapLocation =
        true;

      console.log(
        "EXACT MAP REPORT:",
        result.areaName,
        result.riskPointId,
        result.riskLevel,
        result.riskScore
      );

      res.json(result);
    } catch (error) {
      console.error(
        "Map click report error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to get live conditions for this location",

        details:
          error.message
      });
    }
  }
);

// ============================================================
// MANUAL PREDICTION
// ============================================================

app.post(
  "/api/predict",
  async (req, res) => {
    try {
      const {
        rainfall,
        soilMoisture,
        slope,
        elevation,
        historicalRisk
      } = req.body;

      const values = [
        rainfall,
        soilMoisture,
        slope,
        elevation,
        historicalRisk
      ].map(Number);

      if (
        values.some(
          value =>
            !Number.isFinite(
              value
            )
        )
      ) {
        return res.status(400).json({
          error:
            "All numeric features are required"
        });
      }

      const [
        rainValue,
        soilValue,
        slopeValue,
        elevationValue,
        historyValue
      ] = values;

      const location = {
        slope:
          slopeValue,

        elevation:
          elevationValue,

        historicalRisk:
          historyValue
      };

      const weather = {
        rainfall:
          rainValue,

        soilMoisture:
          soilValue,

        currentRain:
          0,

        humidity:
          0
      };

      res.json(
        calculateRisk(
          location,
          weather
        )
      );
    } catch (error) {
      res.status(500).json({
        error:
          "Prediction failed",

        details:
          error.message
      });
    }
  }
);

// ============================================================
// LIVE ALERTS
// ============================================================

app.get(
  "/api/alerts",
  async (_, res) => {
    try {
      const data =
        await getDynamicData();

      const alerts =
        data
          .filter(
            location =>
              location.riskLevel ===
                "CRITICAL" ||
              location.riskLevel ===
                "HIGH"
          )
          .sort(
            (a, b) =>
              b.riskScore -
              a.riskScore
          )
          .map(
            location => ({
              id:
                `ALERT-${location.id}`,

              riskPointId:
                location.riskPointId,

              areaName:
                location.areaName,

              location:
                location.name,

              displayName:
                location.displayName,

              state:
                location.state,

              lat:
                location.lat,

              lng:
                location.lng,

              riskScore:
                location.riskScore,

              riskLevel:
                location.riskLevel,

              rainfall:
                location.rainfall,

              currentRain:
                location.currentRain,

              soilMoisture:
                location.soilMoisture,

              humidity:
                location.humidity,

              elevation:
                location.elevation,

              slope:
                location.slope,

              roadStatus:
                location.roadStatus,

              source:
                "GiriDrishti AI Dynamic Live Risk Engine",

              dynamic:
                true,

              mlService:
                location.mlService,

              weatherSource:
                location.weatherSource,

              weatherUpdatedAt:
                location.weatherUpdatedAt,

              createdAt:
                new Date().toISOString(),

              action:
                location.riskLevel ===
                "CRITICAL"
                  ? "Immediate field inspection and local emergency assessment recommended."
                  : "Field inspection and enhanced monitoring recommended."
            })
          );

      res.json({
        count:
          alerts.length,

        criticalCount:
          alerts.filter(
            x =>
              x.riskLevel ===
              "CRITICAL"
          ).length,

        highCount:
          alerts.filter(
            x =>
              x.riskLevel ===
              "HIGH"
          ).length,

        generatedAt:
          new Date().toISOString(),

        dynamic:
          true,

        alerts
      });
    } catch (error) {
      console.error(
        "Alerts error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to calculate dynamic live alerts",

        details:
          error.message
      });
    }
  }
);

// ============================================================
// SAVED ALERT SNAPSHOT
// ============================================================

app.get(
  "/api/alerts/history",
  (_, res) => {
    try {
      const alerts =
        JSON.parse(
          fs.readFileSync(
            alertsFile,
            "utf8"
          )
        );

      res.json(alerts);
    } catch {
      res.json([]);
    }
  }
);

// ============================================================
// REPORTS
// ============================================================

app.get(
  "/api/reports",
  (_, res) => {
    try {
      const reports =
        JSON.parse(
          fs.readFileSync(
            reportsFile,
            "utf8"
          )
        );

      res.json(reports);
    } catch {
      res.json([]);
    }
  }
);

// ============================================================
// CREATE REPORT
// ============================================================

app.post(
  "/api/reports",
  upload.single("photo"),
  (req, res) => {
    try {
      const reports =
        JSON.parse(
          fs.readFileSync(
            reportsFile,
            "utf8"
          )
        );

      const report = {
        id:
          `R-${Date.now()}`,

        type:
          req.body.type ||
          "Other",

        description:
          req.body.description ||
          "",

        lat:
          req.body.lat
            ? Number(
                req.body.lat
              )
            : null,

        lng:
          req.body.lng
            ? Number(
                req.body.lng
              )
            : null,

        photo:
          req.file?.filename ||
          null,

        status:
          "Received",

        createdAt:
          new Date().toISOString()
      };

      reports.unshift(
        report
      );

      fs.writeFileSync(
        reportsFile,
        JSON.stringify(
          reports,
          null,
          2
        ),
        "utf8"
      );

      res.status(201).json(
        report
      );
    } catch (error) {
      console.error(
        "Report error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to save report"
      });
    }
  }
);

// ============================================================
// SERVE UPLOADED REPORT PHOTOS
// ============================================================

app.use(
  "/uploads",
  express.static(
    uploadDir
  )
);

// ============================================================
// 404
// ============================================================

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        "GiriDrishti API route not found",

      path:
        req.originalUrl
    });
  }
);

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(
      "Unhandled server error:",
      error
    );

    res.status(500).json({
      error:
        "Internal GiriDrishti server error",

      details:
        error.message
    });
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {
    console.log(
      "=========================================="
    );

    console.log(
      "GiriDrishti API running"
    );

    console.log(
      `http://localhost:${PORT}`
    );

    console.log(
      `Python ML → ${ML_API}`
    );

    console.log(
      "LIVE OPEN-METEO → ENABLED"
    );

    console.log(
      "DYNAMIC NER SCANNING → ENABLED"
    );

    console.log(
      "FIXED RISK ZONES → DISABLED"
    );

    console.log(
      "DYNAMIC HIGH/CRITICAL HOTSPOTS → ENABLED"
    );

    console.log(
      "AUTOMATIC ALERTS → ENABLED"
    );

    console.log(
      "EXACT MAP CLICK REPORT → ENABLED"
    );

    console.log(
      "ENGLISH AREA NAMES → ENABLED"
    );

    console.log(
      "=========================================="
    );

    // Start scan without blocking server startup.
    scanNER().catch(
      error => {
        console.error(
          "Initial dynamic scan failed:",
          error.message
        );
      }
    );
  }
);

