const fs = require("fs");
const path = require("path");
const axios = require("axios");

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL ||
  process.env.ML_API_URL ||
  "http://127.0.0.1:8000";

const WEATHER_TIMEOUT = 15000;
const DEM_TIMEOUT = 15000;

/* =========================================================
   NORTHEAST INDIA GEOGRAPHIC BOUNDARY
========================================================= */

const NER = {
  minLat: 21.8,
  maxLat: 29.6,
  minLng: 88.0,
  maxLng: 97.5
};

const NORTHEAST_STATES = [
  "Arunachal Pradesh",
  "Assam",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Sikkim",
  "Tripura"
];

/*
 * Approximate geographic mask for Northeast India.
 *
 * This is used to prevent:
 *
 * 29.80, 93.00 -> Xizang / China
 *
 * and other obvious non-Indian locations from
 * becoming GiriDrishti risk points.
 */

const NER_BOUNDARY = [
  [21.8, 92.2],
  [22.0, 91.2],
  [23.0, 89.8],
  [24.0, 88.0],
  [25.0, 88.0],
  [26.0, 88.5],
  [27.0, 88.0],
  [28.0, 88.0],
  [28.5, 89.5],
  [28.8, 90.5],
  [29.2, 91.5],
  [29.6, 93.0],
  [29.5, 95.0],
  [29.2, 96.0],
  [28.8, 97.5],
  [27.0, 97.5],
  [25.0, 97.5],
  [23.5, 97.0],
  [22.0, 95.5],
  [21.8, 94.0]
];

/* =========================================================
   BASIC HELPERS
========================================================= */

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

/* =========================================================
   POINT IN POLYGON
========================================================= */

function pointInPolygon(
  latitude,
  longitude,
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

    const intersects =
      yi > latitude !==
        yj > latitude &&
      longitude <
        ((xj - xi) *
          (latitude - yi)) /
          (yj - yi) +
          xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/* =========================================================
   NORTHEAST INDIA VALIDATION
========================================================= */

function isInsideNER(
  latitude,
  longitude
) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return false;
  }

  /*
   * Fast bounding-box rejection.
   */

  if (
    latitude < NER.minLat ||
    latitude > NER.maxLat ||
    longitude < NER.minLng ||
    longitude > NER.maxLng
  ) {
    return false;
  }

  /*
   * Explicit northern rejection.
   *
   * Prevents Xizang/Tibet coordinates
   * from entering the system.
   */

  if (
    latitude >= 29.6
  ) {
    return false;
  }

  /*
   * Geographic polygon mask.
   */

  return pointInPolygon(
    latitude,
    longitude,
    NER_BOUNDARY
  );
}

/* =========================================================
   HAVERSINE DISTANCE
========================================================= */

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
      (lat1 * Math.PI) /
        180
    ) *
      Math.cos(
        (lat2 * Math.PI) /
          180
      ) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

/* =========================================================
   CSV PARSER
========================================================= */

function parseCSVLine(line) {
  const result = [];

  let current = "";
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
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (
      char === "," &&
      !quoted
    ) {
      result.push(
        current.trim()
      );

      current = "";

      continue;
    }

    current += char;
  }

  result.push(
    current.trim()
  );

  return result;
}

/* =========================================================
   STATE NORMALIZATION
========================================================= */

function normalizeState(state) {
  const value =
    String(state || "")
      .trim()
      .toLowerCase();

  const match =
    NORTHEAST_STATES.find(
      item =>
        item.toLowerCase() ===
        value
    );

  return (
    match ||
    String(state || "").trim()
  );
}

/* =========================================================
   GSI INVENTORY
========================================================= */

let inventory = [];
let inventoryLoaded = false;

