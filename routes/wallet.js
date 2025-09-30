const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const campayService = require('../services/campayService');

// Get user's wallet
router.get('/my-wallet', protect, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = await Wallet.createWallet(req.user.id, req.user.role);
    }

    res.json({
      success: true,
      data: {
        wallet: {
          balance: wallet.balance,
          currency: wallet.currency,
          isActive: wallet.isActive,
          paymentMethods: wallet.paymentMethods,
          dailyLimit: wallet.dailyLimit,
          monthlyLimit: wallet.monthlyLimit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet',
      error: error.message
    });
  }
});

// Get wallet balance only
router.get('/balance', protect, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = await Wallet.createWallet(req.user.id, req.user.role);
    }

    res.json({
      success: true,
      data: {
        balance: wallet.balance,
        currency: wallet.currency
      }
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet balance',
      error: error.message
    });
  }
});

// Get wallet transactions
router.get('/transactions', protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const transactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(skip, skip + limit);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total: wallet.transactions.length,
          pages: Math.ceil(wallet.transactions.length / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

// Deposit money to wallet via Campay
router.post('/deposit', protect, async (req, res) => {
  try {
    const { amount, paymentMethod, phoneNumber } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required for mobile money payments'
      });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      wallet = await Wallet.createWallet(req.user.id, req.user.role);
    }

    // Generate unique reference for this transaction
    const externalReference = `DEP_${Date.now()}_${req.user.id}`;
    
    // Create pending deposit transaction
    const transaction = {
      type: 'deposit',
      amount: amount,
      status: 'pending',
      description: `Deposit via ${paymentMethod}`,
      metadata: {
        paymentMethod: paymentMethod,
        phoneNumber: phoneNumber,
        externalReference: externalReference
      },
      createdAt: new Date()
    };

    // Add transaction to wallet
    wallet.transactions.push(transaction);
    await wallet.save();

    try {
      // Try to initiate Campay payment collection
      const campayResponse = await campayService.collectPayment(
        amount,
        'XAF',
        phoneNumber,
        `Wallet deposit - ${amount} FCFA`,
        externalReference
      );

      // Update transaction with Campay reference
      const lastTransaction = wallet.transactions[wallet.transactions.length - 1];
      lastTransaction.metadata.campayReference = campayResponse.paymentId;
      lastTransaction.metadata.campayStatus = campayResponse.status;
      await wallet.save();

      res.json({
        success: true,
        message: 'Payment initiated successfully. Please complete the payment on your phone.',
        data: {
          transaction: lastTransaction,
          campayReference: campayResponse.paymentId,
          paymentInstructions: 'Check your phone for payment instructions and follow the prompts to complete the payment.'
        }
      });
    } catch (campayError) {
      console.error('❌ Campay API error for deposit:', campayError.message);
      
      // Fallback to test mode if Campay fails
      const lastTransaction = wallet.transactions[wallet.transactions.length - 1];
      lastTransaction.status = 'completed';
      lastTransaction.completedAt = new Date();
      lastTransaction.metadata.testMode = true;
      lastTransaction.metadata.campayError = campayError.message;
      
      // Update wallet balance for test transaction
      wallet.balance += amount;
      await wallet.save();

      res.json({
        success: true,
        message: 'Test deposit completed successfully (Campay API unavailable - using test mode)',
        data: {
          transaction: lastTransaction,
          newBalance: wallet.balance,
          testMode: true,
          note: 'Campay service temporarily unavailable'
        }
      });
    }
  } catch (error) {
    console.error('Error processing deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process deposit',
      error: error.message
    });
  }
});

