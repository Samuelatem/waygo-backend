const mongoose = require('mongoose');
const Ride = require('./models/Ride');
const User = require('./models/User');
require('dotenv').config();

const generateTestEarnings = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://sammyaa86:wxZG2RxnfpztbWEZ@securex.6hlvcz3.mongodb.net/');
    console.log('✅ Connected to MongoDB');

    // Find all drivers
    const drivers = await User.find({ role: 'driver' });
    console.log(`📊 Found ${drivers.length} drivers`);

    if (drivers.length === 0) {
      console.log('❌ No drivers found');
      return;
    }

    // Check existing rides for each driver
    for (const driver of drivers) {
      console.log(`\n🚘 Driver: ${driver.name} (${driver._id})`);
      
      const rides = await Ride.find({ driver: driver._id });
      console.log(`   Rides: ${rides.length}`);
      
      const completedRides = await Ride.find({ driver: driver._id, status: 'completed' });
      console.log(`   Completed rides: ${completedRides.length}`);

      // Calculate current earnings
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayEarnings = await Ride.aggregate([
        { $match: { driver: driver._id, status: 'completed', completedAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]);

      const totalEarnings = await Ride.aggregate([
        { $match: { driver: driver._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare.total' } } }
      ]);

      console.log(`   Today earnings: ${todayEarnings[0]?.total || 0}`);
      console.log(`   Total earnings: ${totalEarnings[0]?.total || 0}`);

      // Create test rides if none exist
      if (completedRides.length === 0) {
        console.log('   🔄 Creating test rides...');
        
        // Find a rider
        const rider = await User.findOne({ role: 'rider' });
        if (!rider) {
          console.log('   ❌ No riders found to create test rides');
          continue;
        }

        // Create test rides for today, this week, and this month
        const testRides = [
          {
            rider: rider._id,
            driver: driver._id,
            status: 'completed',
            pickup: {
              address: 'Test Pickup Location',
              location: { type: 'Point', coordinates: [11.5174, 3.8480] }
            },
            destination: {
              address: 'Test Destination',
              location: { type: 'Point', coordinates: [11.5274, 3.8580] }
            },
            fare: {
              base: 500,
              distance: 200,
              total: 700
            },
            distance: 2.5,
            duration: 15,
            completedAt: new Date(), // Today
            startedAt: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
          },
          {
            rider: rider._id,
            driver: driver._id,
            status: 'completed',
            pickup: {
              address: 'Test Pickup 2',
              location: { type: 'Point', coordinates: [11.5175, 3.8481] }
            },
            destination: {
              address: 'Test Destination 2',
              location: { type: 'Point', coordinates: [11.5275, 3.8581] }
            },
            fare: {
              base: 600,
              distance: 300,
              total: 900
            },
            distance: 3.0,
            duration: 18,
            completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
            startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 18 * 60 * 1000)
          },
          {
            rider: rider._id,
            driver: driver._id,
            status: 'completed',
            pickup: {
              address: 'Test Pickup 3',
              location: { type: 'Point', coordinates: [11.5176, 3.8482] }
            },
            destination: {
              address: 'Test Destination 3',
              location: { type: 'Point', coordinates: [11.5276, 3.8582] }
            },
            fare: {
              base: 800,
              distance: 400,
              total: 1200
            },
            distance: 4.0,
            duration: 25,
            completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
            startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 - 25 * 60 * 1000)
          }
        ];

        await Ride.insertMany(testRides);
        console.log(`   ✅ Created ${testRides.length} test rides`);
      }
    }

    console.log('\n🎉 Test earnings generation completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

generateTestEarnings();