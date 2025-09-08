const express = require('express');
const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper function to calculate distance between two points
const calculateDistance = (point1, point2) => {
  console.log('🧮 Calculating distance between:', point1, 'and', point2);
  
  // Validate input
  if (!Array.isArray(point1) || !Array.isArray(point2)) {
    console.error('❌ Invalid points for distance calculation:', { point1, point2 });
    return NaN;
  }
  
  if (point1.length !== 2 || point2.length !== 2) {
    console.error('❌ Points must have exactly 2 coordinates:', { point1, point2 });
    return NaN;
  }
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (point2[1] - point1[1]) * Math.PI / 180;
  const dLon = (point2[0] - point1[0]) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(point1[1] * Math.PI / 180) * Math.cos(point2[1] * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  console.log('🧮 Calculated distance:', distance, 'km');
  return distance;
};

// @desc    Request a new ride
// @route   POST /api/rides/request
// @access  Private
const requestRide = async (req, res) => {
  try {
    const { pickup, destination, vehicleType = 'standard', paymentMethod = 'cash' } = req.body;
    
    if (!pickup || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Pickup and destination are required'
      });
    }

    // Clean up any old pending rides for this rider to prevent duplicates
    const oldPendingRides = await Ride.find({ 
      rider: req.user.id, 
      status: 'pending',
      requestedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Older than 5 minutes
    });
    
    if (oldPendingRides.length > 0) {
      console.log(`🧹 Cleaning up ${oldPendingRides.length} old pending rides for rider ${req.user.id}`);
      await Ride.deleteMany({ 
        rider: req.user.id, 
        status: 'pending',
        requestedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
      });
    }

    // Check if rider already has an active ride
    const activeRide = await Ride.findOne({
      rider: req.user.id,
      status: { $in: ['pending', 'accepted', 'in_progress'] }
    });
    
    if (activeRide) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active ride request. Please wait or cancel it first.',
        activeRide: activeRide._id
      });
    }

    // If pickup is not provided, use user's current location
    let pickupData = pickup;
    if (!pickup.location || !pickup.location.coordinates) {
      // Get user's current location from the database
      const user = await User.findById(req.user.id);
      if (!user.location || !user.location.coordinates) {
        return res.status(400).json({
          success: false,
          message: 'User location not available. Please enable location services.'
        });
      }
      
      pickupData = {
        address: pickup.address || 'Current Location',
        location: user.location
      };
    }

    // For destination, use the coordinates provided by the frontend
    const destinationData = {
      address: destination.address || 'Selected Destination',
      location: {
        type: 'Point',
        coordinates: destination.location.coordinates // Use the coordinates array directly
      }
    };
    
    // Debug coordinate data
    console.log('🔍 Debug coordinates:');
    console.log('📍 Pickup coordinates:', pickupData.location.coordinates);
    console.log('🎯 Destination coordinates:', destinationData.location.coordinates);
    console.log('📍 Pickup data type:', typeof pickupData.location.coordinates);
    console.log('🎯 Destination data type:', typeof destinationData.location.coordinates);
    
    // Validate coordinate format
    if (!Array.isArray(pickupData.location.coordinates) || pickupData.location.coordinates.length !== 2) {
      console.error('❌ Invalid pickup coordinates format:', pickupData.location.coordinates);
      return res.status(400).json({
        success: false,
        message: 'Invalid pickup coordinates format. Expected [longitude, latitude].'
      });
    }
    
    if (!Array.isArray(destinationData.location.coordinates) || destinationData.location.coordinates.length !== 2) {
      console.error('❌ Invalid destination coordinates format:', destinationData.location.coordinates);
      return res.status(400).json({
        success: false,
        message: 'Invalid destination coordinates format. Expected [longitude, latitude].'
      });
    }
    
    // Ensure coordinates are numbers
    const pickupLng = parseFloat(pickupData.location.coordinates[0]);
    const pickupLat = parseFloat(pickupData.location.coordinates[1]);
    const destLng = parseFloat(destinationData.location.coordinates[0]);
    const destLat = parseFloat(destinationData.location.coordinates[1]);
    
    if (isNaN(pickupLng) || isNaN(pickupLat) || isNaN(destLng) || isNaN(destLat)) {
      console.error('❌ Invalid coordinate values:', {
        pickup: [pickupLng, pickupLat],
        destination: [destLng, destLat]
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinate values. Coordinates must be valid numbers.'
      });
    }
    
    // Update coordinates with parsed values
    pickupData.location.coordinates = [pickupLng, pickupLat];
    destinationData.location.coordinates = [destLng, destLat];

    const distance = calculateDistance(
      pickupData.location.coordinates,
      destinationData.location.coordinates
    );
    
    // Validate distance calculation
    if (isNaN(distance) || distance <= 0) {
      console.error('❌ Invalid distance calculated:', distance);
      console.error('📍 Pickup coordinates:', pickupData.location.coordinates);
      console.error('🎯 Destination coordinates:', destinationData.location.coordinates);
      return res.status(400).json({
        success: false,
        message: 'Invalid distance calculation. Please check coordinates.'
      });
    }
    
    const duration = Math.ceil(distance * 3);
    
    // Validate duration calculation
    if (isNaN(duration) || duration <= 0) {
      console.error('❌ Invalid duration calculated:', duration);
      return res.status(400).json({
        success: false,
        message: 'Invalid duration calculation.'
      });
    }

    // Calculate fare before creating the ride
    const baseFare = 500; // 500 XAF base fare
    const perKmRate = 200; // 200 XAF per kilometer
    const perMinuteRate = 10; // 10 XAF per minute
    
    const distanceFare = distance * perKmRate;
    const timeFare = duration * perMinuteRate;
    const totalFare = baseFare + distanceFare + timeFare;
    
    const fare = {
      base: baseFare,
      distance: distanceFare,
      time: timeFare,
      total: totalFare,
      currency: 'XAF'
    };
    
    // Validate fare calculation
    if (isNaN(totalFare) || totalFare <= 0) {
      console.error('❌ Invalid fare calculated:', totalFare);
      return res.status(400).json({
        success: false,
        message: 'Invalid fare calculation.'
      });
    }

    // Final validation before creating ride
    const rideData = {
      rider: req.user.id,
      pickup: pickupData,
      destination: destinationData,
      distance,
      duration,
      vehicleType,
      fare,
      payment: {
        method: paymentMethod,
        status: 'pending'
      },
      riderLocation: pickupData.location, // Add rider's current location for tracking
      requestedAt: new Date()
    };
    
    console.log('🚗 Creating ride with data:', rideData);
    console.log('🔍 Distance type:', typeof distance, 'Value:', distance);
    console.log('🔍 Duration type:', typeof duration, 'Value:', duration);
    
    const ride = await Ride.create(rideData);

    // Find nearby available drivers
    console.log('🔍 Searching for nearby drivers at coordinates:', pickupData.location.coordinates);
    console.log('🔍 Pickup data:', pickupData);
    
    const nearbyDrivers = await User.find({
      role: 'driver',
      isAvailable: true,
      isActive: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: pickupData.location.coordinates
          },
          $maxDistance: 10000 // 10km radius
        }
      }
    }).select('firstName lastName rating vehicleInfo location');

    console.log(`🚗 Ride requested: ${ride._id}`);
    console.log(`📍 Pickup: ${pickupData.address}`);
    console.log(`🎯 Destination: ${destinationData.address}`);
    console.log(`💰 Fare: ${totalFare} XAF`);
    console.log(`🚘 Nearby drivers found: ${nearbyDrivers.length}`);
    
    // Log driver details for debugging
    if (nearbyDrivers.length > 0) {
      nearbyDrivers.forEach((driver, index) => {
        console.log(`🚘 Driver ${index + 1}: ${driver.firstName} ${driver.lastName} - Available: ${driver.isAvailable}, Active: ${driver.isActive}`);
      });
    }

    // Emit real-time ride request to all nearby drivers
    const io = req.app.get('io');
    if (io && nearbyDrivers.length > 0) {
      const rideRequestData = {
        rideId: ride._id,
        pickup: pickupData,
        destination: destinationData,
        distance: distance.toFixed(2),
        fare: totalFare,
        paymentMethod: paymentMethod, // Include payment method for drivers
        vehicleType: vehicleType,
        requestedAt: new Date(),
        rider: {
          id: req.user.id,
          name: `${req.user.firstName} ${req.user.lastName}`,
          phoneNumber: req.user.phoneNumber,
          location: pickupData.location // Include rider location for tracking
        }
      };
      
      // Emit to the general drivers room for all drivers to receive
      io.emit('new_ride_request', rideRequestData);
      
      // Also emit to individual driver rooms for immediate delivery
      nearbyDrivers.forEach(driver => {
        io.to(`user_${driver._id}`).emit('new_ride_request', rideRequestData);
        console.log(`📡 Ride request sent to driver: ${driver.firstName} ${driver.lastName} (${driver._id})`);
      });
      
      console.log(`📡 Ride request broadcasted to ${nearbyDrivers.length} nearby drivers with payment method: ${paymentMethod}`);
    } else {
      console.log('⚠️ No nearby drivers found for ride request');
    }

    res.status(201).json({
      success: true,
      message: 'Ride requested successfully',
      data: {
        ride,
        nearbyDrivers: nearbyDrivers.length,
        estimatedWaitTime: '2-5 minutes'
      }
    });

  } catch (error) {
    console.error('❌ Request ride error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to request ride',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
// @desc    Test endpoint to check nearby drivers
// @route   GET /api/rides/test-nearby-drivers
// @access  Public (for testing)
const testNearbyDrivers = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    console.log('🧪 Testing nearby drivers query at:', [parseFloat(longitude), parseFloat(latitude)]);
    
    const nearbyDrivers = await User.find({
      role: 'driver',
      isAvailable: true,
      isActive: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: 10000 // 10km radius
        }
      }
    }).select('firstName lastName rating vehicleInfo location isAvailable isActive');

    console.log('🧪 Found drivers:', nearbyDrivers.length);
    nearbyDrivers.forEach((driver, index) => {
      console.log(`🧪 Driver ${index + 1}: ${driver.firstName} ${driver.lastName} - Available: ${driver.isAvailable}, Active: ${driver.isActive}, Location: ${driver.location?.coordinates}`);
    });

    res.json({
      success: true,
      data: {
        testLocation: [parseFloat(longitude), parseFloat(latitude)],
        driversFound: nearbyDrivers.length,
        drivers: nearbyDrivers
      }
    });
  } catch (error) {
    console.error('Test nearby drivers error:', error);
    res.status(500).json({ success: false, message: 'Failed to test nearby drivers', error: error.message });
  }
};

