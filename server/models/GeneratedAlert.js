const mongoose = require('mongoose');

const GeneratedAlertSchema = new mongoose.Schema(
  {
    locationKey: {
      type: String,
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

    riskScore: {
      type: Number,
      required: true
    },

    riskLevel: {
      type: String,
      enum: ['HIGH', 'CRITICAL'],
      required: true
    },

    rainfallLast24h: {
      type: Number,
      default: null
    },

    soilMoisture: {
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

    message: {
      type: String,
      default: ''
    },

    reasons: {
      type: [String],
      default: []
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED'],
      default: 'ACTIVE',
      index: true
    },

    generatedAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.GeneratedAlert ||
  mongoose.model(
    'GeneratedAlert',
    GeneratedAlertSchema
  );