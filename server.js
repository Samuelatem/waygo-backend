const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      'https://waygo-kwhwznloa-samuelatems-projects.vercel.app',
      'https://waygo-g6qqsz11k-samuelatems-projects.vercel.app',
      'https://waygo.vercel.app'
    ],
    methods: ["GET", "POST"]
  }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://waygo-kwhwznloa-samuelatems-projects.vercel.app',
    'https://waygo-g6qqsz11k-samuelatems-projects.vercel.app',
    'https://waygo.vercel.app' // In case you get a custom domain
  ],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database Connection
const connectDB = async () => {
  try {
    // Use MongoDB Atlas or local MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://sammyaa86:wxZG2RxnfpztbWEZ@securex.6hlvcz3.mongodb.net/';
    
    console.log('🔗 Connecting to MongoDB...');
    console.log('📊 URI:', mongoURI.substring(0, 20) + '...');
    
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('💡 To use MongoDB Atlas:');
    console.log('1. Create a free account at https://cloud.mongodb.com');
    console.log('2. Create a cluster and get your connection string');
    console.log('3. Set MONGODB_URI in your environment variables');
    console.log('4. Or install MongoDB locally: https://docs.mongodb.com/manual/installation/');
    process.exit(1);
  }
};

// Import routes
const authRoutes = require('./routes/auth');
const ridesRoutes = require('./routes/rides');
const usersRoutes = require('./routes/users');
const paymentsRoutes = require('./routes/payments');
const sosRoutes = require('./routes/sos');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const debugRoutes = require('./routes/debug');

