const express = require('express');

const {
  register,
  verifyOTP,
  resendOTP,
  login
} = require('../controllers/authController');

const router = express.Router();

router.post(
  '/register',
  register
);

router.post(
  '/verify-otp',
  verifyOTP
);

router.post(
  '/resend-otp',
  resendOTP
);

router.post(
  '/login',
  login
);

module.exports = router;