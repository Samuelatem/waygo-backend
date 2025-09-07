const mongoose = require('mongoose');

const SOSSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userRole: {
    type: String,
    enum: ['rider', 'driver'],
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
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'false_alarm'],
    default: 'active'
  },
  emergencyType: {
    type: String,
    enum: ['medical', 'safety', 'accident', 'other'],
    default: 'safety'
  },
  description: {
    type: String,
    maxlength: 500
  },
  adminResponse: {
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    responseTime: Date,
    action: String,
    notes: String
  },
  familyContacted: {
    type: Boolean,
    default: false
  },
  emergencyServicesContacted: {
    type: Boolean,
    default: false
  },
  resolvedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for geospatial queries
SOSSchema.index({ location: '2dsphere' });

// Index for quick status queries
SOSSchema.index({ status: 1, createdAt: -1 });

// Index for user queries
SOSSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SOS', SOSSchema);
