/**
 * OTP Change Workflow Test Utility
 * 
 * This utility helps verify that BDO accounts are properly updated
 * when OTP change requests are completed by the operations team.
 * 
 * Usage:
 * 1. Run this in browser console on your Firebase project
 * 2. Or integrate into your testing suite
 */

class OTPChangeVerifier {
    constructor(db) {
        this.db = db;
    }

    /**
     * Verify BDO account OTP status and history
     */
    async verifyBDOAccount(bdoId, bdoDocumentId = null) {
        try {
            console.log(`🔍 Checking BDO account OTP status for ID: ${bdoId}`);
            
            const { doc, getDoc } = await import('firebase/firestore');
            
            // Use document ID if provided, otherwise use bdoId
            const bdoRef = bdoDocumentId ? 
                doc(this.db, 'bdoAccounts', bdoDocumentId) : 
                doc(this.db, 'bdoAccounts', bdoId);
            
            const bdoDoc = await getDoc(bdoRef);
            
            if (!bdoDoc.exists()) {
                console.error(`❌ BDO account not found: ${bdoId}`);
                return null;
            }
            
            const bdoData = bdoDoc.data();
            
            console.log(`✅ BDO Account Found: ${bdoId}`);
            console.log(`📱 Current OTP: ${bdoData.otpMobileNumber}`);
            console.log(`🔄 Change Count: ${bdoData.otpChangeCount || 0}`);
            
            if (bdoData.lastOtpChange) {
                console.log(`📊 Last Change:`, {
                    from: bdoData.lastOtpChange.previousNumber,
                    to: bdoData.lastOtpChange.newNumber,
                    date: bdoData.lastOtpChange.changeDate?.toDate?.() || bdoData.lastOtpChange.changeDate,
                    request: bdoData.lastOtpChange.requestNumber
                });
            }
            
            if (bdoData.otpChangeHistory && bdoData.otpChangeHistory.length > 0) {
                console.log(`📚 Change History (${bdoData.otpChangeHistory.length} entries):`);
                bdoData.otpChangeHistory.forEach((change, index) => {
                    console.log(`  ${index + 1}. ${change.previousOtp} → ${change.newOtp} (${change.requestNumber})`);
                });
            } else {
                console.log(`📚 No OTP change history found`);
            }
            
            return {
                bdoId,
                currentOtp: bdoData.otpMobileNumber,
                changeCount: bdoData.otpChangeCount || 0,
                lastChange: bdoData.lastOtpChange,
                history: bdoData.otpChangeHistory || [],
                updatedAt: bdoData.updatedAt?.toDate?.() || bdoData.updatedAt
            };
            
        } catch (error) {
            console.error(`❌ Error verifying BDO account:`, error);
            return null;
        }
    }

    /**
     * Check device collection alignment with BDO account
     */
    async verifyDeviceAlignment(bdoId) {
        try {
            console.log(`🔍 Checking device collection alignment for BDO: ${bdoId}`);
            
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            
            const devicesQuery = query(
                collection(this.db, 'devices'),
                where('bdoId', '==', bdoId)
            );
            
            const devicesSnapshot = await getDocs(devicesQuery);
            
            if (devicesSnapshot.empty) {
                console.warn(`⚠️ No devices found for BDO: ${bdoId}`);
                return [];
            }
            
            const devices = [];
            devicesSnapshot.forEach(doc => {
                const deviceData = doc.data();
                devices.push({
                    imei: deviceData.imei,
                    currentOtp: deviceData.currentOtpNumber,
                    status: deviceData.status,
                    mappingDate: deviceData.mappingDate?.toDate?.() || deviceData.mappingDate
                });
                
                console.log(`📱 Device ${deviceData.imei}: OTP = ${deviceData.currentOtpNumber}, Status = ${deviceData.status}`);
            });
            
            return devices;
            
        } catch (error) {
            console.error(`❌ Error verifying device alignment:`, error);
            return [];
        }
    }

