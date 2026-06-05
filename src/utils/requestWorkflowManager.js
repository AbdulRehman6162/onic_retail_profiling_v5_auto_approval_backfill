// --- Request Workflow Manager ---
import { 
    doc, 
    getDoc,
    Timestamp, 
    runTransaction, 
    collection,
    addDoc,
    serverTimestamp
} from 'firebase/firestore';
import DeviceCollectionService from '../services/deviceCollectionService.js';

/**
 * Enhanced request workflow management system
 */
export class RequestWorkflowManager {
    constructor(db, user, actionLogger, notificationSystem) {
        this.db = db;
        this.user = user;
        this.actionLogger = actionLogger;
        this.notificationSystem = notificationSystem;
        
        // Initialize device collection service
        this.deviceService = new DeviceCollectionService(db, actionLogger);
        
        // Always use 'requestsV2' collection for new unified structure
        this.requestsCollection = 'requestsV2';
        console.log('🔧 Using requestsV2 collection for all environments');
    }

    /**
     * Create a new request
     */
    async createRequest(requestData) {
        try {
            console.log(`📝 Creating new request in ${this.requestsCollection} collection`);
            
            const requestDoc = {
                ...requestData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: this.user.uid,
                status: requestData.status || 'pending'
            };

            const docRef = await addDoc(collection(this.db, this.requestsCollection), requestDoc);
            console.log(`✅ Request created with ID: ${docRef.id}`);

            // Log the creation
            await this.actionLogger.logAction({
                action: 'request_created',
                details: {
                    requestId: docRef.id,
                    requestNumber: requestData.requestNumber,
                    requestType: requestData.requestType,
                    collection: this.requestsCollection
                },
                userId: this.user.uid,
                timestamp: new Date()
            });

            return {
                success: true,
                requestId: docRef.id,
                requestNumber: requestData.requestNumber
            };

        } catch (error) {
            console.error('❌ Error creating request:', error);
            await this.actionLogger.logError(error, {
                action: 'createRequest',
                requestData
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Submit a request for review
     */
    async submitRequest(requestId) {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                
                if (requestData.status !== 'DRAFT') {
                    throw new Error('Only draft requests can be submitted');
                }
                
                // Validate request completeness
                this.validateRequestForSubmission(requestData);
                
                // Update request status
                const updates = {
                    status: 'SALES_REVIEW',
                    'metadata.submittedAt': Timestamp.now(),
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid
                };
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates };
            });
            
            // Log the submission
            await this.actionLogger.logRequestStatusChange(
                requestId,
                result.requestNumber,
                'DRAFT',
                'SALES_REVIEW',
                'Request submitted for sales review'
            );
            
            // Notify sales team
            await this.notificationSystem.broadcastToRole('Sales Team', {
                type: 'APPROVAL_REQUIRED',
                title: 'New Request for Review',
                message: `Request ${result.requestNumber} submitted by ${result.franchise.name}`,
                data: {
                    requestId,
                    requestNumber: result.requestNumber,
                    requestType: result.type,
                    franchiseName: result.franchise.name
                },
                priority: 'MEDIUM'
            });
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'submitRequest',
                requestId
            });
            throw error;
        }
    }

    /**
     * Sales team approval/rejection
     */
    async processSalesReview(requestId, approved, comments = '') {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                
                if (requestData.status !== 'Sales Review') {
                    throw new Error('Request is not in sales review status');
                }
                
                const newStatus = approved ? 'Sales Approved' : 'Sales Rejected';
                
                const updates = {
                    status: newStatus,
                    'approvals.sales': {
                        approvedBy: this.user.uid,
                        approvedAt: Timestamp.now(),
                        comments,
                        isApproved: approved
                    },
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid
                };
                
                // Add comment if provided
                if (comments) {
                    const newComment = {
                        id: `comment_${Date.now()}`,
                        userId: this.user.uid,
                        userName: this.user.name || this.user.email,
                        userRole: this.user.role,
                        message: comments,
                        timestamp: Timestamp.now(),
                        isInternal: false
                    };
                    
                    updates.comments = [...(requestData.comments || []), newComment];
                }
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates };
            });
            
            // Log the approval/rejection
            await this.actionLogger.logRequestApproval(
                requestId,
                result.requestNumber,
                'sales',
                approved,
                comments
            );
            
            // Notify relevant parties
            if (approved) {
                // Notify operations team
                await this.notificationSystem.broadcastToRole('Operations Team', {
                    type: 'APPROVAL_REQUIRED',
                    title: 'Request Approved by Sales',
                    message: `Request ${result.requestNumber} has been approved by Sales and is ready for operations processing`,
                    data: {
                        requestId,
                        requestNumber: result.requestNumber,
                        requestType: result.type
                    },
                    priority: 'MEDIUM'
                });
            } else {
                // Notify franchise about rejection (only if franchise contact info is available)
                if (result.franchise?.contactUserId) {
                    await this.notificationSystem.notifyUser(result.franchise.contactUserId, {
                        type: 'STATUS_CHANGE',
                        title: 'Request Rejected',
                        message: `Request ${result.requestNumber} has been rejected by Sales Team`,
                        data: {
                            requestId,
                            requestNumber: result.requestNumber,
                            comments
                        },
                        priority: 'HIGH'
                    });
                } else {
                    console.log(`⚠️ No franchise contact info available for rejection notification on request ${result.requestNumber}`);
                }
            }
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'processSalesReview',
                requestId,
                approved
            });
            throw error;
        }
    }

    /**
     * Operations team approval/rejection
     */
    async processOperationsReview(requestId, approved, comments = '', externalPortalReference = '') {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                
                // Handle multiple status formats: 'OPS_REVIEW', 'Operations Review', and 'Sales Approved'
                const validStatuses = ['OPS_REVIEW', 'Operations Review', 'Sales Approved'];
                if (!validStatuses.includes(requestData.status)) {
                    throw new Error(`Request is not in operations review status. Current status: "${requestData.status}". Expected one of: ${validStatuses.join(', ')}`);
                }
                
                const newStatus = approved ? 'IN_PROCESSING' : 'OPS_REJECTED';
                
                const updates = {
                    status: newStatus,
                    'approvals.operations': {
                        approvedBy: this.user.uid,
                        approvedAt: Timestamp.now(),
                        comments,
                        isApproved: approved,
                        externalPortalReference
                    },
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid
                };
                
                // Add comment if provided
                if (comments) {
                    const newComment = {
                        id: `comment_${Date.now()}`,
                        userId: this.user.uid,
                        userName: this.user.name || this.user.email,
                        userRole: this.user.role,
                        message: comments,
                        timestamp: Timestamp.now(),
                        isInternal: false
                    };
                    
                    updates.comments = [...(requestData.comments || []), newComment];
                }
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates, approved, externalPortalReference, id: requestId };
            });
            
            // If approved, handle the actual mapping/transfer AFTER transaction completes
            // Note: Device collection creation now happens on completion, not here
            
            // Log the approval/rejection
            await this.actionLogger.logRequestApproval(
                requestId,
                result.requestNumber,
                'operations',
                approved,
                comments
            );
            
            // Notify franchise
            const notificationMessage = approved 
                ? `Request ${result.requestNumber} has been approved and is being processed`
                : `Request ${result.requestNumber} has been rejected by Operations Team`;
            
            // Notify franchise (only if franchise contact info is available)
            if (result.franchise?.contactUserId) {
                await this.notificationSystem.notifyUser(result.franchise.contactUserId, {
                    type: 'STATUS_CHANGE',
                    title: approved ? 'Request Approved' : 'Request Rejected',
                    message: notificationMessage,
                    data: {
                        requestId,
                        requestNumber: result.requestNumber,
                        comments,
                        externalPortalReference
                    },
                    priority: approved ? 'MEDIUM' : 'HIGH'
                });
            } else {
                console.log(`⚠️ No franchise contact info available for notification on request ${result.requestNumber}`);
            }
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'processOperationsReview',
                requestId,
                approved
            });
            throw error;
        }
    }

    /**
     * Complete a request after processing
     */
    async completeRequest(requestId, completionNotes = '') {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                
                // Handle both formats: 'IN_PROCESSING' and 'In Processing'
                if (requestData.status !== 'IN_PROCESSING' && requestData.status !== 'In Processing') {
                    throw new Error(`Request is not in processing status. Current status: "${requestData.status}". Expected: "IN_PROCESSING" or "In Processing"`);
                }
                
                const updates = {
                    status: 'COMPLETED',
                    'metadata.completedAt': Timestamp.now(),
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid,
                    completionNotes
                };
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates };
            });
            
            // Execute the actual device mapping/transfer AFTER transaction completes
            await this.executeApprovedRequest({ ...result, id: requestId }, '');
            
            // Log completion
            await this.actionLogger.logRequestStatusChange(
                requestId,
                result.requestNumber,
                'IN_PROCESSING',
                'COMPLETED',
                completionNotes
            );
            
            // Notify franchise of completion (only if franchise contact info is available)
            if (result.franchise?.contactUserId) {
                await this.notificationSystem.notifyUser(result.franchise.contactUserId, {
                    type: 'STATUS_CHANGE',
                    title: 'Request Completed',
                    message: `Request ${result.requestNumber} has been successfully completed`,
                    data: {
                        requestId,
                        requestNumber: result.requestNumber,
                        completionNotes
                    },
                    priority: 'MEDIUM'
                });
            } else {
                console.log(`⚠️ No franchise contact info available for completion notification on request ${result.requestNumber}`);
            }
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'completeRequest',
                requestId
            });
            throw error;
        }
    }

    /**
     * Put request on hold
     */
    async putRequestOnHold(requestId, reason = '') {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                const oldStatus = requestData.status;
                
                const updates = {
                    status: 'ON_HOLD',
                    holdReason: reason,
                    'metadata.heldAt': Timestamp.now(),
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid,
                    previousStatus: oldStatus
                };
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates };
            });
            
            // Log hold action
            await this.actionLogger.logRequestStatusChange(
                requestId,
                result.requestNumber,
                result.previousStatus,
                'ON_HOLD',
                reason
            );
            
            // Notify franchise (only if franchise contact info is available)
            if (result.franchise?.contactUserId) {
                await this.notificationSystem.notifyUser(result.franchise.contactUserId, {
                    type: 'STATUS_CHANGE',
                    title: 'Request On Hold',
                    message: `Request ${result.requestNumber} has been put on hold: ${reason}`,
                    data: {
                        requestId,
                        requestNumber: result.requestNumber,
                        reason
                    },
                    priority: 'MEDIUM'
                });
            } else {
                console.log(`⚠️ No franchise contact info available for hold notification on request ${result.requestNumber}`);
            }
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'putRequestOnHold',
                requestId
            });
            throw error;
        }
    }

    /**
     * Resume request from hold
     */
    async resumeRequestFromHold(requestId, resumeNotes = '') {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                
                if (requestData.status !== 'ON_HOLD') {
                    throw new Error('Request is not on hold');
                }
                
                const resumeStatus = requestData.previousStatus || 'SALES_REVIEW';
                
                const updates = {
                    status: resumeStatus,
                    'metadata.resumedAt': Timestamp.now(),
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid,
                    resumeNotes,
                    holdReason: null,
                    previousStatus: null
                };
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates };
            });
            
            // Log resume action
            await this.actionLogger.logRequestStatusChange(
                requestId,
                result.requestNumber,
                'ON_HOLD',
                result.status,
                resumeNotes
            );
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'resumeRequestFromHold',
                requestId
            });
            throw error;
        }
    }

    /**
     * Add comment to request
     */
    async addComment(requestId, message, isInternal = false) {
        try {
            const result = await runTransaction(this.db, async (transaction) => {
                const requestRef = doc(this.db, 'requestsV2', requestId);
                const requestDoc = await transaction.get(requestRef);
                
                if (!requestDoc.exists()) {
                    throw new Error('Request not found');
                }
                
                const requestData = requestDoc.data();
                
                const newComment = {
                    id: `comment_${Date.now()}`,
                    userId: this.user.uid,
                    userName: this.user.name || this.user.email,
                    userRole: this.user.role,
                    message,
                    timestamp: Timestamp.now(),
                    isInternal
                };
                
                const updates = {
                    comments: [...(requestData.comments || []), newComment],
                    'metadata.updatedAt': Timestamp.now(),
                    'metadata.lastModifiedBy': this.user.uid
                };
                
                transaction.update(requestRef, updates);
                
                return { ...requestData, ...updates };
            });
            
            // Log comment addition
            await this.actionLogger.logAction({
                type: 'COMMENT',
                description: `Comment added to request ${result.requestNumber}`,
                category: 'REQUEST',
                target: {
                    entityType: 'request',
                    entityId: requestId,
                    entityIdentifier: result.requestNumber
                },
                context: {
                    requestId,
                    commentText: message,
                    isInternal
                },
                severity: 'INFO'
            });
            
            return result;
            
        } catch (error) {
            await this.actionLogger.logError(error, {
                action: 'addComment',
                requestId
            });
            throw error;
        }
    }

    /**
     * Execute approved request (actual mapping/transfer) - Called after transaction completion
     */
    async executeApprovedRequest(requestData, externalPortalReference) {
        try {
            const requestType = requestData.requestType || requestData.type;
            console.log(`🚀 Executing approved request: ${requestType} for request ${requestData.requestNumber}`);
            
            switch (requestType) {
                case 'NEW_MAPPING':
                    console.log(`📱 Executing new device mapping...`);
                    return await this.executeNewMapping(requestData, externalPortalReference);
                
                case 'TRANSFER_OWNERSHIP':
                    console.log(`🔄 Executing ownership transfer...`);
                    return await this.executeOwnershipTransfer(requestData, externalPortalReference);
                
                case 'OTP_CHANGE':
                    console.log(`📞 Executing OTP change...`);
                    return await this.executeOTPChange(requestData, externalPortalReference);
                
                case 'LOCATION_UPDATE':
                    console.log(`📍 Executing location update...`);
                    return await this.executeLocationUpdate(requestData, externalPortalReference);
                
                case 'DE_MAPPING':
                    console.log(`🚫 Executing device de-mapping...`);
                    return await this.executeDeviceDemap(requestData, externalPortalReference);
                
                default:
                    console.error(`❌ Unknown request type: ${requestType}`);
                    throw new Error(`Unknown request type: ${requestType}`);
            }
        } catch (error) {
            console.error(`❌ Error executing approved request ${requestData.requestNumber}:`, error);
            
            // Log the error but don't throw it - the request status has already been updated
            await this.actionLogger.logError(error, {
                action: 'executeApprovedRequest',
                requestId: requestData.id,
                requestNumber: requestData.requestNumber,
                requestType: requestData.type,
                context: 'Post-transaction request execution'
            });
            
            // Optionally, you could update the request status to indicate execution failure
            // But for now, we'll just log the error
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Helper function to safely get a value from multiple possible paths, returning null if all are undefined
     */
    safeGetValue(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }
        return null;
    }

    /**
     * Execute new device mapping
     */
    async executeNewMapping(requestData, externalPortalReference) {
        try {
            console.log(`📱 Executing new mapping for request: ${requestData.requestNumber}`);
            console.log(`🔍 [DEBUG] Raw request data structure:`, {
                device: requestData.device,
                deviceDetails: requestData.deviceDetails,
                bdo: requestData.bdo,
                bdoDetails: requestData.bdoDetails,
                franchise: requestData.franchise
            });
            
            // Debug: Check what request ID fields are available
            console.log(`🔍 [DEBUG] Request ID fields:`, {
                id: requestData.id,
                requestId: requestData.requestId,
                requestNumber: requestData.requestNumber,
                topLevelKeys: Object.keys(requestData)
            });
            
            // Prepare device data for the devices collection - all fields are null-safe
            const deviceData = {
                imei: this.safeGetValue(requestData.device?.imei, requestData.deviceDetails?.imei),
                franchiseCode: this.safeGetValue(requestData.franchise?.code, requestData.franchiseCode),
                franchiseName: this.safeGetValue(requestData.franchise?.name, requestData.franchiseName, requestData.bdoDetails?.franchiseName),
                bdoId: this.safeGetValue(requestData.bdo?.id, requestData.bdoDetails?.bdoId),
                bdoName: this.safeGetValue(requestData.bdo?.name, requestData.bdoDetails?.name),
                bdoCnic: this.safeGetValue(requestData.bdo?.cnicNumber, requestData.bdoDetails?.cnicNumber, requestData.bdoDetails?.cnic),
                otpMobileNumber: this.safeGetValue(requestData.device?.otpMobileNumber, requestData.bdoDetails?.otpMobileNumber),
                shopName: this.safeGetValue(requestData.bdo?.shopDetails?.name, requestData.bdoDetails?.shopName, requestData.deviceDetails?.shopName),
                streetAddress: this.safeGetValue(requestData.bdo?.shopDetails?.address, requestData.bdoDetails?.streetAddress, requestData.deviceDetails?.streetAddress),
                city: this.safeGetValue(requestData.bdo?.shopDetails?.city, requestData.bdoDetails?.city, requestData.deviceDetails?.city),
                premiseRelationship: this.safeGetValue(requestData.bdo?.shopDetails?.premiseRelationship, requestData.bdoDetails?.premiseRelationship, requestData.deviceDetails?.premiseRelationship),
                latitude: this.safeGetValue(requestData.bdo?.shopDetails?.coordinates?.latitude, requestData.bdoDetails?.latitude, requestData.deviceDetails?.coordinates?.lat),
                longitude: this.safeGetValue(requestData.bdo?.shopDetails?.coordinates?.longitude, requestData.bdoDetails?.longitude, requestData.deviceDetails?.coordinates?.lng),
                cnicFrontUrl: this.safeGetValue(requestData.bdo?.cnicFrontUrl, requestData.bdoDetails?.cnicFrontUrl, requestData.bdoDetails?.cnicFrontImageUrl),
                cnicBackUrl: this.safeGetValue(requestData.bdo?.cnicBackUrl, requestData.bdoDetails?.cnicBackUrl, requestData.bdoDetails?.cnicBackImageUrl),
                shopInsideImageUrl: this.safeGetValue(requestData.bdo?.shopDetails?.insideImageUrl, requestData.bdoDetails?.shopInsideImageUrl, requestData.deviceDetails?.shopInsideImage),
                shopOutsideImageUrl: this.safeGetValue(requestData.bdo?.shopDetails?.outsideImageUrl, requestData.bdoDetails?.shopOutsideImageUrl, requestData.deviceDetails?.shopOutsideImage),
                performedBy: this.user.uid
            };

            console.log(`🔍 [DEBUG] Device data being sent to DeviceCollectionService:`, deviceData);
            
            // Validate that we have the essential fields
            if (!deviceData.imei) {
                throw new Error('Missing required field: IMEI');
            }
            if (!deviceData.bdoId) {
                throw new Error('Missing required field: BDO ID');
            }

            // Log any null fields for debugging
            const nullFields = Object.entries(deviceData)
                .filter(([key, value]) => value === null)
                .map(([key]) => key);
            
            if (nullFields.length > 0) {
                console.log(`ℹ️ [INFO] Fields with null values: ${nullFields.join(', ')}`);
            }

            // Create device mapping in devices collection (PRIMARY OPERATION)
            const deviceResult = await this.deviceService.createDeviceMapping(
                deviceData, 
                requestData.id || requestData.requestId || requestData.requestNumber
            );

            if (!deviceResult.success) {
                throw new Error(`Failed to create device mapping: ${deviceResult.error}`);
            }

            console.log(`✅ Device mapping created in devices collection for IMEI: ${deviceData.imei}`);

            // Update BDO account with device assignment (LEGACY COMPATIBILITY - in separate transaction)
            if (requestData.bdo?.id || requestData.bdoDetails?.bdoDocumentId) {
                try {
                    await runTransaction(this.db, async (transaction) => {
                        const bdoRef = doc(this.db, 'bdoAccounts', requestData.bdo?.id || requestData.bdoDetails?.bdoDocumentId);
                        transaction.update(bdoRef, {
                            [`assignedDevices.${deviceData.imei}`]: {
                                assignedAt: Timestamp.now(),
                                status: 'Active',
                                requestId: requestData.id || requestData.requestId || requestData.requestNumber
                            },
                            metadata: {
                                updatedAt: Timestamp.now()
                            }
                        });
                    });
                    
                    console.log(`✅ Legacy BDO account updated for device ${deviceData.imei}`);
                } catch (bdoError) {
                    // Log the error but don't fail the main operation since devices collection is primary
                    console.warn(`⚠️ Failed to update legacy BDO account: ${bdoError.message}`);
                    await this.actionLogger.logError(bdoError, {
                        action: 'executeNewMapping',
                        context: 'Legacy BDO account update',
                        imei: deviceData.imei,
                        bdoId: requestData.bdo?.id || requestData.bdoDetails?.bdoDocumentId
                    });
                }
            }

            console.log(`✅ New mapping executed successfully for device ${deviceData.imei} to BDO ${deviceData.bdoId}`);
            return { success: true, deviceResult };

        } catch (error) {
            console.error(`❌ Error executing new mapping:`, error);
            throw error;
        }
    }

    /**
     * Execute ownership transfer
     */
    async executeOwnershipTransfer(requestData, externalPortalReference) {
        try {
            console.log(`🔄 Executing ownership transfer for request: ${requestData.requestNumber}`);
            
            // Extract device IMEI for validation - check multiple possible paths
            const deviceImei = this.safeGetValue(
                requestData.device?.imei, 
                requestData.deviceDetails?.imei,
                requestData.transferDetails?.originalDeviceId
            );
            
            if (!deviceImei) {
                throw new Error('Device IMEI is required for ownership transfer');
            }
            
            // Extract BDO information from transferDetails structure
            // Handle both flat field structure (from DeviceTransferForm) and nested structure (for backward compatibility)
            const transferDetails = requestData.transferDetails || {};
            const deviceDetails = requestData.deviceDetails || {};
            
            const targetBdoId = this.safeGetValue(
                transferDetails.destinationBdoId,
                requestData.bdoId,
                requestData.device?.targetBdoId, 
                requestData.newBdo?.id, 
                requestData.newBdoDetails?.bdoId
            );
            
            const targetBdoName = this.safeGetValue(
                transferDetails.destinationBdoName,
                requestData.bdoName,
                requestData.bdoDetails?.name,
                requestData.newBdo?.name, 
                requestData.newBdoDetails?.name
            );
            
            console.log(`🔍 [DEBUG] Transfer Details Extracted:`, {
                deviceImei,
                targetBdoId,
                targetBdoName,
                sourceBdoId: transferDetails.sourceBdoId,
                sourceBdoName: transferDetails.sourceBdoName,
                transferDetailsKeys: Object.keys(transferDetails),
                deviceDetailsKeys: Object.keys(deviceDetails),
                hasLegacyFields: !!(requestData.bdoId || requestData.bdoName),
                extractionSource: targetBdoId === transferDetails.destinationBdoId ? 'transferDetails' : 'legacy fields'
            });
            
            // Prepare updated device data - extract from actual form structure (flat fields)
            // DeviceTransferForm creates flat fields, not nested destinationBdo object
            const deviceUpdateData = {
                bdoId: targetBdoId,
                bdoName: targetBdoName,
                
                // Extract BDO details from flat fields (actual structure from DeviceTransferForm)
                bdoCnic: this.safeGetValue(
                    requestData.cnicNumber,  // Legacy field from form
                    requestData.bdoDetails?.cnic,
                    transferDetails.destinationBdoCnic,
                    requestData.newBdo?.cnic, 
                    requestData.newBdoDetails?.cnicNumber
                ),
                otpMobileNumber: this.safeGetValue(
                    requestData.otpMobileNumber,  // Legacy field from form
                    requestData.bdoDetails?.otpMobileNumber,
                    transferDetails.destinationOtpMobileNumber,
                    requestData.newBdo?.mobileNumber, 
                    requestData.newBdoDetails?.otpMobileNumber
                ),
                
                // Extract shop information from deviceDetails (new location from form)
                shopName: this.safeGetValue(
                    deviceDetails.newShopName,  // Primary field from DeviceTransferForm
                    requestData.shopName,  // Legacy field
                    transferDetails.destinationShopName,
                    requestData.newBdo?.shopDetails?.name,
                    requestData.newBdoDetails?.shopName
                ),
                streetAddress: this.safeGetValue(
                    deviceDetails.newStreetAddress,  // Primary field from DeviceTransferForm
                    requestData.streetAddress,  // Legacy field
                    transferDetails.destinationStreetAddress,
                    requestData.newBdo?.shopDetails?.address,
                    requestData.newBdoDetails?.streetAddress
                ),
                city: this.safeGetValue(
                    deviceDetails.newCity,  // Primary field from DeviceTransferForm
                    requestData.city,  // Legacy field
                    transferDetails.destinationCity,
                    requestData.newBdo?.shopDetails?.city,
                    requestData.newBdoDetails?.city
                ),
                premiseRelationship: this.safeGetValue(
                    requestData.premiseRelationship,  // Legacy field from form
                    deviceDetails.premiseRelationship,  // From deviceDetails
                    transferDetails.destinationPremiseRelationship,
                    requestData.newBdo?.shopDetails?.premiseRelationship,
                    requestData.newBdoDetails?.premiseRelationship
                ),
                
                // Extract location coordinates from deviceDetails.newCoordinates or legacy fields
                latitude: this.safeGetValue(
                    deviceDetails.newCoordinates?.latitude,  // Primary field from DeviceTransferForm
                    requestData.latitude,  // Legacy field
                    transferDetails.destinationLatitude,
                    requestData.newBdo?.shopDetails?.coordinates?.latitude,
                    requestData.newBdoDetails?.latitude
                ),
                longitude: this.safeGetValue(
                    deviceDetails.newCoordinates?.longitude,  // Primary field from DeviceTransferForm
                    requestData.longitude,  // Legacy field
                    transferDetails.destinationLongitude,
                    requestData.newBdo?.shopDetails?.coordinates?.longitude,
                    requestData.newBdoDetails?.longitude
                ),
                
                // Document URLs from documents section or legacy fields
                cnicFrontUrl: this.safeGetValue(
                    requestData.documents?.cnicFrontUrl,
                    requestData.cnicFrontUrl,
                    transferDetails.destinationCnicFrontUrl,
                    requestData.newBdo?.cnicFrontUrl,
                    requestData.newBdoDetails?.cnicFrontUrl
                ),
                cnicBackUrl: this.safeGetValue(
                    requestData.documents?.cnicBackUrl,
                    requestData.cnicBackUrl,
                    transferDetails.destinationCnicBackUrl,
                    requestData.newBdo?.cnicBackUrl,
                    requestData.newBdoDetails?.cnicBackUrl
                ),
                shopInsideImageUrl: this.safeGetValue(
                    requestData.documents?.shopInsideImage,
                    requestData.shopInsideImageUrl,
                    transferDetails.destinationShopInsideImageUrl,
                    requestData.newBdo?.shopDetails?.insideImageUrl,
                    requestData.newBdoDetails?.shopInsideImageUrl
                ),
                shopOutsideImageUrl: this.safeGetValue(
                    requestData.documents?.shopOutsideImage,
                    requestData.shopOutsideImageUrl,
                    transferDetails.destinationShopOutsideImageUrl,
                    requestData.newBdo?.shopDetails?.outsideImageUrl,
                    requestData.newBdoDetails?.shopOutsideImageUrl
                ),
                
                performedBy: this.user.uid
            };

            // Validate essential fields
            if (!deviceUpdateData.bdoId) {
                throw new Error('Target BDO ID is required for ownership transfer');
            }
            
            if (!deviceUpdateData.bdoName) {
                throw new Error('Target BDO name is required for ownership transfer');
            }

            // Debug: Log the complete device update data being sent
            console.log(`🔍 [DEBUG] Device update data for ownership transfer:`, {
                imei: deviceImei,
                targetBdoId: deviceUpdateData.bdoId,
                targetBdoName: deviceUpdateData.bdoName,
                bdoCnic: deviceUpdateData.bdoCnic,
                otpMobileNumber: deviceUpdateData.otpMobileNumber,
                city: deviceUpdateData.city,
                shopName: deviceUpdateData.shopName,
                streetAddress: deviceUpdateData.streetAddress,
                premiseRelationship: deviceUpdateData.premiseRelationship,
                hasLocation: !!(deviceUpdateData.latitude && deviceUpdateData.longitude),
                updateFields: Object.keys(deviceUpdateData).filter(key => deviceUpdateData[key] !== null && deviceUpdateData[key] !== undefined),
                dataSource: {
                    extractedFromDeviceDetails: !!(deviceDetails.newShopName || deviceDetails.newCity),
                    extractedFromLegacyFields: !!(requestData.shopName || requestData.city),
                    extractedFromTransferDetails: !!(transferDetails.destinationShopName || transferDetails.destinationCity),
                    hasCompleteData: !!(deviceUpdateData.bdoId && deviceUpdateData.bdoName && deviceUpdateData.city && deviceUpdateData.shopName)
                }
            });

            // Log any null fields for debugging
            const nullFields = Object.entries(deviceUpdateData)
                .filter(([key, value]) => value === null || value === undefined)
                .map(([key]) => key);
            
            if (nullFields.length > 0) {
                console.log(`⚠️ [DEBUG] Fields with null/undefined values in ownership transfer:`, nullFields);
            }

            // Update device ownership in devices collection (PRIMARY OPERATION)
            console.log(`📝 Updating device ownership in devices collection...`);
            const deviceResult = await this.deviceService.updateDeviceForCOO(
                deviceImei,
                deviceUpdateData,
                requestData.id || requestData.requestId
            );

            if (!deviceResult.success) {
                console.error(`❌ Device service failed to update ownership:`, {
                    imei: deviceImei,
                    error: deviceResult.error,
                    errorCode: deviceResult.errorCode,
                    suggestion: deviceResult.suggestion,
                    deviceUpdateData: {
                        bdoId: deviceUpdateData.bdoId,
                        bdoName: deviceUpdateData.bdoName,
                        hasOtpNumber: !!deviceUpdateData.otpMobileNumber,
                        hasLocation: !!(deviceUpdateData.latitude && deviceUpdateData.longitude)
                    }
                });
                
                // Provide specific error guidance based on error code
                let errorMessage = `Failed to update device ownership: ${deviceResult.error}`;
                if (deviceResult.errorCode === 'DEVICE_NOT_FOUND') {
                    errorMessage += ` (Suggestion: ${deviceResult.suggestion || 'Verify device exists'})`;
                }
                
                throw new Error(errorMessage);
            }

            console.log(`✅ Device ownership updated in devices collection for IMEI: ${deviceImei}`);

            // Update legacy BDO accounts (LEGACY COMPATIBILITY - with existence checks)
            const currentBdoId = this.safeGetValue(
                transferDetails.sourceBdoId,
                requestData.device?.currentBdoId
            );
            const targetBdoIdForLegacy = deviceUpdateData.bdoId;
            
            if (currentBdoId && targetBdoIdForLegacy) {
                try {
                    await runTransaction(this.db, async (transaction) => {
                        // Check if old BDO document exists before trying to update
                        const oldBdoRef = doc(this.db, 'bdoAccounts', currentBdoId);
                        const oldBdoDoc = await transaction.get(oldBdoRef);
                        
                        if (oldBdoDoc.exists()) {
                            // Remove from old BDO only if it exists
                            transaction.update(oldBdoRef, {
                                [`assignedDevices.${deviceImei}`]: null,
                                metadata: {
                                    updatedAt: Timestamp.now()
                                }
                            });
                            console.log(`📝 Removed device ${deviceImei} from old BDO account: ${currentBdoId}`);
                        } else {
                            console.log(`⚠️ Old BDO account ${currentBdoId} does not exist in bdoAccounts collection - skipping removal`);
                        }
                        
                        // Check if new BDO document exists before trying to update
                        const newBdoRef = doc(this.db, 'bdoAccounts', targetBdoIdForLegacy);
                        const newBdoDoc = await transaction.get(newBdoRef);
                        
                        if (newBdoDoc.exists()) {
                            // Add to new BDO only if it exists
                            transaction.update(newBdoRef, {
                                [`assignedDevices.${deviceImei}`]: {
                                    assignedAt: Timestamp.now(),
                                    status: 'Active',
                                    requestId: requestData.id || requestData.requestId,
                                    transferredFrom: currentBdoId
                                },
                                metadata: {
                                    updatedAt: Timestamp.now()
                                }
                            });
                            console.log(`📝 Added device ${deviceImei} to new BDO account: ${targetBdoIdForLegacy}`);
                        } else {
                            console.log(`⚠️ New BDO account ${targetBdoIdForLegacy} does not exist in bdoAccounts collection - skipping assignment`);
                        }
                    });
                    
                    console.log(`✅ Legacy BDO accounts processing completed for ownership transfer`);
                } catch (bdoError) {
                    // Log the error but don't fail the main operation
                    console.warn(`⚠️ Failed to update legacy BDO accounts: ${bdoError.message}`);
                    await this.actionLogger.logError(bdoError, {
                        action: 'executeOwnershipTransfer',
                        context: 'Legacy BDO account update',
                        imei: deviceImei,
                        currentBdoId,
                        targetBdoId: targetBdoIdForLegacy,
                        errorDetails: bdoError.message
                    });
                }
            } else {
                console.log(`ℹ️ Skipping legacy BDO account update - missing BDO IDs (current: ${currentBdoId}, target: ${targetBdoIdForLegacy})`);
            }

            console.log(`✅ Ownership transfer executed for device ${deviceImei} from BDO ${currentBdoId} to BDO ${targetBdoIdForLegacy}`);
            return { success: true, deviceResult };

        } catch (error) {
            console.error(`❌ Error executing ownership transfer:`, {
                error: error.message,
                requestNumber: requestData.requestNumber,
                deviceImei: this.safeGetValue(
                    requestData.device?.imei, 
                    requestData.deviceDetails?.imei,
                    requestData.transferDetails?.originalDeviceId
                ),
                targetBdoId: this.safeGetValue(
                    requestData.transferDetails?.destinationBdoId,
                    requestData.device?.targetBdoId, 
                    requestData.newBdoDetails?.bdoId
                ),
                sourceBdoId: this.safeGetValue(
                    requestData.transferDetails?.sourceBdoId,
                    requestData.device?.currentBdoId
                ),
                transferDetailsAvailable: !!requestData.transferDetails,
                transferDetailsKeys: Object.keys(requestData.transferDetails || {}),
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Execute OTP number change - Updates BDO account and associated device records
     */
    async executeOTPChange(requestData, externalPortalReference) {
        try {
            console.log(`📞 Executing OTP change for request: ${requestData.requestNumber}`);
            
            // Extract BDO and OTP information from request data
            const bdoId = requestData.bdoDetails?.bdoId || requestData.bdo?.id;
            const bdoDocumentId = requestData.bdoDetails?.bdoDocumentId || requestData.bdo?.documentId;
            const currentOtp = requestData.bdoDetails?.currentOtpMobileNumber || requestData.currentOTP;
            const newOtp = requestData.bdoDetails?.newOtpMobileNumber || requestData.newOTP;
            const deviceImei = requestData.deviceDetails?.imei || requestData.deviceInfo?.imei;

            console.log(`📱 OTP Change Details:`, {
                bdoId,
                bdoDocumentId,
                currentOtp,
                newOtp,
                deviceImei,
                requestId: requestData.id || requestData.requestId
            });

            if (!bdoId || !newOtp) {
                throw new Error('BDO ID and new OTP number are required for OTP change');
            }

            if (!currentOtp) {
                throw new Error('Current OTP number is required for OTP change audit trail');
            }

            // Update device's OTP in devices collection if device IMEI is provided (PRIMARY OPERATION)
            let deviceResult = null;
            if (deviceImei) {
                deviceResult = await this.deviceService.updateDeviceOTP(
                    deviceImei,
                    newOtp,
                    requestData.id || requestData.requestId
                );

                if (!deviceResult.success) {
                    throw new Error(`Failed to update device OTP: ${deviceResult.error}`);
                }
                
                console.log(`✅ Device OTP updated in devices collection for IMEI: ${deviceImei}`);
            } else {
                console.warn(`⚠️ No device IMEI provided for OTP change - only updating BDO account`);
            }

            // Update BDO account with comprehensive OTP change history (NEW METHOD)
            const bdoUpdateResult = await this.updateBDOAccountOTPChange(
                bdoId,
                bdoDocumentId,
                currentOtp,
                newOtp,
                requestData.id || requestData.requestId,
                requestData.requestNumber
            );

            if (!bdoUpdateResult.success) {
                console.warn(`⚠️ BDO account update failed: ${bdoUpdateResult.error}`);
                // Don't fail the entire operation, but log the issue
            } else {
                console.log(`✅ BDO account updated with comprehensive OTP change history`);
            }

            console.log(`✅ OTP Change executed: BDO ${bdoId} OTP updated from ${currentOtp} to ${newOtp}`);
            return { 
                success: true, 
                deviceResult,
                bdoUpdateResult 
            };

        } catch (error) {
            console.error(`❌ Error executing OTP change:`, error);
            
            // Log the error for debugging
            await this.actionLogger.logError(error, {
                action: 'executeOTPChange',
                context: 'OTP change execution',
                requestData: {
                    bdoId: requestData.bdoDetails?.bdoId,
                    deviceImei: requestData.deviceDetails?.imei,
                    requestId: requestData.id
                }
            });
            
            throw error;
        }
    }

    /**
     * Execute device de-mapping
     */
    async executeDeviceDemap(requestData, externalPortalReference) {
        try {
            console.log(`🚫 Executing device de-mapping for request: ${requestData.requestNumber}`);
            
            const deviceImei = requestData.device?.imei;
            const demapReason = requestData.demapReason;
            const performedBy = this.user.uid;

            if (!deviceImei) {
                throw new Error('Device IMEI is required for device de-mapping');
            }

            // Execute device de-mapping in devices collection (PRIMARY OPERATION)
            const deviceResult = await this.deviceService.demapDevice(
                deviceImei,
                requestData.id || requestData.requestId,
                demapReason,
                performedBy
            );

            if (!deviceResult.success) {
                throw new Error(`Failed to demap device: ${deviceResult.error}`);
            }

            console.log(`✅ Device de-mapped in devices collection for IMEI: ${deviceImei}`);

            // Update BDO account to remove device assignment (LEGACY COMPATIBILITY - in separate transaction)
            if (requestData.device?.currentBdoId) {
                try {
                    await runTransaction(this.db, async (transaction) => {
                        const bdoRef = doc(this.db, 'bdoAccounts', requestData.device.currentBdoId);
                        
                        transaction.update(bdoRef, {
                            [`assignedDevices.${deviceImei}`]: null,
                            metadata: {
                                updatedAt: Timestamp.now()
                            }
                        });
                    });
                    
                    console.log(`✅ Legacy BDO account updated for device de-mapping`);
                } catch (bdoError) {
                    // Log the error but don't fail the main operation
                    console.warn(`⚠️ Failed to update legacy BDO account: ${bdoError.message}`);
                    await this.actionLogger.logError(bdoError, {
                        action: 'executeDeviceDemap',
                        context: 'Legacy BDO account update',
                        imei: deviceImei,
                        bdoId: requestData.device?.currentBdoId
                    });
                }
            }

            console.log(`✅ Device de-mapping executed for device ${deviceImei} - Reason: ${demapReason}`);
            return { success: true, deviceResult };

        } catch (error) {
            console.error(`❌ Error executing device de-mapping:`, error);
            throw error;
        }
    }

    /**
     * Execute location update/reset after Operations marks the request complete.
     */
    async executeLocationUpdate(requestData, externalPortalReference) {
        try {
            console.log(`📍 Executing location update for request: ${requestData.requestNumber}`);
            
            const deviceImei = requestData.device?.imei
                || requestData.deviceInfo?.imei
                || requestData.deviceDetails?.imei
                || requestData.currentMapping?.deviceInfo?.imei;
            
            if (!deviceImei) {
                throw new Error('Device IMEI is required for location update');
            }

            const rawNewLocation = requestData.newLocation || requestData.locationChangeDetails?.newLocation || {};
            const hasCoordinates = rawNewLocation.hasCoordinates === true
                || (rawNewLocation.latitude !== null && rawNewLocation.latitude !== undefined && rawNewLocation.longitude !== null && rawNewLocation.longitude !== undefined)
                || (rawNewLocation.coordinates?.latitude !== null && rawNewLocation.coordinates?.latitude !== undefined && rawNewLocation.coordinates?.longitude !== null && rawNewLocation.coordinates?.longitude !== undefined);

            const latitude = hasCoordinates
                ? (rawNewLocation.latitude ?? rawNewLocation.coordinates?.latitude ?? null)
                : null;
            const longitude = hasCoordinates
                ? (rawNewLocation.longitude ?? rawNewLocation.coordinates?.longitude ?? null)
                : null;

            // Prepare location update data. Address/city are not changed by this workflow unless sent explicitly later.
            const locationUpdateData = {
                latitude,
                longitude,
                previousLocation: requestData.previousLocation || requestData.currentMapping?.locationDetails || null,
                performedBy: this.user.uid,
                dateKey: requestData.locationChangeDailyUsageDate,
                reason: requestData.locationChangeReason || requestData.locationChangeDetails?.locationChangeReason || null
            };

            if (rawNewLocation.address || requestData.locationDetails?.streetAddress) {
                locationUpdateData.streetAddress = rawNewLocation.address || requestData.locationDetails?.streetAddress;
            }
            if (rawNewLocation.city || requestData.locationDetails?.city) {
                locationUpdateData.city = rawNewLocation.city || requestData.locationDetails?.city;
            }

            // Update device location in devices collection (PRIMARY OPERATION)
            const deviceResult = await this.deviceService.updateDeviceLocation(
                deviceImei,
                locationUpdateData,
                requestData.id || requestData.requestId
            );

            if (!deviceResult.success) {
                throw new Error(`Failed to update device location: ${deviceResult.error}`);
            }

            console.log(`✅ Device location reset/update executed for IMEI: ${deviceImei}`);
            return { success: true, deviceResult };

        } catch (error) {
            console.error(`❌ Error executing location update:`, error);
            throw error;
        }
    }

    /**
     * Validate request for submission
     */
    validateRequestForSubmission(requestData) {
        const requiredFields = {
            'NEW_MAPPING': ['device.imei', 'bdo.name', 'bdo.cnicNumber', 'bdo.mobileNumber'],
            'TRANSFER_OWNERSHIP': ['device.imei', 'device.currentBdoId', 'device.targetBdoId'],
            'OTP_CHANGE': ['bdoDetails.bdoId', 'bdoDetails.currentOtpMobileNumber', 'bdoDetails.newOtpMobileNumber', 'deviceDetails.imei'],
            'LOCATION_UPDATE': ['device.imei'],
            'DE_MAPPING': ['device.imei', 'device.currentBdoId', 'demapReason']
        };

        const required = requiredFields[requestData.type || requestData.requestType] || [];
        
        for (const field of required) {
            const value = this.getNestedValue(requestData, field);
            if (!value) {
                throw new Error(`Required field missing: ${field}`);
            }
        }
    }

    /**
     * Update BDO account with OTP change history and audit trail
     */
    async updateBDOAccountOTPChange(bdoId, bdoDocumentId, currentOtp, newOtp, requestId, requestNumber) {
        try {
            console.log(`📱 Updating BDO account for OTP change: ${bdoId}`);
            
            await runTransaction(this.db, async (transaction) => {
                // Use document ID if available, otherwise query by bdoId
                const bdoRef = bdoDocumentId ? 
                    doc(this.db, 'bdoAccounts', bdoDocumentId) : 
                    doc(this.db, 'bdoAccounts', bdoId);
                
                const bdoDoc = await transaction.get(bdoRef);
                
                if (!bdoDoc.exists()) {
                    throw new Error(`BDO account not found: ${bdoId}`);
                }
                
                const bdoData = bdoDoc.data();
                
                // Create OTP change history entry
                const otpChangeEntry = {
                    changeId: requestId,
                    requestNumber: requestNumber,
                    previousOtp: currentOtp,
                    newOtp: newOtp,
                    changedAt: Timestamp.now(),
                    changedBy: this.user.uid,
                    franchiseCode: this.user.franchiseCode,
                    reason: 'OTP Change Request'
                };
                
                // Update BDO account
                const updateData = {
                    otpMobileNumber: newOtp,
                    otpChangeCount: (bdoData.otpChangeCount || 0) + 1,
                    otpChangeHistory: [...(bdoData.otpChangeHistory || []), otpChangeEntry],
                    lastOtpChange: {
                        previousNumber: currentOtp,
                        newNumber: newOtp,
                        changeDate: Timestamp.now(),
                        requestId: requestId,
                        requestNumber: requestNumber
                    },
                    updatedAt: Timestamp.now(),
                    metadata: {
                        ...bdoData.metadata,
                        lastModifiedBy: this.user.uid,
                        lastModifiedAt: Timestamp.now(),
                        source: 'OTP_CHANGE_REQUEST'
                    }
                };
                
                transaction.update(bdoRef, updateData);
                
                console.log(`✅ BDO account ${bdoId} updated with OTP change history`);
            });
            
            // Log the OTP change for audit
            await this.actionLogger.logAction({
                action: 'bdo_otp_changed',
                description: `OTP changed for BDO ${bdoId}: ${currentOtp} → ${newOtp}`,
                category: 'BDO_MANAGEMENT',
                severity: 'INFO',
                context: {
                    bdoId,
                    bdoDocumentId,
                    previousOtp: currentOtp,
                    newOtp: newOtp,
                    requestId,
                    requestNumber,
                    performedBy: this.user.uid
                }
            });
            
            return { success: true };
            
        } catch (error) {
            console.error(`❌ Error updating BDO account for OTP change:`, error);
            
            // Log the error but don't fail the main operation
            await this.actionLogger.logError(error, {
                action: 'updateBDOAccountOTPChange',
                context: 'BDO account OTP change update',
                bdoId,
                requestId
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get nested object value by dot notation
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
}

export default RequestWorkflowManager;
