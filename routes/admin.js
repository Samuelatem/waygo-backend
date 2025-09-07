const express = require('express');
const User = require('../models/User');
const Ride = require('../models/Ride');
const SOS = require('../models/SOS');
const Wallet = require('../models/Wallet');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(protect);
router.use(authorize('admin'));

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard-stats
// @access  Admin only
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: { $in: ['rider', 'driver'] } });
    const totalDrivers = await User.countDocuments({ role: 'driver' });
    const totalRides = await Ride.countDocuments();
    const activeRides = await Ride.countDocuments({ status: { $in: ['accepted', 'in_progress'] } });
    const pendingDrivers = await User.countDocuments({ role: 'driver', isVerified: false });
    
    // Calculate total revenue (sum of all completed rides)
    const completedRides = await Ride.find({ status: 'completed' });
    const totalRevenue = completedRides.reduce((sum, ride) => sum + (ride.fare?.total || 0), 0);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalDrivers,
        totalRides,
        totalRevenue,
        activeRides,
        pendingDrivers
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Admin only
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, status, search } = req.query;
    
    let query = {};
    
    // Filter by role
    if (role && role !== 'all') {
      query.role = role;
    }
    
    // Filter by status
    if (status && status !== 'all') {
      if (status === 'active') query.isActive = true;
      else if (status === 'inactive') query.isActive = false;
      else if (status === 'suspended') query.isSuspended = true;
      else if (status === 'pending') query.isVerified = false;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalUsers: total,
          usersPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Admin only
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove sensitive fields that shouldn't be updated
    delete updateData.password;
    delete updateData.email; // Email changes should go through a separate process
    
    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Admin only
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByIdAndDelete(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// @desc    Get all drivers
// @route   GET /api/admin/drivers
// @access  Admin only
const getDrivers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, verification, search } = req.query;
    
    let query = { role: 'driver' };
    
    // Filter by status
    if (status && status !== 'all') {
      if (status === 'active') query.isActive = true;
      else if (status === 'inactive') query.isActive = false;
      else if (status === 'suspended') query.isSuspended = true;
      else if (status === 'pending') query.isVerified = false;
    }
    
    // Filter by verification
    if (verification && verification !== 'all') {
      query.isVerified = verification === 'verified';
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { licensePlate: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    const drivers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        drivers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalDrivers: total,
          driversPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drivers'
    });
  }
};

// @desc    Get all rides
// @route   GET /api/admin/rides
// @access  Admin only
const getRides = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    
    const skip = (page - 1) * limit;
    const rides = await Ride.find(query)
      .populate('rider', 'firstName lastName email phoneNumber')
      .populate('driver', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Ride.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        rides,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRides: total,
          ridesPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching rides:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rides'
    });
  }
};

// @desc    Get all SOS requests
// @route   GET /api/admin/sos
// @access  Admin only
const getSOSRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, priority } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Filter by priority
    if (priority && priority !== 'all') {
      query.priority = priority;
    }
    
    const skip = (page - 1) * limit;
    const sosRequests = await SOS.find(query)
      .populate('user', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await SOS.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        sosRequests,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRequests: total,
          requestsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching SOS requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SOS requests'
    });
  }
};

// @desc    Update SOS request status
// @route   PATCH /api/admin/sos/:id/status
// @access  Admin only
const updateSOSStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    
    const sosRequest = await SOS.findByIdAndUpdate(id, {
      status,
      adminNotes,
      updatedAt: new Date()
    }, {
      new: true,
      runValidators: true
    });
    
    if (!sosRequest) {
      return res.status(404).json({
        success: false,
        message: 'SOS request not found'
      });
    }
    
    res.json({
      success: true,
      message: 'SOS request status updated successfully',
      data: sosRequest
    });
  } catch (error) {
    console.error('Error updating SOS status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SOS status'
    });
  }
};

// @desc    Get wallet transactions
// @route   GET /api/admin/wallets/transactions
// @access  Admin only
const getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, dateFrom, dateTo } = req.query;
    
    let query = {};
    
    // Filter by transaction type
    if (type && type !== 'all') {
      query.type = type;
    }
    
    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    
    const skip = (page - 1) * limit;
    const transactions = await Wallet.aggregate([
      { $unwind: '$transactions' },
      { $match: query },
      { $sort: { 'transactions.createdAt': -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: '$transactions._id',
          type: '$transactions.type',
          amount: '$transactions.amount',
          description: '$transactions.description',
          status: '$transactions.status',
          createdAt: '$transactions.createdAt',
          user: {
            _id: '$user._id',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            email: '$user.email'
          }
        }
      }
    ]);
    
    const total = await Wallet.aggregate([
      { $unwind: '$transactions' },
      { $match: query },
      { $count: 'total' }
    ]);
    
    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((total[0]?.total || 0) / limit),
          totalTransactions: total[0]?.total || 0,
          transactionsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet transactions'
    });
  }
};