// @desc    Get nearby ride requests for drivers
// @route   GET /api/rides/nearby-requests
// @access  Private (Driver only)
const getNearbyRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can view requests' });
    }

    const { latitude, longitude, radius = 5 } = req.query;
    let geoFilter = {};
    if (latitude && longitude) {
      geoFilter = {
        'pickup.location': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: radius * 1000
          }
        }
      };
    }

    const rides = await Ride.find({ status: 'pending', ...geoFilter })
      .populate('rider', 'firstName lastName phoneNumber')
      .sort({ requestedAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: { requests: rides }
    });
  } catch (error) {
    console.error('Get nearby requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch requests', error: error.message });
  }
};

// @desc    Find nearby drivers
// @route   GET /api/rides/nearby-drivers
// @access  Private
const findNearbyDrivers = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    console.log(`🔍 Searching for drivers near: ${latitude}, ${longitude} with radius: ${radius}km`);

    // First, find all available drivers
    const allDrivers = await User.find({
      role: 'driver',
      isActive: true
    }).select('firstName lastName rating vehicleInfo location isAvailable');

    console.log(`📊 Total drivers found: ${allDrivers.length}`);
    console.log(`📊 Available drivers: ${allDrivers.filter(d => d.isAvailable).length}`);

    // Filter by availability and location
    const nearbyDrivers = allDrivers.filter(driver => {
      // Check if driver is available
      if (!driver.isAvailable) {
        console.log(`❌ Driver ${driver.firstName} is not available`);
        return false;
      }

      // Check if driver has location
      if (!driver.location || !driver.location.coordinates) {
        console.log(`❌ Driver ${driver.firstName} has no location`);
        return false;
      }

      // Calculate distance
      const distance = calculateDistance(
        [parseFloat(longitude), parseFloat(latitude)],
        driver.location.coordinates
      );

      console.log(`📍 Driver ${driver.firstName}: ${distance.toFixed(2)}km away`);

      return distance <= radius;
    });

    console.log(`✅ Nearby available drivers: ${nearbyDrivers.length}`);

    const driversWithDistance = nearbyDrivers.map(driver => {
      const distance = calculateDistance(
        [parseFloat(longitude), parseFloat(latitude)],
        driver.location.coordinates
      );

      return {
        id: driver._id,
        name: `${driver.firstName} ${driver.lastName}`,
        rating: driver.rating || 0,
        vehicle: driver.vehicleInfo || 'Vehicle info not available',
        location: driver.location,
        distance: distance,
        isAvailable: driver.isAvailable
      };
    });

    // Sort by distance
    driversWithDistance.sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      data: {
        drivers: driversWithDistance,
        count: driversWithDistance.length,
        searchLocation: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
        radius: parseFloat(radius)
      }
    });
  } catch (error) {
    console.error('Find nearby drivers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearby drivers',
      error: error.message
    });
  }
};