function loadInventory() {
  if (
    inventoryLoaded
  ) {
    return inventory;
  }

  const possibleFiles = [
    path.join(
      __dirname,
      "..",
      "..",
      "ml",
      "data",
      "gsi_landslide_clean.csv"
    ),

    path.join(
      __dirname,
      "..",
      "..",
      "ml",
      "data",
      "gsi_landslide_inventory.csv"
    ),

    path.join(
      __dirname,
      "..",
      "data",
      "gsi_landslide_clean.csv"
    ),

    path.join(
      __dirname,
      "..",
      "data",
      "gsi_ner_inventory.csv"
    ),

    path.join(
      __dirname,
      "..",
      "..",
      "ml-service",
      "data",
      "gsi_landslide_clean.csv"
    )
  ];

  const file =
    possibleFiles.find(
      filePath =>
        fs.existsSync(
          filePath
        )
    );

  if (!file) {
    console.warn(
      "GSI inventory CSV not found."
    );

    inventoryLoaded = true;
    inventory = [];

    return inventory;
  }

  try {
    const text =
      fs.readFileSync(
        file,
        "utf8"
      );

    const lines =
      text
        .split(/\r?\n/)
        .filter(Boolean);

    if (
      lines.length < 2
    ) {
      inventoryLoaded = true;
      inventory = [];

      return inventory;
    }

    const headers =
      parseCSVLine(
        lines[0]
      ).map(
        header =>
          String(header)
            .replace(
              /^\uFEFF/,
              ""
            )
            .trim()
            .toLowerCase()
      );

    const latitudeIndex =
      headers.indexOf(
        "latitude"
      );

    const longitudeIndex =
      headers.indexOf(
        "longitude"
      );

    const stateIndex =
      headers.indexOf(
        "state"
      );

    const districtIndex =
      headers.indexOf(
        "district"
      );

    if (
      latitudeIndex === -1 ||
      longitudeIndex === -1
    ) {
      console.warn(
        "GSI CSV latitude/longitude columns missing."
      );

      inventoryLoaded = true;
      inventory = [];

      return inventory;
    }

    inventory =
      lines
        .slice(1)
        .map(line => {
          const values =
            parseCSVLine(
              line
            );

          const row = {};

          headers.forEach(
            (
              header,
              index
            ) => {
              row[header] =
                values[index] ??
                "";
            }
          );

          return row;
        })
        .map(row => ({
          ...row,

          latitude:
            Number(
              row.latitude
            ),

          longitude:
            Number(
              row.longitude
            ),

          state:
            normalizeState(
              row.state
            ),

          district:
            row.district ||
            ""
        }))
        .filter(
          row =>
            Number.isFinite(
              row.latitude
            ) &&
            Number.isFinite(
              row.longitude
            )
        )
        .filter(
          row =>
            NORTHEAST_STATES.includes(
              normalizeState(
                row.state
              )
            )
        );

    inventoryLoaded = true;

    console.log(
      `GSI inventory loaded: ${inventory.length} Northeast records`
    );

    return inventory;

  } catch (error) {
    console.error(
      "Unable to load GSI inventory:",
      error.message
    );

    inventoryLoaded = true;
    inventory = [];

    return inventory;
  }
}

/* =========================================================
   HISTORICAL EVIDENCE
========================================================= */

function calculateHistoricalRisk(
  latitude,
  longitude
) {
  const data =
    loadInventory();

  if (
    !data.length
  ) {
    return {
      historicalRisk: 0,

      historicalScore: 0,

      nearbyCount: 0,

      historicalCount5km: 0,

      historicalCount25km: 0,

      nearestDistanceKm:
        null
    };
  }

  let count5 =
    0;

  let count25 =
    0;

  let nearest =
    Infinity;

  for (
    const item of data
  ) {
    const distance =
      distanceKm(
        latitude,
        longitude,
        item.latitude,
        item.longitude
      );

    if (
      distance <= 5
    ) {
      count5++;
    }

    if (
      distance <= 25
    ) {
      count25++;
    }

    if (
      distance < nearest
    ) {
      nearest =
        distance;
    }
  }

  const density5 =
    clamp(
      count5 / 20,
      0,
      1
    );

  const density25 =
    clamp(
      count25 / 100,
      0,
      1
    );

  const proximity =
    nearest === Infinity
      ? 0
      : clamp(
          1 -
            nearest / 25,
          0,
          1
        );

  /*
   * Historical evidence is normalized
   * to 0..1 for the ML model.
   */

  const historicalRisk =
    clamp(
      density5 * 0.50 +
        density25 * 0.30 +
        proximity * 0.20,
      0,
      1
    );

  return {
    historicalRisk,

    historicalScore:
      Number(
        (
          historicalRisk *
          100
        ).toFixed(2)
      ),

    nearbyCount:
      count5,

    historicalCount5km:
      count5,

    historicalCount25km:
      count25,

    nearestDistanceKm:
      nearest === Infinity
        ? null
        : Number(
            nearest.toFixed(2)
          )
  };
}

/* =========================================================
   LIVE WEATHER
========================================================= */

