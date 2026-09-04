const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');

const User = require('../models/User');

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;


/* =========================================================
   ENVIRONMENT CHECK
========================================================= */

const JWT_SECRET =
  process.env.JWT_SECRET;

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;


if (!JWT_SECRET) {
  console.error(
    '❌ JWT_SECRET is missing from server/.env'
  );
}


if (!RESEND_API_KEY) {
  console.error(
    '❌ RESEND_API_KEY is missing from server/.env'
  );
}


const resend = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;


/* =========================================================
   GENERATE OTP
========================================================= */

const generateOTP = () => {

  return crypto
    .randomInt(
      100000,
      1000000
    )
    .toString();

};


/* =========================================================
   HASH OTP
========================================================= */

const hashOTP = otp => {

  return crypto
    .createHash('sha256')
    .update(
      String(otp)
    )
    .digest('hex');

};


/* =========================================================
   NORMALIZE EMAIL
========================================================= */

const normalizeEmail = email => {

  return String(email || '')
    .trim()
    .toLowerCase();

};


/* =========================================================
   GENERATE JWT
========================================================= */

const generateToken = user => {

  if (!JWT_SECRET) {

    throw new Error(
      'JWT_SECRET is not configured in server/.env'
    );

  }


  return jwt.sign(

    {
      id: user._id.toString(),

      email: user.email

    },

    JWT_SECRET,

    {
      expiresIn: '7d'
    }

  );

};


/* =========================================================
   SEND OTP EMAIL
========================================================= */

const sendOTPEmail = async ({
  email,
  name,
  otp
}) => {

  if (!resend) {

    throw new Error(
      'RESEND_API_KEY is not configured'
    );

  }


  const from =
    process.env.RESEND_FROM_EMAIL ||
    'GiriDrishti AI <onboarding@resend.dev>';


  console.log(
    `📧 Sending OTP email to ${email}`
  );


  const {
    data,
    error
  } =
    await resend.emails.send({

      from,

      to: [
        email
      ],

      subject:
        'GiriDrishti AI - Email Verification OTP',

      html: `
        <!DOCTYPE html>

        <html>

        <head>

          <meta charset="UTF-8" />

          <title>
            GiriDrishti AI OTP
          </title>

        </head>

        <body
          style="
            margin:0;
            padding:0;
            background:#f4f7fb;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          "
        >

          <div
            style="
              max-width:600px;
              margin:40px auto;
              background:white;
              border-radius:16px;
              padding:32px;
              box-shadow:
                0 8px 30px
                rgba(0,0,0,0.08);
            "
          >

            <h1
              style="
                margin:0 0 10px;
                color:#123b2a;
              "
            >
              GiriDrishti AI
            </h1>


            <p
              style="
                color:#555;
                font-size:16px;
              "
            >
              Hello ${name},
            </p>


            <p
              style="
                color:#555;
                font-size:16px;
              "
            >
              Use the following OTP to
              verify your GiriDrishti AI
              account:
            </p>


            <div
              style="
                margin:28px 0;
                padding:20px;
                text-align:center;
                background:#eef7f1;
                border-radius:12px;
              "
            >

              <span
                style="
                  font-size:36px;
                  font-weight:bold;
                  letter-spacing:8px;
                  color:#123b2a;
                "
              >
                ${otp}
              </span>

            </div>


            <p
              style="
                color:#777;
                font-size:14px;
              "
            >
              This OTP expires in
              ${OTP_EXPIRY_MINUTES}
              minutes.
            </p>


            <p
              style="
                color:#777;
                font-size:14px;
              "
            >
              If you did not request this
              verification, you can safely
              ignore this email.
            </p>


            <hr
              style="
                border:none;
                border-top:1px solid #eee;
                margin:28px 0;
              "
            />


            <p
              style="
                color:#999;
                font-size:12px;
                text-align:center;
              "
            >
              GiriDrishti AI · Intelligent
              Landslide Risk Monitoring
            </p>

          </div>

        </body>

        </html>
      `,

      text:
        `Hello ${name},\n\n` +
        `Your GiriDrishti AI verification OTP is: ${otp}\n\n` +
        `This OTP expires in ${OTP_EXPIRY_MINUTES} minutes.\n\n` +
        `If you did not request this, ignore this email.`

    });


  if (error) {

    console.error(
      '❌ Resend email error:',
      error
    );

    throw new Error(
      error.message ||
      'Unable to send verification email'
    );

  }


  console.log(
    '✅ OTP email sent successfully'
  );


  return data;

};


/* =========================================================
   REGISTER
========================================================= */