// @desc    Accept ride (driver)
// @route   PUT /api/rides/:id/accept
// @access  Private (Driver only)
const acceptRide = async (req, res) => {
  try {
    console.log('🚗 Accept ride request for ride:', req.params.id, 'by driver:', req.user.id);
    console.log('🔍 User details:', {
      id: req.user.id,
      role: req.user.role,
      email: req.user.email,
      isAvailable: req.user.isAvailable
    });
    
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      console.log('❌ Ride not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    console.log('🔍 Ride found:', {
      id: ride._id,
      status: ride.status,
      rider: ride.rider,
      driver: ride.driver
    });

    if (ride.status !== 'pending') {
      console.log('❌ Ride status is not pending:', ride.status);
      return res.status(400).json({
        success: false,
        message: 'Ride is not available for acceptance'
      });
    }

    const driver = await User.findById(req.user.id);
    if (!driver.isAvailable) {
      console.log('❌ Driver is not available:', req.user.id);
      return res.status(400).json({
        success: false,
        message: 'You are not available for rides'
      });
    }

    console.log('✅ Driver is available, updating ride...');

    // Update ride with driver and status
    ride.driver = req.user.id;
    console.log('🚗 Calling updateStatus...');
    
    try {
      await ride.updateStatus('accepted', req.user.id);
      console.log('✅ Ride status updated to accepted');
    } catch (updateError) {
      console.error('❌ Error updating ride status:', updateError);
      throw new Error(`Failed to update ride status: ${updateError.message}`);
    }

    // Set driver to unavailable
    console.log('🚘 Setting driver to unavailable...');
    driver.isAvailable = false;
    await driver.save();
    console.log('✅ Driver availability updated');

    // Emit real-time updates
    const io = req.app.get('io');
    if (io) {
      console.log('📡 Emitting real-time updates...');
      
      // Notify ride participants
      io.to(`ride_${ride._id}`).emit('ride_status_changed', {
        rideId: ride._id,
        status: 'accepted',
        driverId: req.user.id,
        riderId: ride.rider
      });
      
      // Notify all drivers to remove this request from their lists
      io.emit('ride_request_accepted', { rideId: ride._id });
      
      // Broadcast driver status change to all clients
      io.emit('driver_status_changed', {
        driverId: req.user.id,
        isAvailable: false,
        location: driver.location
      });
      
      console.log('✅ Real-time updates emitted');
    } else {
      console.log('⚠️ Socket.IO not available for real-time updates');
    }

    console.log('🎉 Ride accepted successfully!');
    res.json({
      success: true,
      message: 'Ride accepted successfully',
      data: ride
    });
  } catch (error) {
    console.error('❌ Accept ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept ride',
      error: error.message
    });
  }
};

