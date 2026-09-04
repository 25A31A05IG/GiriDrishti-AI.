const Report = require('../models/Report');

const getReports = async (
  req,
  res
) => {
  try {
    const reports =
      await Report.find()
        .sort({
          createdAt: -1
        })
        .limit(100);

    res.json(reports);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Unable to load reports'
    });
  }
};

const createReport = async (
  req,
  res
) => {
  try {
    const {
      type,
      description,
      lat,
      lng
    } = req.body;

    const report =
      await Report.create({
        type,
        description,
        lat: Number(lat),
        lng: Number(lng),
        photo: req.file
          ? `/uploads/${req.file.filename}`
          : '',
        status: 'Received'
      });

    res.status(201).json(report);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Unable to submit report'
    });
  }
};

module.exports = {
  getReports,
  createReport
};