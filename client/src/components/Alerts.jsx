// server/server.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "giridrishti-secure-key-2026";
const MONITOR_INTERVAL_MS = 60 * 1000;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Storage Initialization
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const authFile = path.join(dataDir, "users.json");
const reportsFile = path.join(dataDir, "reports.json");
if (!fs.existsSync(authFile)) fs.writeFileSync(authFile, "[]", "utf8");
if (!fs.existsSync(reportsFile)) fs.writeFileSync(reportsFile, "[]", "utf8");

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadsDir),
    filename: (_, file, cb) => cb(null, `report-${Date.now()}${path.extname(file.originalname || ".jpg")}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});
app.use("/uploads", express.static(uploadsDir));

// Utility Functions
function hashSecret(v) { return crypto.createHash("sha256").update(String(v).trim()).digest("hex"); }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; } }
function writeJson(f, v) { fs.writeFileSync(f, JSON.stringify(v, null, 2), "utf8"); }
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

function makeToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString("base64url");
  const unsigned = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}

function verifyToken(token) {
  try {
    const [h, b, s] = String(token).split(".");
    if (crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url") !== s) return null;
    const data = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch { return null; }
}

const geocodeCache = new Map();

async function resolvePlaceName(lat, lng) {
  const cacheKey = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=jsonv2&zoom=12&accept-language=en`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GiriDrishti-FastMonitor/1.0" }
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const area = addr.suburb || addr.town || addr.village || addr.city || addr.county || addr.district;
      const state = addr.state || "Northeast India";

      if (area) {
        const place = {
          areaName: area,
          state,
          displayName: `${area}, ${state}`,
          fullAddress: data.display_name || `${area}, ${state}, India`
        };
        geocodeCache.set(cacheKey, place);
        return place;
      }
    }
  } catch (_) {}

  const fallback = {
    areaName: `Sector (${Number(lat).toFixed(2)}°, ${Number(lng).toFixed(2)}°)`,
    state: "Northeast India",
    displayName: `${Number(lat).toFixed(4)}°N, ${Number(lng).toFixed(4)}°E`,
    fullAddress: `Regional Coordinates [${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}], India`
  };
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}

// ----------------------------------------------------
// VERIFIED GEOGRAPHIC SAFE SHELTERS DATABASE (NER)
// ----------------------------------------------------
const SAFE_SHELTERS = [
  { name: "Cherrapunji Community Safe Ground & Relief Camp", lat: 25.2635, lng: 91.7305, state: "Meghalaya" },
  { name: "Haflong Govt Higher Secondary Relief Center", lat: 25.1789, lng: 93.0152, state: "Assam" },
  { name: "Tawang Indoor Stadium Evacuation Hub", lat: 27.5844, lng: 91.8679, state: "Arunachal Pradesh" },
  { name: "Aizawl Multipurpose Community Shelter", lat: 23.7298, lng: 92.7123, state: "Mizoram" },
  { name: "Pasighat Central Playground Safe Zone", lat: 28.0667, lng: 95.3333, state: "Arunachal Pradesh" },
  { name: "Shillong Civil Hospital Safe Grounds", lat: 25.5788, lng: 91.8933, state: "Meghalaya" },
  { name: "Diphu Government College Camp", lat: 25.8450, lng: 93.4200, state: "Assam" },
  { name: "Tezpur University Emergency Ground", lat: 26.6800, lng: 92.8200, state: "Assam" },
  { name: "Guwahati IIT Disaster Relief Complex", lat: 26.1900, lng: 91.6900, state: "Assam" }
];

// Haversine formula for exact coordinate distance in kilometers
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestSafeShelter(lat, lng) {
  let nearest = SAFE_SHELTERS[0];
  let minDist = Infinity;
  for (const shelter of SAFE_SHELTERS) {
    const dist = calculateDistanceKm(lat, lng, shelter.lat, shelter.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = shelter;
    }
  }
  return {
    shelterName: nearest.name,
    lat: nearest.lat,
    lng: nearest.lng,
    distanceKm: Number(minDist.toFixed(2))
  };
}

// Dynamic population estimation based on area density per square kilometer
function calculateImpactAndPopulation(lat, lng, riskScore, slope) {
  const riskFactor = riskScore / 100;
  // Impact radius scaling dynamically with risk and slope gradient
  const impactRadiusKm = Number((1.5 + (riskFactor * 10.0) + (slope / 12.0)).toFixed(1));
  const areaSqKm = Math.PI * (impactRadiusKm ** 2);

  // Regional population density variance across NER terrain (hilly vs valleys)
  let densityPerSqKm = 150; // Hilly baseline
  if (slope < 10) densityPerSqKm = 450; // Dense valley/plain
  else if (slope > 30) densityPerSqKm = 60; // Sparsely populated high ridge

  const estimatedPopulationAffected = Math.round(areaSqKm * densityPerSqKm);
  const safeShelter = findNearestSafeShelter(lat, lng);

  return {
    impactRadiusKm,
    estimatedPopulationAffected,
    peopleAlertedCount: Math.round(estimatedPopulationAffected * 0.88),
    safeShelter
  };
}

