const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^(\+237|237)?[0-9]{9}$/, 'Please enter a valid Cameroonian phone number']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [4, 'Password must be at least 4 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['rider', 'driver', 'admin'],
    default: 'rider'
  },
  profilePicture: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  // Driver-specific fields
  vehicleInfo: {
    make: String,
    model: String,
    year: Number,
    licensePlate: String,
    region: {
      type: String,
      enum: ['AD', 'CE', 'EN', 'ES', 'LT', 'NO', 'NW', 'OU', 'SU', 'SW'],
      validate: {
        validator: function(v) {
          if (this.role === 'driver') {
            return v && v.length === 2;
          }
          return true;
        },
        message: 'License plate region is required for drivers'
      }
    },
    color: String
  },
  driverLicense: String,
  insuranceInfo: String,
  isAvailable: {
    type: Boolean,
    default: true
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRides: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  // Emergency contact information
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  // Payment info
  paymentMethods: [{
    type: {
      type: String,
      enum: ['momo', 'orange_money', 'card'],
      required: true
    },
    accountNumber: String,
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  preferences: {
    language: {
      type: String,
      enum: ['en', 'fr'],
      default: 'en'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for geospatial queries
userSchema.index({ location: '2dsphere' });

// Index for role-based queries
userSchema.index({ role: 1 });

// Index for driver availability
userSchema.index({ role: 1, isAvailable: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile (without sensitive data)
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

// Method to get driver profile
userSchema.methods.getDriverProfile = function() {
  if (this.role !== 'driver') {
    throw new Error('User is not a driver');
  }
  
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

// Static method to find nearby drivers
userSchema.statics.findNearbyDrivers = function(coordinates, maxDistance = 10000) {
  return this.find({
    role: 'driver',
    isAvailable: true,
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  });
};

// Static method to find drivers by region
userSchema.statics.findDriversByRegion = function(region) {
  return this.find({
    role: 'driver',
    isAvailable: true,
    isActive: true,
    'vehicleInfo.region': region
  });
};

module.exports = mongoose.model('User', userSchema); 