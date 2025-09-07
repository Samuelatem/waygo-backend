// Test script for Cameroonian license plate validation
const testLicensePlates = () => {
  console.log('🚗 Testing Cameroonian License Plate Validation\n');

  // Test cases
  const testCases = [
    { plate: 'LT 1234 AB', region: 'LT', expected: true, description: 'Valid Douala plate' },
    { plate: 'CE 5678 CD', region: 'CE', expected: true, description: 'Valid Yaoundé plate' },
    { plate: 'NW 9012 EF', region: 'NW', expected: true, description: 'Valid Bamenda plate' },
    { plate: 'AD 3456 GHI', region: 'AD', expected: true, description: 'Valid 3-letter plate' },
    { plate: 'LT 123 AB', region: 'LT', expected: false, description: 'Invalid - missing digit' },
    { plate: 'LT 12345 AB', region: 'LT', expected: false, description: 'Invalid - too many digits' },
    { plate: 'LT 1234 A', region: 'LT', expected: false, description: 'Invalid - only 1 letter' },
    { plate: 'LT 1234 ABCD', region: 'LT', expected: false, description: 'Invalid - too many letters' },
    { plate: 'XX 1234 AB', region: 'XX', expected: false, description: 'Invalid region code' },
    { plate: 'LT 1234 AB', region: 'CE', expected: false, description: 'Region mismatch' },
    { plate: 'lt 1234 ab', region: 'LT', expected: true, description: 'Lowercase should work' },
    { plate: 'LT1234AB', region: 'LT', expected: true, description: 'No spaces should work' }
  ];

  // Validation function (same as in the backend)
  const validateLicensePlate = (plate, region) => {
    if (!plate || !region) return false;
    
    // Remove spaces and convert to uppercase
    const cleanPlate = plate.replace(/\s/g, '').toUpperCase();
    
    // Format: [Region Code][4 digits][2-3 letters]
    const plateRegex = new RegExp(`^${region}\\d{4}[A-Z]{2,3}$`);
    
    return plateRegex.test(cleanPlate);
  };

  // Run tests
  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    const result = validateLicensePlate(testCase.plate, testCase.region);
    const status = result === testCase.expected ? '✅ PASS' : '❌ FAIL';
    
    console.log(`${index + 1}. ${status} - ${testCase.description}`);
    console.log(`   Plate: "${testCase.plate}" | Region: ${testCase.region}`);
    console.log(`   Expected: ${testCase.expected} | Got: ${result}`);
    
    if (result === testCase.expected) {
      passed++;
    } else {
      failed++;
    }
    console.log('');
  });

  // Summary
  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! License plate validation is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the validation logic.');
  }
};

// Run the tests
testLicensePlates();
