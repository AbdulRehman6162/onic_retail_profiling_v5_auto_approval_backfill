// --- Conflict Resolution Utility ---
import { 
    runTransaction, 
    doc, 
    collection, 
    query, 
    where, 
    getDocs, 
    Timestamp 
} from 'firebase/firestore';

/**
 * Conflict resolution system for handling concurrent requests and IMEI conflicts
 */
export class ConflictResolver {
    constructor(db, actionLogger) {
        this.db = db;
        this.actionLogger = actionLogger;
    }

    /**
     * Atomically claim an IMEI for a new mapping request
     * @param {string} imei - The IMEI to claim
     * @param {Object} requestData - The request data
     * @returns {Promise<string>} - The created request ID
     */
    async claimIMEIForRequest(imei, requestData) {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                // Check if device exists and is available
                const deviceRef = doc(this.db, 'devices', imei);
                const deviceDoc = await transaction.get(deviceRef);
                
                if (!deviceDoc.exists()) {
                    throw new Error(`Device with IMEI ${imei} not found in inventory`);
                }
                
                const deviceData = deviceDoc.data();
                
                // Check if device is already mapped
                if (deviceData.status === 'Mapped') {
                    throw new Error(`IMEI ${imei} is already assigned to BDO ${deviceData.currentLocation?.bdoId}`);
                }
                
                // Check if device is under maintenance or faulty
                if (['Faulty', 'Under_Maintenance', 'Retired'].includes(deviceData.status)) {
                    throw new Error(`IMEI ${imei} is not available for mapping (Status: ${deviceData.status})`);
                }
                
                // Check for pending requests with the same IMEI
                const pendingRequestsQuery = query(
                    collection(this.db, 'requestsV2'),
                    where('imei', '==', imei),
                    where('status', 'in', [
                        'SUBMITTED', 
                        'SALES_REVIEW', 
                        'SALES_APPROVED', 
                        'OPS_REVIEW'
                    ])
                );
                
                const pendingRequestsSnapshot = await getDocs(pendingRequestsQuery);
                if (!pendingRequestsSnapshot.empty) {
                    const existingRequest = pendingRequestsSnapshot.docs[0].data();
                    throw new Error(
                        `IMEI ${imei} already has a pending request (${existingRequest.requestNumber}) ` +
                        `by franchise ${existingRequest.franchise.name}`
                    );
                }
                
                // Create the request
                const requestRef = doc(collection(this.db, 'requestsV2'));
                const finalRequestData = {
                    ...requestData,
                    id: requestRef.id,
                    requestNumber: await this.generateRequestNumber(requestData.type),
                    metadata: {
                        ...requestData.metadata,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    }
                };
                
                transaction.set(requestRef, finalRequestData);
                
                // Reserve the device
                transaction.update(deviceRef, {
                    status: 'Reserved',
                    reservedBy: requestData.franchise.id,
                    reservedAt: Timestamp.now(),
                    reservedForRequest: requestRef.id,
                    metadata: {
                        ...deviceData.metadata,
                        updatedAt: Timestamp.now()
                    }
                });
                
                return { requestId: requestRef.id, requestNumber: finalRequestData.requestNumber };
            });
            
            // Log successful IMEI claim
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'CLAIM',
                    description: `IMEI ${imei} claimed for request ${result.requestNumber}`,
                    category: 'DEVICE',
                    target: {
                        entityType: 'device',
                        entityId: imei,
                        entityIdentifier: imei
                    },
                    context: {
                        deviceImei: imei,
                        requestId: result.requestId,
                        franchiseId: requestData.franchise.id
                    },
                    severity: 'INFO'
                });
            }
            
            return result.requestId;
            
        } catch (error) {
            // Log conflict resolution failure
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'CONFLICT',
                    description: `Failed to claim IMEI ${imei}: ${error.message}`,
                    category: 'DEVICE',
                    target: {
                        entityType: 'device',
                        entityId: imei,
                        entityIdentifier: imei
                    },
                    context: {
                        deviceImei: imei,
                        franchiseId: requestData.franchise.id,
                        errorMessage: error.message
                    },
                    severity: 'WARNING'
                });
            }
            
            throw error;
        }
    }

    /**
     * Release a reserved IMEI (when request is cancelled or rejected)
     * @param {string} imei - The IMEI to release
     * @param {string} requestId - The request ID that reserved it
     * @param {string} reason - Reason for release
     */
    async releaseReservedIMEI(imei, requestId, reason = 'Request cancelled') {
        try {
            await runTransaction(this.db, async (transaction) => {
                const deviceRef = doc(this.db, 'devices', imei);
                const deviceDoc = await transaction.get(deviceRef);
                
                if (!deviceDoc.exists()) {
                    throw new Error(`Device with IMEI ${imei} not found`);
                }
                
                const deviceData = deviceDoc.data();
                
                // Verify this request actually reserved the device
                if (deviceData.reservedForRequest !== requestId) {
                    throw new Error(`IMEI ${imei} was not reserved by request ${requestId}`);
                }
                
                // Release the device
                transaction.update(deviceRef, {
                    status: 'Available',
                    reservedBy: null,
                    reservedAt: null,
                    reservedForRequest: null,
                    metadata: {
                        ...deviceData.metadata,
                        updatedAt: Timestamp.now()
                    }
                });
            });
            
            // Log release
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'RELEASE',
                    description: `IMEI ${imei} released from request ${requestId}: ${reason}`,
                    category: 'DEVICE',
                    target: {
                        entityType: 'device',
                        entityId: imei,
                        entityIdentifier: imei
                    },
                    context: {
                        deviceImei: imei,
                        requestId,
                        reason
                    },
                    severity: 'INFO'
                });
            }
            
        } catch (error) {
            console.error('Failed to release reserved IMEI:', error);
            throw error;
        }
    }

    /**
     * Handle transfer of ownership conflicts
     * @param {string} imei - The IMEI being transferred
     * @param {string} currentBdoId - Current BDO ID
     * @param {string} newBdoId - New BDO ID
     * @param {Object} requestData - Transfer request data
     */
    async handleOwnershipTransfer(imei, currentBdoId, newBdoId, requestData) {
        try {
            return await runTransaction(this.db, async (transaction) => {
                // Verify device current assignment
                const deviceRef = doc(this.db, 'devices', imei);
                const deviceDoc = await transaction.get(deviceRef);
                
                if (!deviceDoc.exists()) {
                    throw new Error(`Device with IMEI ${imei} not found`);
                }
                
                const deviceData = deviceDoc.data();
                
                if (deviceData.currentLocation?.bdoId !== currentBdoId) {
                    throw new Error(
                        `Device ${imei} is not currently assigned to BDO ${currentBdoId}. ` +
                        `Current assignment: ${deviceData.currentLocation?.bdoId || 'None'}`
                    );
                }
                
                // Check if new BDO exists and is active
                const newBdoQuery = query(
                    collection(this.db, 'bdoAccounts'),
                    where('bdoId', '==', newBdoId),
                    where('status', '==', 'ACTIVE')
                );
                
                const newBdoSnapshot = await getDocs(newBdoQuery);
                if (newBdoSnapshot.empty) {
                    throw new Error(`Target BDO ${newBdoId} not found or not active`);
                }
                
                // Check for conflicting transfer requests
                const conflictingTransfersQuery = query(
                    collection(this.db, 'requestsV2'),
                    where('type', '==', 'TRANSFER_OWNERSHIP'),
                    where('imei', '==', imei),
                    where('status', 'in', ['SUBMITTED', 'SALES_REVIEW', 'SALES_APPROVED', 'OPS_REVIEW'])
                );
                
                const conflictingTransfersSnapshot = await getDocs(conflictingTransfersQuery);
                if (!conflictingTransfersSnapshot.empty) {
                    const existingTransfer = conflictingTransfersSnapshot.docs[0].data();
                    throw new Error(
                        `Device ${imei} already has a pending transfer request (${existingTransfer.requestNumber})`
                    );
                }
                
                // Create transfer request
                const requestRef = doc(collection(this.db, 'requestsV2'));
                const finalRequestData = {
                    ...requestData,
                    id: requestRef.id,
                    requestNumber: await this.generateRequestNumber('TRANSFER_OWNERSHIP'),
                    device: {
                        ...requestData.device,
                        imei,
                        currentBdoId,
                        targetBdoId: newBdoId
                    },
                    metadata: {
                        ...requestData.metadata,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    }
                };
                
                transaction.set(requestRef, finalRequestData);
                
                return requestRef.id;
            });
            
        } catch (error) {
            // Log transfer conflict
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'CONFLICT',
                    description: `Transfer ownership conflict for IMEI ${imei}: ${error.message}`,
                    category: 'REQUEST',
                    target: {
                        entityType: 'device',
                        entityId: imei,
                        entityIdentifier: imei
                    },
                    context: {
                        deviceImei: imei,
                        currentBdoId,
                        newBdoId,
                        errorMessage: error.message
                    },
                    severity: 'WARNING'
                });
            }
            
            throw error;
        }
    }

    /**
     * Check for and resolve conflicts in BDO creation
     * @param {Object} bdoData - BDO data to validate
     */
    async validateBDOCreation(bdoData) {
        try {
            // Check for CNIC conflicts
            const cnicQuery = query(
                collection(this.db, 'bdoAccounts'),
                where('personalInfo.cnicNumber', '==', bdoData.personalInfo.cnicNumber)
            );
            
            const cnicSnapshot = await getDocs(cnicQuery);
            if (!cnicSnapshot.empty) {
                throw new Error(`CNIC ${bdoData.personalInfo.cnicNumber} is already registered`);
            }
            
            // Check for mobile number conflicts
            const mobileQuery = query(
                collection(this.db, 'bdoAccounts'),
                where('personalInfo.mobileNumber', '==', bdoData.personalInfo.mobileNumber)
            );
            
            const mobileSnapshot = await getDocs(mobileQuery);
            if (!mobileSnapshot.empty) {
                throw new Error(`Mobile number ${bdoData.personalInfo.mobileNumber} is already registered`);
            }
            
            // Check franchise limits
            const franchiseBDOQuery = query(
                collection(this.db, 'bdoAccounts'),
                where('franchiseId', '==', bdoData.franchiseId),
                where('status', 'in', ['ACTIVE', 'PENDING_APPROVAL'])
            );
            
            const franchiseBDOSnapshot = await getDocs(franchiseBDOQuery);
            
            // Get franchise limits
            const franchiseDoc = await doc(this.db, 'franchises', bdoData.franchiseId);
            const franchiseData = (await franchiseDoc.get())?.data();
            
            if (franchiseData?.limits?.maxBDOs && franchiseBDOSnapshot.size >= franchiseData.limits.maxBDOs) {
                throw new Error(`Franchise ${bdoData.franchiseId} has reached maximum BDO limit (${franchiseData.limits.maxBDOs})`);
            }
            
            return true;
            
        } catch (error) {
            // Log validation failure
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'VALIDATION_FAILED',
                    description: `BDO creation validation failed: ${error.message}`,
                    category: 'BDO',
                    target: {
                        entityType: 'bdo',
                        entityId: 'validation',
                        entityIdentifier: bdoData.personalInfo?.cnicNumber || 'unknown'
                    },
                    context: {
                        franchiseId: bdoData.franchiseId,
                        cnicNumber: bdoData.personalInfo?.cnicNumber,
                        mobileNumber: bdoData.personalInfo?.mobileNumber,
                        errorMessage: error.message
                    },
                    severity: 'WARNING'
                });
            }
            
            throw error;
        }
    }

    /**
     * Generate unique request number
     * @param {string} requestType - Type of request
     * @returns {Promise<string>} - Generated request number
     */
    async generateRequestNumber(requestType) {
        const currentYear = new Date().getFullYear();
        const prefix = this.getRequestPrefix(requestType);
        
        // Get count of requests for this year and type
        const requestQuery = query(
            collection(this.db, 'requestsV2'),
            where('type', '==', requestType),
            where('metadata.createdAt', '>=', new Date(`${currentYear}-01-01`)),
            where('metadata.createdAt', '<', new Date(`${currentYear + 1}-01-01`))
        );
        
        const requestSnapshot = await getDocs(requestQuery);
        const count = requestSnapshot.size + 1;
        
        return `${prefix}-${currentYear}-${String(count).padStart(6, '0')}`;
    }

    /**
     * Get request prefix based on type
     * @param {string} requestType - Type of request
     * @returns {string} - Request prefix
     */
    getRequestPrefix(requestType) {
        const prefixes = {
            'NEW_MAPPING': 'MAP',
            'TRANSFER_OWNERSHIP': 'TRF',
            'OTP_CHANGE': 'OTP',
            'DEVICE_DEMAP': 'DMP'
        };
        
        return prefixes[requestType] || 'REQ';
    }
}

export default ConflictResolver;