// Basic routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'WayGo Backend API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/debug', debugRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  // Join user to their room
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} joined their room`);
  });

  // Handle location updates
  socket.on('location_update', (data) => {
    const { userId, location } = data;
    console.log(`📍 Location update from user ${userId}:`, location);
    
    // Broadcast to all other users (for nearby driver detection)
    socket.broadcast.emit('location_updated', { userId, location });
    
    // Also emit to specific user room for ride tracking
    socket.to(`user_${userId}`).emit('location_updated', { userId, location });
  });

  // Handle ride status updates
  socket.on('ride_status_update', (data) => {
    const { rideId, status, driverId, riderId } = data;
    console.log(`🚗 Ride ${rideId} status updated to: ${status}`);
    
    // Join ride room for real-time updates
    socket.join(`ride_${rideId}`);
    
    // Broadcast to ride room
    io.to(`ride_${rideId}`).emit('ride_status_changed', { rideId, status, driverId, riderId });
  });

  // Join ride room
  socket.on('join_ride', (rideId) => {
    socket.join(`ride_${rideId}`);
    console.log(`🚗 User joined ride room: ${rideId}`);
  });

  // Handle driver availability
  socket.on('driver_availability', (data) => {
    const { driverId, isAvailable, location } = data;
    console.log(`🚘 Driver ${driverId} availability: ${isAvailable ? 'Online' : 'Offline'}`);
    
    // Broadcast to all users for real-time driver status
    socket.broadcast.emit('driver_status_changed', { driverId, isAvailable, location });
    
    // Also emit to admin room
    socket.to('admin_room').emit('driver_status_changed', { driverId, isAvailable, location });
  });

  // Handle new ride requests (for drivers)
  socket.on('join_driver', (driverId) => {
    socket.join(`user_${driverId}`);
    socket.join(`driver_${driverId}`); // For earnings updates
    console.log(`🚘 Driver ${driverId} joined rooms: user_${driverId} and driver_${driverId}`);
    
    // Emit current status to driver
    socket.emit('driver_connected', { 
      message: 'Driver connected successfully',
      timestamp: new Date().toISOString()
    });
    
    // Also join a general drivers room for broadcast notifications
    socket.join('drivers_room');
    console.log(`🚘 Driver ${driverId} joined drivers_room`);
  });

  // Handle emergency SOS alerts
  socket.on('emergency_alert', (data) => {
    const { driverId, riderId, location, timestamp } = data;
    
    // Broadcast to all admins
    socket.to('admin_room').emit('emergency_sos', {
      driverId,
      riderId,
      location,
      timestamp,
      alertId: Date.now()
    });
    
    console.log(`🚨 Emergency SOS alert received from ${driverId || riderId}`);
  });

  // Join admin room for emergency alerts
  socket.on('join_admin', () => {
    socket.join('admin_room');
    console.log('👑 Admin joined emergency monitoring room');
  });

  // Handle SOS alert responses
  socket.on('sos_response', (data) => {
    const { sosId, adminId, response } = data;
    
    // Broadcast response to the user who sent the SOS
    if (data.userId) {
      socket.to(`user_${data.userId}`).emit('sos_admin_response', {
        sosId,
        adminId,
        response,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📝 SOS response sent for alert ${sosId}`);
  });

  // Handle ride request acceptance
  socket.on('ride_accepted', (data) => {
    const { rideId, driverId, riderId } = data;
    console.log(`✅ Ride ${rideId} accepted by driver ${driverId}`);
    
    // Notify rider that ride was accepted
    socket.to(`user_${riderId}`).emit('ride_accepted', {
      rideId,
      driverId,
      timestamp: new Date().toISOString()
    });
    
    // Join both users to ride room
    socket.join(`ride_${rideId}`);
  });

  // Handle ride requests from backend
  socket.on('ride_request_created', (data) => {
    const { rideId, pickup, destination, distance, fare, rider, nearbyDrivers } = data;
    console.log(`🚗 Broadcasting ride request ${rideId} to all drivers`);
    
    // Broadcast to all drivers in the drivers room
    socket.to('drivers_room').emit('new_ride_request', {
      rideId,
      pickup,
      destination,
      distance,
      fare,
      rider,
      requestedAt: new Date(),
      nearbyDrivers: nearbyDrivers.length
    });
    
    // Also emit to admin room
    socket.to('admin_room').emit('new_ride_request', {
      rideId,
      pickup,
      destination,
      distance,
      fare,
      rider,
      requestedAt: new Date()
    });
  });

  // Handle ride cancellation
  socket.on('ride_cancelled', (data) => {
    const { rideId, reason, cancelledBy } = data;
    console.log(`❌ Ride ${rideId} cancelled by ${cancelledBy}`);
    
    // Notify all participants
    io.to(`ride_${rideId}`).emit('ride_cancelled', {
      rideId,
      reason,
      cancelledBy,
      timestamp: new Date().toISOString()
    });
  });

  // Handle new ride requests - broadcast to all drivers
  socket.on('ride_requested', (data) => {
    const { rideId, riderId, pickup, destination } = data;
    console.log(`🚗 New ride request ${rideId} from rider ${riderId}`);
    
    // Broadcast to all connected drivers
    socket.broadcast.emit('new_ride_request', {
      rideId,
      riderId,
      pickup,
      destination,
      timestamp: new Date().toISOString()
    });
    
    // Also emit to admin room if needed
    socket.to('admin_room').emit('new_ride_request', {
      rideId,
      riderId,
      pickup,
      destination,
      timestamp: new Date().toISOString()
    });
  });

  // Handle driver joining for ride requests
  socket.on('driver_ready_for_rides', (driverId) => {
    console.log(`🚘 Driver ${driverId} is ready to receive ride requests`);
    socket.join('drivers_room');
    
    // Emit confirmation
    socket.emit('driver_status_confirmed', {
      message: 'You are now visible to passengers',
      timestamp: new Date().toISOString()
    });
  });

  // Handle driver going offline
  socket.on('driver_going_offline', (driverId) => {
    console.log(`🚫 Driver ${driverId} is going offline`);
    socket.leave('drivers_room');
    
    // Emit confirmation
    socket.emit('driver_status_confirmed', {
      message: 'You are now offline',
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const startServer = async () => {
  try {
    await connectDB();
    
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔌 WebSocket server ready`);
      console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();