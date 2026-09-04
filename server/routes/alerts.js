const express = require('express');
const router = express.Router();

const {
  getAlerts,
  acknowledgeAlert
} = require('../controllers/alertController');

router.get('/', getAlerts);

router.patch('/:id/acknowledge', acknowledgeAlert);

module.exports = router;