// @desc    Get ride by ID
// @route   GET /api/rides/:id
// @access  Private
const getRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('rider', 'firstName lastName phoneNumber')
      .populate('driver', 'firstName lastName phoneNumber vehicleInfo rating');

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    const isRider = ride.rider._id.toString() === req.user.id;
    const isDriver = ride.driver && ride.driver._id.toString() === req.user.id;

    if (!isRider && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this ride'
      });
    }

    res.json({
      success: true,
      data: ride
    });
  } catch (error) {
    console.error('Get ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ride',
      error: error.message
    });
  }
};

// @desc    Start ride
// @route   PUT /api/rides/:id/start
// @access  Private (Driver only)
const startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.driver.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to start this ride'
      });
    }

    if (ride.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Ride must be accepted before starting'
      });
    }

    await ride.updateStatus('in_progress', req.user.id);

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`ride_${ride._id}`).emit('ride_status_changed', {
      rideId: ride._id,
      status: 'in_progress',
      driverId: req.user.id,
      riderId: ride.rider
    });

    res.json({
      success: true,
      message: 'Ride started successfully',
      data: ride
    });
  } catch (error) {
    console.error('Start ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start ride',
      error: error.message
    });
  }
};

// @desc    Complete ride
// @route   PUT /api/rides/:id/complete
// @access  Private (Driver only)
const completeRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.driver.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to complete this ride'
      });
    }

    if (ride.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Ride must be in progress to complete'
      });
    }

    await ride.updateStatus('completed', req.user.id);

    // Handle wallet payment if applicable
    if (ride.payment.method === 'wallet') {
      try {
        const Wallet = require('../models/Wallet');
        
        // Transfer funds from rider's wallet to driver's wallet
        await Wallet.transferFunds(
          ride.rider, // fromUserId (rider)
          req.user.id, // toUserId (driver)
          ride.fare.total, // amount
          ride._id // rideId
        );
        
        ride.payment.status = 'completed';
        await ride.save();
        
        console.log(`💳 Wallet payment completed: ${ride.fare.total} FCFA transferred from rider to driver`);
      } catch (walletError) {
        console.error('❌ Wallet payment failed:', walletError);
        // Don't fail the ride completion, but log the error
        ride.payment.status = 'failed';
        await ride.save();
      }
    } else {
      // For cash payments, mark as completed
      ride.payment.status = 'completed';
      await ride.save();
    }

    // Update driver availability and emit status change
    const driver = await User.findById(req.user.id);
    driver.isAvailable = true;
    await driver.save();

    // Emit real-time updates
    const io = req.app.get('io');
    
    // Notify ride participants
    io.to(`ride_${ride._id}`).emit('ride_status_changed', {
      rideId: ride._id,
      status: 'completed',
      driverId: req.user.id,
      riderId: ride.rider
    });
    
    // Emit ride completion event for earnings updates
    io.to(`driver_${req.user.id}`).emit('ride_completed', {
      rideId: ride._id,
      fare: ride.fare.total,
      paymentMethod: ride.payment.method,
      completedAt: ride.completedAt
    });
    
    // Fetch and emit updated earnings
    try {
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

      const updatedEarnings = {
        today: todayEarnings[0]?.total || 0,
        week: weekEarnings[0]?.total || 0,
        month: monthEarnings[0]?.total || 0,
        total: totalEarnings[0]?.total || 0
      };

      console.log('📊 Real-time earnings calculation for driver:', req.user.id);
      console.log('💰 Updated earnings:', updatedEarnings);

      // Emit updated earnings to driver
      io.to(`driver_${req.user.id}`).emit('earnings_updated', {
        earnings: updatedEarnings
      });

      console.log(`💰 Updated earnings emitted for driver ${req.user.id}:`, updatedEarnings);
    } catch (earningsError) {
      console.error('❌ Failed to calculate updated earnings:', earningsError);
    }
    
    // Broadcast driver status change to all clients
    io.emit('driver_status_changed', {
      driverId: req.user.id,
      isAvailable: true,
      location: driver.location
    });

    console.log(`🎉 Ride ${ride._id} completed successfully! Fare: ${ride.fare.total} FCFA`);

    res.json({
      success: true,
      message: 'Ride completed successfully',
      data: ride
    });
  } catch (error) {
    console.error('Complete ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete ride',
      error: error.message
    });
  }
};

