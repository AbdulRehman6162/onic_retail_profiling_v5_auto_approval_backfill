// --- Device Collection Service ---
import { 
    doc, 
    setDoc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    Timestamp,
    arrayUnion,
    increment
} from 'firebase/firestore';

/**
 * Service for managing the devices collection - single source of truth for device mappings
 */
export class DeviceCollectionService {
    constructor(db, actionLogger) {
        this.db = db;
        this.actionLogger = actionLogger;
    }

    /**
     * Create GeoJSON Point from coordinates
     */
    createGeoPoint(latitude, longitude) {
        const lat = latitude === null || latitude === undefined || latitude === '' ? null : parseFloat(latitude);
        const lng = longitude === null || longitude === undefined || longitude === '' ? null : parseFloat(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        
        return {
            type: "Point",
            coordinates: [lng, lat] // [longitude, latitude]
        };
    }

    /**
     * Create a new device mapping record
     */
    async createDeviceMapping(deviceData, requestId) {
        try {
            console.log(`📱 Creating device mapping for IMEI: ${deviceData.imei}`);

            const deviceDoc = {
                // Device Identity
                imei: deviceData.imei || null,
                
                // Franchise Information
                franchiseCode: deviceData.franchiseCode || null,
                franchiseName: deviceData.name || deviceData.franchiseName || null,
                
                // BDO Information
                bdoId: deviceData.bdoId || null,
                bdoName: deviceData.bdoName || null,
                bdoCnic: deviceData.bdoCnic || null,
                otpMobileNumber: deviceData.otpMobileNumber || null,
                
                // Shop Information
                shopName: deviceData.shopName || null,
                streetAddress: deviceData.streetAddress || null,
                city: deviceData.city || null,
                premiseRelationship: deviceData.premiseRelationship || null,
                
                // Location Data
                latitude: deviceData.latitude ? parseFloat(deviceData.latitude) : null,
                longitude: deviceData.longitude ? parseFloat(deviceData.longitude) : null,
                location: this.createGeoPoint(deviceData.latitude, deviceData.longitude),
                
                // Document URLs
                cnicFrontUrl: deviceData.cnicFrontUrl || null,
                cnicBackUrl: deviceData.cnicBackUrl || null,
                shopInsideImageUrl: deviceData.shopInsideImageUrl || null,
                shopOutsideImageUrl: deviceData.shopOutsideImageUrl || null,
                
                // Status and Metadata
                status: "Mapped",
                createdAt: Timestamp.now(),
                lastUpdatedAt: Timestamp.now(),
                
                // Full Audit Trail - Complete history of all changes
                auditTrail: [{
                    action: "INITIAL_MAPPING",
                    timestamp: Timestamp.now(),
                    requestId: requestId,
                    previousState: null,
                    newState: {
                        bdoId: deviceData.bdoId || null,
                        bdoName: deviceData.bdoName || null,
                        bdoCnic: deviceData.bdoCnic || null,
                        otpMobileNumber: deviceData.otpMobileNumber || null,
                        shopName: deviceData.shopName || null,
                        streetAddress: deviceData.streetAddress || null,
                        city: deviceData.city || null,
                        premiseRelationship: deviceData.premiseRelationship || null,
                        status: "Mapped"
                    },
                    performedBy: deviceData.performedBy || 'system',
                    description: `Device initially mapped to BDO ${deviceData.bdoId || 'unknown'}`
                }]
            };

            // Debug: Check for undefined values before sending to Firestore
            console.log(`🔍 [DEBUG] Checking deviceDoc for undefined values before setDoc:`);
            const checkForUndefined = (obj, path = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const currentPath = path ? `${path}.${key}` : key;
                    if (value === undefined) {
                        console.error(`❌ Found undefined value at: ${currentPath}`);
                    } else if (value !== null && typeof value === 'object' && !value.hasOwnProperty('seconds')) {
                        // Skip Timestamp objects and recursively check other objects
                        checkForUndefined(value, currentPath);
                    }
                }
            };
            checkForUndefined(deviceDoc);

            const deviceRef = doc(this.db, 'devices', deviceData.imei);
            await setDoc(deviceRef, deviceDoc);

            // Log action
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'DEVICE_MAPPED',
                    description: `Device ${deviceData.imei} mapped to BDO ${deviceData.bdoId}`,
                    category: 'DEVICE_MANAGEMENT',
                    severity: 'INFO',
                    context: {
                        imei: deviceData.imei,
                        bdoId: deviceData.bdoId,
                        requestId: requestId
                    }
                });
            }

            console.log(`✅ Device mapping created successfully for IMEI: ${deviceData.imei}`);
            return { success: true, deviceDoc };

        } catch (error) {
            console.error('❌ Error creating device mapping:', error);
            
            if (this.actionLogger) {
                await this.actionLogger.logError(error, {
                    action: 'createDeviceMapping',
                    imei: deviceData.imei,
                    context: 'Creating new device mapping'
                });
            }

            return {
                success: false,
                error: 'Failed to create device mapping',
                errorCode: 'CREATE_FAILED'
            };
        }
    }

    /**
     * Update device mapping for Change of Operator (COO)
     */
    async updateDeviceForCOO(imei, newBdoData, requestId) {
        try {
            console.log(`🔄 Updating device ${imei} for COO to BDO: ${newBdoData.bdoId}`);
            
            // Validate essential parameters
            if (!imei) {
                return {
                    success: false,
                    error: 'Device IMEI is required',
                    errorCode: 'MISSING_IMEI'
                };
            }
            
            if (!newBdoData.bdoId) {
                return {
                    success: false,
                    error: 'Target BDO ID is required',
                    errorCode: 'MISSING_BDO_ID'
                };
            }

            const deviceRef = doc(this.db, 'devices', imei);
            const deviceDoc = await getDoc(deviceRef);

            if (!deviceDoc.exists()) {
                console.log(`❌ Device not found in devices collection: ${imei}`);
                console.log(`🔍 [DEBUG] This might be a legacy device that hasn't been migrated to the new devices collection yet.`);
                return {
                    success: false,
                    error: `Device ${imei} not found in devices collection. This device may need to be migrated from legacy data first.`,
                    errorCode: 'DEVICE_NOT_FOUND',
                    suggestion: 'Check if device exists in legacy bdoAccounts collection and migrate if needed'
                };
            }

            const currentData = deviceDoc.data();
            
            // Log the update details for debugging
            console.log(`🔍 [DEBUG] COO Update Details:`, {
                imei,
                currentBdoId: currentData.bdoId,
                newBdoId: newBdoData.bdoId,
                hasOtpNumber: !!newBdoData.otpMobileNumber,
                hasLocation: !!(newBdoData.latitude && newBdoData.longitude),
                newBdoDataKeys: Object.keys(newBdoData).filter(key => newBdoData[key] !== null && newBdoData[key] !== undefined)
            });
            
            // Prepare audit trail entry
            const auditEntry = {
                action: "CHANGE_OF_OPERATOR",
                timestamp: Timestamp.now(),
                requestId: requestId,
                previousState: {
                    bdoId: currentData.bdoId,
                    bdoName: currentData.bdoName,
                    bdoCnic: currentData.bdoCnic,
                    otpMobileNumber: currentData.otpMobileNumber,
                    shopName: currentData.shopName,
                    streetAddress: currentData.streetAddress,
                    city: currentData.city,
                    premiseRelationship: currentData.premiseRelationship
                },
                newState: {
                    bdoId: newBdoData.bdoId,
                    bdoName: newBdoData.bdoName,
                    bdoCnic: newBdoData.bdoCnic,
                    otpMobileNumber: newBdoData.otpMobileNumber,
                    shopName: newBdoData.shopName,
                    streetAddress: newBdoData.streetAddress,
                    city: newBdoData.city,
                    premiseRelationship: newBdoData.premiseRelationship
                },
                performedBy: newBdoData.performedBy || 'system',
                description: `Device transferred from BDO ${currentData.bdoId} to BDO ${newBdoData.bdoId}`
            };

            // Prepare update object with only defined values to avoid Firestore issues
            const updateFields = {
                // Update BDO Information (only if values are not null/undefined)
                ...(newBdoData.bdoId !== null && newBdoData.bdoId !== undefined && { bdoId: newBdoData.bdoId }),
                ...(newBdoData.bdoName !== null && newBdoData.bdoName !== undefined && { bdoName: newBdoData.bdoName }),
                ...(newBdoData.bdoCnic !== null && newBdoData.bdoCnic !== undefined && { bdoCnic: newBdoData.bdoCnic }),
                ...(newBdoData.otpMobileNumber !== null && newBdoData.otpMobileNumber !== undefined && { otpMobileNumber: newBdoData.otpMobileNumber }),
                
                // Update Shop Information (only if values are not null/undefined)
                ...(newBdoData.shopName !== null && newBdoData.shopName !== undefined && { shopName: newBdoData.shopName }),
                ...(newBdoData.streetAddress !== null && newBdoData.streetAddress !== undefined && { streetAddress: newBdoData.streetAddress }),
                ...(newBdoData.city !== null && newBdoData.city !== undefined && { city: newBdoData.city }),
                ...(newBdoData.premiseRelationship !== null && newBdoData.premiseRelationship !== undefined && { premiseRelationship: newBdoData.premiseRelationship }),
                
                // Update Location if provided
                ...(newBdoData.latitude && newBdoData.longitude && {
                    latitude: parseFloat(newBdoData.latitude),
                    longitude: parseFloat(newBdoData.longitude),
                    location: this.createGeoPoint(newBdoData.latitude, newBdoData.longitude)
                }),
                
                // Update Document URLs if provided
                ...(newBdoData.cnicFrontUrl && { cnicFrontUrl: newBdoData.cnicFrontUrl }),
                ...(newBdoData.cnicBackUrl && { cnicBackUrl: newBdoData.cnicBackUrl }),
                ...(newBdoData.shopInsideImageUrl && { shopInsideImageUrl: newBdoData.shopInsideImageUrl }),
                ...(newBdoData.shopOutsideImageUrl && { shopOutsideImageUrl: newBdoData.shopOutsideImageUrl }),
                
                // Update metadata
                lastUpdatedAt: Timestamp.now(),
                
                // Add to audit trail
                auditTrail: arrayUnion(auditEntry)
            };

            // Debug: Log the final update fields being sent to Firestore
            console.log(`🔍 [DEBUG] Firestore update fields:`, {
                imei,
                updateFieldCount: Object.keys(updateFields).length,
                updateFields: Object.keys(updateFields),
                hasRequiredFields: !!(updateFields.bdoId && updateFields.bdoName)
            });

            // Update device document
            await updateDoc(deviceRef, updateFields);

            console.log(`✅ Device ${imei} updated successfully for COO`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating device for COO:', {
                error: error.message,
                imei,
                newBdoId: newBdoData?.bdoId,
                requestId,
                errorDetails: {
                    code: error.code,
                    message: error.message,
                    stack: error.stack
                }
            });
            
            // Log detailed error for debugging
            if (this.actionLogger) {
                await this.actionLogger.logError(error, {
                    action: 'updateDeviceForCOO',
                    imei,
                    newBdoData,
                    requestId,
                    context: 'Device ownership transfer update'
                });
            }
            
            return {
                success: false,
                error: `Failed to update device for COO: ${error.message}`,
                errorCode: 'UPDATE_FAILED',
                errorDetails: {
                    originalError: error.message,
                    imei,
                    newBdoId: newBdoData?.bdoId
                }
            };
        }
    }

    /**
     * Update device OTP number
     */
    async updateDeviceOTP(imei, newOtpNumber, requestId) {
        try {
            console.log(`📞 Updating OTP for device ${imei} to: ${newOtpNumber}`);

            const deviceRef = doc(this.db, 'devices', imei);
            const deviceDoc = await getDoc(deviceRef);

            if (!deviceDoc.exists()) {
                return {
                    success: false,
                    error: 'Device not found',
                    errorCode: 'DEVICE_NOT_FOUND'
                };
            }

            const currentData = deviceDoc.data();

            // Prepare audit trail entry
            const auditEntry = {
                action: "OTP_CHANGE",
                timestamp: Timestamp.now(),
                requestId: requestId,
                previousState: {
                    otpMobileNumber: currentData.otpMobileNumber
                },
                newState: {
                    otpMobileNumber: newOtpNumber
                },
                performedBy: 'system',
                description: `OTP changed from ${currentData.otpMobileNumber} to ${newOtpNumber}`
            };

            // Update device document
            await updateDoc(deviceRef, {
                otpMobileNumber: newOtpNumber,
                lastUpdatedAt: Timestamp.now(),
                auditTrail: arrayUnion(auditEntry)
            });

            console.log(`✅ OTP updated successfully for device ${imei}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating device OTP:', error);
            return {
                success: false,
                error: 'Failed to update device OTP',
                errorCode: 'UPDATE_FAILED'
            };
        }
    }

    /**
     * De-map device - Remove BDO and shop details but preserve audit trail
     */
    async demapDevice(imei, requestId, reason) {
        try {
            console.log(`🚫 De-mapping device ${imei}`);

            const deviceRef = doc(this.db, 'devices', imei);
            const deviceDoc = await getDoc(deviceRef);

            if (!deviceDoc.exists()) {
                return {
                    success: false,
                    error: 'Device not found',
                    errorCode: 'DEVICE_NOT_FOUND'
                };
            }

            const currentData = deviceDoc.data();

            // Prepare audit trail entry with complete previous state
            const auditEntry = {
                action: "DE_MAPPING",
                timestamp: Timestamp.now(),
                requestId: requestId,
                previousState: {
                    bdoId: currentData.bdoId,
                    bdoName: currentData.bdoName,
                    bdoCnic: currentData.bdoCnic,
                    otpMobileNumber: currentData.otpMobileNumber,
                    shopName: currentData.shopName,
                    streetAddress: currentData.streetAddress,
                    city: currentData.city,
                    premiseRelationship: currentData.premiseRelationship,
                    status: currentData.status
                },
                newState: {
                    status: "Unmapped"
                },
                performedBy: 'system',
                description: `Device de-mapped from BDO ${currentData.bdoId}. Reason: ${reason || 'Not specified'}`,
                demappingReason: reason
            };

            // Update device document - clear BDO and shop details but keep audit trail
            await updateDoc(deviceRef, {
                // Clear BDO Information
                bdoId: null,
                bdoName: null,
                bdoCnic: null,
                otpMobileNumber: null,
                
                // Clear Shop Information
                shopName: null,
                streetAddress: null,
                city: null,
                premiseRelationship: null,
                
                // Clear Location Data
                latitude: null,
                longitude: null,
                location: null,
                
                // Clear Document URLs
                cnicFrontUrl: null,
                cnicBackUrl: null,
                shopInsideImageUrl: null,
                shopOutsideImageUrl: null,
                
                // Update status and metadata
                status: "Unmapped",
                lastUpdatedAt: Timestamp.now(),
                
                // Add to audit trail (preserving complete history)
                auditTrail: arrayUnion(auditEntry)
            });

            console.log(`✅ Device ${imei} de-mapped successfully`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error de-mapping device:', error);
            return {
                success: false,
                error: 'Failed to de-map device',
                errorCode: 'DEMAP_FAILED'
            };
        }
    }

    /**
     * Update or reset device coordinates after an approved Location Change request.
     *
     * Read optimization: if the request already contains previousLocation, this method
     * skips a device read and performs a direct update. It only reads the device when
     * previous data is missing, so the audit entry can still be complete.
     */
    async updateDeviceLocation(imei, locationData = {}, requestId) {
        try {
            console.log(`📍 Updating location for device ${imei}`);

            const deviceRef = doc(this.db, 'devices', imei);
            const previousLocation = locationData.previousLocation || null;
            let currentData = previousLocation ? {
                streetAddress: previousLocation.streetAddress ?? previousLocation.address ?? null,
                city: previousLocation.city ?? null,
                latitude: previousLocation.latitude ?? null,
                longitude: previousLocation.longitude ?? null,
                shopName: previousLocation.shopName ?? null
            } : null;

            if (!currentData) {
                const deviceDoc = await getDoc(deviceRef);

                if (!deviceDoc.exists()) {
                    return {
                        success: false,
                        error: 'Device not found',
                        errorCode: 'DEVICE_NOT_FOUND'
                    };
                }

                currentData = deviceDoc.data();
            }

            const nextLatitude = locationData.latitude === null || locationData.latitude === undefined || locationData.latitude === ''
                ? null
                : parseFloat(locationData.latitude);
            const nextLongitude = locationData.longitude === null || locationData.longitude === undefined || locationData.longitude === ''
                ? null
                : parseFloat(locationData.longitude);
            const normalizedLatitude = Number.isFinite(nextLatitude) ? nextLatitude : null;
            const normalizedLongitude = Number.isFinite(nextLongitude) ? nextLongitude : null;
            const hasCoordinates = normalizedLatitude !== null && normalizedLongitude !== null;
            const timestamp = Timestamp.now();
            const dateKey = locationData.dateKey || new Date().toISOString().slice(0, 10);
            const safeDateKey = `d_${String(dateKey).replace(/[^A-Za-z0-9_]/g, '_')}`;

            const nextStreetAddress = Object.prototype.hasOwnProperty.call(locationData, 'streetAddress')
                ? (locationData.streetAddress || null)
                : (currentData.streetAddress ?? currentData.address ?? null);
            const nextCity = Object.prototype.hasOwnProperty.call(locationData, 'city')
                ? (locationData.city || null)
                : (currentData.city ?? null);

            const auditEntry = {
                action: 'LOCATION_RESET',
                timestamp,
                requestId: requestId || null,
                previousState: {
                    streetAddress: currentData.streetAddress ?? currentData.address ?? null,
                    city: currentData.city ?? null,
                    latitude: currentData.latitude ?? null,
                    longitude: currentData.longitude ?? null
                },
                newState: {
                    streetAddress: nextStreetAddress,
                    city: nextCity,
                    latitude: normalizedLatitude,
                    longitude: normalizedLongitude
                },
                performedBy: locationData.performedBy || 'system',
                description: hasCoordinates
                    ? `Location coordinates updated for device ${imei}`
                    : `Location coordinates reset to null for device ${imei}`,
                reason: locationData.reason || null
            };

            const updatePayload = {
                latitude: normalizedLatitude,
                longitude: normalizedLongitude,
                location: this.createGeoPoint(normalizedLatitude, normalizedLongitude),
                lastUpdatedAt: timestamp,
                locationResetCount: increment(1),
                [`locationResetCountByDate.${safeDateKey}`]: increment(1),
                auditTrail: arrayUnion(auditEntry)
            };

            // Keep existing address/city unless a future location workflow explicitly sends them.
            if (Object.prototype.hasOwnProperty.call(locationData, 'streetAddress')) {
                updatePayload.streetAddress = nextStreetAddress;
            }
            if (Object.prototype.hasOwnProperty.call(locationData, 'city')) {
                updatePayload.city = nextCity;
            }

            await updateDoc(deviceRef, updatePayload);

            // Separate lightweight counter document for reset reporting without scanning devices.
            const counterRef = doc(this.db, 'deviceLocationResetCounters', imei);
            await setDoc(counterRef, {
                imei,
                totalResets: increment(1),
                dailyCounts: {
                    [safeDateKey]: increment(1)
                },
                lastResetAt: timestamp,
                lastRequestId: requestId || null,
                lastPerformedBy: locationData.performedBy || 'system',
                lastLatitude: normalizedLatitude,
                lastLongitude: normalizedLongitude,
                updatedAt: timestamp
            }, { merge: true });

            console.log(`✅ Location reset/update completed for device ${imei}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating device location:', error);
            return {
                success: false,
                error: 'Failed to update device location',
                errorCode: 'UPDATE_FAILED'
            };
        }
    }

    /**
     * Get device by IMEI
     */
    async getDeviceByIMEI(imei) {
        try {
            const deviceRef = doc(this.db, 'devices', imei);
            const deviceDoc = await getDoc(deviceRef);

            if (!deviceDoc.exists()) {
                return {
                    success: false,
                    error: 'Device not found',
                    errorCode: 'DEVICE_NOT_FOUND'
                };
            }

            return {
                success: true,
                device: deviceDoc.data()
            };

        } catch (error) {
            console.error('❌ Error getting device:', error);
            return {
                success: false,
                error: 'Failed to retrieve device',
                errorCode: 'GET_FAILED'
            };
        }
    }

    /**
     * Get devices by BDO ID
     */
    async getDevicesByBDO(bdoId) {
        try {
            const devicesQuery = query(
                collection(this.db, 'devices'),
                where('bdoId', '==', bdoId),
                where('status', '==', 'Mapped')
            );

            const devicesSnapshot = await getDocs(devicesQuery);
            const devices = [];

            devicesSnapshot.forEach(doc => {
                devices.push({
                    imei: doc.id,
                    ...doc.data()
                });
            });

            return {
                success: true,
                devices: devices
            };

        } catch (error) {
            console.error('❌ Error getting devices by BDO:', error);
            return {
                success: false,
                error: 'Failed to retrieve devices',
                errorCode: 'QUERY_FAILED'
            };
        }
    }

    /**
     * Get devices by franchise
     */
    async getDevicesByFranchise(franchiseCode, status = 'Mapped') {
        try {
            const devicesQuery = query(
                collection(this.db, 'devices'),
                where('franchiseCode', '==', franchiseCode),
                where('status', '==', status)
            );

            const devicesSnapshot = await getDocs(devicesQuery);
            const devices = [];

            devicesSnapshot.forEach(doc => {
                devices.push({
                    imei: doc.id,
                    ...doc.data()
                });
            });

            return {
                success: true,
                devices: devices
            };

        } catch (error) {
            console.error('❌ Error getting devices by franchise:', error);
            return {
                success: false,
                error: 'Failed to retrieve devices',
                errorCode: 'QUERY_FAILED'
            };
        }
    }

    /**
     * Check if device exists and is mapped
     */
    async isDeviceMapped(imei) {
        try {
            const result = await this.getDeviceByIMEI(imei);
            
            if (!result.success) {
                return { mapped: false, exists: false };
            }

            return {
                mapped: result.device.status === 'Mapped',
                exists: true,
                device: result.device
            };

        } catch (error) {
            console.error('❌ Error checking device mapping status:', error);
            return { mapped: false, exists: false, error: error.message };
        }
    }

    /**
     * Get complete audit trail for a device
     */
    async getDeviceAuditTrail(imei) {
        try {
            const result = await this.getDeviceByIMEI(imei);
            
            if (!result.success) {
                return result;
            }

            return {
                success: true,
                auditTrail: result.device.auditTrail || []
            };

        } catch (error) {
            console.error('❌ Error getting device audit trail:', error);
            return {
                success: false,
                error: 'Failed to retrieve audit trail',
                errorCode: 'AUDIT_FAILED'
            };
        }
    }

    /**
     * Get mapped devices for a specific franchise with search and filter capabilities
     */
    async getMappedDevicesForFranchise(franchiseCode, searchFilters = {}) {
        try {
            console.log(`🔍 Getting mapped devices for franchise: ${franchiseCode}`, searchFilters);

            // Base query for franchise mapped devices
            let q = query(
                collection(this.db, 'devices'),
                where('franchiseCode', '==', franchiseCode),
                where('status', '==', 'Mapped')
            );

            const querySnapshot = await getDocs(q);
            let devices = querySnapshot.docs.map(doc => ({
                imei: doc.id,
                ...doc.data(),
                // Convert Firestore Timestamps to JavaScript Dates for easier handling
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
                lastUpdatedAt: doc.data().lastUpdatedAt?.toDate?.() || doc.data().lastUpdatedAt
            }));

            // Apply client-side filters (since Firestore has limited query capabilities)
            if (searchFilters.imei) {
                devices = devices.filter(device => 
                    device.imei?.toLowerCase().includes(searchFilters.imei.toLowerCase())
                );
            }

            if (searchFilters.bdoId) {
                devices = devices.filter(device => 
                    device.bdoId?.toLowerCase().includes(searchFilters.bdoId.toLowerCase())
                );
            }

            if (searchFilters.bdoName) {
                devices = devices.filter(device => 
                    device.bdoName?.toLowerCase().includes(searchFilters.bdoName.toLowerCase())
                );
            }

            if (searchFilters.city) {
                devices = devices.filter(device => 
                    device.city?.toLowerCase().includes(searchFilters.city.toLowerCase())
                );
            }

            if (searchFilters.shopName) {
                devices = devices.filter(device => 
                    device.shopName?.toLowerCase().includes(searchFilters.shopName.toLowerCase())
                );
            }

            // Sort by lastUpdatedAt (most recent first)
            devices.sort((a, b) => {
                const dateA = a.lastUpdatedAt || a.createdAt || new Date(0);
                const dateB = b.lastUpdatedAt || b.createdAt || new Date(0);
                return dateB - dateA;
            });

            console.log(`✅ Found ${devices.length} mapped devices for franchise ${franchiseCode}`);

            return {
                success: true,
                devices: devices,
                total: devices.length,
                franchiseCode: franchiseCode
            };

        } catch (error) {
            console.error(`❌ Error getting mapped devices for franchise ${franchiseCode}:`, error);
            return {
                success: false,
                error: 'Failed to retrieve franchise devices',
                errorCode: 'QUERY_FAILED',
                devices: []
            };
        }
    }

    /**
     * Get device details with current mapping information for de-mapping workflow
     */
    async getDeviceWithMappingDetails(imei) {
        try {
            console.log(`📱 Getting device mapping details for: ${imei}`);

            const deviceRef = doc(this.db, 'devices', imei);
            const deviceDoc = await getDoc(deviceRef);

            if (!deviceDoc.exists()) {
                return {
                    success: false,
                    error: 'Device not found',
                    errorCode: 'DEVICE_NOT_FOUND'
                };
            }

            const deviceData = deviceDoc.data();

            // Structure the response for de-mapping workflow
            const mappingDetails = {
                imei: imei,
                deviceInfo: {
                    imei: imei,
                    status: deviceData.status,
                    model: deviceData.model || 'Not specified',
                    createdAt: deviceData.createdAt?.toDate?.() || deviceData.createdAt,
                    lastUpdatedAt: deviceData.lastUpdatedAt?.toDate?.() || deviceData.lastUpdatedAt
                },
                bdoDetails: {
                    bdoId: deviceData.bdoId,
                    name: deviceData.bdoName,
                    cnic: deviceData.bdoCnic,
                    phoneNumber: deviceData.otpMobileNumber
                },
                locationDetails: {
                    shopName: deviceData.shopName,
                    streetAddress: deviceData.streetAddress,
                    city: deviceData.city,
                    premiseRelationship: deviceData.premiseRelationship,
                    coordinates: deviceData.location ? {
                        latitude: deviceData.latitude,
                        longitude: deviceData.longitude
                    } : null
                },
                franchiseInfo: {
                    franchiseCode: deviceData.franchiseCode,
                    franchiseName: deviceData.franchiseName
                },
                mappingDate: deviceData.createdAt?.toDate?.() || deviceData.createdAt,
                status: deviceData.status,
                auditTrail: deviceData.auditTrail || []
            };

            console.log(`✅ Device mapping details retrieved for: ${imei}`);

            return {
                success: true,
                mappingDetails: mappingDetails
            };

        } catch (error) {
            console.error(`❌ Error getting device mapping details for ${imei}:`, error);
            return {
                success: false,
                error: 'Failed to retrieve device mapping details',
                errorCode: 'QUERY_FAILED'
            };
        }
    }

    /**
     * Get available cities for a franchise (for filtering)
     */
    async getFranchiseCities(franchiseCode) {
        try {
            console.log(`🏙️ Getting cities for franchise: ${franchiseCode}`);

            const q = query(
                collection(this.db, 'devices'),
                where('franchiseCode', '==', franchiseCode),
                where('status', '==', 'Mapped')
            );

            const querySnapshot = await getDocs(q);
            const cities = new Set();
            
            querySnapshot.docs.forEach(doc => {
                const city = doc.data().city;
                if (city) {
                    cities.add(city);
                }
            });

            const cityList = Array.from(cities).sort();

            console.log(`✅ Found ${cityList.length} cities for franchise ${franchiseCode}`);

            return {
                success: true,
                cities: cityList
            };

        } catch (error) {
            console.error(`❌ Error getting cities for franchise ${franchiseCode}:`, error);
            return {
                success: false,
                error: 'Failed to retrieve cities',
                errorCode: 'QUERY_FAILED',
                cities: []
            };
        }
    }

    /**
     * Get device statistics for a franchise
     */
    async getFranchiseDeviceStats(franchiseCode) {
        try {
            console.log(`📊 Getting device statistics for franchise: ${franchiseCode}`);

            const q = query(
                collection(this.db, 'devices'),
                where('franchiseCode', '==', franchiseCode)
            );

            const querySnapshot = await getDocs(q);
            const stats = {
                total: 0,
                mapped: 0,
                demapped: 0,
                transferred: 0,
                byCity: {},
                byStatus: {},
                recentActivity: 0 // devices updated in last 30 days
            };

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            querySnapshot.docs.forEach(doc => {
                const data = doc.data();
                stats.total++;

                // Status counts
                const status = data.status || 'Unknown';
                stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

                if (status === 'Mapped') stats.mapped++;
                if (status === 'Demapped') stats.demapped++;

                // City counts
                const city = data.city || 'Unknown';
                stats.byCity[city] = (stats.byCity[city] || 0) + 1;

                // Recent activity
                const lastUpdated = data.lastUpdatedAt?.toDate?.() || data.lastUpdatedAt;
                if (lastUpdated && lastUpdated > thirtyDaysAgo) {
                    stats.recentActivity++;
                }

                // Transfer count (check audit trail for transfers)
                const auditTrail = data.auditTrail || [];
                const hasTransfer = auditTrail.some(entry => entry.action === 'TRANSFER');
                if (hasTransfer) stats.transferred++;
            });

            console.log(`✅ Device statistics generated for franchise ${franchiseCode}:`, {
                total: stats.total,
                mapped: stats.mapped,
                cities: Object.keys(stats.byCity).length
            });

            return {
                success: true,
                stats: stats
            };

        } catch (error) {
            console.error(`❌ Error getting device statistics for franchise ${franchiseCode}:`, error);
            return {
                success: false,
                error: 'Failed to retrieve statistics',
                errorCode: 'QUERY_FAILED',
                stats: {}
            };
        }
    }
}

export default DeviceCollectionService;