    /**
     * Compare BDO account OTP with device collection OTPs
     */
    async verifyOTPConsistency(bdoId, bdoDocumentId = null) {
        try {
            console.log(`🔄 Verifying OTP consistency for BDO: ${bdoId}`);
            
            // Get BDO account data
            const bdoData = await this.verifyBDOAccount(bdoId, bdoDocumentId);
            if (!bdoData) {
                console.error(`❌ Could not verify BDO account`);
                return false;
            }
            
            // Get device data
            const devices = await this.verifyDeviceAlignment(bdoId);
            if (devices.length === 0) {
                console.warn(`⚠️ No devices to compare`);
                return true; // No inconsistency if no devices
            }
            
            // Compare OTPs
            const bdoOtp = bdoData.currentOtp;
            let consistent = true;
            
            devices.forEach(device => {
                if (device.currentOtp !== bdoOtp) {
                    console.error(`❌ OTP Mismatch - Device ${device.imei}: ${device.currentOtp} vs BDO: ${bdoOtp}`);
                    consistent = false;
                } else {
                    console.log(`✅ OTP Match - Device ${device.imei}: ${device.currentOtp}`);
                }
            });
            
            if (consistent) {
                console.log(`✅ All OTPs are consistent for BDO: ${bdoId}`);
            } else {
                console.error(`❌ OTP inconsistencies found for BDO: ${bdoId}`);
            }
            
            return consistent;
            
        } catch (error) {
            console.error(`❌ Error verifying OTP consistency:`, error);
            return false;
        }
    }

    /**
     * Check if an OTP number is already in use
     */
    async checkOTPUsage(otpNumber) {
        try {
            console.log(`🔍 Checking if OTP ${otpNumber} is already in use...`);
            
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            
            const bdoQuery = query(
                collection(this.db, 'bdoAccounts'),
                where('otpMobileNumber', '==', otpNumber)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);
            
            if (bdoSnapshot.empty) {
                console.log(`✅ OTP ${otpNumber} is available`);
                return { inUse: false, bdoCount: 0, bdos: [] };
            }
            
            const usedBy = [];
            bdoSnapshot.forEach(doc => {
                const bdoData = doc.data();
                usedBy.push({
                    bdoId: bdoData.bdoId,
                    name: bdoData.name,
                    documentId: doc.id,
                    lastUpdated: bdoData.updatedAt?.toDate?.() || bdoData.updatedAt
                });
            });
            
            console.warn(`⚠️ OTP ${otpNumber} is already in use by ${usedBy.length} BDO(s):`);
            usedBy.forEach(bdo => {
                console.log(`  - ${bdo.bdoId} (${bdo.name})`);
            });
            
            return { inUse: true, bdoCount: usedBy.length, bdos: usedBy };
            
        } catch (error) {
            console.error(`❌ Error checking OTP usage:`, error);
            return { inUse: false, error: error.message };
        }
    }

    /**
     * Full workflow verification
     */
    async fullVerification(bdoId, bdoDocumentId = null) {
        console.log(`🚀 Starting full OTP change workflow verification for BDO: ${bdoId}`);
        console.log(`========================================`);
        
        try {
            // Step 1: BDO Account Status
            const bdoData = await this.verifyBDOAccount(bdoId, bdoDocumentId);
            if (!bdoData) return false;
            
            console.log(`\n========================================`);
            
            // Step 2: Device Alignment  
            await this.verifyDeviceAlignment(bdoId);
            
            console.log(`\n========================================`);
            
            // Step 3: OTP Consistency
            const consistent = await this.verifyOTPConsistency(bdoId, bdoDocumentId);
            
            console.log(`\n========================================`);
            
            // Step 4: Current OTP Usage Check
            if (bdoData.currentOtp) {
                await this.checkOTPUsage(bdoData.currentOtp);
            }
            
            console.log(`\n========================================`);
            console.log(`🏁 Verification Complete for BDO: ${bdoId}`);
            console.log(`✅ Status: ${consistent ? 'PASSED' : 'FAILED'}`);
            
            return consistent;
            
        } catch (error) {
            console.error(`❌ Full verification failed:`, error);
            return false;
        }
    }
}

// Export for use in browser console or testing
if (typeof window !== 'undefined') {
    window.OTPChangeVerifier = OTPChangeVerifier;
    console.log(`🔧 OTPChangeVerifier loaded. Usage: new OTPChangeVerifier(db).fullVerification('BDO_ID')`);
}

export default OTPChangeVerifier;
