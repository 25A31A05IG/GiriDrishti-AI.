const mongoose = require('mongoose');

const reportSchema =
  new mongoose.Schema(
    {
      type: {
        type: String,
        required: true
      },

      description: {
        type: String,
        default: ''
      },

      lat: {
        type: Number
      },

      lng: {
        type: Number
      },

      photo: {
        type: String,
        default: ''
      },

      status: {
        type: String,
        default: 'Received'
      }
    },
    {
      timestamps: true
    }
  );

module.exports =
  mongoose.model(
    'Report',
    reportSchema
  );