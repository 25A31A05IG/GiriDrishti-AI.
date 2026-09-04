const express = require('express');

const {
  getLocations,
  getLocationReport
} = require('../controllers/locationController');

const router = express.Router();

/*
 * GET /api/locations
 * Dynamic Northeast India monitoring locations
 */
router.get('/', getLocations);

/*
 * GET /api/locations/location-report
 * Backward-compatible location report endpoint
 */
router.get('/location-report', getLocationReport);

module.exports = router;