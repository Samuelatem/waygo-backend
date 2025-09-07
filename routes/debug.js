const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Wallet = require('../models/Wallet');

// Debug endpoint to test wallet deposit functionality
router.post('/debug-deposit', protect, async (req, res) => {
  try {
    console.log('🧪 Debug deposit endpoint called');
    console.log('User:', req.user.id, req.user.role);
    console.log('Request body:', req.body);

    const { amount, paymentMethod, phoneNumber } = req.body;
    
    // Basic validation
    if (!amount || amount <= 0) {
      console.log('❌ Invalid amount:', amount);
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required',
        debug: { amount, isValid: amount > 0 }
      });
    }

    if (!phoneNumber) {
      console.log('❌ Missing phone number');
      return res.status(400).json({
        success: false,
        message: 'Phone number is required for mobile money payments',
        debug: { phoneNumber }
      });
    }

    // Check if wallet exists
    let wallet = await Wallet.findOne({ userId: req.user.id });
    console.log('🔍 Existing wallet:', wallet ? 'Found' : 'Not found');
    
    if (!wallet) {
      console.log('🆕 Creating new wallet...');
      wallet = await Wallet.createWallet(req.user.id, req.user.role);
      console.log('✅ Wallet created:', wallet._id);
    }

    // Generate simple reference for testing
    const externalReference = `TEST_DEP_${Date.now()}_${req.user.id}`;
    console.log('📋 External reference:', externalReference);
    
    // Create test transaction
    const transaction = {
      type: 'deposit',
      amount: amount,
      status: 'pending',
      description: `Test deposit via ${paymentMethod}`,
      metadata: {
        paymentMethod: paymentMethod,
        phoneNumber: phoneNumber,
        externalReference: externalReference
      },
      createdAt: new Date()
    };

    console.log('📝 Transaction data:', transaction);

    // Test adding transaction
    wallet.transactions.push(transaction);
    await wallet.save();
    
    console.log('✅ Transaction saved successfully');

    res.json({
      success: true,
      message: 'Debug deposit test successful',
      debug: {
        walletId: wallet._id,
        userId: req.user.id,
        userRole: req.user.role,
        transactionCount: wallet.transactions.length,
        lastTransaction: wallet.transactions[wallet.transactions.length - 1],
        externalReference
      }
    });

  } catch (error) {
    console.error('❌ Debug deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug deposit failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// Test campay service separately
router.post('/debug-campay', protect, async (req, res) => {
  try {
    console.log('🧪 Debug Campay service test');
    
    const campayService = require('../services/campayService');
    console.log('📦 CampayService loaded:', typeof campayService);

    // Test if campay service methods exist
    const methods = ['collectPayment', 'withdrawPayment', 'getPaymentStatus'];
    const methodsAvailable = methods.map(method => ({
      method,
      available: typeof campayService[method] === 'function'
    }));

    console.log('🔍 Available methods:', methodsAvailable);

    res.json({
      success: true,
      message: 'CampayService debug test',
      debug: {
        serviceLoaded: true,
        methods: methodsAvailable,
        config: {
          hasBaseURL: !!campayService.baseURL,
          hasAppId: !!campayService.appId,
          hasToken: !!campayService.permanentAccessToken
        }
      }
    });

  } catch (error) {
    console.error('❌ Campay debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Campay debug failed',
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;