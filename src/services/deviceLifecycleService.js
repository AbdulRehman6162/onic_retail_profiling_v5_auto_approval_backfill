import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs, 
    orderBy,
    limit,
    Timestamp 
} from 'firebase/firestore';

/**
 * Device Lifecycle Service - Track device history and current status
 */
export class DeviceLifecycleService {
    constructor(app) {
        this.db = getFirestore(app);
    }

    /**
     * Get complete lifecycle history for a device
     */
    async getDeviceLifecycle(imei) {
        try {
            console.log(`🔍 Getting lifecycle for device: ${imei}`);
            
            // Query all requests for this device from requestsV2
            const q = query(
                collection(this.db, 'requestsV2'),
                where('imei', '==', imei),
                orderBy('createdAt', 'asc')
            );

            const querySnapshot = await getDocs(q);
            const requests = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Build lifecycle timeline
            const lifecycle = {
                imei,
                currentStatus: 'UNKNOWN',
                currentBdoId: null,
                currentBdoName: null,
                currentLocation: null,
                totalTransfers: 0,
                totalDays: 0,
                history: [],
                statistics: {
                    totalRequests: requests.length,
                    requestTypes: {},
                    statusChanges: 0,
                    locations: new Set(),
                    bdos: new Set()
                }
            };

            // Process each request chronologically
            requests.forEach((request, index) => {
                const event = {
                    requestId: request.id,
                    type: request.type,
                    status: request.status,
                    date: request.createdAt?.toDate?.() || new Date(request.createdAt),
                    bdoId: request.bdoId || request.bdoInfo?.bdoId,
                    bdoName: request.bdoName || request.bdoInfo?.bdoName,
                    location: {
                        shopName: request.shopName || request.locationInfo?.shopName,
                        city: request.city || request.locationInfo?.city,
                        address: request.streetAddress || request.locationInfo?.streetAddress
                    },
                    franchiseCode: request.franchiseCode,
                    workflowHistory: request.workflowHistory || []
                };

                lifecycle.history.push(event);

                // Update statistics
                lifecycle.statistics.requestTypes[request.type] = 
                    (lifecycle.statistics.requestTypes[request.type] || 0) + 1;
                
                if (event.location.shopName) {
                    lifecycle.statistics.locations.add(event.location.shopName);
                }
                if (event.bdoId) {
                    lifecycle.statistics.bdos.add(event.bdoId);
                }

                // Update current status (last request wins)
                if (index === requests.length - 1) {
                    lifecycle.currentStatus = request.status;
                    lifecycle.currentBdoId = event.bdoId;
                    lifecycle.currentBdoName = event.bdoName;
                    lifecycle.currentLocation = event.location;
                }

                // Count transfers
                if (request.type === 'TRANSFER_OWNERSHIP') {
                    lifecycle.totalTransfers++;
                }
            });

            // Calculate total active days
            if (lifecycle.history.length > 0) {
                const firstDate = lifecycle.history[0].date;
                const lastDate = lifecycle.history[lifecycle.history.length - 1].date;
                lifecycle.totalDays = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));
            }

            // Convert sets to arrays for JSON serialization
            lifecycle.statistics.locations = Array.from(lifecycle.statistics.locations);
            lifecycle.statistics.bdos = Array.from(lifecycle.statistics.bdos);
            lifecycle.statistics.statusChanges = lifecycle.history.length;

            console.log(`✅ Device lifecycle retrieved:`, {
                imei,
                totalRequests: lifecycle.statistics.totalRequests,
                currentBdoId: lifecycle.currentBdoId,
                totalTransfers: lifecycle.totalTransfers
            });

