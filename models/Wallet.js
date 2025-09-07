const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'transfer', 'ride_payment', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'FCFA'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  description: {
    type: String,
    required: true
  },
  reference: {
    type: String,
    unique: true
  },
  metadata: {
    // For ride payments
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride'
    },
    // For transfers
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // For deposits/withdrawals
    paymentMethod: String,
    transactionId: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
});

const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  userRole: {
    type: String,
    enum: ['rider', 'driver'],
    required: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'FCFA'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  transactions: [TransactionSchema],
  // Payment methods
  paymentMethods: [{
    type: {
      type: String,
      enum: ['mtn_momo', 'orange_money', 'card', 'bank'],
      required: true
    },
    accountNumber: String,
    accountName: String,
    isDefault: {
      type: Boolean,
      default: false
    },
    isVerified: {
      type: Boolean,
      default: false
    }
  }],
  // Security settings
  dailyLimit: {
    type: Number,
    default: 100000 // 100,000 FCFA daily limit
  },
  monthlyLimit: {
    type: Number,
    default: 2000000 // 2,000,000 FCFA monthly limit
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
WalletSchema.index({ userId: 1 });
WalletSchema.index({ 'transactions.createdAt': -1 });
WalletSchema.index({ 'transactions.status': 1 });

// Pre-save middleware to update timestamp
WalletSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Generate unique reference for transactions
TransactionSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
  }
  next();
});

// Instance methods
WalletSchema.methods.addTransaction = function(transactionData) {
  this.transactions.push(transactionData);
  return this.save();
};

WalletSchema.methods.updateBalance = function(amount, type) {
  if (type === 'deposit' || type === 'transfer' || type === 'refund') {
    this.balance += amount;
  } else if (type === 'withdrawal' || type === 'ride_payment') {
    if (this.balance >= amount) {
      this.balance -= amount;
    } else {
      throw new Error('Insufficient balance');
    }
  }
  return this.save();
};

WalletSchema.methods.canWithdraw = function(amount) {
  return this.balance >= amount && this.isActive;
};

// Static methods
WalletSchema.statics.createWallet = function(userId, userRole) {
  return this.create({
    userId,
    userRole,
    balance: 0,
    transactions: []
  });
};

WalletSchema.statics.transferFunds = async function(fromUserId, toUserId, amount, rideId = null) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get both wallets
    const fromWallet = await this.findOne({ userId: fromUserId }).session(session);
    const toWallet = await this.findOne({ userId: toUserId }).session(session);

    if (!fromWallet || !toWallet) {
      throw new Error('One or both wallets not found');
    }

    if (!fromWallet.canWithdraw(amount)) {
      throw new Error('Insufficient balance or wallet inactive');
    }

    // Create transfer transaction for sender
    const fromTransaction = {
      type: 'transfer',
      amount: amount,
      status: 'completed',
      description: `Transfer to ${toWallet.userRole}`,
      metadata: {
        toUserId: toUserId,
        rideId: rideId
      },
      completedAt: new Date()
    };

    // Create transfer transaction for receiver
    const toTransaction = {
      type: 'transfer',
      amount: amount,
      status: 'completed',
      description: `Payment from ${fromWallet.userRole}`,
      metadata: {
        fromUserId: fromUserId,
        rideId: rideId
      },
      completedAt: new Date()
    };

    // Update balances and add transactions
    await fromWallet.updateBalance(amount, 'ride_payment');
    await toWallet.updateBalance(amount, 'transfer');
    
    fromWallet.transactions.push(fromTransaction);
    toWallet.transactions.push(toTransaction);

    await fromWallet.save({ session });
    await toWallet.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      fromWallet: fromWallet.balance,
      toWallet: toWallet.balance,
      transactionId: fromTransaction.reference
    };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

module.exports = mongoose.model('Wallet', WalletSchema);