// @desc    Cancel ride
// @route   PUT /api/rides/:id/cancel
// @access  Private
const cancelRide = async (req, res) => {
  try {
    const { reason } = req.body;
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    const isRider = ride.rider.toString() === req.user.id;
    const isDriver = ride.driver && ride.driver.toString() === req.user.id;

    if (!isRider && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this ride'
      });
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Ride cannot be cancelled'
      });
    }

    const cancelledBy = isRider ? 'rider' : 'driver';
    await ride.updateStatus('cancelled', cancelledBy);
    ride.cancellationReason = reason;
    await ride.save();

    // If driver cancelled, make them available again and broadcast status
    if (isDriver) {
      const driver = await User.findById(req.user.id);
      driver.isAvailable = true;
      await driver.save();
      
      // Broadcast driver status change
      const io = req.app.get('io');
      io.emit('driver_status_changed', {
        driverId: req.user.id,
        isAvailable: true,
        location: driver.location
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`ride_${ride._id}`).emit('ride_status_changed', {
      rideId: ride._id,
      status: 'cancelled',
      driverId: ride.driver,
      riderId: ride.rider,
      cancelledBy
    });

    res.json({
      success: true,
      message: 'Ride cancelled successfully',
      data: ride
    });
  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel ride',
      error: error.message
    });
  }
};

