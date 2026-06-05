import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * BDO ID Generation Service
 * Client-side service for interacting with atomic ID generation Cloud Functions
 */
export class BDOIdService {
    constructor(app) {
        this.functions = getFunctions(app);
        
        // Initialize callable functions
        this.generateBDOId = httpsCallable(this.functions, 'generateBDOId');
        this.generateRequestNumber = httpsCallable(this.functions, 'generateRequestNumber');
        this.previewNextNumbers = httpsCallable(this.functions, 'previewNextNumbers');
        this.validateBDOId = httpsCallable(this.functions, 'validateBDOId');
    }

    /**
     * Generate unique BDO ID atomically
     * @param {string} franchiseCode - Franchise code (e.g., "KH1")
     * @returns {Promise<Object>} Generated BDO ID and metadata
     */
    async generateUniqueBDOId(franchiseCode) {
        try {
            console.log('🆔 Generating unique BDO ID for franchise:', franchiseCode);
            
            if (!franchiseCode || typeof franchiseCode !== 'string') {
                throw new Error('Valid franchiseCode is required');
            }

            const result = await this.generateBDOId({ franchiseCode });
            
            if (result.data.success) {
                console.log('✅ BDO ID generated successfully:', result.data.data);
                return result.data.data;
            } else {
                throw new Error(result.data.error || 'Failed to generate BDO ID');
            }
            
        } catch (error) {
            console.error('❌ Error generating BDO ID:', error);
            throw new Error(`Failed to generate BDO ID: ${error.message}`);
        }
    }

    /**
     * Generate unique request number atomically
     * @param {string} franchiseCode - Franchise code
     * @returns {Promise<Object>} Generated request number and metadata
     */
    async generateUniqueRequestNumber(franchiseCode) {
        try {
            console.log('📋 Generating unique request number for franchise:', franchiseCode);
            
            if (!franchiseCode) {
                throw new Error('franchiseCode is required');
            }

            const result = await this.generateRequestNumber({ franchiseCode });
            
            if (result.data.success) {
                console.log('✅ Request number generated successfully:', result.data.data);
                return result.data.data;
            } else {
                throw new Error(result.data.error || 'Failed to generate request number');
            }
            
        } catch (error) {
            console.error('❌ Error generating request number:', error);
            throw new Error(`Failed to generate request number: ${error.message}`);
        }
    }

    /**
     * Preview next available numbers (non-atomic, for UI display)
     * @param {string} franchiseCode - Franchise code
     * @returns {Promise<Object>} Preview of next available numbers
     */
    async getNextNumbersPreview(franchiseCode) {
        try {
            console.log('👁️ Getting preview of next numbers for franchise:', franchiseCode);
            
            if (!franchiseCode) {
                throw new Error('franchiseCode is required');
            }

            const result = await this.previewNextNumbers({ franchiseCode });
            
            if (result.data.success) {
                console.log('✅ Numbers preview retrieved:', result.data.data);
                return result.data.data;
            } else {
                throw new Error(result.data.error || 'Failed to get numbers preview');
            }
            
        } catch (error) {
            console.error('❌ Error getting numbers preview:', error);
            throw new Error(`Failed to get numbers preview: ${error.message}`);
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
            
            if (!bdoId) {
                throw new Error('bdoId is required');
            }

            const result = await this.validateBDOId({ bdoId });
            
            if (result.data.success) {
                console.log('✅ BDO ID validation result:', result.data.data);
                return result.data.data;
            } else {
                console.log('❌ BDO ID validation failed:', result.data.error);
                return {
                    isValid: false,
                    error: result.data.error
                };
            }
            
        } catch (error) {
            console.error('❌ Error validating BDO ID:', error);
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    /**
     * Format franchise code for consistency
     * @param {string} franchiseCode - Raw franchise code
     * @returns {string} Formatted franchise code
     */
    formatFranchiseCode(franchiseCode) {
        if (!franchiseCode) return '';
        return franchiseCode.toString().toUpperCase().trim();
    }

    /**
     * Validate franchise code format
     * @param {string} franchiseCode - Franchise code to validate
     * @returns {boolean} Whether franchise code is valid
     */
    isValidFranchiseCode(franchiseCode) {
        if (!franchiseCode || typeof franchiseCode !== 'string') return false;
        
        // Basic validation: alphanumeric, 2-10 characters
        const pattern = /^[A-Z0-9]{2,10}$/;
        return pattern.test(franchiseCode.toUpperCase());
    }

    /**
     * Parse BDO ID to extract franchise code and sequential number
     * @param {string} bdoId - BDO ID to parse
     * @returns {Object|null} Parsed components or null if invalid
     */
    parseBDOId(bdoId) {
        if (!bdoId || typeof bdoId !== 'string') return null;
        
        const pattern = /^([A-Z0-9]+)-(\d{5})$/;
        const match = bdoId.match(pattern);
        
        if (!match) return null;
        
        return {
            franchiseCode: match[1],
            sequentialNumber: parseInt(match[2], 10),
            formattedNumber: match[2]
        };
    }

    /**
     * Generate a batch of BDO IDs (for bulk operations)
     * @param {string} franchiseCode - Franchise code
     * @param {number} count - Number of IDs to generate
     * @returns {Promise<Array>} Array of generated BDO IDs
     */
    async generateBDOIdBatch(franchiseCode, count) {
        try {
            console.log(`🔄 Generating ${count} BDO IDs for franchise:`, franchiseCode);
            
            if (!franchiseCode || !this.isValidFranchiseCode(franchiseCode)) {
                throw new Error('Valid franchiseCode is required');
            }
            
            if (!count || count < 1 || count > 100) {
                throw new Error('Count must be between 1 and 100');
            }

            const generatedIds = [];
            
            // Generate IDs sequentially to maintain order
            for (let i = 0; i < count; i++) {
                const bdoData = await this.generateUniqueBDOId(franchiseCode);
                generatedIds.push(bdoData);
            }
            
            console.log('✅ Batch BDO IDs generated successfully:', generatedIds.length);
            return generatedIds;
            
        } catch (error) {
            console.error('❌ Error generating BDO ID batch:', error);
            throw new Error(`Failed to generate BDO ID batch: ${error.message}`);
        }
    }
}