            return lifecycle;

        } catch (error) {
            console.error(`❌ Error getting device lifecycle for ${imei}:`, error);
            throw error;
        }
    }

    /**
     * Get current device assignments for a BDO
     */
    async getBDODevices(bdoId) {
        try {
            console.log(`🔍 Getting devices for BDO: ${bdoId}`);
            
            // Get all requests for this BDO
            const q = query(
                collection(this.db, 'requestsV2'),
                where('bdoId', '==', bdoId),
                orderBy('createdAt', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const requests = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Group by IMEI and get latest status for each device
            const deviceMap = new Map();
            
            requests.forEach(request => {
                const imei = request.imei;
                if (!imei) return;
                
                if (!deviceMap.has(imei) || 
                    request.createdAt > deviceMap.get(imei).createdAt) {
                    deviceMap.set(imei, request);
                }
            });

            // Filter for currently active devices
            const activeDevices = Array.from(deviceMap.values())
                .filter(request => 
                    request.bdoId === bdoId && 
                    !['DEVICE_RETURNED', 'TRANSFER_COMPLETED'].includes(request.status)
                )
                .map(request => ({
                    imei: request.imei,
                    status: request.status,
                    bdoId: request.bdoId,
                    bdoName: request.bdoName || request.bdoInfo?.bdoName,
                    location: {
                        shopName: request.shopName || request.locationInfo?.shopName,
                        city: request.city || request.locationInfo?.city,
                        address: request.streetAddress || request.locationInfo?.streetAddress
                    },
                    assignedDate: request.createdAt,
                    requestId: request.id,
                    type: request.type
                }));

            console.log(`✅ Found ${activeDevices.length} active devices for BDO ${bdoId}`);
            return activeDevices;

        } catch (error) {
            console.error(`❌ Error getting BDO devices for ${bdoId}:`, error);
            throw error;
        }
    }

    /**
     * Get device transfer history
     */
    async getDeviceTransferHistory(imei) {
        try {
            const q = query(
                collection(this.db, 'requestsV2'),
                where('imei', '==', imei),
                where('type', '==', 'TRANSFER_OWNERSHIP'),
                orderBy('createdAt', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const transfers = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return transfers.map(transfer => ({
                transferId: transfer.id,
                date: transfer.createdAt?.toDate?.() || new Date(transfer.createdAt),
                fromBdoId: transfer.requestData?.originalBdoId,
                fromBdoName: transfer.requestData?.originalBdoName,
                toBdoId: transfer.bdoId || transfer.bdoInfo?.bdoId,
                toBdoName: transfer.bdoName || transfer.bdoInfo?.bdoName,
                reason: transfer.requestData?.transferReason,
                status: transfer.status,
                newLocation: {
                    shopName: transfer.shopName || transfer.locationInfo?.shopName,
                    city: transfer.city || transfer.locationInfo?.city,
                    address: transfer.streetAddress || transfer.locationInfo?.streetAddress
                }
            }));

        } catch (error) {
            console.error(`❌ Error getting transfer history for ${imei}:`, error);
            throw error;
        }
    }

    /**
     * Get analytics for device lifecycle management
     */
    async getLifecycleAnalytics(franchiseCode = null) {
        try {
            console.log('📊 Generating lifecycle analytics...');
            
            let q = query(collection(this.db, 'requestsV2'));
            if (franchiseCode) {
                q = query(
                    collection(this.db, 'requestsV2'),
                    where('franchiseCode', '==', franchiseCode)
                );
            }

            const querySnapshot = await getDocs(q);
            const requests = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            const analytics = {
                totalDevices: new Set(),
                totalBDOs: new Set(),
                requestTypes: {},
                statusDistribution: {},
                averageTransfersPerDevice: 0,
                devicesByStatus: {},
                monthlyActivity: {},
                topLocations: {},
                totalRequests: requests.length
            };

            // Process each request
            requests.forEach(request => {
                if (request.imei) {
                    analytics.totalDevices.add(request.imei);
                }
                if (request.bdoId) {
                    analytics.totalBDOs.add(request.bdoId);
                }

                // Request types
                analytics.requestTypes[request.type] = 
                    (analytics.requestTypes[request.type] || 0) + 1;

                // Status distribution
                analytics.statusDistribution[request.status] = 
                    (analytics.statusDistribution[request.status] || 0) + 1;

                // Monthly activity
                const date = request.createdAt?.toDate?.() || new Date(request.createdAt);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                analytics.monthlyActivity[monthKey] = 
                    (analytics.monthlyActivity[monthKey] || 0) + 1;

                // Top locations
                const location = request.city || request.locationInfo?.city;
                if (location) {
                    analytics.topLocations[location] = 
                        (analytics.topLocations[location] || 0) + 1;
                }
            });

            // Calculate averages
            analytics.totalDevices = analytics.totalDevices.size;
            analytics.totalBDOs = analytics.totalBDOs.size;
            analytics.averageTransfersPerDevice = analytics.totalDevices > 0 
                ? (analytics.requestTypes['TRANSFER_OWNERSHIP'] || 0) / analytics.totalDevices 
                : 0;

            console.log('✅ Lifecycle analytics generated:', {
                totalDevices: analytics.totalDevices,
                totalBDOs: analytics.totalBDOs,
                totalRequests: analytics.totalRequests
            });

            return analytics;

        } catch (error) {
            console.error('❌ Error generating lifecycle analytics:', error);
            throw error;
        }
    }

    /**
     * Search devices by various criteria
     */
    async searchDevices(searchCriteria) {
        try {
            const { imei, bdoId, bdoName, city, status, requestType } = searchCriteria;
            
            let q = collection(this.db, 'requestsV2');
            
            if (imei) {
                q = query(q, where('imei', '==', imei));
            }
            if (bdoId) {
                q = query(q, where('bdoId', '==', bdoId));
            }
            if (city) {
                q = query(q, where('city', '==', city));
            }
            if (status) {
                q = query(q, where('status', '==', status));
            }
            if (requestType) {
                q = query(q, where('type', '==', requestType));
            }

            q = query(q, orderBy('createdAt', 'desc'), limit(100));

            const querySnapshot = await getDocs(q);
            const results = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Apply additional filters that couldn't be done in Firestore query
            let filteredResults = results;
            
            if (bdoName) {
                filteredResults = filteredResults.filter(request => 
                    (request.bdoName || request.bdoInfo?.bdoName)?.toLowerCase()
                        .includes(bdoName.toLowerCase())
                );
            }

            return filteredResults;

        } catch (error) {
            console.error('❌ Error searching devices:', error);
            throw error;
        }
    }
}