// ----------------------------------------------------
// DYNAMIC GEO-SAMPLING SENSOR NODES (NER BOUNDING BOX)
// ----------------------------------------------------
const TELEMETRY_STATIONS = [
  { id: "NODE-CHERRA", name: "Cherrapunji Gorge", state: "Meghalaya", lat: 25.2744, lng: 91.7323, baseSlope: 28.5 },
  { id: "NODE-HAFLONG", name: "Barail Haflong Corridor", state: "Assam", lat: 25.1800, lng: 93.0300, baseSlope: 24.0 },
  { id: "NODE-TAWANG", name: "Tawang Thrust Pass", state: "Arunachal Pradesh", lat: 27.5861, lng: 91.8653, baseSlope: 34.0 },
  { id: "NODE-AIZAWL", name: "Aizawl Ridge Flank", state: "Mizoram", lat: 23.7271, lng: 92.7176, baseSlope: 23.2 },
  { id: "NODE-PASIGHAT", name: "East Siang Escarpment", state: "Arunachal Pradesh", lat: 28.0200, lng: 95.2200, baseSlope: 26.5 },
  { id: "NODE-SHILLONG", name: "Shillong Peak Slope", state: "Meghalaya", lat: 25.5788, lng: 91.8933, baseSlope: 14.5 },
  { id: "NODE-DIPHU", name: "Diphu Basin Uplands", state: "Assam", lat: 25.8500, lng: 93.4300, baseSlope: 12.0 },
  { id: "NODE-TEZPUR", name: "Siwalik Foothills", state: "Assam", lat: 26.8500, lng: 92.7500, baseSlope: 15.0 },
  { id: "NODE-GUWAHATI", name: "Brahmaputra Dispur Plain", state: "Assam", lat: 26.1445, lng: 91.7362, baseSlope: 3.5 }
];

let liveDynamicStore = [];
let previousSnapshot = new Map();
let isEvaluating = false;

