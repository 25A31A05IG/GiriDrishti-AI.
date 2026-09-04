const jwt = require('jsonwebtoken');

function auth(req, res, next) {

  try {

    const header =
      req.headers.authorization;

    if (!header) {

      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });

    }

    const parts =
      header.split(' ');

    if (
      parts.length !== 2 ||
      parts[0] !== 'Bearer'
    ) {

      return res.status(401).json({
        success: false,
        error: 'Invalid authorization format'
      });

    }

    const token = parts[1];

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });

  }
}

module.exports = auth;