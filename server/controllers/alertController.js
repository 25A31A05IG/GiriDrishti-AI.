const Alert = require('../models/Alert');

const getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(alerts);
  } catch (error) {
    console.error('getAlerts error:', error);
    res.status(500).json({
      error: 'Failed to fetch alerts'
    });
  }
};

const acknowledgeAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        acknowledged: true,
        acknowledgedAt: new Date()
      },
      {
        new: true
      }
    ).lean();

    if (!alert) {
      return res.status(404).json({
        error: 'Alert not found'
      });
    }

    res.json(alert);
  } catch (error) {
    console.error('acknowledgeAlert error:', error);
    res.status(500).json({
      error: 'Failed to acknowledge alert'
    });
  }
};

module.exports = {
  getAlerts,
  acknowledgeAlert
};