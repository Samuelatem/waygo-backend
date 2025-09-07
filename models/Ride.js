const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  pickup: {
    address: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    }
  },
  destination: {
    address: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    }
  },
  distance: {
    type: Number, // in kilometers
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  fare: {
    base: {
      type: Number,
      required: true
    },
    distance: {
      type: Number,
      required: true
    },
    time: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'XAF'
    }
  },
  payment: {
    method: {
      type: String,
      enum: ['momo', 'orange_money', 'card', 'cash', 'wallet'],
      required: true,
      default: 'cash'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    transactionId: String
  },
  // Rating by driver for rider
  driverRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  // Rating by rider for driver
  riderRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  // Legacy rating field (for backward compatibility)
  rating: {
    rider: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    },
    driver: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    }
  },
  // Timestamps for different stages
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelledBy: {
    type: String,
    enum: ['rider', 'driver', 'system']
  },
  cancellationReason: String,
  // Additional info
  notes: String,
  vehicleType: {
    type: String,
    enum: ['standard', 'premium', 'bike'],
    default: 'standard'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
rideSchema.index({ rider: 1, createdAt: -1 });
rideSchema.index({ driver: 1, createdAt: -1 });
rideSchema.index({ status: 1 });
rideSchema.index({ 'pickup.location': '2dsphere' });
rideSchema.index({ 'destination.location': '2dsphere' });

// Virtual for ride duration
rideSchema.virtual('durationInMinutes').get(function() {
  if (this.completedAt && this.startedAt) {
    return Math.round((this.completedAt - this.startedAt) / (1000 * 60));
  }
  return null;
});

// Method to calculate fare
rideSchema.methods.calculateFare = function() {
  const baseFare = 500; // 500 XAF base fare
  const perKmRate = 200; // 200 XAF per kilometer
  const perMinuteRate = 10; // 10 XAF per minute
  
  const distanceFare = this.distance * perKmRate;
  const timeFare = this.duration * perMinuteRate;
  const totalFare = baseFare + distanceFare + timeFare;
  
  return {
    base: baseFare,
    distance: distanceFare,
    time: timeFare,
    total: totalFare,
    currency: 'XAF'
  };
};

// Method to update ride status
rideSchema.methods.updateStatus = function(newStatus, userId = null) {
  this.status = newStatus;
  
  switch (newStatus) {
    case 'accepted':
      this.acceptedAt = new Date();
      break;
    case 'in_progress':
      this.startedAt = new Date();
      break;
    case 'completed':
      this.completedAt = new Date();
      break;
    case 'cancelled':
      this.cancelledAt = new Date();
      this.cancelledBy = userId;
      break;
  }
  
  return this.save();
};

module.exports = mongoose.model('Ride', rideSchema); 