async function getLiveWeather(
  latitude,
  longitude
) {
  const url =
    "https://api.open-meteo.com/v1/forecast";

  const params = {
    latitude,

    longitude,

    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "showers",
      "wind_speed_10m"
    ].join(","),

    hourly: [
      "rain",
      "precipitation",
      "soil_moisture_0_to_1cm"
    ].join(","),

    timezone:
      "auto",

    past_days:
      1,

    forecast_days:
      2
  };

  const response =
    await axios.get(
      url,
      {
        params,

        timeout:
          WEATHER_TIMEOUT
      }
    );

  const data =
    response.data ||
    {};

  const current =
    data.current ||
    {};

  const hourly =
    data.hourly ||
    {};

  if (
    !current ||
    !current.time
  ) {
    throw new Error(
      "Open-Meteo returned no current observation"
    );
  }

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

  const soil =
    Array.isArray(
      hourly.soil_moisture_0_to_1cm
    )
      ? hourly.soil_moisture_0_to_1cm
      : [];

  /*
   * Recent rainfall:
   *
   * Use the previous 24 hours,
   * not future forecast values.
   */

  const recentRain =
    rain.length
      ? rain.slice(
          0,
          Math.min(
            24,
            rain.length
          )
        )
      : precipitation.slice(
          0,
          Math.min(
            24,
            precipitation.length
          )
        );

  const rainfall =
    recentRain.reduce(
      (
        sum,
        value
      ) =>
        sum +
        (
          Number(value) ||
          0
        ),
      0
    );

  /*
   * Soil moisture.
   *
   * Open-Meteo returns volumetric
   * water fraction.
   *
   * Convert:
   *
   * 0.326 -> 32.6%
   */

  const validSoil =
    soil
      .map(Number)
      .filter(
        Number.isFinite
      );

  let soilMoisture =
    null;

  if (
    validSoil.length
  ) {
    /*
     * Use the most recent
     * available observation.
     */

    const latestSoil =
      validSoil[
        validSoil.length - 1
      ];

    soilMoisture =
      latestSoil * 100;
  }

  const temperature =
    Number(
      current.temperature_2m
    );

  const humidity =
    Number(
      current.relative_humidity_2m
    );

  const currentRain =
    Number(
      current.rain
    );

  const currentPrecipitation =
    Number(
      current.precipitation
    );

  const windSpeed =
    Number(
      current.wind_speed_10m
    );

  if (
    !Number.isFinite(
      temperature
    )
  ) {
    throw new Error(
      "Temperature unavailable"
    );
  }

  if (
    !Number.isFinite(
      humidity
    )
  ) {
    throw new Error(
      "Humidity unavailable"
    );
  }

  if (
    !Number.isFinite(
      windSpeed
    )
  ) {
    throw new Error(
      "Wind speed unavailable"
    );
  }

  if (
    soilMoisture === null ||
    !Number.isFinite(
      soilMoisture
    )
  ) {
    throw new Error(
      "Soil moisture unavailable"
    );
  }

  const retrievedAt =
    new Date().toISOString();

  return {
    available:
      true,

    rainfall:
      Number(
        rainfall.toFixed(2)
      ),

    currentRain:
      Number.isFinite(
        currentRain
      )
        ? Number(
            currentRain.toFixed(
              2
            )
          )
        : Number(
            (
              currentPrecipitation ||
              0
            ).toFixed(2)
          ),

    precipitation:
      Number.isFinite(
        currentPrecipitation
      )
        ? Number(
            currentPrecipitation.toFixed(
              2
            )
          )
        : 0,

    soilMoisture:
      Number(
        soilMoisture.toFixed(
          2
        )
      ),

    temperature:
      Number(
        temperature.toFixed(
          1
        )
      ),

    humidity:
      Math.round(
        humidity
      ),

    windSpeed:
      Number(
        windSpeed.toFixed(
          1
        )
      ),

    weatherObservedAt:
      current.time,

    weatherSource:
      "Open-Meteo",

    weatherRetrievedAt:
      retrievedAt
  };
}

/* =========================================================
   REAL DEM + SLOPE
========================================================= */