const register = async (
  req,
  res
) => {

  try {

    const {
      name,
      email,
      password
    } = req.body;


    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (
      !name ||
      !email ||
      !password
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Name, email and password are required'

        });

    }


    if (
      String(password).length < 6
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Password must contain at least 6 characters'

        });

    }


    const normalizedEmail =
      normalizeEmail(email);


    /* -----------------------------------------------------
       FIND EXISTING USER
    ----------------------------------------------------- */

    let user =
      await User.findOne({
        email:
          normalizedEmail
      });


    if (
      user &&
      user.isVerified
    ) {

      return res
        .status(409)
        .json({

          success: false,

          message:
            'An account with this email already exists'

        });

    }


    /* -----------------------------------------------------
       HASH PASSWORD
    ----------------------------------------------------- */

    const hashedPassword =
      await bcrypt.hash(
        String(password),
        12
      );


    /* -----------------------------------------------------
       GENERATE OTP
    ----------------------------------------------------- */

    const otp =
      generateOTP();


    const otpHash =
      hashOTP(otp);


    const otpExpiresAt =
      new Date(
        Date.now() +
        OTP_EXPIRY_MINUTES *
        60 *
        1000
      );


    /* -----------------------------------------------------
       CREATE OR UPDATE USER
    ----------------------------------------------------- */

    if (!user) {

      user =
        new User({

          name:
            String(name).trim(),

          email:
            normalizedEmail,

          password:
            hashedPassword,

          isVerified:
            false,

          otpHash,

          otpExpiresAt,

          otpAttempts:
            0

        });

    } else {

      user.name =
        String(name).trim();

      user.password =
        hashedPassword;

      user.isVerified =
        false;

      user.otpHash =
        otpHash;

      user.otpExpiresAt =
        otpExpiresAt;

      user.otpAttempts =
        0;

    }


    await user.save();


    /* -----------------------------------------------------
       SEND EMAIL
    ----------------------------------------------------- */

    try {

      await sendOTPEmail({

        email:
          user.email,

        name:
          user.name,

        otp

      });

    } catch (emailError) {

      console.error(
        '❌ OTP email failed:',
        emailError
      );


      /*
        Remove OTP so the user cannot
        accidentally verify with an OTP
        that was never delivered.
      */

      user.otpHash = null;

      user.otpExpiresAt = null;

      user.otpAttempts = 0;

      await user.save();


      return res
        .status(500)
        .json({

          success: false,

          message:
            'Registration created, but the verification email could not be sent. Check your Resend configuration.'

        });

    }


    return res
      .status(201)
      .json({

        success: true,

        message:
          'Registration successful. OTP sent to your email.',

        email:
          user.email

      });


  } catch (error) {

    console.error(
      '❌ Registration error:',
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          'Unable to complete registration'

      });

  }

};


/* =========================================================
   VERIFY OTP
========================================================= */

const verifyOTP = async (
  req,
  res
) => {

  try {

    const {
      email,
      otp
    } = req.body;


    console.log(
      '🔐 OTP verification request:',
      {
        email,
        otpReceived:
          Boolean(otp)
      }
    );


    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (
      !email ||
      !otp
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Email and OTP are required'

        });

    }


    const normalizedEmail =
      normalizeEmail(email);


    const cleanOTP =
      String(otp)
        .trim();


    if (
      !/^\d{6}$/.test(
        cleanOTP
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'OTP must contain exactly 6 digits'

        });

    }


    /* -----------------------------------------------------
       FIND USER
    ----------------------------------------------------- */

    const user =
      await User.findOne({
        email:
          normalizedEmail
      });


    if (!user) {

      return res
        .status(404)
        .json({

          success: false,

          message:
            'User account not found'

        });

    }


    /* -----------------------------------------------------
       ALREADY VERIFIED
    ----------------------------------------------------- */

    if (
      user.isVerified
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Email is already verified'

        });

    }


    /* -----------------------------------------------------
       OTP EXISTS
    ----------------------------------------------------- */

    if (
      !user.otpHash ||
      !user.otpExpiresAt
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'No active OTP. Please request a new OTP.'

        });

    }


    /* -----------------------------------------------------
       OTP EXPIRED
    ----------------------------------------------------- */

    if (
      new Date() >
      new Date(
        user.otpExpiresAt
      )
    ) {

      user.otpHash =
        null;

      user.otpExpiresAt =
        null;

      user.otpAttempts =
        0;

      await user.save();


      return res
        .status(400)
        .json({

          success: false,

          message:
            'OTP has expired. Please request a new OTP.'

        });

    }


    /* -----------------------------------------------------
       ATTEMPT LIMIT
    ----------------------------------------------------- */

    if (
      Number(
        user.otpAttempts || 0
      ) >=
      MAX_OTP_ATTEMPTS
    ) {

      return res
        .status(429)
        .json({

          success: false,

          message:
            'Too many incorrect attempts. Please request a new OTP.'

        });

    }


    /* -----------------------------------------------------
       COMPARE OTP
    ----------------------------------------------------- */

    const suppliedHash =
      hashOTP(
        cleanOTP
      );


    if (
      suppliedHash !==
      user.otpHash
    ) {

      user.otpAttempts =
        Number(
          user.otpAttempts || 0
        ) + 1;


      await user.save();


      return res
        .status(400)
        .json({

          success: false,

          message:
            'Invalid OTP'

        });

    }


    /* -----------------------------------------------------
       VERIFY USER
    ----------------------------------------------------- */

    user.isVerified =
      true;

    user.otpHash =
      null;

    user.otpExpiresAt =
      null;

    user.otpAttempts =
      0;


    await user.save();


    /* -----------------------------------------------------
       JWT
    ----------------------------------------------------- */

    const token =
      generateToken(
        user
      );


    console.log(
      `✅ Email verified: ${user.email}`
    );


    return res
      .status(200)
      .json({

        success: true,

        message:
          'Email verified successfully',

        token,

        user: {

          id:
            user._id,

          name:
            user.name,

          email:
            user.email,

          isVerified:
            user.isVerified

        }

      });


  } catch (error) {

    console.error(
      '❌ OTP verification error:',
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          error.message ||
          'Unable to verify OTP'

      });

  }

};


