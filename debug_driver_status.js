// Debug script to check driver status
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/waygo', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const User = require('./models/User');

async function checkDriverStatus() {
  try {
    console.log('🔍 Checking driver status...');
    
    // Find all drivers
    const drivers = await User.find({ role: 'driver' });
    console.log(`📊 Total drivers: ${drivers.length}`);
    
    // Check active drivers
    const activeDrivers = await User.find({ role: 'driver', isActive: true });
    console.log(`📊 Active drivers: ${activeDrivers.length}`);
    
    // Check available drivers
    const availableDrivers = await User.find({ 
      role: 'driver', 
      isActive: true, 
      isAvailable: true 
    });
    console.log(`📊 Available drivers: ${availableDrivers.length}`);
    
    // Check drivers with location
    const driversWithLocation = await User.find({
      role: 'driver',
      isActive: true,
      isAvailable: true,
      'location.coordinates': { $exists: true, $ne: [0, 0] }
    });
    console.log(`📊 Available drivers with location: ${driversWithLocation.length}`);
    
    // Show driver details
    console.log('\n📋 Driver Details:');
    drivers.forEach((driver, index) => {
      console.log(`${index + 1}. ${driver.firstName} ${driver.lastName}`);
      console.log(`   - Active: ${driver.isActive}`);
      console.log(`   - Available: ${driver.isAvailable}`);
      console.log(`   - Location: ${driver.location?.coordinates || 'Not set'}`);
      console.log(`   - Phone: ${driver.phoneNumber}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error checking driver status:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkDriverStatus();