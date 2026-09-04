const mongoose = require('mongoose');

const MonitoringSnapshotSchema = new mongoose.Schema(
  {
    locationKey: {
      type: String,
      unique: true,
      index: true
    },

    areaName: {
      type: String,
      default: 'Area unavailable'
    },

    district: {
      type: String,
      default: ''
    },

    state: {
      type: String,
      default: ''
    },

    lat: {
      type: Number,
      required: true
    },

    lng: {
      type: Number,
      required: true
    },

    rainfall: {
      type: Number,
      default: null
    },

    rainfallLastHour: {
      type: Number,
      default: null
    },

    rainfallLast24h: {
      type: Number,
      default: null
    },

    soilMoisture: {
      type: Number,
      default: null
    },

    temperature: {
      type: Number,
      default: null
    },

    windSpeed: {
      type: Number,
      default: null
    },

    elevation: {
      type: Number,
      default: null
    },

    slope: {
      type: Number,
      default: null
    },

    historicalRisk: {
      type: Number,
      default: 0
    },

    nearbyHistoricalSlides: {
      type: Number,
      default: 0
    },

    riskScore: {
      type: Number,
      default: 0
    },

    riskLevel: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
      default: 'LOW'
    },

    probability: {
      type: Number,
      default: null
    },

    aiScore: {
      type: Number,
      default: null
    },

    dataStatus: {
      type: String,
      enum: ['LIVE', 'PARTIAL', 'STALE', 'UNAVAILABLE'],
      default: 'UNAVAILABLE'
    },

    weatherDataTime: {
      type: Date,
      default: null
    },

    checkedAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    source: {
      type: String,
      default: 'Open-Meteo + DEM + GSI'
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.MonitoringSnapshot ||
  mongoose.model(
    'MonitoringSnapshot',
    MonitoringSnapshotSchema
  );