async function getTerrain(
  latitude,
  longitude
) {
  /*
   * Sample:
   *
   *             North
   *               |
   *
   * West ---- Center ---- East
   *
   *               |
   *             South
   */

  const offset =
    0.001;

  const points = [
    [
      latitude,
      longitude
    ],

    [
      latitude + offset,
      longitude
    ],

    [
      latitude - offset,
      longitude
    ],

    [
      latitude,
      longitude + offset
    ],

    [
      latitude,
      longitude - offset
    ]
  ];

  const url =
    "https://api.open-meteo.com/v1/elevation";

  const response =
    await axios.get(
      url,
      {
        params: {
          latitude:
            points
              .map(
                point =>
                  point[0]
              )
              .join(","),

          longitude:
            points
              .map(
                point =>
                  point[1]
              )
              .join(",")
        },

        timeout:
          DEM_TIMEOUT
      }
    );

  const data =
    response.data ||
    {};

  if (
    !Array.isArray(
      data.elevation
    ) ||
    data.elevation.length <
      5
  ) {
    throw new Error(
      "DEM elevation data unavailable"
    );
  }

  const elevation =
    data.elevation.map(
      Number
    );

  if (
    elevation.some(
      value =>
        !Number.isFinite(
          value
        )
    )
  ) {
    throw new Error(
      "Invalid DEM elevation values"
    );
  }

  const center =
    elevation[0];

  const north =
    elevation[1];

  const south =
    elevation[2];

  const east =
    elevation[3];

  const west =
    elevation[4];

  /*
   * Geographic distance
   * between samples.
   */

  const latitudeMeters =
    111320 *
    offset;

  const longitudeMeters =
    111320 *
    Math.cos(
      (latitude *
        Math.PI) /
        180
    ) *
    offset;

  const safeLongitudeMeters =
    Math.max(
      Math.abs(
        longitudeMeters
      ),
      1
    );

  /*
   * Gradient in east-west direction.
   */

  const dzdx =
    (east - west) /
    (2 *
      safeLongitudeMeters);

  /*
   * Gradient in north-south direction.
   */

  const dzdy =
    (north - south) /
    (2 *
      latitudeMeters);

  /*
   * Terrain slope:
   *
   * slope =
   * atan(
   * sqrt(
   * dzdx² + dzdy²
   * )
   * )
   */

  const slope =
    Math.atan(
      Math.sqrt(
        dzdx ** 2 +
          dzdy ** 2
      )
    ) *
    (180 / Math.PI);

  return {
    elevation:
      Number(
        center.toFixed(
          2
        )
      ),

    slope:
      Number(
        clamp(
          slope,
          0,
          90
        ).toFixed(
          2
        )
      ),

    elevationSource:
      "Copernicus DEM via Open-Meteo Elevation API",

    elevationRetrievedAt:
      new Date().toISOString()
  };
}

/* =========================================================
   REAL AI / ML PREDICTION
========================================================= */

async function getAIPrediction(
  features
) {
  /*
   * First make sure the ML service
   * and trained model are actually
   * available.
   */

  const health =
    await axios.get(
      `${ML_SERVICE_URL}/health`,
      {
        timeout: 5000
      }
    );

  if (
    !health.data?.modelLoaded
  ) {
    throw new Error(
      "AI model is not loaded"
    );
  }

  const response =
    await axios.post(
      `${ML_SERVICE_URL}/predict`,
      features,
      {
        headers: {
          "Content-Type":
            "application/json"
        },

        timeout:
          15000
      }
    );

  const prediction =
    response.data;

  if (
    !prediction
  ) {
    throw new Error(
      "Empty ML prediction"
    );
  }

  const probability =
    Number(
      prediction.probability
    );

  const riskScore =
    Number(
      prediction.riskScore
    );

  const aiScore =
    Number(
      prediction.aiScore
    );

  const riskLevel =
    String(
      prediction.riskLevel ||
        ""
    ).toUpperCase();

  if (
    !Number.isFinite(
      riskScore
    )
  ) {
    throw new Error(
      "ML service returned invalid risk score"
    );
  }

  if (
    ![
      "LOW",
      "MODERATE",
      "HIGH",
      "CRITICAL"
    ].includes(
      riskLevel
    )
  ) {
    throw new Error(
      "ML service returned invalid risk level"
    );
  }

  return {
    probability:
      Number.isFinite(
        probability
      )
        ? clamp(
            probability,
            0,
            1
          )
        : clamp(
            riskScore / 100,
            0,
            1
          ),

    riskScore:
      clamp(
        riskScore,
        0,
        100
      ),

    aiScore:
      Number.isFinite(
        aiScore
      )
        ? clamp(
            aiScore,
            0,
            100
          )
        : clamp(
            riskScore,
            0,
            100
          ),

    riskLevel,

    model:
      prediction.model ||
      "RandomForestClassifier",

    modelVersion:
      prediction.modelVersion ||
      "unknown",

    modelFeatures:
      prediction.modelFeatures,

    mlAvailable:
      true,

    mlService:
      true
  };
}

