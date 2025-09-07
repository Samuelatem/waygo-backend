const express = require('express');
const User = require('../models/User');
const { protect, authorize, generateToken } = require('../middleware/auth');

const router = express.Router();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      phoneNumber, 
      email, 
      password, 
      role,
      vehicleInfo,
      driverLicense,
      insuranceInfo,
      emergencyContact
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone number already exists'
      });
    }

    // Validate driver-specific fields
    if (role === 'driver') {
      if (!vehicleInfo || !vehicleInfo.make || !vehicleInfo.model || !vehicleInfo.licensePlate || !vehicleInfo.region) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle information is required for drivers'
        });
      }

      if (!driverLicense) {
        return res.status(400).json({
          success: false,
          message: 'Driver license is required for drivers'
        });
      }

      // Validate license plate format
      const plateRegex = new RegExp(`^${vehicleInfo.region}\\d{4}[A-Z]{2,3}$`);
      if (!plateRegex.test(vehicleInfo.licensePlate.replace(/\s/g, '').toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid license plate format. Use format: ${vehicleInfo.region} 1234 AB`
        });
      }
    }

    // Create user data
    const userData = {
      firstName,
      lastName,
      phoneNumber,
      email,
      password,
      role: role || 'rider'
    };

    // Add driver-specific fields if registering as driver
    if (role === 'driver') {
      userData.vehicleInfo = {
        make: vehicleInfo.make,
        model: vehicleInfo.model,
        year: vehicleInfo.year,
        licensePlate: vehicleInfo.licensePlate.replace(/\s/g, '').toUpperCase(),
        region: vehicleInfo.region,
        color: vehicleInfo.color
      };
      userData.driverLicense = driverLicense;
      userData.insuranceInfo = insuranceInfo;
      userData.emergencyContact = emergencyContact;
    }

    // Create user
    const user = await User.create(userData);

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    console.log('🔐 Backend Login: Attempting login', { email, requestedRole: role });

    // Check if user exists
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.log('❌ Backend Login: User not found for email:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('✅ Backend Login: User found', { 
      userId: user._id, 
      userRole: user.role, 
      requestedRole: role,
      isActive: user.isActive 
    });

    // Check if password matches
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      console.log('❌ Backend Login: Password mismatch for user:', user._id);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      console.log('❌ Backend Login: Account deactivated for user:', user._id);
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // If role is specified, validate it matches
    if (role && user.role !== role) {
      console.log('❌ Backend Login: Role mismatch', { 
        userId: user._id, 
        userRole: user.role, 
        requestedRole: role 
      });
      return res.status(403).json({
        success: false,
        message: `This account is registered as a ${user.role}, not a ${role}`
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log('✅ Backend Login: Login successful', { 
      userId: user._id, 
      role: user.role,
      name: `${user.firstName} ${user.lastName}`
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('❌ Backend Login: Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data',
      error: error.message
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const fieldsToUpdate = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      profilePicture: req.body.profilePicture,
      language: req.body.language,
      notifications: req.body.notifications
    };

    // Remove undefined fields
    Object.keys(fieldsToUpdate).forEach(key => 
      fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
    );

    const user = await User.findByIdAndUpdate(
      req.user.id,
      fieldsToUpdate,
      {
        new: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just return a success message
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

// Routes
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);
router.post('/logout', protect, logout);

module.exports = router; 