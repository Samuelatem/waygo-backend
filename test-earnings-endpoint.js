// Add this to test the backend earnings directly
const express = require('express');
const mongoose = require('mongoose');
const Ride = require('./models/Ride');

const testEarnings = async (req, res) => {
  try {
    const driverId = '689a058fa78748cc2607c28f'; // Your driver ID
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [todayEarnings, totalEarnings] = await Promise.all([
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId), status: 'completed', completedAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]),
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ])
    ]);

    res.json({
      success: true,
      driverId: driverId,
      today: todayEarnings[0]?.total || 0,
      total: totalEarnings[0]?.total || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { testEarnings };