// @desc    Update driver location for active ride
// @route   PUT /api/rides/:id/driver-location
// @access  Private (Driver only)
const updateDriverLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.driver.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ride'
      });
    }

    // Update driver location in user document
    await User.findByIdAndUpdate(req.user.id, {
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    });

    // Emit real-time update to rider
    const io = req.app.get('io');
    io.to(`ride_${ride._id}`).emit('driver_location_updated', {
      rideId: ride._id,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    });

    res.json({
      success: true,
      message: 'Driver location updated successfully'
    });
  } catch (error) {
    console.error('Update driver location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update driver location',
      error: error.message
    });
  }
};

// @desc    Get user's active ride
// @route   GET /api/rides/active
// @access  Private
const getActiveRide = async (req, res) => {
  try {
    const ride = await Ride.findOne({
      $or: [
        { rider: req.user.id },
        { driver: req.user.id }
      ],
      status: { $in: ['pending', 'accepted', 'in_progress'] }
    })
    .populate('rider', 'firstName lastName phoneNumber')
    .populate('driver', 'firstName lastName phoneNumber vehicleInfo location')
    .populate('fare', 'total');

    if (!ride) {
      return res.json({
        success: true,
        data: { ride: null }
      });
    }

    res.json({
      success: true,
      data: { ride }
    });
  } catch (error) {
    console.error('Get active ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active ride',
      error: error.message
    });
  }
};

// @desc    Get user's rides
// @route   GET /api/rides/my-rides
// @access  Private
const getMyRides = async (req, res) => {
  try {
    console.log('🚗 getMyRides called for user:', req.user.id);
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { rider: req.user.id },
        { driver: req.user.id }
      ]
    };

    if (status) {
      query.status = status;
    }

    const rides = await Ride.find(query)
      .populate('rider', 'firstName lastName')
      .populate('driver', 'firstName lastName vehicleInfo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Ride.countDocuments(query);

    res.json({
      success: true,
      data: {
        rides,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get my rides error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rides',
      error: error.message
    });
  }
};

// Routes
router.post('/request', protect, requestRide);
router.get('/nearby-drivers', protect, findNearbyDrivers);
router.get('/nearby-requests', protect, authorize('driver'), getNearbyRequests);
router.get('/active', protect, getActiveRide);
router.get('/my-rides', protect, getMyRides);

// Parameterized routes (must come after specific routes)
router.put('/:id/driver-location', protect, authorize('driver'), updateDriverLocation);
router.put('/:id/accept', protect, authorize('driver'), acceptRide);
router.put('/:id/start', protect, authorize('driver'), startRide);
router.put('/:id/complete', protect, authorize('driver'), completeRide);
router.put('/:id/cancel', protect, cancelRide);
router.get('/:id', protect, getRide);

// Test route (remove in production)
router.get('/test-nearby-drivers', testNearbyDrivers);

// Alias for /nearby-requests for backward compatibility
router.get('/nearby', protect, authorize('driver'), getNearbyRequests);

// Test route to check current user details
router.get('/test-user', protect, async (req, res) => {
  try {
    console.log('🧪 Testing user details:', {
      id: req.user.id,
      role: req.user.role,
      email: req.user.email,
      isAvailable: req.user.isAvailable,
      location: req.user.location
    });
    
    res.json({
      success: true,
      message: 'User details retrieved',
      data: {
        id: req.user.id,
        role: req.user.role,
        email: req.user.email,
        isAvailable: req.user.isAvailable,
        location: req.user.location
      }
    });
  } catch (error) {
    console.error('Test user error:', error);
    res.status(500).json({ success: false, message: 'Failed to test user', error: error.message });
  }
});

// Test route to check current ride requests
router.get('/test-ride-requests', async (req, res) => {
  try {
    const rides = await Ride.find({ status: 'pending' })
      .populate('rider', 'firstName lastName')
      .select('pickup destination status createdAt');
    
    console.log('🧪 Current pending rides:', rides.length);
    
    res.json({
      success: true,
      data: {
        pendingRides: rides.length,
        rides: rides
      }
    });
  } catch (error) {
    console.error('Test ride requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get ride requests', error: error.message });
  }
});

