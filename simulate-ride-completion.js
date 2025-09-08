const mongoose = require('mongoose');
const Ride = require('./models/Ride');
const User = require('./models/User');
require('dotenv').config();

const simulateRideCompletion = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://sammyaa86:wxZG2RxnfpztbWEZ@securex.6hlvcz3.mongodb.net/');
    console.log('✅ Connected to MongoDB');

    // Find an in-progress ride or create one
    let ride = await Ride.findOne({ status: 'in_progress' });
    
    if (!ride) {
      // Create a test ride if none exists
      const driver = await User.findOne({ role: 'driver' });
      const rider = await User.findOne({ role: 'rider' });
      
      if (!driver || !rider) {
        console.log('❌ Need both driver and rider to create test ride');
        return;
      }

      ride = new Ride({
        rider: rider._id,
        driver: driver._id,
        status: 'in_progress',
        pickup: {
          address: 'Test Pickup Address',
          location: { type: 'Point', coordinates: [11.5174, 3.8480] }
        },
        destination: {
          address: 'Test Destination Address',
          location: { type: 'Point', coordinates: [11.5274, 3.8580] }
        },
        fare: {
          base: 500,
          distance: 300,
          total: 800
        },
        distance: 3.2,
        duration: 18,
        startedAt: new Date(Date.now() - 18 * 60 * 1000), // Started 18 minutes ago
        payment: {
          method: 'cash',
          status: 'pending'
        }
      });

      await ride.save();
      console.log('🚗 Created test ride:', ride._id);
    }

    console.log(`🏁 Completing ride ${ride._id} for driver ${ride.driver}`);

    // Complete the ride (this would normally be done via API)
    await ride.updateStatus('completed', ride.driver);
    
    console.log('✅ Ride completed successfully!');
    console.log(`💰 Fare: ${ride.fare.total} FCFA`);
    console.log('📱 Check your app for real-time earnings update!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

simulateRideCompletion();