/* =========================================================
   RESEND OTP
========================================================= */

const resendOTP = async (
  req,
  res
) => {

  try {

    const {
      email
    } = req.body;


    if (!email) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Email is required'

        });

    }


    const normalizedEmail =
      normalizeEmail(email);


    const user =
      await User.findOne({
        email:
          normalizedEmail
      });


    if (!user) {

      return res
        .status(404)
        .json({

          success: false,

          message:
            'User account not found'

        });

    }


    if (
      user.isVerified
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Email is already verified'

        });

    }


    /* -----------------------------------------------------
       GENERATE NEW OTP
    ----------------------------------------------------- */

    const otp =
      generateOTP();


    user.otpHash =
      hashOTP(otp);


    user.otpExpiresAt =
      new Date(
        Date.now() +
        OTP_EXPIRY_MINUTES *
        60 *
        1000
      );


    user.otpAttempts =
      0;


    await user.save();


    /* -----------------------------------------------------
       SEND NEW OTP
    ----------------------------------------------------- */

    try {

      await sendOTPEmail({

        email:
          user.email,

        name:
          user.name,

        otp

      });

    } catch (emailError) {

      console.error(
        '❌ Resend email failed:',
        emailError
      );


      user.otpHash =
        null;

      user.otpExpiresAt =
        null;

      user.otpAttempts =
        0;


      await user.save();


      return res
        .status(500)
        .json({

          success: false,

          message:
            'Unable to send the new OTP. Check your Resend configuration.'

        });

    }


    return res
      .status(200)
      .json({

        success: true,

        message:
          'A new OTP has been sent to your email.'

      });


  } catch (error) {

    console.error(
      '❌ Resend OTP error:',
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          error.message ||
          'Unable to resend OTP'

      });

  }

};


/* =========================================================
   LOGIN
========================================================= */

const login = async (
  req,
  res
) => {

  try {

    const {
      email,
      password
    } = req.body;


    if (
      !email ||
      !password
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            'Email and password are required'

        });

    }


    const normalizedEmail =
      normalizeEmail(email);


    const user =
      await User.findOne({
        email:
          normalizedEmail
      });


    if (!user) {

      return res
        .status(401)
        .json({

          success: false,

          message:
            'Invalid email or password'

        });

    }


    if (
      !user.isVerified
    ) {

      return res
        .status(403)
        .json({

          success: false,

          message:
            'Please verify your email with OTP before logging in.'

        });

    }


    const passwordMatch =
      await bcrypt.compare(

        String(password),

        user.password

      );


    if (!passwordMatch) {

      return res
        .status(401)
        .json({

          success: false,

          message:
            'Invalid email or password'

        });

    }


    /* -----------------------------------------------------
       CREATE TOKEN
    ----------------------------------------------------- */

    const token =
      generateToken(
        user
      );


    console.log(
      `✅ Login successful: ${user.email}`
    );


    return res
      .status(200)
      .json({

        success: true,

        message:
          'Login successful',

        token,

        user: {

          id:
            user._id,

          name:
            user.name,

          email:
            user.email,

          isVerified:
            user.isVerified

        }

      });


  } catch (error) {

    console.error(
      '❌ Login error:',
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          error.message ||
          'Unable to login'

      });

  }

};


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  register,

  verifyOTP,

  resendOTP,

  login

};