// Withdraw money from wallet via Campay
router.post('/withdraw', protect, async (req, res) => {
  try {
    const { amount, paymentMethod, phoneNumber } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required for withdrawals'
      });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    if (!wallet.canWithdraw(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance or wallet inactive'
      });
    }

    // Generate unique reference for this transaction
    const externalReference = `WIT_${Date.now()}_${req.user.id}`;
    
    // Create pending withdrawal transaction
    const transaction = {
      type: 'withdrawal',
      amount: amount,
      status: 'pending',
      description: `Withdrawal to ${paymentMethod}`,
      metadata: {
        paymentMethod: paymentMethod,
        phoneNumber: phoneNumber,
        externalReference: externalReference
      },
      createdAt: new Date()
    };

    // Add transaction to wallet
    wallet.transactions.push(transaction);
    await wallet.save();

    try {
      // Try to initiate Campay withdrawal
      const campayResponse = await campayService.withdrawPayment(
        amount,
        'XAF',
        phoneNumber,
        `Wallet withdrawal - ${amount} FCFA`,
        externalReference
      );

      // Update transaction with Campay reference
      const lastTransaction = wallet.transactions[wallet.transactions.length - 1];
      lastTransaction.metadata.campayReference = campayResponse.withdrawalId;
      lastTransaction.metadata.campayStatus = campayResponse.status;
      await wallet.save();

      res.json({
        success: true,
        message: 'Withdrawal initiated successfully. Money will be sent to your phone shortly.',
        data: {
          transaction: lastTransaction,
          campayReference: campayResponse.withdrawalId,
          estimatedTime: '5-10 minutes'
        }
      });
    } catch (campayError) {
      console.error('❌ Campay API error for withdrawal:', campayError.message);
      
      // Fallback to test mode if Campay fails
      const lastTransaction = wallet.transactions[wallet.transactions.length - 1];
      lastTransaction.status = 'completed';
      lastTransaction.completedAt = new Date();
      lastTransaction.metadata.testMode = true;
      lastTransaction.metadata.campayError = campayError.message;
      
      // Update wallet balance for test transaction (subtract withdrawal amount)
      wallet.balance -= amount;
      await wallet.save();

      res.json({
        success: true,
        message: 'Test withdrawal completed successfully (Campay API unavailable - using test mode)',
        data: {
          transaction: lastTransaction,
          newBalance: wallet.balance,
          testMode: true,
          estimatedTime: 'Completed immediately (test mode)',
          note: 'Campay service temporarily unavailable'
        }
      });
    }
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal',
      error: error.message
    });
  }
});

// Transfer funds between users (for ride payments)
router.post('/transfer', protect, async (req, res) => {
  try {
    const { toUserId, amount, rideId } = req.body;
    
    if (!toUserId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid recipient and amount are required'
      });
    }

    // Check if recipient exists
    const recipient = await User.findById(toUserId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Transfer funds
    const result = await Wallet.transferFunds(req.user.id, toUserId, amount, rideId);

    res.json({
      success: true,
      message: 'Transfer successful',
      data: {
        newBalance: result.fromWallet,
        recipientBalance: result.toWallet,
        transactionId: result.transactionId
      }
    });
  } catch (error) {
    console.error('Error processing transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process transfer',
      error: error.message
    });
  }
});

