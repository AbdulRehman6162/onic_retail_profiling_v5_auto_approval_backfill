// --- BDO Verification Service ---
import { 
    doc, 
    getDoc, 
    collection,
    query,
    where,
    getDocs
} from 'firebase/firestore';

/**
 * Service for verifying BDO/Retailer information and finding associated devices
 */
export class BDOVerificationService {
    constructor(db, actionLogger) {
        this.db = db;
        this.actionLogger = actionLogger;
    }

    /**
     * Normalize phone number to last 10 digits for comparison
     * Handles formats: 923346234623, +923346234623, 03346234623
     */
    normalizePhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        
        // Remove all non-digit characters and get string version
        const digitsOnly = phoneNumber.toString().replace(/\D/g, '');
        
        // Get last 10 digits (the actual mobile number part)
        return digitsOnly.slice(-10);
    }

    /**
     * Verify BDO by ID and validate CNIC and current OTP number
     */
    async verifyBDO(bdoId, cnicNumber, currentOtpNumber) {
        try {
            console.log(`🔍 Verifying BDO: ${bdoId} with CNIC: ${cnicNumber}`);

            // Query BDO account by bdoId field (not document ID)
            const bdoQuery = query(
                collection(this.db, 'bdoAccounts'),
                where('bdoId', '==', bdoId)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);

            if (bdoSnapshot.empty) {
                console.log(`❌ BDO not found with bdoId: ${bdoId}`);
                return {
                    success: false,
                    error: 'BDO/Retailer not found',
                    errorCode: 'BDO_NOT_FOUND'
                };
            }

            // Get the first (should be only) matching document
            const bdoDoc = bdoSnapshot.docs[0];
            const bdoData = bdoDoc.data();
            
            console.log(`✅ Found BDO: ${bdoData.name} (${bdoData.bdoId})`);

            // Verify CNIC number - check both 'cnic' and 'cnicNumber' fields
            const storedCnic = bdoData.cnicNumber || bdoData.cnic;
            if (storedCnic !== cnicNumber) {
                console.log(`❌ CNIC mismatch. Expected: ${storedCnic}, Got: ${cnicNumber}`);
                
                // Log failed verification attempt
                if (this.actionLogger) {
                    await this.actionLogger.logAction({
                        type: 'VERIFICATION_FAILED',
                        description: 'BDO CNIC verification failed',
                        category: 'SECURITY',
                        severity: 'WARNING',
                        context: {
                            bdoId,
                            attemptedCnic: cnicNumber,
                            storedCnic: storedCnic,
                            reason: 'CNIC_MISMATCH'
                        }
                    });
                }

                return {
                    success: false,
                    error: 'CNIC number does not match',
                    errorCode: 'CNIC_MISMATCH'
                };
            }

            // Verify current OTP number - normalize both to last 10 digits
            const storedOtpNormalized = this.normalizePhoneNumber(bdoData.otpMobileNumber);
            const inputOtpNormalized = this.normalizePhoneNumber(currentOtpNumber);
            
            if (storedOtpNormalized !== inputOtpNormalized) {
                console.log(`❌ OTP mismatch. Expected: ${bdoData.otpMobileNumber} (normalized: ${storedOtpNormalized}), Got: ${currentOtpNumber} (normalized: ${inputOtpNormalized})`);
                
                // Log failed verification attempt
                if (this.actionLogger) {
                    await this.actionLogger.logAction({
                        type: 'VERIFICATION_FAILED',
                        description: 'BDO OTP number verification failed',
                        category: 'SECURITY',
                        severity: 'WARNING',
                        context: {
                            bdoId,
                            storedOtp: bdoData.otpMobileNumber,
                            inputOtp: currentOtpNumber,
                            storedNormalized: storedOtpNormalized,
                            inputNormalized: inputOtpNormalized,
                            reason: 'OTP_MISMATCH'
                        }
                    });
                }

                return {
                    success: false,
                    error: 'Current OTP number does not match',
                    errorCode: 'OTP_MISMATCH'
                };
            }

            // Log successful verification
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'VERIFICATION_SUCCESS',
                    description: `BDO ${bdoId} successfully verified for OTP change`,
                    category: 'SECURITY',
                    severity: 'INFO',
                    context: {
                        bdoId,
                        bdoName: bdoData.name
                    }
                });
            }

            console.log(`✅ BDO verification successful for: ${bdoData.name}`);

            return {
                success: true,
                bdoData: {
                    id: bdoId,
                    documentId: bdoDoc.id, // Store the actual Firestore document ID
                    name: bdoData.name,
                    cnicNumber: storedCnic,
                    otpMobileNumber: bdoData.otpMobileNumber,
                    franchiseId: bdoData.franchiseId || bdoData.franchiseCode,
                    franchiseName: bdoData.franchiseName,
                    shopDetails: bdoData.shopDetails || {},
                    otpChangeCount: bdoData.otpChangeCount || 0,
                    otpChangeHistory: bdoData.otpChangeHistory || []
                }
            };

        } catch (error) {
            console.error('❌ Error verifying BDO:', error);
            
            if (this.actionLogger) {
                await this.actionLogger.logError(error, {
                    action: 'verifyBDO',
                    bdoId,
                    context: 'BDO verification for OTP change'
                });
            }

            return {
                success: false,
                error: 'Verification failed due to system error',
                errorCode: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Find device assigned to a specific BDO
     */
    async findBDOAssignedDevice(bdoId) {
        try {
            console.log(`🔍 Finding device assigned to BDO: ${bdoId}`);

            // Query devices collection for devices assigned to this BDO
            // Updated to use correct field structure from DeviceCollectionService
            const devicesQuery = query(
                collection(this.db, 'devices'),
                where('bdoId', '==', bdoId),  // Fixed: Use direct bdoId field, not nested
                where('status', '==', 'Mapped')
            );

            const devicesSnapshot = await getDocs(devicesQuery);

            if (devicesSnapshot.empty) {
                console.log(`❌ No mapped device found for BDO: ${bdoId}`);
                return {
                    success: false,
                    error: 'No active device found for this BDO/Retailer',
                    errorCode: 'NO_DEVICE_FOUND'
                };
            }

            // Handle multiple devices (should be rare but possible during transition periods)
            if (devicesSnapshot.docs.length > 1) {
                console.warn(`⚠️ Multiple devices found for BDO ${bdoId}. Count: ${devicesSnapshot.docs.length}`);
                // Log this for investigation
                if (this.actionLogger) {
                    await this.actionLogger.logAction({
                        type: 'MULTIPLE_DEVICES_WARNING',
                        description: `BDO ${bdoId} has multiple mapped devices`,
                        category: 'DATA_INTEGRITY',
                        severity: 'WARNING',
                        context: {
                            bdoId,
                            deviceCount: devicesSnapshot.docs.length,
                            imeiList: devicesSnapshot.docs.map(doc => doc.id)
                        }
                    });
                }
            }

            // Take the first device (or most recently updated if we want to be smart about it)
            const deviceDoc = devicesSnapshot.docs[0];
            const deviceData = deviceDoc.data();

            console.log(`✅ Found device for BDO ${bdoId}: IMEI ${deviceDoc.id}`);

            // Create coordinates object from latitude/longitude fields
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

        } catch (error) {
            console.error('❌ Error finding BDO assigned device:', error);
            
            // Safe error logging - check if actionLogger exists
            if (this.actionLogger) {
                try {
                    await this.actionLogger.logError(error, {
                        action: 'findBDOAssignedDevice',
                        bdoId,
                        context: 'Finding device for OTP change'
                    });
                } catch (logError) {
                    console.error('❌ Error logging to actionLogger:', logError);
                }
            }

            return {
                success: false,
                error: 'Failed to find assigned device',
                errorCode: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Validate new OTP number format (supports multiple Pakistani formats)
     */
    validateOTPNumberFormat(otpNumber) {
        if (!otpNumber) {
            return {
                valid: false,
                error: 'OTP number is required'
            };
        }

        // Remove all non-digit characters
        const digitsOnly = otpNumber.replace(/\D/g, '');
        
        // Check various Pakistani mobile formats:
        // 03xxxxxxxxx (11 digits)
        // 923xxxxxxxxx (12 digits) 
        // +923xxxxxxxxx (12 digits with +)
        const validFormats = [
            /^03[0-9]{9}$/, // 03xxxxxxxxx
            /^923[0-9]{9}$/, // 923xxxxxxxxx
            /^\+923[0-9]{9}$/ // +923xxxxxxxxx
        ];

        const isValidFormat = validFormats.some(regex => regex.test(otpNumber)) || 
                             (digitsOnly.length === 10 && digitsOnly.startsWith('3')); // Last 10 digits starting with 3

        if (!isValidFormat) {
            return {
                valid: false,
                error: 'Invalid mobile number format. Please use Pakistani mobile number format (03xxxxxxxxx, 923xxxxxxxxx, or +923xxxxxxxxx)'
            };
        }

        // Ensure the last 10 digits start with 3 (Pakistani mobile pattern)
        const last10Digits = digitsOnly.slice(-10);
        if (!last10Digits.startsWith('3')) {
            return {
                valid: false,
                error: 'Invalid Pakistani mobile number. Mobile numbers should start with 03...'
            };
        }

        return { valid: true };
    }

    /**
     * Check if new OTP number is different from current (normalize both)
     */
     validateOTPNumberChange(currentOtp, newOtp) {
        const currentNormalized = this.normalizePhoneNumber(currentOtp);
        const newNormalized = this.normalizePhoneNumber(newOtp);
        
        if (currentNormalized === newNormalized) {
            return {
                valid: false,
                error: 'New OTP number must be different from current OTP number'
            };
        }

        return { valid: true };
    }

    /**
     * Get BDO details by ID (for form population)
     */
    async getBDOById(bdoId) {
        try {
            console.log(`🔍 Getting BDO details for: ${bdoId}`);
            
            // Query BDO account by bdoId field (not document ID)
            const bdoQuery = query(
                collection(this.db, 'bdoAccounts'),
                where('bdoId', '==', bdoId)
            );
            
            const bdoSnapshot = await getDocs(bdoQuery);

            if (bdoSnapshot.empty) {
                console.log(`❌ BDO not found with bdoId: ${bdoId}`);
                return {
                    success: false,
                    error: 'BDO/Retailer not found'
                };
            }

            // Get the first (should be only) matching document
            const bdoDoc = bdoSnapshot.docs[0];
            const bdoData = bdoDoc.data();
            
            console.log(`✅ Found BDO: ${bdoData.name} (${bdoData.bdoId})`);
            
            return {
                success: true,
                bdo: {
                    id: bdoId,
                    documentId: bdoDoc.id, // Store the actual Firestore document ID
                    name: bdoData.name,
                    cnicNumber: bdoData.cnicNumber || bdoData.cnic,
                    otpMobileNumber: bdoData.otpMobileNumber,
                    franchiseId: bdoData.franchiseId || bdoData.franchiseCode,
                    franchiseName: bdoData.franchiseName,
                    shopDetails: bdoData.shopDetails || {}
                }
            };

        } catch (error) {
            console.error('❌ Error getting BDO details:', error);
            return {
                success: false,
                error: 'Failed to retrieve BDO details'
            };
        }
    }

    /**
     * Get all devices assigned to a BDO (for comprehensive view)
     * Useful for admin panels or debugging
     */
    async getAllBDODevices(bdoId, includeDeactivated = false) {
        try {
            console.log(`🔍 Getting all devices for BDO: ${bdoId} (includeDeactivated: ${includeDeactivated})`);

            let devicesQuery;
            
            if (includeDeactivated) {
                // Get all devices regardless of status
                devicesQuery = query(
                    collection(this.db, 'devices'),
                    where('bdoId', '==', bdoId)
                );
            } else {
                // Get only mapped devices
                devicesQuery = query(
                    collection(this.db, 'devices'),
                    where('bdoId', '==', bdoId),
                    where('status', '==', 'Mapped')
                );
            }

            const devicesSnapshot = await getDocs(devicesQuery);

            if (devicesSnapshot.empty) {
                console.log(`ℹ️ No devices found for BDO: ${bdoId}`);
                return {
                    success: true,
                    devices: [],
                    count: 0
                };
            }

            const devices = devicesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    imei: doc.id,
                    status: data.status,
                    otpMobileNumber: data.otpMobileNumber,
                    bdoName: data.bdoName,
                    shopName: data.shopName,
                    city: data.city,
                    createdAt: data.createdAt,
                    lastUpdatedAt: data.lastUpdatedAt,
                    coordinates: (data.latitude && data.longitude) ? {
                        latitude: data.latitude,
                        longitude: data.longitude
                    } : null
                };
            });

            console.log(`✅ Found ${devices.length} devices for BDO ${bdoId}`);

            return {
                success: true,
                devices: devices,
                count: devices.length
            };

        } catch (error) {
            console.error('❌ Error getting BDO devices:', error);
            
            if (this.actionLogger) {
                try {
                    await this.actionLogger.logError(error, {
                        action: 'getAllBDODevices',
                        bdoId,
                        context: 'Getting all devices for BDO'
                    });
                } catch (logError) {
                    console.error('❌ Error logging to actionLogger:', logError);
                }
            }

            return {
                success: false,
                error: 'Failed to retrieve BDO devices'
            };
        }
    }
}

export default BDOVerificationService;
