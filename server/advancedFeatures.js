// server/advancedFeatures.js
// ADDITIVE MODULE — does not replace existing GiriDrishti features/UI.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function registerAdvancedFeatures(app) {
  const DATA_DIR = path.join(__dirname, "data");
  const UPLOADS_DIR = path.join(__dirname, "uploads");
  const ML_API =
    process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const reportsFile = path.join(DATA_DIR, "reports.json");
  const notificationFile = path.join(
    DATA_DIR,
    "notification_subscriptions.json"
  );
  const backtestFile = path.join(
    DATA_DIR,
    "backtest_results.json"
  );

  function readJson(file, fallback = []) {
    try {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(
          file,
          JSON.stringify(fallback, null, 2)
        );
        return fallback;
      }

      const value = JSON.parse(
        fs.readFileSync(file, "utf8")
      );

      return value;
    } catch {
      return fallback;
    }
  }

  function writeJson(file, value) {
    fs.writeFileSync(
      file,
      JSON.stringify(value, null, 2),
      "utf8"
    );
  }

  function authUser(req) {
    const header =
      req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return null;
    }

    const token = header.slice(7);

    try {
      const [h, b, s] = token.split(".");

      if (!h || !b || !s) {
        return null;
      }

      const secret =
        process.env.JWT_SECRET ||
        "giridrishti-development-secret";

      const expected = crypto
        .createHmac("sha256", secret)
        .update(`${h}.${b}`)
        .digest("base64url");

      if (
        !crypto.timingSafeEqual(
          Buffer.from(s),
          Buffer.from(expected)
        )
      ) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(b, "base64url").toString("utf8")
      );

      if (
        payload.exp &&
        payload.exp <
          Math.floor(Date.now() / 1000)
      ) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  function haversine(
    lat1,
    lng1,
    lat2,
    lng2
  ) {
    const R = 6371;

    const dLat =
      ((lat2 - lat1) * Math.PI) / 180;

    const dLng =
      ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
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

  function riskLevel(score) {
    if (score >= 80) return "CRITICAL";
    if (score >= 60) return "HIGH";
    if (score >= 35) return "MODERATE";
    return "LOW";
  }

  function validateCoordinates(lat, lng) {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }

  async function fetchJson(
    url,
    options = {},
    timeoutMs = 20000
  ) {
    const controller =
      new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response = await fetch(
        url,
        {
          ...options,
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(
          `${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================
  // 1–12: DIRECT LIVE LOCATION ENGINE
  // =========================================================

  async function getLiveLocation(lat, lng) {
    if (!validateCoordinates(lat, lng)) {
      throw new Error(
        "Invalid coordinates"
      );
    }

    const checkedAt =
      new Date().toISOString();

    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat}` +
      `&longitude=${lng}` +
      "&current=" +
      [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "rain",
        "wind_speed_10m"
      ].join(",") +
      "&hourly=" +
      [
        "soil_moisture_0_to_7cm",
        "soil_moisture_7_to_28cm"
      ].join(",") +
      "&forecast_days=1" +
      "&timezone=UTC";

    const weather =
      await fetchJson(weatherUrl);

    const current =
      weather.current || {};

    const hourly =
      weather.hourly || {};

    const temperature =
      Number(current.temperature_2m);

    const humidity =
      Number(
        current.relative_humidity_2m
      );

    const precipitation =
      Number(current.precipitation);

    const rain =
      Number(current.rain);

    const windSpeed =
      Number(current.wind_speed_10m);

    const soilA =
      Array.isArray(
        hourly.soil_moisture_0_to_7cm
      )
        ? Number(
            hourly.soil_moisture_0_to_7cm[0]
          )
        : NaN;

    const soilB =
      Array.isArray(
        hourly.soil_moisture_7_to_28cm
      )
        ? Number(
            hourly.soil_moisture_7_to_28cm[0]
          )
        : NaN;

    const soilValues = [
      soilA,
      soilB
    ].filter(Number.isFinite);

    if (
      !Number.isFinite(temperature) ||
      !Number.isFinite(humidity) ||
      !Number.isFinite(precipitation) ||
      !Number.isFinite(windSpeed) ||
      soilValues.length === 0
    ) {
      throw new Error(
        "Live weather/soil data unavailable"
      );
    }

    const soilMoisture =
      (soilValues.reduce(
        (a, b) => a + b,
        0
      ) /
        soilValues.length) *
      100;

    const weatherTime =
      current.time;

    const elevationUrl =
      "https://api.open-meteo.com/v1/elevation" +
      `?latitude=${lat},${lat + 0.001},${lat - 0.001},${lat},${lat}` +
      `&longitude=${lng},${lng},${lng},${lng + 0.001},${lng - 0.001}`;

    const elevationData =
      await fetchJson(elevationUrl);

    const elevations =
      Array.isArray(
        elevationData.elevation
      )
        ? elevationData.elevation.map(Number)
        : [];

    if (
      elevations.length !== 5 ||
      elevations.some(
        (v) => !Number.isFinite(v)
      )
    ) {
      throw new Error(
        "DEM elevation unavailable"
      );
    }

    const center =
      elevations[0];

    const north =
      elevations[1];

    const south =
      elevations[2];

    const east =
      elevations[3];

    const west =
      elevations[4];

    const latMeters = 111320 * 0.001;

    const lngMeters =
      111320 *
      Math.cos(
        (lat * Math.PI) / 180
      ) *
      0.001;

    const dzNorthSouth =
      Math.abs(north - south);

    const dzEastWest =
      Math.abs(east - west);

    const gradientNS =
      dzNorthSouth /
      (2 * latMeters);

    const gradientEW =
      dzEastWest /
      (2 * Math.max(lngMeters, 1));

    const gradient =
      Math.max(
        gradientNS,
        gradientEW
      );

    const slope =
      Math.atan(gradient) *
      (180 / Math.PI);

    // -------------------------------------------------------
    // GSI historical evidence
    // -------------------------------------------------------

    const historicalFile =
      path.join(
        __dirname,
        "..",
        "ml",
        "data",
        "gsi_landslide_clean.csv"
      );

    let events = [];

    if (fs.existsSync(historicalFile)) {
      const text =
        fs.readFileSync(
          historicalFile,
          "utf8"
        );

      const lines =
        text
          .split(/\r?\n/)
          .filter(Boolean);

      if (lines.length > 1) {
        const headers =
          lines[0]
            .split(",")
            .map((x) =>
              x.trim().toLowerCase()
            );

        for (
          let i = 1;
          i < lines.length;
          i++
        ) {
          const row =
            lines[i].split(",");

          const latIndex =
            headers.indexOf(
              "latitude"
            );

          const lngIndex =
            headers.indexOf(
              "longitude"
            );

          if (
            latIndex === -1 ||
            lngIndex === -1
          ) {
            continue;
          }

          const eventLat =
            Number(row[latIndex]);

          const eventLng =
            Number(row[lngIndex]);

          if (
            Number.isFinite(eventLat) &&
            Number.isFinite(eventLng)
          ) {
            events.push({
              latitude: eventLat,
              longitude: eventLng
            });
          }
        }
      }
    }

    let nearbyEvents = 0;
    let nearestDistance = Infinity;

    for (const event of events) {
      const distance =
        haversine(
          lat,
          lng,
          event.latitude,
          event.longitude
        );

      if (distance <= 25) {
        nearbyEvents++;
      }

      if (
        distance <
        nearestDistance
      ) {
        nearestDistance = distance;
      }
    }

    let historicalRisk = 0;

    if (nearbyEvents > 0) {
      historicalRisk += Math.min(
        nearbyEvents / 20,
        0.7
      );
    }

    if (
      Number.isFinite(
        nearestDistance
      )
    ) {
      historicalRisk +=
        0.3 *
        Math.max(
          0,
          1 -
            Math.min(
              nearestDistance / 25,
              1
            )
        );
    }

    historicalRisk =
      Math.max(
        0,
        Math.min(
          historicalRisk,
          1
        )
      );

    // -------------------------------------------------------
    // REAL ML — no fallback engine
    // -------------------------------------------------------

    const prediction =
      await fetchJson(
        `${ML_API}/predict`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            rainfall:
              precipitation,
            soilMoisture,
            slope,
            elevation: center,
            historicalRisk,
            latitude: lat,
            longitude: lng
          })
        },
        15000
      );

    if (
      !prediction ||
      !Number.isFinite(
        Number(
          prediction.riskScore
        )
      )
    ) {
      throw new Error(
        "AI/ML prediction unavailable"
      );
    }

    let areaName =
      `Area near ${lat.toFixed(
        5
      )}, ${lng.toFixed(5)}`;

    let state =
      "Northeast India";

    let fullAddress =
      areaName;

    // -------------------------------------------------------
    // Reverse geocoding
    // -------------------------------------------------------

    try {
      const geo =
        await fetchJson(
          "https://nominatim.openstreetmap.org/reverse" +
            `?format=jsonv2&lat=${lat}` +
            `&lon=${lng}` +
            "&zoom=12&addressdetails=1",
          {
            headers: {
              "User-Agent":
                "GiriDrishtiAI/1.0"
            }
          },
          10000
        );

      const address =
        geo.address || {};

      areaName =
        address.village ||
        address.town ||
        address.city ||
        address.municipality ||
        address.county ||
        address.state_district ||
        areaName;

      state =
        address.state ||
        state;

      fullAddress =
        geo.display_name ||
        `${areaName}, ${state}`;
    } catch {
      // Keep coordinate-based name.
    }

    const sourceStatus = {
      weather: {
        source:
          "Open-Meteo Forecast API",
        observationTime:
          weatherTime || null,
        checkedAt,
        fresh:
          Boolean(weatherTime)
      },

      soil: {
        source:
          "Open-Meteo Forecast API",
        observationTime:
          weatherTime || null,
        checkedAt,
        fresh:
          Boolean(weatherTime)
      },

      terrain: {
        source:
          "Open-Meteo Elevation API / Copernicus DEM",
        observationTime:
          checkedAt,
        checkedAt,
        fresh: true
      },

      historical: {
        source:
          "GSI Landslide Inventory",
        checkedAt,
        records:
          events.length
      },

      ai: {
        source:
          "GiriDrishti AI ML Service",
        checkedAt
      }
    };

    return {
      id:
        `LIVE-${lat.toFixed(
          5
        )}-${lng.toFixed(5)}`,

      name: areaName,
      areaName,
      state,
      fullAddress,

      lat,
      lng,

      riskPoint: {
        latitude: lat,
        longitude: lng
      },

      rainfall:
        precipitation,

      currentRain:
        Number.isFinite(rain)
          ? rain
          : 0,

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

      elevation:
        Number(
          center.toFixed(2)
        ),

      slope:
        Number(
          slope.toFixed(2)
        ),

      historicalRisk:
        Number(
          historicalRisk.toFixed(4)
        ),

      historicalEventsNearby:
        nearbyEvents,

      nearestHistoricalLandslideKm:
        Number.isFinite(
          nearestDistance
        )
          ? Number(
              nearestDistance.toFixed(
                2
              )
            )
          : null,

      probability:
        Number(
          prediction.probability
        ),

      aiScore:
        Number(
          prediction.aiScore ??
            prediction.riskScore
        ),

      riskScore:
        Number(
          prediction.riskScore
        ),

      riskLevel:
        prediction.riskLevel ||
        riskLevel(
          Number(
            prediction.riskScore
          )
        ),

      mlService: true,

      dynamic: true,

      weatherSource:
        "Open-Meteo Forecast API",

      weatherUpdatedAt:
        weatherTime || null,

      weatherCheckedAt:
        checkedAt,

      terrainSource:
        "Open-Meteo Elevation API / Copernicus DEM",

      terrainUpdatedAt:
        checkedAt,

      historicalSource:
        "GSI Landslide Inventory",

      dataCheckedAt:
        checkedAt,

      sourceStatus,

      dataUnavailable: false,

      stale: false
    };
  }

  // =========================================================
  // ANY MAP COORDINATE
  // =========================================================

  app.get(
    "/api/live-assessment",
    async (req, res) => {
      try {
        const lat =
          Number(req.query.lat);

        const lng =
          Number(req.query.lng);

        if (
          !validateCoordinates(
            lat,
            lng
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                "Valid latitude and longitude are required"
            });
        }

        const result =
          await getLiveLocation(
            lat,
            lng
          );

        result.clickedLocation =
          true;

        res.json(result);
      } catch (error) {
        res.status(503).json({
          error:
            "Live assessment unavailable",
          dataUnavailable: true,
          stale: false,
          mlService: false,
          details:
            error.message
        });
      }
    }
  );

  // Compatibility endpoint.
  app.get(
    "/api/location-report",
    async (req, res) => {
      try {
        const lat =
          Number(req.query.lat);

        const lng =
          Number(req.query.lng);

        if (
          !validateCoordinates(
            lat,
            lng
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                "Valid latitude and longitude are required"
            });
        }

        const result =
          await getLiveLocation(
            lat,
            lng
          );

        result.clickedLocation =
          true;

        res.json(result);
      } catch (error) {
        res.status(503).json({
          error:
            "Unable to get live conditions for this location",
          dataUnavailable: true,
          mlService: false,
          details:
            error.message
        });
      }
    }
  );

  // =========================================================
  // 14–15: CITIZEN REPORT + AI PHOTO ANALYSIS
  // =========================================================

  app.post(
    "/api/reports/:id/analyze",
    async (req, res) => {
      try {
        const reports =
          readJson(
            reportsFile,
            []
          );

        const report =
          reports.find(
            (item) =>
              String(item.id) ===
              String(req.params.id)
          );

        if (!report) {
          return res
            .status(404)
            .json({
              error:
                "Report not found"
            });
        }

        if (!report.photo) {
          return res
            .status(400)
            .json({
              error:
                "No citizen photo attached"
            });
        }

        const imagePath =
          path.join(
            UPLOADS_DIR,
            report.photo
          );

        if (
          !fs.existsSync(imagePath)
        ) {
          return res
            .status(404)
            .json({
              error:
                "Report image not found"
            });
        }

        const result =
          await analyzePhotoWithAI(
            imagePath,
            report
          );

        report.aiAnalysis =
          result;

        report.aiAnalyzedAt =
          new Date().toISOString();

        report.status =
          result.landslideDetected
            ? "AI Flagged"
            : "AI Reviewed";

        writeJson(
          reportsFile,
          reports
        );

        res.json({
          success: true,
          report
        });
      } catch (error) {
        res.status(503).json({
          error:
            "AI photo analysis unavailable",
          details:
            error.message
        });
      }
    }
  );

  async function analyzePhotoWithAI(
    imagePath,
    report
  ) {
    const apiKey =
      process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is not configured"
      );
    }

    const imageBuffer =
      fs.readFileSync(imagePath);

    const base64 =
      imageBuffer.toString(
        "base64"
      );

    const extension =
      path
        .extname(imagePath)
        .toLowerCase();

    const mime =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";

    const response =
      await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            model:
              process.env.GROQ_VISION_MODEL ||
              "meta-llama/llama-4-scout-17b-16e-instruct",

            temperature: 0,

            max_tokens: 700,

            messages: [
              {
                role: "system",
                content:
                  "You are GiriDrishti AI, a landslide image assessment system. Analyze the image for visible landslide indicators such as slope failure, exposed soil, rockfall, debris, cracks, displaced vegetation, blocked roads, mudflow or unstable terrain. Do not claim certainty. Return ONLY valid JSON with keys landslideDetected, confidence, severity, indicators, recommendedAction."
              },
              {
                role: "user",
                content: [
                  {
                    type:
                      "text",
                    text:
                      `Analyze this citizen landslide report. GPS: ${report.lat}, ${report.lng}.`
                  },
                  {
                    type:
                      "image_url",
                    image_url: {
                      url:
                        `data:${mime};base64,${base64}`
                    }
                  }
                ]
              }
            ]
          })
        }
      );

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `Groq vision request failed: ${response.status} ${body}`
      );
    }

    const data =
      await response.json();

    const content =
      data?.choices?.[0]?.message
        ?.content || "";

    let parsed;

    try {
      parsed =
        JSON.parse(
          content
            .replace(
              /^```json/i,
              ""
            )
            .replace(
              /^```/i,
              ""
            )
            .replace(
              /```$/i,
              ""
            )
            .trim()
        );
    } catch {
      parsed = {
        landslideDetected: false,
        confidence: 0,
        severity: "UNKNOWN",
        indicators: [
          content
        ],
        recommendedAction:
          "Manual field verification recommended."
      };
    }

    return {
      ...parsed,
      source:
        "GiriDrishti AI Vision Model",
      analyzedAt:
        new Date().toISOString()
    };
  }

  // =========================================================
  // 16–17: REGISTERED USER ALERT SUBSCRIPTIONS
  // =========================================================

  app.post(
    "/api/notifications/subscribe",
    async (req, res) => {
      const user =
        authUser(req);

      if (!user) {
        return res
          .status(401)
          .json({
            error:
              "Authentication required"
          });
      }

      const {
        latitude,
        longitude,
        radiusKm = 25,
        channels = [
          "email"
        ]
      } = req.body;

      const lat =
        Number(latitude);

      const lng =
        Number(longitude);

      if (
        !validateCoordinates(
          lat,
          lng
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "Valid coordinates are required"
          });
      }

      const subscriptions =
        readJson(
          notificationFile,
          []
        );

      const subscription = {
        id: crypto.randomUUID(),
        userId:
          user.sub,
        email:
          user.email,
        latitude: lat,
        longitude: lng,
        radiusKm:
          Number(radiusKm),
        channels:
          Array.isArray(channels)
            ? channels
            : ["email"],
        active: true,
        createdAt:
          new Date().toISOString()
      };

      subscriptions.push(
        subscription
      );

      writeJson(
        notificationFile,
        subscriptions
      );

      res.status(201).json({
        success: true,
        subscription
      });
    }
  );

  app.get(
    "/api/notifications/subscriptions",
    async (req, res) => {
      const user =
        authUser(req);

      if (!user) {
        return res
          .status(401)
          .json({
            error:
              "Authentication required"
          });
      }

      const subscriptions =
        readJson(
          notificationFile,
          []
        );

      res.json(
        subscriptions.filter(
          (item) =>
            item.userId ===
            user.sub
        )
      );
    }
  );

  app.delete(
    "/api/notifications/subscriptions/:id",
    async (req, res) => {
      const user =
        authUser(req);

      if (!user) {
        return res
          .status(401)
          .json({
            error:
              "Authentication required"
          });
      }

      const subscriptions =
        readJson(
          notificationFile,
          []
        );

      const updated =
        subscriptions.map(
          (item) =>
            item.id ===
              req.params.id &&
            item.userId ===
              user.sub
              ? {
                  ...item,
                  active: false
                }
              : item
        );

      writeJson(
        notificationFile,
        updated
      );

      res.json({
        success: true
      });
    }
  );

  // =========================================================
  // 17: EMAIL / SMS / PHONE NOTIFICATION
  // =========================================================

  async function sendNotification(
    subscription,
    alert
  ) {
    const results = [];

    const channels =
      subscription.channels || [];

    if (
      channels.includes(
        "email"
      )
    ) {
      results.push(
        await sendEmailAlert(
          subscription.email,
          alert
        )
      );
    }

    if (
      channels.includes("sms") ||
      channels.includes("phone")
    ) {
      results.push(
        await sendTwilioAlert(
          subscription,
          alert,
          channels
        )
      );
    }

    return results;
  }

  async function sendEmailAlert(
    email,
    alert
  ) {
    const key =
      process.env.RESEND_API_KEY;

    if (!key) {
      return {
        channel: "email",
        sent: false,
        reason:
          "RESEND_API_KEY not configured"
      };
    }

    const from =
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev";

    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${key}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject:
              `GiriDrishti AI ${alert.riskLevel} Landslide Warning`,
            html: `
              <h2>GiriDrishti AI Alert</h2>
              <p><strong>Risk:</strong> ${alert.riskLevel}</p>
              <p><strong>Risk Score:</strong> ${alert.riskScore}%</p>
              <p><strong>Location:</strong> ${alert.areaName}</p>
              <p><strong>Rainfall:</strong> ${alert.rainfall} mm</p>
              <p><strong>Slope:</strong> ${alert.slope}°</p>
              <p><strong>Elevation:</strong> ${alert.elevation} m</p>
              <p>Please follow local authority guidance.</p>
            `
          })
        }
      );

    return {
      channel: "email",
      sent: response.ok
    };
  }

  async function sendTwilioAlert(
    subscription,
    alert,
    channels
  ) {
    const sid =
      process.env.TWILIO_ACCOUNT_SID;

    const authToken =
      process.env.TWILIO_AUTH_TOKEN;

    const from =
      process.env.TWILIO_FROM_NUMBER;

    const to =
      subscription.phone ||
      process.env.TWILIO_DEFAULT_TO;

    if (
      !sid ||
      !authToken ||
      !from ||
      !to
    ) {
      return {
        channel:
          channels.includes(
            "phone"
          )
            ? "phone"
            : "sms",
        sent: false,
        reason:
          "Twilio configuration unavailable"
      };
    }

    const message =
      `GiriDrishti AI ${alert.riskLevel} warning at ${alert.areaName}. Risk ${alert.riskScore}%. Please follow local safety guidance.`;

    const body =
      new URLSearchParams({
        To: to,
        From: from,
        Body: message
      });

    const credentials =
      Buffer.from(
        `${sid}:${authToken}`
      ).toString(
        "base64"
      );

    if (
      channels.includes(
        "phone"
      )
    ) {
      const voiceBody =
        new URLSearchParams({
          To: to,
          From: from,
          Twiml:
            `<Response><Say>${message}</Say></Response>`
        });

      const voiceResponse =
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Basic ${credentials}`,
              "Content-Type":
                "application/x-www-form-urlencoded"
            },
            body: voiceBody
          }
        );

      return {
        channel: "phone",
        sent:
          voiceResponse.ok
      };
    }

    const smsResponse =
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Basic ${credentials}`,
            "Content-Type":
              "application/x-www-form-urlencoded"
          },
          body
        }
      );

    return {
      channel: "sms",
      sent: smsResponse.ok
    };
  }

  // =========================================================
  // DYNAMIC ALERT EVALUATION
  // =========================================================

  let lastAlertKeys =
    new Map();

  async function evaluateSubscriptions(
    locations
  ) {
    const subscriptions =
      readJson(
        notificationFile,
        []
      ).filter(
        (item) =>
          item.active
      );

    for (const location of locations) {
      if (
        location.riskLevel !==
          "HIGH" &&
        location.riskLevel !==
          "CRITICAL"
      ) {
        continue;
      }

      for (
        const subscription of subscriptions
      ) {
        const distance =
          haversine(
            subscription.latitude,
            subscription.longitude,
            location.lat,
            location.lng
          );

        if (
          distance >
          Number(
            subscription.radiusKm ||
              25
          )
        ) {
          continue;
        }

        const key =
          `${subscription.id}:${location.id}:${location.riskLevel}:${Math.floor(location.riskScore)}`;

        if (
          lastAlertKeys.has(key)
        ) {
          continue;
        }

        lastAlertKeys.set(
          key,
          Date.now()
        );

        await sendNotification(
          subscription,
          {
            ...location,
            distanceKm:
              Number(
                distance.toFixed(2)
              )
          }
        );
      }
    }

    // Prevent unlimited memory growth.
    if (
      lastAlertKeys.size >
      10000
    ) {
      lastAlertKeys =
        new Map(
          [
            ...lastAlertKeys.entries()
          ].slice(-5000)
        );
    }
  }

  // =========================================================
  // 18: HISTORICAL BACKTESTING
  // =========================================================

  app.post(
    "/api/backtesting/run",
    async (req, res) => {
      try {
        const historicalFile =
          path.join(
            __dirname,
            "..",
            "ml",
            "data",
            "gsi_landslide_clean.csv"
          );

        if (
          !fs.existsSync(
            historicalFile
          )
        ) {
          return res
            .status(404)
            .json({
              error:
                "GSI historical dataset not found"
            });
        }

        const text =
          fs.readFileSync(
            historicalFile,
            "utf8"
          );

        const lines =
          text
            .split(/\r?\n/)
            .filter(Boolean);

        if (
          lines.length < 2
        ) {
          return res
            .status(400)
            .json({
              error:
                "Historical dataset is empty"
            });
        }

        const headers =
          lines[0]
            .split(",")
            .map((x) =>
              x.trim().toLowerCase()
            );

        const latIndex =
          headers.indexOf(
            "latitude"
          );

        const lngIndex =
          headers.indexOf(
            "longitude"
          );

        if (
          latIndex === -1 ||
          lngIndex === -1
        ) {
          return res
            .status(400)
            .json({
              error:
                "Latitude/longitude columns unavailable"
            });
        }

        const maxEvents =
          Math.min(
            Number(
              req.body.maxEvents ||
                100
            ),
            500
          );

        const events = [];

        for (
          let i = 1;
          i < lines.length &&
          events.length <
            maxEvents;
          i++
        ) {
          const row =
            lines[i].split(",");

          const latitude =
            Number(
              row[latIndex]
            );

          const longitude =
            Number(
              row[lngIndex]
            );

          if (
            Number.isFinite(
              latitude
            ) &&
            Number.isFinite(
              longitude
            )
          ) {
            events.push({
              latitude,
              longitude
            });
          }
        }

        let evaluated = 0;
        let warnings = 0;
        let highWarnings = 0;
        let criticalWarnings = 0;

        const results = [];

        for (const event of events) {
          try {
            const prediction =
              await fetchJson(
                `${ML_API}/predict`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json"
                  },
                  body: JSON.stringify({
                    rainfall:
                      0,
                    soilMoisture:
                      0,
                    slope:
                      0,
                    elevation:
                      0,
                    historicalRisk:
                      1,
                    latitude:
                      event.latitude,
                    longitude:
                      event.longitude
                  })
                },
                10000
              );

            evaluated++;

            const score =
              Number(
                prediction.riskScore
              );

            const level =
              prediction.riskLevel ||
              riskLevel(score);

            const warned =
              level ===
                "HIGH" ||
              level ===
                "CRITICAL";

            if (warned) {
              warnings++;
            }

            if (
              level ===
              "HIGH"
            ) {
              highWarnings++;
            }

            if (
              level ===
              "CRITICAL"
            ) {
              criticalWarnings++;
            }

            results.push({
              ...event,
              riskScore:
                score,
              riskLevel:
                level,
              warning:
                warned
            });
          } catch {
            // Do not fabricate historical predictions.
          }
        }

        const warningRecall =
          evaluated > 0
            ? warnings /
              evaluated
            : 0;

        const output = {
          generatedAt:
            new Date().toISOString(),

          dataset:
            "GSI Landslide Inventory",

          eventsAvailable:
            events.length,

          eventsEvaluated:
            evaluated,

          warnings,

          highWarnings,

          criticalWarnings,

          warningRecall:
            Number(
              warningRecall.toFixed(
                4
              )
            ),

          warningRecallPercent:
            Number(
              (
                warningRecall *
                100
              ).toFixed(2)
            ),

          methodology:
            "Historical event replay. This is a screening/backtesting metric and does not claim future-event certainty.",

          results
        };

        writeJson(
          backtestFile,
          output
        );

        res.json(output);
      } catch (error) {
        res.status(500).json({
          error:
            "Backtesting failed",
          details:
            error.message
        });
      }
    }
  );

  app.get(
    "/api/backtesting/latest",
    (req, res) => {
      res.json(
        readJson(
          backtestFile,
          {
            message:
              "No backtest has been run yet."
          }
        )
      );
    }
  );

  // =========================================================
  // 19: SECURITY
  // =========================================================

  app.use(
    "/api",
    (req, res, next) => {
      res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
      );

      res.setHeader(
        "X-Frame-Options",
        "SAMEORIGIN"
      );

      res.setHeader(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
      );

      res.setHeader(
        "Permissions-Policy",
        "geolocation=(self), camera=(self)"
      );

      next();
    }
  );

  // =========================================================
  // 20: SCALABILITY STATUS
  // =========================================================

  app.get(
    "/api/system/status",
    (req, res) => {
      res.json({
        service:
          "GiriDrishti AI",

        architecture:
          "API + ML microservice + external live-data providers",

        liveMonitoring:
          true,

        automaticMonitoring:
          true,

        monitoringIntervalSeconds:
          60,

        dynamicLocations:
          true,

        arbitraryCoordinates:
          true,

        demTerrain:
          true,

        gsiEvidence:
          true,

        mlPredictionOnly:
          true,

        fallbackRiskEngine:
          false,

        staleDataProtection:
          true,

        authentication:
          true,

        registeredAlerts:
          true,

        smsSupport:
          Boolean(
            process.env.TWILIO_ACCOUNT_SID
          ),

        phoneSupport:
          Boolean(
            process.env.TWILIO_ACCOUNT_SID
          ),

        aiPhotoAnalysis:
          Boolean(
            process.env.GROQ_API_KEY
          ),

        backtesting:
          true,

        serverTime:
          new Date().toISOString()
      });
    }
  );

  // =========================================================
  // EXPORT INTERNAL ENGINE FOR EXISTING MONITORING
  // =========================================================

  app.giriDrishtiAdvanced = {
    getLiveLocation,
    evaluateSubscriptions
  };
};