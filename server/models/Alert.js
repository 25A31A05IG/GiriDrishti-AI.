const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    locationId: {
      type: String,
      default: ''
    },

    areaName: {
      type: String,
      default: 'Unknown Area'
    },

    state: {
      type: String,
      default: 'Northeast India'
    },

    latitude: {
      type: Number,
      required: true
    },

    longitude: {
      type: Number,
      required: true
    },

    riskLevel: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
      required: true
    },

    riskScore: {
      type: Number,
      default: 0
    },

    message: {
      type: String,
      default: ''
    },

    acknowledged: {
      type: Boolean,
      default: false
    },

    acknowledgedAt: {
      type: Date,
      default: null
    },

    source: {
      type: String,
      default: 'GiriDrishti AI'
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.Alert ||
  mongoose.model('Alert', alertSchema);