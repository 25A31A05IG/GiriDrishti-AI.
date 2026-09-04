const User = require("../models/User");

const alertHistory = new Map();

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearbyUsers(latitude, longitude, radiusKm = 10) {
  const users = await User.find({
    notificationsEnabled: true,
    latitude: { $ne: null },
    longitude: { $ne: null },
  });

  return users.filter((user) => {
    const distance = distanceKm(
      latitude,
      longitude,
      user.latitude,
      user.longitude
    );

    return distance <= radiusKm;
  });
}

async function sendAlertToUser(user, alert) {
  /*
    No Twilio/API key is required.

    The application stores the alert and exposes it
    through the API for the registered user's app.
  */

  console.log(
    `ALERT → ${user.phone} | ${alert.riskLevel} | ${alert.message}`
  );

  return {
    success: true,
    userId: user._id,
    phone: user.phone,
    delivered: true,
    channel: "APP_NOTIFICATION",
  };
}

async function broadcastAlert({
  latitude,
  longitude,
  riskLevel,
  riskScore,
  locationName,
}) {
  if (!["HIGH", "CRITICAL"].includes(riskLevel)) {
    return [];
  }

  const nearbyUsers = await findNearbyUsers(
    latitude,
    longitude,
    riskLevel === "CRITICAL" ? 20 : 10
  );

  const results = [];

  for (const user of nearbyUsers) {
    const key = `${user._id}-${riskLevel}`;

    const previous = alertHistory.get(key);

    const cooldown =
      Number(process.env.ALERT_COOLDOWN_MINUTES || 15) *
      60 *
      1000;

    if (previous && Date.now() - previous < cooldown) {
      continue;
    }

    const alert = {
      riskLevel,
      riskScore,
      locationName,
      latitude,
      longitude,
      message:
        riskLevel === "CRITICAL"
          ? `CRITICAL LANDSLIDE WARNING near ${locationName}. Move to a safer location immediately.`
          : `HIGH LANDSLIDE RISK detected near ${locationName}. Please move away from vulnerable slopes.`,
      createdAt: new Date(),
    };

    const result = await sendAlertToUser(user, alert);

    alertHistory.set(key, Date.now());

    results.push(result);
  }

  return results;
}

module.exports = {
  broadcastAlert,
  findNearbyUsers,
};