// --- Cloud Functions Service ---
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useMemo } from 'react';

/**
 * Service to handle Cloud Functions calls
 * This replaces direct Firestore queries for dashboard initialization
 */
export class CloudFunctionsService {
    constructor(app) {
        this.functions = getFunctions(app);
        
        // Initialize callable functions
        this.initializeDashboard = httpsCallable(this.functions, 'initializeDashboard');
        this.searchBDOAccounts = httpsCallable(this.functions, 'searchBDOAccounts');
        
        // BDO ID Generation functions
        this.generateBDOId = httpsCallable(this.functions, 'generateBDOId');
        this.generateRequestNumber = httpsCallable(this.functions, 'generateRequestNumber');
        this.previewNextNumbers = httpsCallable(this.functions, 'previewNextNumbers');
        this.validateBDOId = httpsCallable(this.functions, 'validateBDOId');
    }

    /**
     * Initialize dashboard data based on user role
     * @param {Object} userData - User data including role and franchiseCode
     * @returns {Promise} Dashboard data
     */
    async initializeDashboardData(userData) {
        try {
            console.log('🚀 Calling initializeDashboard Cloud Function:', userData);
            
            // Defensive: Validate user data before making the call
            if (!userData || 
                typeof userData.role === 'undefined' || 
                userData.role === null || 
                userData.role === '' || 
                typeof userData.franchiseCode === 'undefined' || 
                userData.franchiseCode === null || 
                userData.franchiseCode === '') {
                console.error('[CloudFunctionsService] Missing or invalid user data for dashboard initialization', userData);
                throw new Error('Missing or invalid user data for dashboard initialization');
            }

            const result = await this.initializeDashboard({
                role: userData.role,
                franchiseCode: userData.franchiseCode,
                uid: userData.uid
            });

            console.log('✅ Dashboard data loaded via Cloud Function:', result.data);
            return result.data;

        } catch (error) {
            console.error('❌ Cloud Function initializeDashboard failed:', error);
            
            // Provide fallback data structure to prevent app crashes
            const fallbackData = {
                requests: [],
                bdoAccounts: [],
                stats: {
                    totalRequests: 0,
                    pendingRequests: 0,
                    approvedRequests: 0,
                    rejectedRequests: 0
                },
                error: error.message,
                fallback: true
            };
            
            console.log('🔄 Using fallback data structure');
            return fallbackData;
        }
    }

    /**
     * Search BDO accounts using Cloud Function
     * @param {string} franchiseCode - Franchise code
     * @param {string} searchTerm - Search term
     * @param {string} searchType - Type of search (cnic, mobile, general)
     * @returns {Promise} Search results
     */
    async searchBDOs(franchiseCode, searchTerm, searchType = 'general') {
        try {
            console.log('🔍 Calling searchBDOAccounts Cloud Function:', { franchiseCode, searchTerm, searchType });
            
            // Defensive: Validate inputs
            if (!franchiseCode || !searchTerm) {
                console.error('[CloudFunctionsService] Missing required search parameters', { franchiseCode, searchTerm, searchType });
                throw new Error('Missing required search parameters');
            }

            const result = await this.searchBDOAccounts({
                franchiseCode,
                searchTerm,
                searchType
            });

            console.log('✅ BDO search completed via Cloud Function:', result.data);
            return result.data.results;

        } catch (error) {
            console.error('❌ Cloud Function searchBDOAccounts failed:', error);
            throw new Error(`BDO search failed: ${error.message}`);
        }
    }

    /**
     * Health check for Cloud Functions
     */
    async healthCheck() {
        try {
            const response = await fetch('/api/healthCheck');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Health check failed:', error);
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Generate unique BDO ID atomically
     * @param {string} franchiseCode - Franchise code
     * @returns {Promise<Object>} Generated BDO ID data
     */
    async generateUniqueBDOId(franchiseCode) {
        try {
            console.log('🆔 Generating unique BDO ID for franchise:', franchiseCode);
            const result = await this.generateBDOId({ franchiseCode });
            return result.data;
        } catch (error) {
            console.error('❌ Error generating BDO ID:', error);
            throw error;
        }
    }

    /**
     * Generate unique request number atomically
     * @param {string} franchiseCode - Franchise code
     * @returns {Promise<Object>} Generated request number data
     */
    async generateUniqueRequestNumber(franchiseCode) {
        try {
            console.log('📋 Generating unique request number for franchise:', franchiseCode);
            const result = await this.generateRequestNumber({ franchiseCode });
            return result.data;
        } catch (error) {
            console.error('❌ Error generating request number:', error);
            throw error;
        }
    }

    /**
     * Preview next available numbers
     * @param {string} franchiseCode - Franchise code
     * @returns {Promise<Object>} Preview of next numbers
     */
    async getNextNumbersPreview(franchiseCode) {
        try {
            console.log('👁️ Getting preview of next numbers for franchise:', franchiseCode);
            const result = await this.previewNextNumbers({ franchiseCode });
            return result.data;
        } catch (error) {
            console.error('❌ Error getting numbers preview:', error);
            throw error;
        }
    }

    /**
     * Validate BDO ID format and availability
     * @param {string} bdoId - BDO ID to validate
     * @returns {Promise<Object>} Validation result
     */
    async validateBDOIdFormat(bdoId) {
        try {
            console.log('🔍 Validating BDO ID:', bdoId);
            const result = await this.validateBDOId({ bdoId });
            return result.data;
        } catch (error) {
            console.error('❌ Error validating BDO ID:', error);
            throw error;
        }
    }
}

/**
 * Hook to use Cloud Functions service
 */
export const useCloudFunctions = (app) => {
    return useMemo(() => {
        if (!app) return null;
        return new CloudFunctionsService(app);
    }, [app]);
};

export default CloudFunctionsService;
