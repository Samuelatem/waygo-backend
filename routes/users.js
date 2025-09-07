const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Ride = require('../models/Ride');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Update user location
// @route   PUT /api/users/location
// @access  Private
const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        location: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        }
      },
      { new: true }
    );

    // Emit real-time location update
    const io = req.app.get('io');
    io.emit('location_updated', {
      userId: req.user.id,
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      }
    });

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
};

// @desc    Toggle driver availability
// @route   PUT /api/users/toggle-availability
// @access  Private (Driver only)
const toggleAvailability = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can toggle availability'
      });
    }

    user.isAvailable = !user.isAvailable;
    await user.save();

    res.json({
      success: true,
      message: `Driver ${user.isAvailable ? 'available' : 'unavailable'}`,
      data: {
        isAvailable: user.isAvailable
      }
    });
  } catch (error) {
    console.error('Toggle availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle availability',
      error: error.message
    });
  }
};

// @desc    Update driver availability status
// @route   PUT /api/users/driver-status
// @access  Private (Driver only)
const updateDriverStatus = async (req, res) => {
  try {
    const { isAvailable } = req.body;

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isAvailable must be a boolean value'
      });
    }

    const user = await User.findById(req.user.id);

    if (user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can update availability status'
      });
    }

    user.isAvailable = isAvailable;
    await user.save();

    // Emit real-time driver status update
    const io = req.app.get('io');
    io.emit('driver_status_changed', {
      driverId: req.user.id,
      isAvailable: user.isAvailable,
      location: user.location
    });

    res.json({
      success: true,
      message: `Driver ${user.isAvailable ? 'available' : 'unavailable'}`,
      data: {
        isAvailable: user.isAvailable
      }
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update driver status',
      error: error.message
    });
  }
};

// @desc    Get driver statistics and current status
// @route   GET /api/users/driver-stats
// @access  Private (Driver only)
const getDriverStats = async (req, res) => {
  try {
    console.log('🔍 Getting driver stats for user ID:', req.user.id);
    const user = await User.findById(req.user.id);

    if (user.role !== 'driver') {
      return res.status(403).json({
        success: false,
        message: 'Only drivers can access statistics'
      });
    }

    // Check if driver has any active rides
    const activeRide = await Ride.findOne({
      driver: new mongoose.Types.ObjectId(req.user.id),
      status: { $in: ['accepted', 'started', 'in_progress'] }
    });

    // Calculate earnings from completed rides
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayEarnings, weekEarnings, monthEarnings, totalEarnings] = await Promise.all([
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(req.user.id), status: 'completed', completedAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]),
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(req.user.id), status: 'completed', completedAt: { $gte: weekStart } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]),
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(req.user.id), status: 'completed', completedAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]),
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(req.user.id), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ])
    ]);

    console.log('📊 Earnings aggregation results for driver:', req.user.id);
    console.log('   Today:', todayEarnings);
    console.log('   Week:', weekEarnings);
    console.log('   Month:', monthEarnings);
    console.log('   Total:', totalEarnings);

    // In a real app, you'd calculate these from ride data
    const stats = {
      totalRides: user.totalRides || 0,
      rating: user.rating || 0,
      isAvailable: user.isAvailable && !activeRide,
      vehicleInfo: user.vehicleInfo,
      location: user.location,
      isActive: user.isActive,
      hasActiveRide: !!activeRide,
      activeRideId: activeRide?._id || null,
      earnings: {
        today: todayEarnings[0]?.total || 0,
        week: weekEarnings[0]?.total || 0,
        month: monthEarnings[0]?.total || 0,
        total: totalEarnings[0]?.total || 0
      }
    };

    console.log('💰 Final earnings object:', stats.earnings);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get driver stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get driver statistics',
      error: error.message
    });
  }
};

// Routes
router.put('/location', protect, updateLocation);
router.put('/toggle-availability', protect, authorize('driver'), toggleAvailability);
router.put('/driver-status', protect, authorize('driver'), updateDriverStatus);
router.get('/driver-stats', protect, authorize('driver'), getDriverStats);

module.exports = router; 