// Pay for ride using wallet (rider pays driver)
router.post('/pay-ride', protect, async (req, res) => {
  try {
    const { rideId, driverId, amount } = req.body;
    
    if (!rideId || !driverId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID, driver ID, and valid amount are required'
      });
    }

    // Verify the user is a rider
    if (req.user.role !== 'rider') {
      return res.status(403).json({
        success: false,
        message: 'Only riders can pay for rides'
      });
    }

    // Check if driver exists and is actually a driver
    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Get rider's wallet
    const riderWallet = await Wallet.findOne({ userId: req.user.id });
    if (!riderWallet) {
      return res.status(404).json({
        success: false,
        message: 'Rider wallet not found'
      });
    }

    // Check if rider has sufficient balance
    if (riderWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance. Please add funds to your wallet.',
        currentBalance: riderWallet.balance,
        requiredAmount: amount
      });
    }

    // Get or create driver's wallet
    let driverWallet = await Wallet.findOne({ userId: driverId });
    if (!driverWallet) {
      driverWallet = await Wallet.createWallet(driverId, 'driver');
    }

    // Generate transaction reference
    const transactionReference = `RIDE_${rideId}_${Date.now()}`;

    // Create transaction for rider (payment out)
    const riderTransaction = {
      type: 'ride_payment',
      amount: amount,
      status: 'completed',
      description: `Payment for ride to ${driver.firstName} ${driver.lastName}`,
      metadata: {
        rideId: rideId,
        driverId: driverId,
        driverName: `${driver.firstName} ${driver.lastName}`,
        transactionReference: transactionReference
      },
      createdAt: new Date(),
      completedAt: new Date()
    };

    // Create transaction for driver (payment received)
    const driverTransaction = {
      type: 'ride_earning',
      amount: amount,
      status: 'completed',
      description: `Payment received from ${req.user.firstName} ${req.user.lastName}`,
      metadata: {
        rideId: rideId,
        riderId: req.user.id,
        riderName: `${req.user.firstName} ${req.user.lastName}`,
        transactionReference: transactionReference
      },
      createdAt: new Date(),
      completedAt: new Date()
    };

    // Update balances and add transactions
    riderWallet.balance -= amount;
    driverWallet.balance += amount;
    
    riderWallet.transactions.push(riderTransaction);
    driverWallet.transactions.push(driverTransaction);

    // Save both wallets
    await Promise.all([
      riderWallet.save(),
      driverWallet.save()
    ]);

    // Get the latest transactions
    const riderLatestTransaction = riderWallet.transactions[riderWallet.transactions.length - 1];
    const driverLatestTransaction = driverWallet.transactions[driverWallet.transactions.length - 1];

    console.log('💳 Ride payment completed successfully:', {
      rideId,
      rider: `${req.user.firstName} ${req.user.lastName}`,
      driver: `${driver.firstName} ${driver.lastName}`,
      amount,
      riderNewBalance: riderWallet.balance,
      driverNewBalance: driverWallet.balance
    });

    res.json({
      success: true,
      message: 'Ride payment completed successfully',
      data: {
        rideId: rideId,
        amount: amount,
        riderNewBalance: riderWallet.balance,
        driverNewBalance: driverWallet.balance,
        riderTransaction: riderLatestTransaction,
        driverTransaction: driverLatestTransaction,
        transactionReference: transactionReference
      }
    });
  } catch (error) {
    console.error('Error processing ride payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process ride payment',
      error: error.message
    });
  }
});

// Add payment method
router.post('/payment-methods', protect, async (req, res) => {
  try {
    const { type, accountNumber, accountName } = req.body;
    
    if (!type || !accountNumber || !accountName) {
      return res.status(400).json({
        success: false,
        message: 'Payment method details are required'
      });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      wallet = await Wallet.createWallet(req.user.id, req.user.role);
    }

    // Check if payment method already exists
    const existingMethod = wallet.paymentMethods.find(
      method => method.type === type && method.accountNumber === accountNumber
    );

    if (existingMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payment method already exists'
      });
    }

    // Add new payment method
    const newPaymentMethod = {
      type,
      accountNumber,
      accountName,
      isDefault: wallet.paymentMethods.length === 0, // First method becomes default
      isVerified: false
    };

    wallet.paymentMethods.push(newPaymentMethod);
    await wallet.save();

    res.json({
      success: true,
      message: 'Payment method added successfully',
      data: {
        paymentMethod: newPaymentMethod
      }
    });
  } catch (error) {
    console.error('Error adding payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add payment method',
      error: error.message
    });
  }
});

// Set default payment method
router.put('/payment-methods/:methodId/default', protect, async (req, res) => {
  try {
    const { methodId } = req.params;
    
    const wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Find the payment method
    const paymentMethod = wallet.paymentMethods.id(methodId);
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    // Remove default from all methods
    wallet.paymentMethods.forEach(method => {
      method.isDefault = false;
    });

    // Set new default
    paymentMethod.isDefault = true;
    await wallet.save();

    res.json({
      success: true,
      message: 'Default payment method updated',
      data: {
        paymentMethod: paymentMethod
      }
    });
  } catch (error) {
    console.error('Error updating default payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update default payment method',
      error: error.message
    });
  }
});

