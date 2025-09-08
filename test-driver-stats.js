const mongoose = require('mongoose');
const User = require('./models/User');
const Ride = require('./models/Ride');
require('dotenv').config();

const testDriverStatsAPI = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://sammyaa86:wxZG2RxnfpztbWEZ@securex.6hlvcz3.mongodb.net/');
    console.log('✅ Connected to MongoDB');

    // Find the driver with earnings
    const driverId = '689a058fa78748cc2607c28f'; // The one with today earnings
    console.log('🔍 Testing driver stats for ID:', driverId);

    // Test the exact same aggregation as the API
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    console.log('📅 Date ranges:');
    console.log('   Today start:', today);
    console.log('   Week start:', weekStart);
    console.log('   Month start:', monthStart);

    // Test with string ID (old way)
    console.log('\n🧪 Testing with string ID...');
    const stringResults = await Promise.all([
      Ride.aggregate([
        { $match: { driver: driverId, status: 'completed', completedAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]),
      Ride.aggregate([
        { $match: { driver: driverId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ])
    ]);

    console.log('   Today (string):', stringResults[0][0]?.total || 0);
    console.log('   Total (string):', stringResults[1][0]?.total || 0);

    // Test with ObjectId (new way)
    console.log('\n🧪 Testing with ObjectId...');
    const objectIdResults = await Promise.all([
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId), status: 'completed', completedAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]),
      Ride.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId), status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ])
    ]);

    console.log('   Today (ObjectId):', objectIdResults[0][0]?.total || 0);
    console.log('   Total (ObjectId):', objectIdResults[1][0]?.total || 0);

    // Check what type the driver field actually is in the database
    console.log('\n🔍 Checking driver field types in rides...');
    const sampleRides = await Ride.find({ status: 'completed' }).limit(3);
    sampleRides.forEach((ride, index) => {
      console.log(`   Ride ${index + 1}: driver = ${ride.driver} (type: ${typeof ride.driver})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

testDriverStatsAPI();