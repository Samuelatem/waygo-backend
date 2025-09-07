const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const SOS = require('../models/SOS');
const User = require('../models/User');

// Create SOS alert (for riders and drivers)
router.post('/alert', protect, async (req, res) => {
  try {
    const { location, emergencyType, description } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate user role
    if (!['rider', 'driver'].includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Only riders and drivers can create SOS alerts'
      });
    }

    // Validate location
    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Valid location coordinates are required'
      });
    }

    // Create SOS alert
    const sosAlert = new SOS({
      userId,
      userRole,
      location: {
        type: 'Point',
        coordinates: [location.lng, location.lat] // MongoDB expects [longitude, latitude]
      },
      emergencyType: emergencyType || 'safety',
      description: description || ''
    });

    await sosAlert.save();

    // Emit to WebSocket for real-time admin notification
    // This would be handled in your WebSocket implementation
    req.app.get('io').emit('sos_alert', {
      sosId: sosAlert._id,
      userId,
      userRole,
      location: sosAlert.location,
      emergencyType: sosAlert.emergencyType,
      createdAt: sosAlert.createdAt
    });

    res.status(201).json({
      success: true,
      message: 'SOS alert created successfully',
      data: {
        sosId: sosAlert._id,
        status: sosAlert.status
      }
    });

  } catch (error) {
    console.error('Error creating SOS alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create SOS alert',
      error: error.message
    });
  }
});

// Get all active SOS alerts (admin only)
router.get('/active', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const activeAlerts = await SOS.find({ status: 'active' })
      .populate('userId', 'firstName lastName phoneNumber email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        alerts: activeAlerts
      }
    });

  } catch (error) {
    console.error('Error fetching active SOS alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS alerts',
      error: error.message
    });
  }
});

// Get SOS alerts by user (for riders and drivers)
router.get('/my-alerts', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate user role
    if (!['rider', 'driver'].includes(userRole)) {
      return res.status(400).json({
        success: false,
        message: 'Only riders and drivers can view their SOS alerts'
      });
    }

    const alerts = await SOS.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: {
        alerts
      }
    });

  } catch (error) {
    console.error('Error fetching user SOS alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS alerts',
      error: error.message
    });
  }
});

// Admin response to SOS alert
router.put('/:sosId/respond', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const { action, notes, status } = req.body;
    const sosId = req.params.sosId;

    const sosAlert = await SOS.findById(sosId);
    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: 'SOS alert not found'
      });
    }

    // Update SOS alert
    sosAlert.adminResponse = {
      respondedBy: req.user.id,
      responseTime: new Date(),
      action: action || '',
      notes: notes || ''
    };

    if (status && ['active', 'resolved', 'false_alarm'].includes(status)) {
      sosAlert.status = status;
      if (status === 'resolved') {
        sosAlert.resolvedAt = new Date();
      }
    }

    await sosAlert.save();

    // Emit to WebSocket for real-time updates
    req.app.get('io').emit('sos_response', {
      sosId: sosAlert._id,
      status: sosAlert.status,
      adminResponse: sosAlert.adminResponse
    });

    res.json({
      success: true,
      message: 'SOS alert updated successfully',
      data: {
        sosAlert
      }
    });

  } catch (error) {
    console.error('Error responding to SOS alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to SOS alert',
      error: error.message
    });
  }
});

// Mark SOS alert as resolved
router.put('/:sosId/resolve', protect, async (req, res) => {
  try {
    const sosId = req.params.sosId;
    const { resolvedBy } = req.body;

    const sosAlert = await SOS.findById(sosId);
    if (!sosAlert) {
      return res.status(404).json({
        success: false,
        message: 'SOS alert not found'
      });
    }

    // Check if user can resolve this alert
    if (req.user.role === 'admin' || sosAlert.userId.toString() === req.user.id) {
      sosAlert.status = 'resolved';
      sosAlert.resolvedAt = new Date();
      
      if (resolvedBy) {
        sosAlert.adminResponse = {
          ...sosAlert.adminResponse,
          resolvedBy: resolvedBy === 'admin' ? req.user.id : null
        };
      }

      await sosAlert.save();

      // Emit to WebSocket
      req.app.get('io').emit('sos_resolved', {
        sosId: sosAlert._id,
        status: sosAlert.status
      });

      res.json({
        success: true,
        message: 'SOS alert resolved successfully',
        data: {
          sosAlert
        }
      });
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only resolve your own alerts or must be an admin.'
      });
    }

  } catch (error) {
    console.error('Error resolving SOS alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve SOS alert',
      error: error.message
    });
  }
});

// Get SOS statistics (admin only)
router.get('/stats', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const totalAlerts = await SOS.countDocuments();
    const activeAlerts = await SOS.countDocuments({ status: 'active' });
    const resolvedAlerts = await SOS.countDocuments({ status: 'resolved' });
    const falseAlarms = await SOS.countDocuments({ status: 'false_alarm' });

    // Get alerts by role
    const riderAlerts = await SOS.countDocuments({ userRole: 'rider' });
    const driverAlerts = await SOS.countDocuments({ userRole: 'driver' });

    // Get alerts by emergency type
    const emergencyTypeStats = await SOS.aggregate([
      {
        $group: {
          _id: '$emergencyType',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalAlerts,
        activeAlerts,
        resolvedAlerts,
        falseAlarms,
        byRole: {
          rider: riderAlerts,
          driver: driverAlerts
        },
        byEmergencyType: emergencyTypeStats
      }
    });

  } catch (error) {
    console.error('Error fetching SOS statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS statistics',
      error: error.message
    });
  }
});

module.exports = router;