// Test route to test distance calculation
router.post('/test-distance', async (req, res) => {
  try {
    const { point1, point2 } = req.body;
    
    if (!point1 || !point2) {
      return res.status(400).json({
        success: false,
        message: 'point1 and point2 are required'
      });
    }
    
    console.log('🧪 Testing distance calculation between:', point1, 'and', point2);
    
    const distance = calculateDistance(point1, point2);
    
    res.json({
      success: true,
      data: {
        point1,
        point2,
        distance,
        isValid: !isNaN(distance) && distance > 0
      }
    });
  } catch (error) {
    console.error('Test distance calculation error:', error);
    res.status(500).json({ success: false, message: 'Failed to test distance calculation', error: error.message });
  }
});

// @desc    Get rider's current location for tracking
// @route   GET /api/rides/:id/rider-location  
// @access  Private (Driver only)
const getRiderLocation = async (req, res) => {
  try {
    console.log('📍 Getting rider location for ride:', req.params.id, 'by driver:', req.user.id);
    
    const ride = await Ride.findById(req.params.id).populate('rider', 'location firstName lastName');
    
    if (!ride) {
      console.log('❌ Ride not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }
    
    console.log('🔍 Ride found:', {
      id: ride._id,
      status: ride.status,
      driver: ride.driver,
      rider: ride.rider?._id
    });
    
    // Only driver of this ride can access rider location
    if (!ride.driver || ride.driver.toString() !== req.user.id) {
      console.log('❌ Driver not authorized:', {
        rideDriver: ride.driver,
        requestingDriver: req.user.id
      });
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access rider location. You must be the assigned driver.'
      });
    }
    
    if (!ride.rider) {
      console.log('❌ No rider associated with ride');
      return res.status(400).json({
        success: false,
        message: 'No rider associated with this ride'
      });
    }
    
    // Get the latest location from the user document
    const rider = await User.findById(ride.rider._id).select('location firstName lastName');
    
    if (!rider) {
      console.log('❌ Rider not found:', ride.rider._id);
      return res.status(404).json({
        success: false,
        message: 'Rider not found'
      });
    }
    
    console.log('📍 Rider location found:', rider.location);
    
    res.json({
      success: true,
      data: {
        riderId: rider._id,
        riderName: `${rider.firstName} ${rider.lastName}`,
        location: rider.location,
        lastUpdated: new Date()
      }
    });
    
  } catch (error) {
    console.error('Get rider location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rider location',
      error: error.message
    });
  }
};

router.get('/:id/rider-location', protect, getRiderLocation);

