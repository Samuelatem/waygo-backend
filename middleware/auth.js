const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const jwtSecret = process.env.JWT_SECRET || 'waygo-secret-key-2024-default';
      const decoded = jwt.verify(token, jwtSecret);

      console.log('🔐 Token decoded:', {
        id: decoded.id,
        iat: new Date(decoded.iat * 1000).toISOString(),
        exp: new Date(decoded.exp * 1000).toISOString(),
        timestamp: new Date().toISOString()
      });

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        console.log('❌ Protect: User not found for token ID:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log('✅ Protect: User retrieved successfully', {
        userId: req.user._id,
        role: req.user.role,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        isActive: req.user.isActive
      });

      if (!req.user.isActive) {
        console.log('❌ Protect: User account is deactivated:', req.user._id);
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      next();
    } catch (error) {
      console.error('❌ Token verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed'
      });
    }
  }

  if (!token) {
    console.log('❌ Protect: No token provided');
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }
};

// Authorize roles
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log('🔒 Authorize middleware called:', {
      path: req.path,
      method: req.method,
      requestedRoles: roles,
      user: req.user ? {
        id: req.user._id,
        role: req.user.role,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName
      } : null,
      timestamp: new Date().toISOString()
    });

    if (!req.user) {
      console.log('❌ Authorize: No user found in request');
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (!roles.includes(req.user.role)) {
      console.log('🚫 Authorize: Role mismatch', {
        userRole: req.user.role,
        allowedRoles: roles,
        userId: req.user._id,
        userEmail: req.user.email
      });
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    console.log('✅ Authorize: Access granted for role:', req.user.role);
    next();
  };
};

// Generate JWT token
const generateToken = (id) => {
  const jwtSecret = process.env.JWT_SECRET || 'waygo-secret-key-2024-default';
  return jwt.sign({ id }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

module.exports = {
  protect,
  authorize,
  generateToken
}; 