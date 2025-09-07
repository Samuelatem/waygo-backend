const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Process payment
// @route   POST /api/payments/process
// @access  Private
const processPayment = async (req, res) => {
  try {
    const { rideId, method, amount } = req.body;

    if (!rideId || !method || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID, payment method, and amount are required'
      });
    }

    // Simulate payment processing
    const paymentResult = {
      success: true,
      transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      method,
      amount,
      status: 'completed',
      timestamp: new Date()
    };

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: paymentResult
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment',
      error: error.message
    });
  }
};

// @desc    Get payment methods
// @route   GET /api/payments/methods
// @access  Private
const getPaymentMethods = async (req, res) => {
  try {
    const methods = [
      {
        id: 'momo',
        name: 'MTN Mobile Money',
        icon: '📱',
        description: 'Pay with MTN MoMo'
      },
      {
        id: 'orange_money',
        name: 'Orange Money',
        icon: '🍊',
        description: 'Pay with Orange Money'
      },
      {
        id: 'cash',
        name: 'Cash',
        icon: '💵',
        description: 'Pay with cash'
      }
    ];

    res.json({
      success: true,
      data: methods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment methods',
      error: error.message
    });
  }
};

// Routes
router.post('/process', protect, processPayment);
router.get('/methods', protect, getPaymentMethods);

module.exports = router; 