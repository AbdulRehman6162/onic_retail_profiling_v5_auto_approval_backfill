// --- OTP Change Data Service ---
import BDOVerificationService from './bdoVerificationService';
import { DeviceCollectionService } from './deviceCollectionService';

/**
 * Service for managing OTP change request data consistency
 * Integrates with devices collection as single source of truth
 */
export class OTPChangeDataService {
    constructor(db, actionLogger) {
        this.db = db;
        this.actionLogger = actionLogger;
        this.bdoService = new BDOVerificationService(db, actionLogger);
        this.deviceService = new DeviceCollectionService(db, actionLogger);
    }

    /**
     * Get comprehensive BDO and device data for OTP change
     * Uses devices collection as primary source with BDO collection as fallback
     */
    async getBDOWithDeviceData(bdoId) {
        try {
            console.log(`🔍 [OTPChangeDataService] Getting comprehensive data for BDO: ${bdoId}`);

            // First, get device data from devices collection (primary source)
            const deviceResult = await this.bdoService.findBDOAssignedDevice(bdoId);
            
            if (!deviceResult.success) {
                console.log(`❌ [OTPChangeDataService] No device found for BDO ${bdoId}`);
                return {
                    success: false,
                    error: deviceResult.error,
                    errorCode: deviceResult.errorCode
                };
            }

            // Get BDO details from BDO collection for additional info
            const bdoResult = await this.bdoService.getBDOById(bdoId);
            
            if (!bdoResult.success) {
                console.log(`❌ [OTPChangeDataService] BDO not found: ${bdoId}`);
                return {
                    success: false,
                    error: bdoResult.error
                };
            }

            // Merge data with devices collection taking precedence
            const deviceData = deviceResult.device;
            const bdoData = bdoResult.bdo;

            const consolidatedData = {
                // BDO Information (from devices collection primarily)
                bdoDetails: {
                    bdoId: bdoId,
                    bdoDocumentId: bdoData.documentId,
                    name: deviceData.bdoName || bdoData.name,
                    cnic: bdoData.cnicNumber,
                    cnicNumber: bdoData.cnicNumber,
                    currentOtpMobileNumber: deviceData.currentOtpNumber || bdoData.otpMobileNumber,
                    otpMobileNumber: deviceData.currentOtpNumber || bdoData.otpMobileNumber,
                    handlerType: 'BDO/Retailer',
                    franchiseId: bdoData.franchiseId,
                    franchiseName: bdoData.franchiseName,
                    shopDetails: {
                        name: deviceData.shopName || bdoData.shopDetails?.name,
                        city: deviceData.city || bdoData.shopDetails?.city
                    },
                    otpChangeCount: 0, // Will be updated during processing
                    dataSource: 'devices_collection'
                },
                
                // Device Information (from devices collection)
                deviceDetails: {
                    imei: deviceData.imei,
                    currentStatus: deviceData.status,
                    assignedAt: deviceData.assignedAt,
                    coordinates: deviceData.coordinates,
                    bdoName: deviceData.bdoName,
                    shopName: deviceData.shopName,
                    city: deviceData.city,
                    lastUpdatedAt: deviceData.lastUpdatedAt,
                    dataSource: 'devices_collection'
                }
            };

            console.log(`✅ [OTPChangeDataService] Successfully consolidated data for BDO ${bdoId}`);
            console.log(`📱 [OTPChangeDataService] Device: ${deviceData.imei}, Shop: ${deviceData.shopName || 'N/A'}`);

            return {
                success: true,
                data: consolidatedData
            };

        } catch (error) {
            console.error('❌ [OTPChangeDataService] Error getting BDO with device data:', error);
            
            if (this.actionLogger) {
                try {
                    await this.actionLogger.logError(error, {
                        action: 'getBDOWithDeviceData',
                        bdoId,
                        context: 'OTP Change data consolidation'
                    });
                } catch (logError) {
                    console.error('❌ Error logging to actionLogger:', logError);
                }
            }

            return {
                success: false,
                error: 'Failed to retrieve BDO and device data',
                errorCode: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Validate and refresh data before review step
     * Ensures data integrity and consistency
     */
    async refreshAndValidateOTPChangeData(formData) {
        try {
            console.log(`🔄 [OTPChangeDataService] Refreshing OTP change data...`);

            const bdoId = formData.bdoDetails?.bdoId;
            if (!bdoId) {
                return {
                    success: false,
                    error: 'BDO ID not found in form data'
                };
            }

            // Get fresh data from devices collection
            const freshDataResult = await this.getBDOWithDeviceData(bdoId);
            
            if (!freshDataResult.success) {
                return freshDataResult;
            }

            // Merge fresh data with existing form data, preserving user inputs
            const refreshedFormData = {
                ...formData,
                bdoDetails: {
                    ...freshDataResult.data.bdoDetails,
                    // Preserve user-entered new OTP number
                    newOtpMobileNumber: formData.bdoDetails?.newOtpMobileNumber,
                    verificationStatus: formData.bdoDetails?.verificationStatus
                },
                deviceDetails: {
                    ...freshDataResult.data.deviceDetails
                }
            };

            // Validate data integrity
            const validation = this.validateOTPChangeData(refreshedFormData);
            
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    warnings: validation.warnings
                };
            }

            console.log(`✅ [OTPChangeDataService] Data refreshed and validated successfully`);

            return {
                success: true,
                data: refreshedFormData,
                warnings: validation.warnings
            };

        } catch (error) {
            console.error('❌ [OTPChangeDataService] Error refreshing OTP change data:', error);
            return {
                success: false,
                error: 'Failed to refresh OTP change data'
            };
        }
    }

    /**
     * Validate OTP change data for completeness and consistency
     */
    validateOTPChangeData(formData) {
        const warnings = [];
        const errors = [];

        // Check required BDO fields
        if (!formData.bdoDetails) {
            errors.push('BDO details missing');
        } else {
            if (!formData.bdoDetails.bdoId) errors.push('BDO ID missing');
            if (!formData.bdoDetails.name) errors.push('BDO name missing');
            if (!formData.bdoDetails.cnic && !formData.bdoDetails.cnicNumber) errors.push('CNIC number missing');
            if (!formData.bdoDetails.currentOtpMobileNumber && !formData.bdoDetails.otpMobileNumber) errors.push('Current OTP number missing');
            if (!formData.bdoDetails.newOtpMobileNumber) errors.push('New OTP number missing');
        }

        // Check required device fields
        if (!formData.deviceDetails) {
            errors.push('Device details missing');
        } else {
            if (!formData.deviceDetails.imei) errors.push('Device IMEI missing');
            if (!formData.deviceDetails.currentStatus) warnings.push('Device status not specified');
        }

        // Check OTP number difference
        if (formData.bdoDetails?.currentOtpMobileNumber && formData.bdoDetails?.newOtpMobileNumber) {
            const currentNormalized = this.bdoService.normalizePhoneNumber(formData.bdoDetails.currentOtpMobileNumber);
            const newNormalized = this.bdoService.normalizePhoneNumber(formData.bdoDetails.newOtpMobileNumber);
            
            if (currentNormalized === newNormalized) {
                errors.push('New OTP number must be different from current OTP number');
            }
        }

        // Check data consistency
        if (formData.bdoDetails?.dataSource !== 'devices_collection') {
            warnings.push('Data may not be from the latest devices collection');
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings,
            error: errors.length > 0 ? errors.join(', ') : null
        };
    }

    /**
     * Get summary data for display
     */
    getDisplaySummary(formData) {
        if (!formData.bdoDetails || !formData.deviceDetails) {
            return null;
        }

        return {
            bdoId: formData.bdoDetails.bdoId,
            bdoName: formData.bdoDetails.name,
            imei: formData.deviceDetails.imei,
            shopName: formData.bdoDetails.shopDetails?.name || formData.deviceDetails.shopName,
            currentOtp: formData.bdoDetails.currentOtpMobileNumber || formData.bdoDetails.otpMobileNumber,
            newOtp: formData.bdoDetails.newOtpMobileNumber,
            city: formData.bdoDetails.shopDetails?.city || formData.deviceDetails.city,
            dataConsistent: formData.bdoDetails.dataSource === 'devices_collection'
        };
    }

    /**
     * Get current BDO and device data for ReviewSubmitStep validation
     * Simplified version focused on current data consistency
     */
    async getCurrentBDODeviceData(bdoId, imei) {
        try {
            console.log(`🔍 [OTPChangeDataService] Getting current data for BDO ${bdoId} and IMEI ${imei}`);

            // Get comprehensive data
            const result = await this.getBDOWithDeviceData(bdoId);
            
            if (!result.success) {
                return null;
            }

            // Validate that the device matches
            if (imei && result.data.deviceDetails.imei !== imei) {
                console.warn(`⚠️ [OTPChangeDataService] IMEI mismatch: expected ${imei}, got ${result.data.deviceDetails.imei}`);
                return null;
            }

            return {
                bdoInfo: result.data.bdoDetails,
                deviceInfo: result.data.deviceDetails,
                status: 'Mapped',
                isValid: true,
                dataSource: 'devices_collection'
            };

        } catch (error) {
            console.error('❌ [OTPChangeDataService] Error getting current BDO/device data:', error);
            return null;
        }
    }
}

export default OTPChangeDataService;
