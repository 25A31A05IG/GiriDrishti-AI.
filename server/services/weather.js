const axios = require("axios");

async function getWeather(latitude, longitude) {
  try {
    const url =
      process.env.OPEN_METEO_URL ||
      "https://api.open-meteo.com/v1/forecast";

    const response = await axios.get(url, {
      params: {
        latitude,
        longitude,
        current:
          "temperature_2m,relative_humidity_2m,precipitation,rain,showers,wind_speed_10m",
        hourly:
          "precipitation,rain,soil_moisture_0_to_1cm",
        forecast_days: 1,
      },
      timeout: 10000,
    });

    const current = response.data.current || {};

    const hourly = response.data.hourly || {};

    const rainfall = Number(
      current.rain ??
        current.precipitation ??
        0
    );

    let soilMoisture = 0;

    if (
      Array.isArray(hourly.soil_moisture_0_to_1cm) &&
      hourly.soil_moisture_0_to_1cm.length
    ) {
      soilMoisture =
        Number(hourly.soil_moisture_0_to_1cm[0]) * 100;
    }

    return {
      rainfall,
      soilMoisture,
      temperature: Number(current.temperature_2m || 0),
      humidity: Number(current.relative_humidity_2m || 0),
      windSpeed: Number(current.wind_speed_10m || 0),
      precipitation: Number(current.precipitation || 0),
    };
  } catch (error) {
    console.error("Weather error:", error.message);

    return {
      rainfall: 0,
      soilMoisture: 0,
      temperature: 0,
      humidity: 0,
      windSpeed: 0,
      precipitation: 0,
    };
  }
}

async function reverseGeocode(latitude, longitude) {
  try {
    const url =
      process.env.NOMINATIM_URL ||
      "https://nominatim.openstreetmap.org/reverse";

    const response = await axios.get(url, {
      params: {
        lat: latitude,
        lon: longitude,
        format: "json",
      },
      headers: {
        "User-Agent": "GiriDrishtiAI/1.0",
      },
      timeout: 10000,
    });

    return response.data?.display_name || "Unknown location";
  } catch (error) {
    return "Unknown location";
  }
}

module.exports = {
  getWeather,
  reverseGeocode,
};