require("dotenv").config();

const axios = require("axios");

const Alert =
  require("../models/Alert");

const {
  sendSMS,
  makeCall,
} = require("./notification");

// ======================================================
// PREVENT DUPLICATE ALERTS
// ======================================================

const sentAlerts = new Map();

const ALERT_COOLDOWN =
  30 * 60 * 1000;

// ======================================================
// WEATHER
// ======================================================

async function getWeather(
  lat,
  lng
) {
  const response =
    await axios.get(
      "https://api.open-meteo.com/v1/forecast",
      {
        params: {
          latitude: lat,
          longitude: lng,

          current: [
            "temperature_2m",
            "rain",
            "relative_humidity_2m",
            "wind_speed_10m",
            "soil_moisture_0_to_1cm",
          ].join(","),

          hourly: [
            "rain",
            "soil_moisture_0_to_1cm",
          ].join(","),

          past_hours: 24,

          forecast_hours: 1,

          timezone: "auto",
        },

        timeout: 10000,
      }
    );

  const data =
    response.data;

  const current =
    data.current || {};

  const hourly =
    data.hourly || {};

  const rain =
    Array.isArray(hourly.rain)
      ? hourly.rain.slice(-24)
      : [];

  const rainfall =
    rain.reduce(
      (sum, value) =>
        sum +
        (Number(value) || 0),
      0
    );

  const soil =
    Number(
      current.soil_moisture_0_to_1cm
    ) || 0;

  return {
    temperature:
      Number(
        current.temperature_2m
      ) || 0,

    currentRain:
      Number(
        current.rain
      ) || 0,

    rainfall,

    humidity:
      Number(
        current.relative_humidity_2m
      ) || 0,

    windSpeed:
      Number(
        current.wind_speed_10m
      ) || 0,

    soilMoisture:
      Math.max(
        0,
        Math.min(
          100,
          soil * 100
        )
      ),

    elevation:
      Number(
        data.elevation
      ) || 0,

    weatherUpdatedAt:
      current.time ||
      new Date().toISOString(),
  };
}

// ======================================================
// RISK
// ======================================================

function calculateRisk(
  weather
) {
  const elevation =
    weather.elevation;

  let slope;

  if (elevation >= 2500)
    slope = 40;
  else if (elevation >= 1800)
    slope = 34;
  else if (elevation >= 1200)
    slope = 30;
  else if (elevation >= 700)
    slope = 25;
  else if (elevation >= 300)
    slope = 20;
  else
    slope = 14;

  const historicalRisk =
    Math.min(
      90,
      Math.max(
        20,
        slope * 1.55
      )
    );

  const rainfallScore =
    Math.min(
      100,
      (weather.rainfall / 180) *
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
      (slope / 45) * 100
    );

  const historyScore =
    historicalRisk;

  const currentRainScore =
    Math.min(
      100,
      (weather.currentRain / 20) *
        100
    );

  const humidityScore =
    Math.min(
      100,
      weather.humidity
    );

  let score =
    rainfallScore * 0.30 +
    soilScore * 0.20 +
    slopeScore * 0.20 +
    historyScore * 0.15 +
    currentRainScore * 0.10 +
    humidityScore * 0.05;

  if (
    weather.currentRain >= 5
  )
    score += 5;

  if (
    weather.rainfall >= 100
  )
    score += 5;

  if (
    weather.rainfall >= 150
  )
    score += 5;

  if (
    weather.soilMoisture >= 80
  )
    score += 5;

  score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    )
  );

  let riskLevel =
    "LOW";

  if (score >= 75)
    riskLevel = "CRITICAL";
  else if (score >= 55)
    riskLevel = "HIGH";
  else if (score >= 35)
    riskLevel = "MODERATE";

  return {
    riskScore: score,
    riskLevel,
    slope,
    historicalRisk,
  };
}

// ======================================================
// ALERT
// ======================================================

async function processAlert(
  location
) {
  if (
    location.riskLevel !==
      "HIGH" &&
    location.riskLevel !==
      "CRITICAL"
  ) {
    return;
  }

  const key =
    `${location.lat.toFixed(3)}-${location.lng.toFixed(3)}-${location.riskLevel}`;

  const previous =
    sentAlerts.get(key);

  if (
    previous &&
    Date.now() - previous <
      ALERT_COOLDOWN
  ) {
    return;
  }

  sentAlerts.set(
    key,
    Date.now()
  );

  const message =
    location.riskLevel ===
    "CRITICAL"
      ? `GiriDrishti AI critical landslide warning. High risk detected at ${location.areaName}. Risk score ${location.riskScore} percent. Immediate field inspection and emergency assessment recommended.`
      : `GiriDrishti AI high landslide warning. High risk detected at ${location.areaName}. Risk score ${location.riskScore} percent. Field inspection and enhanced monitoring recommended.`;

  const smsSent =
    await sendSMS(message);

  const callSent =
    await makeCall(message);

  await Alert.create({
    locationId:
      location.locationId ||
      `LIVE-${location.lat}-${location.lng}`,

    riskPointId:
      location.riskPointId ||
      `RISK-${location.lat}-${location.lng}`,

    areaName:
      location.areaName ||
      "Unknown",

    location:
      location.name ||
      "Unknown",

    state:
      location.state ||
      "Northeast India",

    lat: location.lat,
    lng: location.lng,

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

    temperature:
      location.temperature,

    windSpeed:
      location.windSpeed,

    elevation:
      location.elevation,

    slope:
      location.slope,

    source:
      "GiriDrishti AI Live Monitoring",

    action:
      location.riskLevel ===
      "CRITICAL"
        ? "Immediate field inspection and emergency assessment recommended."
        : "Field inspection and enhanced monitoring recommended.",

    smsSent,

    callSent,
  });

  console.log(
    `ALERT CREATED: ${location.riskLevel} - ${location.areaName}`
  );
}

// ======================================================
// MONITORING
// ======================================================

async function startMonitoring() {
  console.log(
    "GiriDrishti monitoring started"
  );

  const locations = [
    {
      lat: 27.4728,
      lng: 94.9119,
      areaName: "Dibrugarh",
      state: "Assam",
    },

    {
      lat: 27.5861,
      lng: 91.8647,
      areaName: "Tawang",
      state: "Arunachal Pradesh",
    },

    {
      lat: 25.5788,
      lng: 91.8933,
      areaName: "Shillong",
      state: "Meghalaya",
    },

    {
      lat: 23.7271,
      lng: 92.7176,
      areaName: "Aizawl",
      state: "Mizoram",
    },

    {
      lat: 24.817,
      lng: 93.9368,
      areaName: "Imphal",
      state: "Manipur",
    },

    {
      lat: 26.1445,
      lng: 91.7362,
      areaName: "Guwahati",
      state: "Assam",
    },

    {
      lat: 26.3265,
      lng: 89.4459,
      areaName: "Alipurduar",
      state: "West Bengal",
    },

    {
      lat: 27.3389,
      lng: 88.6065,
      areaName: "Gangtok",
      state: "Sikkim",
    },
  ];

  async function monitor() {
    for (const point of locations) {
      try {
        const weather =
          await getWeather(
            point.lat,
            point.lng
          );

        const risk =
          calculateRisk(
            weather
          );

        const location = {
          ...point,
          ...weather,
          ...risk,
        };

        await processAlert(
          location
        );
      } catch (error) {
        console.error(
          `Monitor failed for ${point.areaName}:`,
          error.message
        );
      }
    }
  }

  await monitor();

  setInterval(
    monitor,
    1000
  );
}

module.exports = {
  startMonitoring,
};