// Remove payment method
router.delete('/payment-methods/:methodId', protect, async (req, res) => {
  try {
    const { methodId } = req.params;
    
    const wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Find and remove the payment method
    const paymentMethod = wallet.paymentMethods.id(methodId);
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    // Check if it's the default method
    if (paymentMethod.isDefault && wallet.paymentMethods.length > 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove default payment method. Set another as default first.'
      });
    }

    paymentMethod.remove();
    await wallet.save();

    res.json({
      success: true,
      message: 'Payment method removed successfully'
    });
  } catch (error) {
    console.error('Error removing payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove payment method',
      error: error.message
    });
  }
});

// Get wallet statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Calculate statistics
    const totalDeposits = wallet.transactions
      .filter(t => t.type === 'deposit' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalWithdrawals = wallet.transactions
      .filter(t => t.type === 'withdrawal' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalTransfers = wallet.transactions
      .filter(t => t.type === 'transfer' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyTransactions = wallet.transactions
      .filter(t => {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return new Date(t.createdAt) >= monthAgo;
      });

    res.json({
      success: true,
      data: {
        currentBalance: wallet.balance,
        totalDeposits,
        totalWithdrawals,
        totalTransfers,
        monthlyTransactions: monthlyTransactions.length,
        dailyLimit: wallet.dailyLimit,
        monthlyLimit: wallet.monthlyLimit
      }
    });
  } catch (error) {
    console.error('Error fetching wallet stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet statistics',
      error: error.message
    });
  }
});

// Campay webhook endpoint
router.post('/campay-webhook', async (req, res) => {
  try {
    console.log('📡 Received Campay webhook:', req.body);
    
    // Process the webhook data
    const webhookData = campayService.processWebhook(req.body);
    
    if (!webhookData.success) {
      throw new Error('Failed to process webhook data');
    }

    const { externalReference, status, amount, phoneNumber } = webhookData;

    // Find the transaction by external reference
    const wallet = await Wallet.findOne({
      'transactions.metadata.externalReference': externalReference
    });

    if (!wallet) {
      console.error('❌ Wallet not found for external reference:', externalReference);
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Find the specific transaction
    const transaction = wallet.transactions.find(
      t => t.metadata.externalReference === externalReference
    );

    if (!transaction) {
      console.error('❌ Transaction not found for external reference:', externalReference);
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Update transaction status based on Campay response
    if (status === 'SUCCESSFUL') {
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      transaction.metadata.campayStatus = status;
      
      // Update wallet balance for deposits
      if (transaction.type === 'deposit') {
        await wallet.updateBalance(amount, 'deposit');
      }
      
      // Update wallet balance for withdrawals
      if (transaction.type === 'withdrawal') {
        await wallet.updateBalance(amount, 'withdrawal');
      }
      
      console.log('✅ Transaction completed successfully:', {
        externalReference,
        type: transaction.type,
        amount,
        newBalance: wallet.balance
      });
    } else if (status === 'FAILED') {
      transaction.status = 'failed';
      transaction.metadata.campayStatus = status;
      console.log('❌ Transaction failed:', { externalReference, status });
    } else {
      transaction.metadata.campayStatus = status;
      console.log('⏳ Transaction status updated:', { externalReference, status });
    }

    await wallet.save();

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Error processing Campay webhook:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process webhook',
      error: error.message 
    });
  }
});

// Check payment status
router.get('/payment-status/:externalReference', protect, async (req, res) => {
  try {
    const { externalReference } = req.params;
    
    // Find the transaction
    const wallet = await Wallet.findOne({
      'transactions.metadata.externalReference': externalReference
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = wallet.transactions.find(
      t => t.metadata.externalReference === externalReference
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // If transaction has Campay reference, check status with Campay
    if (transaction.metadata.campayReference) {
      try {
        const campayStatus = await campayService.getPaymentStatus(transaction.metadata.campayReference);
        transaction.metadata.campayStatus = campayStatus.status;
        await wallet.save();
      } catch (error) {
        console.error('Error checking Campay status:', error);
      }
    }

    res.json({
      success: true,
      data: {
        transaction: {
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          createdAt: transaction.createdAt,
          completedAt: transaction.completedAt,
          metadata: transaction.metadata
        }
      }
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message
    });
  }
});

module.exports = router;
