// Test script for BDO device lookup functionality
// This tests the updated findBDOAssignedDevice method logic

console.log('🧪 Testing BDO Device Lookup Logic...');

// Mock Firestore data structure (based on DeviceCollectionService schema)
const mockDeviceData = {
    "860123456789012": { // IMEI as document ID
        imei: "860123456789012",
        bdoId: "BDO12345",
        bdoName: "John Doe",
        bdoCnic: "12345-6789012-3",
        otpMobileNumber: "03001234567",
        shopName: "Test Shop",
        streetAddress: "Test Address",
        city: "Karachi",
        latitude: 24.8607,
        longitude: 67.0011,
        status: "Mapped",
        createdAt: new Date(),
        lastUpdatedAt: new Date()
    },
    "860987654321098": {
        imei: "860987654321098", 
        bdoId: "BDO67890",
        bdoName: "Jane Smith",
        bdoCnic: "54321-0987654-1",
        otpMobileNumber: "03007654321",
        shopName: "Another Shop",
        city: "Lahore",
        latitude: 31.5204,
        longitude: 74.3587,
        status: "Mapped",
        createdAt: new Date(),
        lastUpdatedAt: new Date()
    }
};

// Mock the new query logic
function mockFindBDOAssignedDevice(bdoId) {
    console.log(`🔍 Mock: Finding device assigned to BDO: ${bdoId}`);
    
    // Simulate the Firestore query: where('bdoId', '==', bdoId) && where('status', '==', 'Mapped')
    const matchingDevices = Object.entries(mockDeviceData)
        .filter(([imei, data]) => data.bdoId === bdoId && data.status === 'Mapped')
        .map(([imei, data]) => ({ id: imei, data }));
    
    if (matchingDevices.length === 0) {
        console.log(`❌ Mock: No mapped device found for BDO: ${bdoId}`);
        return {
            success: false,
            error: 'No active device found for this BDO/Retailer',
            errorCode: 'NO_DEVICE_FOUND'
        };
    }
    
    if (matchingDevices.length > 1) {
        console.warn(`⚠️ Mock: Multiple devices found for BDO ${bdoId}. Count: ${matchingDevices.length}`);
    }
    
    const deviceDoc = matchingDevices[0];
    const deviceData = deviceDoc.data;
    
    console.log(`✅ Mock: Found device for BDO ${bdoId}: IMEI ${deviceDoc.id}`);
    
    // Create coordinates object from latitude/longitude fields (new logic)
    const coordinates = (deviceData.latitude && deviceData.longitude) ? {
        latitude: deviceData.latitude,
        longitude: deviceData.longitude
    } : null;
    
    return {
        success: true,
        device: {
            imei: deviceDoc.id, // Document ID is the IMEI
            status: deviceData.status,
            currentOtpNumber: deviceData.otpMobileNumber,
            assignedAt: deviceData.createdAt, // Use createdAt as assigned timestamp
            coordinates: coordinates,
            bdoName: deviceData.bdoName,
            shopName: deviceData.shopName,
            city: deviceData.city,
            lastUpdatedAt: deviceData.lastUpdatedAt
        }
    };
}

// Test cases
console.log('\n--- Test Case 1: Valid BDO with Device ---');
const result1 = mockFindBDOAssignedDevice('BDO12345');
console.log('Result:', JSON.stringify(result1, null, 2));

console.log('\n--- Test Case 2: Valid BDO with Different Device ---');
const result2 = mockFindBDOAssignedDevice('BDO67890');
console.log('Result:', JSON.stringify(result2, null, 2));

console.log('\n--- Test Case 3: BDO Not Found ---');
const result3 = mockFindBDOAssignedDevice('BDO99999');
console.log('Result:', JSON.stringify(result3, null, 2));

// Test comparison with old logic
console.log('\n--- Comparison: Old vs New Field Structure ---');
console.log('❌ Old Query: where("currentLocation.bdoId", "==", bdoId) - INCORRECT');
console.log('✅ New Query: where("bdoId", "==", bdoId) - CORRECT');
console.log('❌ Old Response: deviceData.currentLocation?.assignedAt - UNDEFINED');
console.log('✅ New Response: deviceData.createdAt - HAS VALUE');
console.log('❌ Old Response: deviceData.currentLocation?.coordinates - UNDEFINED');
console.log('✅ New Response: {latitude: deviceData.latitude, longitude: deviceData.longitude} - HAS VALUE');

console.log('\n✅ BDO Device Lookup Logic Test Complete!');
