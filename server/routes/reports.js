const express = require('express');
const multer = require('multer');

const {
  getReports,
  createReport
} = require('../controllers/reportController');

const router = express.Router();

const upload = multer({
  dest: 'uploads/'
});

router.get('/', getReports);

router.post(
  '/',
  upload.single('photo'),
  createReport
);

module.exports = router;