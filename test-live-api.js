const fetch = require('node-fetch');

const testLiveAPI = async () => {
  try {
    // You'll need to get a real JWT token from your app
    // For now, let's just test if the endpoint is accessible
    const response = await fetch('https://waygo-backend-production.up.railway.app/health');
    const data = await response.json();
    
    console.log('🌐 Backend health check:', data);
    console.log('✅ Backend is accessible');
    
    // Test if the endpoint exists (will get 401 without token, but that's expected)
    const statsResponse = await fetch('https://waygo-backend-production.up.railway.app/api/users/driver-stats');
    console.log('📊 Driver stats endpoint status:', statsResponse.status);
    
    if (statsResponse.status === 401) {
      console.log('✅ Endpoint exists (401 = needs authentication)');
    } else {
      console.log('❌ Unexpected status:', statsResponse.status);
    }
    
  } catch (error) {
    console.error('❌ Error testing live API:', error.message);
  }
};

testLiveAPI();