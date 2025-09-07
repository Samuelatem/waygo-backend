const axios = require('axios');

class CampayService {
  constructor() {
    this.baseURL = 'https://api.campay.net';
    this.appId = 'cnF3t_zZRssf4fDwyrwr_iKLIt7vy0G2L2NJaPL1Q-tc-Ts7QDCDRimz7omiiQ0jerG15EWdx0-NcQ9hv3Rh3A';
    this.appUsername = '2youV2_M0Ra7dFdXY4-geYd1wkTa2qEJzhrvx-JFidvKR1Ez2HBdxPr-8wDZtDgTuMg_rtrv0OU5ArnMFdvlVA';
    this.appPassword = 'ybNJWpJ0HdxaqebXvNIivYI3k4Z2eMJ8w_mnYZoBFETf3uuHuarBgsZdrQ8Pd9xk2-0n1JZj9W0WXrBbp7mDsQ';
    this.permanentAccessToken = '8c54d08638524a830e080208474e663014ba69b4';
    this.webhookKey = 'qlI6ojHh8iYGk1s5RTnOwLzoNuhwTtwkvh83DNc5KNCZPgiT-Nw5V2geGD9JpG3GS90dO4_gYreDA8RzOLzayA';
    
    // Initialize axios with default config
    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Token ${this.permanentAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get access token (if needed for some operations)
  async getAccessToken() {
    try {
      const response = await axios.post(`${this.baseURL}/token/`, {
        username: this.appUsername,
        password: this.appPassword
      });
      return response.data.access;
    } catch (error) {
      console.error('Error getting Campay access token:', error);
      throw error;
    }
  }

  // Collect payment from user (deposit to wallet)
  async collectPayment(amount, currency, phoneNumber, description, externalReference) {
    try {
      const paymentData = {
        amount: amount,
        currency: currency || 'XAF',
        phone_number: phoneNumber,
        description: description || 'Wallet deposit',
        external_reference: externalReference,
        callback_url: `${process.env.BASE_URL || 'http://localhost:5000'}/api/wallet/campay-webhook`
      };

      console.log('🚀 Initiating Campay payment collection:', paymentData);

      const response = await this.api.post('/collect/', paymentData);
      
      console.log('✅ Campay payment initiated successfully:', response.data);
      
      return {
        success: true,
        data: response.data,
        paymentId: response.data.reference,
        status: 'pending'
      };
    } catch (error) {
      console.error('❌ Error initiating Campay payment:', error.response?.data || error.message);
      throw new Error(`Campay payment failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Withdraw money to user's account
  async withdrawPayment(amount, currency, phoneNumber, description, externalReference) {
    try {
      const withdrawalData = {
        amount: amount,
        currency: currency || 'XAF',
        phone_number: phoneNumber,
        description: description || 'Wallet withdrawal',
        external_reference: externalReference
      };

      console.log('🚀 Initiating Campay withdrawal:', withdrawalData);

      const response = await this.api.post('/withdraw/', withdrawalData);
      
      console.log('✅ Campay withdrawal initiated successfully:', response.data);
      
      return {
        success: true,
        data: response.data,
        withdrawalId: response.data.reference,
        status: 'pending'
      };
    } catch (error) {
      console.error('❌ Error initiating Campay withdrawal:', error.response?.data || error.message);
      throw new Error(`Campay withdrawal failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get payment status
  async getPaymentStatus(paymentId) {
    try {
      const response = await this.api.get(`/transaction/${paymentId}/`);
      return {
        success: true,
        data: response.data,
        status: response.data.status
      };
    } catch (error) {
      console.error('❌ Error getting payment status:', error.response?.data || error.message);
      throw new Error(`Failed to get payment status: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get all transactions
  async getTransactions(page = 1, limit = 50) {
    try {
      const response = await this.api.get(`/transactions/?page=${page}&limit=${limit}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Error getting transactions:', error.response?.data || error.message);
      throw new Error(`Failed to get transactions: ${error.response?.data?.message || error.message}`);
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    // In a real implementation, you would verify the webhook signature
    // For now, we'll trust the webhook (you should implement proper verification)
    return true;
  }

  // Process webhook data
  processWebhook(webhookData) {
    try {
      const {
        reference,
        status,
        amount,
        currency,
        phone_number,
        external_reference,
        description
      } = webhookData;

      console.log('📡 Processing Campay webhook:', {
        reference,
        status,
        amount,
        currency,
        phone_number,
        external_reference
      });

      return {
        success: true,
        paymentId: reference,
        status: status,
        amount: amount,
        currency: currency,
        phoneNumber: phone_number,
        externalReference: external_reference,
        description: description
      };
    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      throw error;
    }
  }

  // Get supported payment methods
  async getSupportedPaymentMethods() {
    try {
      const response = await this.api.get('/payment-methods/');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Error getting payment methods:', error.response?.data || error.message);
      // Return default payment methods if API fails
      return {
        success: true,
        data: [
          {
            id: 'mtn_momo',
            name: 'MTN Mobile Money',
            type: 'mobile_money',
            country: 'CM'
          },
          {
            id: 'orange_money',
            name: 'Orange Money',
            type: 'mobile_money',
            country: 'CM'
          },
          {
            id: 'card',
            name: 'Credit/Debit Card',
            type: 'card',
            country: 'CM'
          }
        ]
      };
    }
  }

  // Get account balance
  async getAccountBalance() {
    try {
      const response = await this.api.get('/account/balance/');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Error getting account balance:', error.response?.data || error.message);
      throw new Error(`Failed to get account balance: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new CampayService();