// @desc    Get financial overview
// @route   GET /api/admin/financial-overview
// @access  Admin only
const getFinancialOverview = async (req, res) => {
  try {
    const { range = 'month', period = 'current' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    // Set date range based on parameters
    if (range === 'month') {
      if (period === 'current') {
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0)
        };
      } else if (period === 'previous') {
        dateFilter = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          $lte: new Date(now.getFullYear(), now.getMonth(), 0)
        };
      }
    } else if (range === 'year') {
      if (period === 'current') {
        dateFilter = {
          $gte: new Date(now.getFullYear(), 0, 1),
          $lte: new Date(now.getFullYear(), 11, 31)
        };
      } else if (period === 'previous') {
        dateFilter = {
          $gte: new Date(now.getFullYear() - 1, 0, 1),
          $lte: new Date(now.getFullYear() - 1, 11, 31)
        };
      }
    }
    
    // Get completed rides in the date range
    const completedRides = await Ride.find({
      status: 'completed',
      createdAt: dateFilter
    });
    
    // Calculate financial metrics
    const totalRevenue = completedRides.reduce((sum, ride) => sum + (ride.fare?.total || 0), 0);
    const totalRides = completedRides.length;
    const averageFare = totalRides > 0 ? totalRevenue / totalRides : 0;
    
    // Get platform commission (assuming 20% commission)
    const platformCommission = totalRevenue * 0.2;
    const driverEarnings = totalRevenue * 0.8;
    
    // Get payment method distribution
    const paymentMethods = {};
    completedRides.forEach(ride => {
      const method = ride.paymentMethod || 'cash';
      paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });
    
    // Get daily revenue for charts
    const dailyRevenue = {};
    completedRides.forEach(ride => {
      const date = ride.createdAt.toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (ride.fare?.total || 0);
    });
    
    res.json({
      success: true,
      data: {
        totalRevenue,
        totalRides,
        averageFare,
        platformCommission,
        driverEarnings,
        paymentMethods,
        dailyRevenue,
        currency: 'FCFA',
        dateRange: {
          start: dateFilter.$gte,
          end: dateFilter.$lte,
          range,
          period
        }
      }
    });
  } catch (error) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch financial overview'
    });
  }
};

// @desc    Get system analytics
// @route   GET /api/admin/analytics
// @access  Admin only
const getSystemAnalytics = async (req, res) => {
  try {
    const { range = 'month' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    // Set date range
    if (range === 'month') {
      dateFilter = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0)
      };
    } else if (range === 'year') {
      dateFilter = {
        $gte: new Date(now.getFullYear(), 0, 1),
        $lte: new Date(now.getFullYear(), 11, 31)
      };
    } else if (range === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      dateFilter = {
        $gte: startOfWeek,
        $lte: endOfWeek
      };
    }
    
    // User growth analytics
    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments({ createdAt: dateFilter });
    const activeUsers = await User.countDocuments({ 
      lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    
    // Driver analytics
    const totalDrivers = await User.countDocuments({ role: 'driver' });
    const activeDrivers = await User.countDocuments({ 
      role: 'driver',
      lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const pendingDrivers = await User.countDocuments({ 
      role: 'driver', 
      isVerified: false 
    });
    
    // Ride analytics
    const totalRides = await Ride.countDocuments();
    const ridesInPeriod = await Ride.countDocuments({ createdAt: dateFilter });
    const completedRides = await Ride.countDocuments({ 
      status: 'completed',
      createdAt: dateFilter
    });
    const cancelledRides = await Ride.countDocuments({ 
      status: 'cancelled',
      createdAt: dateFilter
    });
    
    // Calculate success rate
    const successRate = ridesInPeriod > 0 ? (completedRides / ridesInPeriod) * 100 : 0;
    
    // Get daily metrics for charts
    const dailyMetrics = {};
    const ridesInRange = await Ride.find({ createdAt: dateFilter });
    
    ridesInRange.forEach(ride => {
      const date = ride.createdAt.toISOString().split('T')[0];
      if (!dailyMetrics[date]) {
        dailyMetrics[date] = {
          rides: 0,
          revenue: 0,
          users: new Set()
        };
      }
      dailyMetrics[date].rides++;
      dailyMetrics[date].revenue += ride.fare?.total || 0;
      dailyMetrics[date].users.add(ride.rider.toString());
      if (ride.driver) {
        dailyMetrics[date].users.add(ride.driver.toString());
      }
    });
    
    // Convert sets to counts and format for charts
    const chartData = Object.keys(dailyMetrics).map(date => ({
      date,
      rides: dailyMetrics[date].rides,
      revenue: dailyMetrics[date].revenue,
      users: dailyMetrics[date].users.size
    }));
    
    // Top performing drivers
    const topDrivers = await Ride.aggregate([
      { $match: { status: 'completed', createdAt: dateFilter } },
      { $group: {
        _id: '$driver',
        totalRides: { $sum: 1 },
        totalRevenue: { $sum: '$fare.total' },
        averageRating: { $avg: '$driverRating' }
      }},
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 },
      { $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'driverInfo'
      }},
      { $unwind: '$driverInfo' },
      { $project: {
        driverId: '$_id',
        driverName: { $concat: ['$driverInfo.firstName', ' ', '$driverInfo.lastName'] },
        totalRides: 1,
        totalRevenue: 1,
        averageRating: { $round: ['$averageRating', 1] }
      }}
    ]);
    
    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          newUsers,
          activeUsers,
          totalDrivers,
          activeDrivers,
          pendingDrivers,
          totalRides,
          ridesInPeriod,
          completedRides,
          cancelledRides,
          successRate: Math.round(successRate * 100) / 100
        },
        charts: {
          dailyMetrics: chartData,
          topDrivers
        },
        dateRange: {
          start: dateFilter.$gte,
          end: dateFilter.$lte,
          range
        }
      }
    });
  } catch (error) {
    console.error('Error fetching system analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system analytics'
    });
  }
};

// Routes
router.get('/dashboard-stats', getDashboardStats);
router.get('/users', getUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/drivers', getDrivers);
router.get('/rides', getRides);
router.get('/sos', getSOSRequests);
router.patch('/sos/:id/status', updateSOSStatus);
router.get('/wallets/transactions', getWalletTransactions);
router.get('/financial-overview', getFinancialOverview);
router.get('/analytics', getSystemAnalytics);

module.exports = router;