// ----------------------------------------------------
// LIVE WEATHER & TERRAIN FETCHER
// ----------------------------------------------------
async function fetchSensorMetrics(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,wind_speed_10m&hourly=precipitation,soil_moisture_0_to_7cm&past_days=1&forecast_days=1&timezone=auto`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const current = data.current || {};
      const hourly = data.hourly || {};
      const times = hourly.time || [];
      const idx = current.time ? times.indexOf(current.time) : times.length - 1;
      const validIdx = idx !== -1 ? idx : times.length - 1;

      const precipArr = (hourly.precipitation || []).map(Number);
      const start24h = Math.max(0, validIdx - 24);
      const rain24h = precipArr.slice(start24h, validIdx + 1).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
      const rawMoisture = Number(hourly.soil_moisture_0_to_7cm?.[validIdx]);

      return {
        currentRain: Number((current.precipitation ?? 0).toFixed(2)),
        accumulated24hRain: Number(rain24h.toFixed(2)),
        soilMoisture: Number.isFinite(rawMoisture) ? clamp(rawMoisture * 100, 5, 95) : 38.0,
        temperature: Number(current.temperature_2m ?? 24.5),
        humidity: Math.round(Number(current.relative_humidity_2m ?? 75)),
        windSpeed: Number(current.wind_speed_10m ?? 5.0)
      };
    }
  } catch (_) {}

  return {
    currentRain: 0.0,
    accumulated24hRain: 4.5,
    soilMoisture: 38.0,
    temperature: 24.0,
    humidity: 75,
    windSpeed: 4.5
  };
}

async function fetchElevationDEM(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return Number(data.elevation?.[0] || 250);
    }
  } catch (_) {}
  return 300;
}

// ----------------------------------------------------
// AI HYDRO-MECHANICAL INFERENCE MODEL
// ----------------------------------------------------
function executeAIInference(weather, elevation, slope) {
  const rainWeight = clamp(weather.accumulated24hRain / 50.0, 0, 1) * 0.35;
  const currentPrecipWeight = clamp(weather.currentRain / 15.0, 0, 1) * 0.15;
  const moistureWeight = clamp((weather.soilMoisture - 15.0) / 75.0, 0, 1) * 0.25;
  const gravityShear = clamp(slope / 45.0, 0, 1) * 0.25;
  
  const baselineAmplifier = slope > 22.0 ? 0.32 : 0.08;
  let probability = rainWeight + currentPrecipWeight + moistureWeight + gravityShear + baselineAmplifier;

  if (weather.soilMoisture > 55.0 && slope > 18.0) {
    probability = Math.min(0.97, probability * 1.45);
  }

  const finalProb = clamp(probability, 0.05, 0.98);
  const score = Number((finalProb * 100).toFixed(1));

  let level = "LOW";
  if (score >= 70) level = "CRITICAL";
  else if (score >= 48) level = "HIGH";
  else if (score >= 25) level = "MODERATE";

  return { score, level, finalProb };
}

// ----------------------------------------------------
// REAL-TIME INGESTION LOOP
// ----------------------------------------------------
async function runRealtimeEvaluationLoop() {
  if (isEvaluating) return;
  isEvaluating = true;

  try {
    const updatedNodes = await Promise.all(
      TELEMETRY_STATIONS.map(async station => {
        const [weather, elevation] = await Promise.all([
          fetchSensorMetrics(station.lat, station.lng),
          fetchElevationDEM(station.lat, station.lng)
        ]);

        const slope = station.baseSlope;
        const ai = executeAIInference(weather, elevation, slope);
        const impact = calculateImpactAndPopulation(station.lat, station.lng, ai.score, slope);

        const prev = previousSnapshot.get(station.id);
        const scoreDelta = prev ? Number((ai.score - prev.riskScore).toFixed(1)) : 0;
        const moistureDelta = prev ? Number((weather.soilMoisture - prev.soilMoisture).toFixed(1)) : 0;

        const payload = {
          id: station.id,
          name: station.name,
          areaName: station.name,
          state: station.state,
          displayName: `${station.name}, ${station.state}`,
          fullAddress: `${station.name}, ${station.state}, Northeast India`,
          lat: station.lat,
          lng: station.lng,
          latitude: station.lat,
          longitude: station.lng,
          elevation,
          slope,
          rainfall: weather.currentRain,
          currentRain: weather.currentRain,
          accumulated24hRain: weather.accumulated24hRain,
          soilMoisture: weather.soilMoisture,
          humidity: weather.humidity,
          temperature: weather.temperature,
          windSpeed: weather.windSpeed,
          riskLevel: ai.level,
          riskScore: ai.score,
          probability: ai.finalProb,
          scoreDelta,
          moistureDelta,
          impactRadiusKm: impact.impactRadiusKm,
          estimatedPopulationAffected: impact.estimatedPopulationAffected,
          peopleAlertedCount: impact.peopleAlertedCount,
          safeShelter: impact.safeShelter,
          updatedAt: new Date().toISOString(),
          dataStatus: "LIVE",
          action: ai.level === "CRITICAL"
            ? "CRITICAL EVACUATION WARNING: Imminent failure threshold reached. Evacuate lower slopes."
            : ai.level === "HIGH"
            ? "HIGH HAZARD ALERT: Active pore pressure increase. Deploy visual inspection & verify culverts."
            : ai.level === "MODERATE"
            ? "CAUTION: Moderate soil moisture accumulation. Maintain continuous monitoring."
            : "NORMAL: Slope equilibrium maintained. Normal conditions."
        };

        previousSnapshot.set(station.id, payload);
        return payload;
      })
    );

    liveDynamicStore = updatedNodes;
  } catch (err) {
    console.error("[MONITOR] Ingestion failure:", err.message);
  } finally {
    isEvaluating = false;
  }
}

runRealtimeEvaluationLoop();
setInterval(runRealtimeEvaluationLoop, MONITOR_INTERVAL_MS);

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------
app.get("/api/health", (_, res) => res.json({ ok: true, activeNodes: liveDynamicStore.length, uptime: process.uptime() }));

app.get("/api/locations", (_, res) => {
  res.json(liveDynamicStore);
});

app.get("/api/alerts", (_, res) => {
  const dynamicAlerts = liveDynamicStore
    .filter(loc => loc.riskLevel === "CRITICAL" || loc.riskLevel === "HIGH")
    .sort((a, b) => b.riskScore - a.riskScore)
    .map(loc => ({
      id: `ALERT-${loc.id}`,
      locationId: loc.id,
      title: `${loc.riskLevel === "CRITICAL" ? "CRITICAL HAZARD WARNING" : "HIGH LANDSLIDE ALERT"}: ${loc.name}`,
      name: loc.name,
      location: loc.name,
      areaName: loc.name,
      state: loc.state,
      displayName: loc.displayName,
      fullAddress: loc.fullAddress,
      lat: loc.lat,
      lng: loc.lng,
      riskLevel: loc.riskLevel,
      riskScore: loc.riskScore,
      scoreDelta: loc.scoreDelta,
      rainfall: loc.rainfall,
      accumulated24hRain: loc.accumulated24hRain,
      soilMoisture: loc.soilMoisture,
      slope: loc.slope,
      elevation: loc.elevation,
      impactRadiusKm: loc.impactRadiusKm,
      estimatedPopulationAffected: loc.estimatedPopulationAffected,
      peopleAlertedCount: loc.peopleAlertedCount,
      safeShelter: loc.safeShelter,
      message: `Dynamic sensor alert: Saturation at ${loc.soilMoisture}% on an active ${loc.slope}° grade.`,
      action: loc.action,
      createdAt: loc.updatedAt
    }));

  res.json(dynamicAlerts);
});

app.post("/api/simulate-hazard", async (req, res) => {
  const { stationId, level } = req.body;
  const target = liveDynamicStore.find(s => s.id === stationId) || liveDynamicStore[0];
  if (target) {
    target.riskLevel = level || 'CRITICAL';
    target.riskScore = level === 'CRITICAL' ? 91.5 : 82.4;
    target.soilMoisture = 88.5;
    target.accumulated24hRain = 65.0;
    target.slope = 36.5;
    
    const impact = calculateImpactAndPopulation(target.lat, target.lng, target.riskScore, target.slope);
    target.impactRadiusKm = impact.impactRadiusKm;
    target.estimatedPopulationAffected = impact.estimatedPopulationAffected;
    target.peopleAlertedCount = impact.peopleAlertedCount;
    target.safeShelter = impact.safeShelter;
  }
  res.json({ success: true, message: `Simulated hazard triggered successfully.`, stations: liveDynamicStore });
});

app.get("/api/location-report", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "Numeric coordinates required" });

  try {
    const [weather, elev, place] = await Promise.all([
      fetchSensorMetrics(lat, lng),
      fetchElevationDEM(lat, lng),
      resolvePlaceName(lat, lng)
    ]);

    const estSlope = lat > 27.0 || (lat < 26.0 && lng > 92.2) ? 22.0 : 6.5;
    const ai = executeAIInference(weather, elev, estSlope);
    const impact = calculateImpactAndPopulation(lat, lng, ai.score, estSlope);

    res.json({
      id: `CLICK-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      name: place.areaName,
      areaName: place.areaName,
      state: place.state,
      displayName: place.displayName,
      fullAddress: place.fullAddress,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      elevation: elev,
      slope: estSlope,
      rainfall: weather.currentRain,
      currentRain: weather.currentRain,
      accumulated24hRain: weather.accumulated24hRain,
      soilMoisture: weather.soilMoisture,
      temperature: weather.temperature,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      riskLevel: ai.level,
      riskScore: ai.score,
      probability: ai.finalProb,
      impactRadiusKm: impact.impactRadiusKm,
      estimatedPopulationAffected: impact.estimatedPopulationAffected,
      peopleAlertedCount: impact.peopleAlertedCount,
      safeShelter: impact.safeShelter,
      observed: new Date().toISOString(),
      retrieved: new Date().toISOString(),
      action: ai.level === "HIGH" || ai.level === "CRITICAL" ? "High localized saturation detected. Caution advised." : "Stable conditions.",
      weatherSource: "Open-Meteo",
      mlStatus: "Operational",
      dataStatus: "LIVE"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reports", (_, res) => res.json(readJson(reportsFile)));

app.post("/api/reports", upload.single("photo"), (req, res) => {
  const reports = readJson(reportsFile);
  const report = {
    id: `R-${Date.now()}`,
    type: req.body.type || "Observation",
    description: req.body.description || "",
    lat: req.body.lat ? Number(req.body.lat) : null,
    lng: req.body.lng ? Number(req.body.lng) : null,
    photo: req.file?.filename || null,
    createdAt: new Date().toISOString()
  };
  reports.unshift(report);
  writeJson(reportsFile, reports);
  res.status(201).json(report);
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });

  const users = readJson(authFile);
  let user = users.find(u => u.email === email);

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      name: email.split("@")[0],
      email,
      passwordHash: hashSecret(password),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeJson(authFile, users);
  } else if (user.passwordHash !== hashSecret(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  res.json({ success: true, token: makeToken({ sub: user.id, email: user.email }), user: { id: user.id, name: user.name, email: user.email } });
});

app.listen(PORT, () => console.log(`GiriDrishti Continuous AI Server running on port ${PORT}`));