// @desc    Get driver location for a ride
// @route   GET /api/rides/:id/driver-location
// @access  Private (Rider only)
const getDriverLocation = async (req, res) => {
  try {
    const rideId = req.params.id;
    console.log(`🗺️ Getting driver location for ride ${rideId} by user ${req.user.id}`);

    // Find the ride
    const ride = await Ride.findById(rideId).populate('driver', 'location');
    
    if (!ride) {
      console.log(`❌ Ride ${rideId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Check if user is the rider
    if (ride.rider.toString() !== req.user.id) {
      console.log(`❌ Unauthorized: User ${req.user.id} is not the rider for ride ${rideId}`);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this driver location'
      });
    }

    // Check if ride has a driver assigned
    if (!ride.driver) {
      console.log(`❌ No driver assigned to ride ${rideId}`);
      return res.status(404).json({
        success: false,
        message: 'No driver assigned to this ride'
      });
    }

    // Check if driver has location
    if (!ride.driver.location || !ride.driver.location.coordinates) {
      console.log(`❌ Driver location not available for ride ${rideId}`);
      return res.status(404).json({
        success: false,
        message: 'Driver location not available'
      });
    }

    const driverLocation = {
      coordinates: ride.driver.location.coordinates,
      updatedAt: ride.driver.location.updatedAt || new Date()
    };

    console.log(`✅ Driver location retrieved for ride ${rideId}:`, driverLocation);

    res.json({
      success: true,
      message: 'Driver location retrieved',
      data: {
        location: driverLocation
      }
    });

  } catch (error) {
    console.error('❌ Error getting driver location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get driver location',
      error: error.message
    });
  }
};

router.get('/:id/driver-location', protect, getDriverLocation);

// @desc    Rate a completed ride
// @route   POST /api/rides/:id/rate
// @access  Private (Driver or Rider)
const rateRide = async (req, res) => {
  try {
    const rideId = req.params.id;
    const { rating, comment, ratedBy } = req.body;
    console.log(`⭐ Rating ride ${rideId} by ${ratedBy}: ${rating}/5`);

    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    if (!ratedBy || !['driver', 'rider'].includes(ratedBy)) {
      return res.status(400).json({
        success: false,
        message: 'ratedBy must be either "driver" or "rider"'
      });
    }

    // Find the ride
    const ride = await Ride.findById(rideId).populate('driver rider');
    
    if (!ride) {
      console.log(`❌ Ride ${rideId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Check if ride is completed
    if (ride.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate completed rides'
      });
    }

    // Check authorization
    if (ratedBy === 'driver' && ride.driver._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned driver can rate this ride'
      });
    }

    if (ratedBy === 'rider' && ride.rider._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the rider can rate this ride'
      });
    }

    // Update the ride with rating
    const ratingData = {
      rating: rating,
      comment: comment || '',
      createdAt: new Date()
    };

    if (ratedBy === 'driver') {
      ride.driverRating = ratingData;
    } else {
      ride.riderRating = ratingData;
    }

    await ride.save();

    // Update user's average rating
    const targetUser = ratedBy === 'driver' ? ride.rider : ride.driver;
    
    // Calculate new average rating for the target user
    const userRides = await Ride.find({
      $or: [
        { rider: targetUser._id, riderRating: { $exists: true } },
        { driver: targetUser._id, driverRating: { $exists: true } }
      ],
      status: 'completed'
    });

    let totalRating = 0;
    let ratingCount = 0;

    userRides.forEach(ride => {
      if (ratedBy === 'driver' && ride.rider._id.toString() === targetUser._id.toString() && ride.driverRating) {
        totalRating += ride.driverRating.rating;
        ratingCount++;
      } else if (ratedBy === 'rider' && ride.driver._id.toString() === targetUser._id.toString() && ride.riderRating) {
        totalRating += ride.riderRating.rating;
        ratingCount++;
      }
    });

    if (ratingCount > 0) {
      const newAverageRating = totalRating / ratingCount;
      await User.findByIdAndUpdate(targetUser._id, {
        rating: parseFloat(newAverageRating.toFixed(2))
      });
      console.log(`✅ Updated ${targetUser.firstName}'s rating to ${newAverageRating.toFixed(2)}`);
    }

    console.log(`✅ Ride ${rideId} rated successfully by ${ratedBy}`);

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        rating: ratingData,
        ratedBy: ratedBy
      }
    });

  } catch (error) {
    console.error('❌ Error rating ride:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit rating',
      error: error.message
    });
  }
};

// @desc    Get rider contact information for drivers
// @route   GET /api/rides/:id/rider-info
// @access  Private (Driver only)
const getRiderInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;

    console.log(`🔍 Driver ${driverId} requesting rider info for ride ${id}`);

    // Find the ride and verify driver has access
    const ride = await Ride.findById(id).populate('rider', 'firstName lastName phoneNumber');

    if (!ride) {
      console.log(`❌ Ride ${id} not found`);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Check if the requesting user is the driver for this ride
    if (ride.driver.toString() !== driverId) {
      console.log(`❌ Driver ${driverId} not authorized for ride ${id}`);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this ride information'
      });
    }

    // Only allow access if ride is accepted, started, or completed
    if (!['accepted', 'started', 'completed'].includes(ride.status)) {
      console.log(`❌ Ride ${id} status ${ride.status} - rider info not accessible`);
      return res.status(400).json({
        success: false,
        message: 'Rider information only available for accepted rides'
      });
    }

    const riderInfo = {
      firstName: ride.rider.firstName,
      lastName: ride.rider.lastName,
      phone: ride.rider.phoneNumber,
      fullName: `${ride.rider.firstName} ${ride.rider.lastName}`
    };

    console.log(`✅ Returning rider info for ride ${id}:`, {
      name: riderInfo.fullName,
      phone: riderInfo.phone
    });

    res.json({
      success: true,
      data: riderInfo
    });

  } catch (error) {
    console.error('❌ Error getting rider info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rider information',
      error: error.message
    });
  }
};

router.post('/:id/rate', protect, rateRide);
router.get('/:id/rider-info', protect, authorize('driver'), getRiderInfo);

module.exports = router; 