/* =========================================================
   STATE DETECTION
========================================================= */

function nearestState(
  latitude,
  longitude
) {
  const records =
    loadInventory();

  let best =
    null;

  let bestDistance =
    Infinity;

  for (
    const record of records
  ) {
    const state =
      normalizeState(
        record.state
      );

    if (
      !NORTHEAST_STATES.includes(
        state
      )
    ) {
      continue;
    }

    const distance =
      distanceKm(
        latitude,
        longitude,
        record.latitude,
        record.longitude
      );

    if (
      distance <
      bestDistance
    ) {
      bestDistance =
        distance;

      best =
        state;
    }
  }

  return (
    best ||
    "Northeast India"
  );
}

/* =========================================================
   COMPLETE LOCATION REPORT
========================================================= */

async function buildLocationReport(
  latitude,
  longitude
) {
  /*
   * Geographic validation must happen
   * before any external API request.
   */

  if (
    !isInsideNER(
      latitude,
      longitude
    )
  ) {
    throw new Error(
      "Selected location is outside Northeast India"
    );
  }

  /*
   * Get real weather.
   */

  const weather =
    await getLiveWeather(
      latitude,
      longitude
    );

  /*
   * Get real DEM and calculate
   * real terrain slope.
   */

  const terrain =
    await getTerrain(
      latitude,
      longitude
    );

  /*
   * Historical GSI evidence.
   */

  const historical =
    calculateHistoricalRisk(
      latitude,
      longitude
    );

  /*
   * IMPORTANT:
   *
   * historicalRisk is 0..1.
   *
   * The ML model expects:
   *
   * rainfall
   * soilMoisture
   * slope
   * elevation
   * historicalRisk
   */

  const features = {
    rainfall:
      Number(
        weather.rainfall
      ),

    soilMoisture:
      Number(
        weather.soilMoisture
      ),

    slope:
      Number(
        terrain.slope
      ),

    elevation:
      Number(
        terrain.elevation
      ),

    historicalRisk:
      Number(
        historical.historicalRisk
      ),

    latitude,

    longitude
  };

  const missing =
    Object.entries(
      features
    )
      .filter(
        ([, value]) =>
          !Number.isFinite(
            Number(value)
          )
      )
      .map(
        ([key]) =>
          key
      );

  if (
    missing.length
  ) {
    throw new Error(
      `Required prediction features unavailable: ${missing.join(
        ", "
      )}`
    );
  }

  /*
   * NO FALLBACK RISK.
   *
   * A risk score is accepted only
   * from the trained AI model.
   */

  const ml =
    await getAIPrediction(
      features
    );

  const checkedAt =
    new Date().toISOString();

  return {
    lat:
      latitude,

    lng:
      longitude,

    state:
      nearestState(
        latitude,
        longitude
      ),

    clickedLocation:
      true,

    rainfall:
      weather.rainfall,

    currentRain:
      weather.currentRain,

    precipitation:
      weather.precipitation,

    soilMoisture:
      weather.soilMoisture,

    temperature:
      weather.temperature,

    humidity:
      weather.humidity,

    windSpeed:
      weather.windSpeed,

    elevation:
      terrain.elevation,

    slope:
      terrain.slope,

    historicalRisk:
      historical.historicalRisk,

    historicalScore:
      historical.historicalScore,

    historicalCount5km:
      historical.historicalCount5km,

    historicalCount25km:
      historical.historicalCount25km,

    nearbyHistoricalLandslides:
      historical.nearbyCount,

    nearestHistoricalKm:
      historical.nearestDistanceKm,

    nearestHistoricalLandslideKm:
      historical.nearestDistanceKm,

    probability:
      ml.probability,

    aiScore:
      ml.aiScore,

    riskScore:
      ml.riskScore,

    riskLevel:
      ml.riskLevel,

    model:
      ml.model,

    modelVersion:
      ml.modelVersion,

    modelFeatures:
      ml.modelFeatures,

    mlAvailable:
      true,

    mlService:
      true,

    weatherAvailable:
      true,

    weatherSource:
      weather.weatherSource,

    weatherObservedAt:
      weather.weatherObservedAt,

    weatherUpdatedAt:
      weather.weatherObservedAt,

    weatherRetrievedAt:
      weather.weatherRetrievedAt,

    weatherCheckedAt:
      weather.weatherRetrievedAt,

    elevationSource:
      terrain.elevationSource,

    elevationRetrievedAt:
      terrain.elevationRetrievedAt,

    requestedAt:
      checkedAt,

    retrievedAt:
      checkedAt,

    generatedAt:
      checkedAt,

    updatedAt:
      checkedAt,

    dataStatus:
      "LIVE",

    stale:
      false
  };
}

