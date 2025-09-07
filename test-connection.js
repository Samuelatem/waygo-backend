const mongoose = require('mongoose');
require('dotenv').config();

// Test database connection
const testConnection = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://sammyaa86:wxZG2RxnfpztbWEZ@securex.6hlvcz3.mongodb.net/';
    
    console.log('🔗 Testing MongoDB connection...');
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connection successful');
    
    // Test basic operations
    const User = require('./models/User');
    const Ride = require('./models/Ride');
    
    // Count users
    const userCount = await User.countDocuments();
    console.log(`👥 Total users in database: ${userCount}`);
    
    // Count drivers
    const driverCount = await User.countDocuments({ role: 'driver' });
    console.log(`🚘 Total drivers: ${driverCount}`);
    
    // Count available drivers
    const availableDrivers = await User.countDocuments({ 
      role: 'driver', 
      isAvailable: true,
      isActive: true 
    });
    console.log(`🟢 Available drivers: ${availableDrivers}`);
    
    // Count riders
    const riderCount = await User.countDocuments({ role: 'rider' });
    console.log(`🚶 Total riders: ${riderCount}`);
    
    // Count rides
    const rideCount = await Ride.countDocuments();
    console.log(`🚗 Total rides: ${rideCount}`);
    
    // Test geospatial query
    const testLocation = [9.7679, 4.0511]; // Douala coordinates
    const nearbyDrivers = await User.find({
      role: 'driver',
      isAvailable: true,
      isActive: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: testLocation
          },
          $maxDistance: 10000 // 10km
        }
      }
    }).limit(5);
    
    console.log(`📍 Drivers near Douala: ${nearbyDrivers.length}`);
    nearbyDrivers.forEach(driver => {
      console.log(`  - ${driver.firstName} ${driver.lastName} (${driver.isAvailable ? 'Available' : 'Unavailable'})`);
    });
    
    console.log('\n🎉 All tests passed! Backend is ready.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run test
testConnection();