/* =========================================================
   EXACT LIVE LOCATION REPORT
========================================================= */

async function getLocationReport(
  req,
  res
) {
  const requestedAt =
    new Date().toISOString();

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
      return res.status(
        400
      ).json({
        ok: false,

        error:
          "Valid latitude and longitude are required",

        dataStatus:
          "INVALID_COORDINATES",

        stale:
          false
      });
    }

    if (
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(
        400
      ).json({
        ok: false,

        error:
          "Latitude or longitude is outside valid range",

        dataStatus:
          "INVALID_COORDINATES",

        stale:
          false
      });
    }

    /*
     * IMPORTANT:
     *
     * Reject China / Bhutan /
     * Bangladesh / Myanmar etc.
     * before calling weather or ML.
     */

    if (
      !isInsideNER(
        lat,
        lng
      )
    ) {
      return res.status(
        400
      ).json({
        ok: false,

        error:
          "Selected location is outside Northeast India",

        lat,

        lng,

        dataStatus:
          "OUTSIDE_NER",

        stale:
          false,

        mlService:
          false
      });
    }

    const report =
      await buildLocationReport(
        lat,
        lng
      );

    const retrievedAt =
      new Date().toISOString();

    return res.json({
      ok: true,

      ...report,

      id:
        `live-${lat}-${lng}`,

      dynamic:
        true,

      clickedLocation:
        true,

      riskPointName:
        `${report.riskLevel} Live Assessment`,

      pointName:
        `${report.riskLevel} Live Assessment`,

      requestedAt,

      retrievedAt,

      generatedAt:
        retrievedAt,

      dataStatus:
        "LIVE",

      stale:
        false
    });

  } catch (error) {
    console.error(
      "Location report error:",
      error.message
    );

    /*
     * Never generate a fake score.
     */

    const message =
      error.message ||
      "Unable to generate live location report";

    let failedSource =
      "GiriDrishti Live Assessment";

    if (
      message
        .toLowerCase()
        .includes(
          "open-meteo"
        )
    ) {
      failedSource =
        "Open-Meteo Weather";
    }

    if (
      message
        .toLowerCase()
        .includes(
          "dem"
        ) ||
      message
        .toLowerCase()
        .includes(
          "elevation"
        ) ||
      message
        .toLowerCase()
        .includes(
          "slope"
        )
    ) {
      failedSource =
        "Copernicus DEM / Open-Meteo Elevation";
    }

    if (
      message
        .toLowerCase()
        .includes(
          "ai"
        ) ||
      message
        .toLowerCase()
        .includes(
          "ml"
        ) ||
      message
        .toLowerCase()
        .includes(
          "model"
        ) ||
      message
        .toLowerCase()
        .includes(
          "prediction"
        )
    ) {
      failedSource =
        "GiriDrishti ML Service";
    }

    return res.status(
      503
    ).json({
      ok: false,

      error:
        "Live AI assessment is currently unavailable.",

      reason:
        message,

      failedSource,

      dataStatus:
        "UNAVAILABLE",

      stale:
        true,

      mlService:
        false,

      mlAvailable:
        false,

      requestedAt,

      retrievedAt:
        new Date().toISOString()
    });
  }
}

/* =========================================================
   DYNAMIC HOTSPOTS
========================================================= */

async function getLocations(
  req,
  res
) {
  try {
    const data =
      loadInventory();

    if (
      !data.length
    ) {
      return res.json(
        []
      );
    }

    /*
     * Group actual GSI records
     * into spatial cells.
     */

    const cells =
      new Map();

    const CELL_SIZE =
      0.18;

    for (
      const item of data
    ) {
      const lat =
        Number(
          item.latitude
        );

      const lng =
        Number(
          item.longitude
        );

      if (
        !Number.isFinite(
          lat
        ) ||
        !Number.isFinite(
          lng
        )
      ) {
        continue;
      }

      /*
       * Geographic protection.
       */

      if (
        !isInsideNER(
          lat,
          lng
        )
      ) {
        continue;
      }

      const cellLat =
        Math.floor(
          lat /
            CELL_SIZE
        );

      const cellLng =
        Math.floor(
          lng /
            CELL_SIZE
        );

      const key =
        `${cellLat}:${cellLng}`;

      if (
        !cells.has(
          key
        )
      ) {
        cells.set(
          key,
          []
        );
      }

      cells
        .get(key)
        .push(item);
    }

    const candidates =
      Array.from(
        cells.values()
      )
        .sort(
          (
            a,
            b
          ) =>
            b.length -
            a.length
        )
        .slice(
          0,
          80
        );

    const results =
      [];

    /*
     * Sequential processing prevents
     * API rate-limit problems.
     */

    for (
      const cell of candidates
    ) {
      try {
        const center =
          cell.reduce(
            (
              accumulator,
              item
            ) => {

              accumulator.lat +=
                item.latitude;

              accumulator.lng +=
                item.longitude;

              return accumulator;

            },
            {
              lat: 0,
              lng: 0
            }
          );

        const lat =
          center.lat /
          cell.length;

        const lng =
          center.lng /
          cell.length;

        /*
         * Do not evaluate anything
         * outside NER.
         */

        if (
          !isInsideNER(
            lat,
            lng
          )
        ) {
          continue;
        }

        const report =
          await buildLocationReport(
            lat,
            lng
          );

        /*
         * Historical density is evidence,
         * not a replacement for AI.
         *
         * Small additional adjustment
         * preserves the existing hotspot
         * behaviour while the base score
         * remains AI-generated.
         */

        const densityBoost =
          Math.min(
            cell.length /
              20,
            1
          ) * 12;

        const adjustedScore =
          Math.min(
            Math.round(
              report.riskScore +
                densityBoost
            ),
            100
          );

        let adjustedLevel =
          "LOW";

        if (
          adjustedScore >=
          80
        ) {
          adjustedLevel =
            "CRITICAL";
        } else if (
          adjustedScore >=
          60
        ) {
          adjustedLevel =
            "HIGH";
        } else if (
          adjustedScore >=
          35
        ) {
          adjustedLevel =
            "MODERATE";
        }

        const state =
          normalizeState(
            cell[0]?.state
          );

        results.push({

          ...report,

          id:
            `risk-${lat.toFixed(
              4
            )}-${lng.toFixed(
              4
            )}`,

          riskScore:
            adjustedScore,

          riskLevel:
            adjustedLevel,

          historicalDensity:
            cell.length,

          state:
            state ||
            "Northeast India",

          areaName:
            cell[0]?.district ||
            state ||
            "Northeast India",

          riskPointName:
            `${adjustedLevel} Risk Hotspot`,

          pointName:
            `${adjustedLevel} Risk Hotspot`,

          dynamic:
            true,

          dataStatus:
            "LIVE",

          stale:
            false,

          mlService:
            true
        });

      } catch (
        error
      ) {

        /*
         * If weather, DEM or ML fails,
         * simply skip that hotspot.
         *
         * NEVER invent a score.
         */

        console.warn(
          `Skipping hotspot because live data failed: ${error.message}`
        );
      }
    }

    results.sort(
      (
        a,
        b
      ) =>
        b.riskScore -
        a.riskScore
    );

    return res.json(
      results.slice(
        0,
        60
      )
    );

  } catch (
    error
  ) {

    console.error(
      "Location controller error:",
      error
    );

    return res.status(
      500
    ).json({
      error:
        "Unable to calculate live landslide risk"
    });
  }
}

/* =========================================================
   BUILD EXACT LOCATION
========================================================= */

async function buildExactLocation(
  latitude,
  longitude
) {
  if (
    !isInsideNER(
      Number(latitude),
      Number(longitude)
    )
  ) {
    throw new Error(
      "Selected location is outside Northeast India"
    );
  }

  return buildLocationReport(
    Number(latitude),
    Number(longitude)
  );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getLocations,

  getLocationReport,

  loadInventory,

  buildLocationReport,

  buildExactLocation,

  isInsideNER
};