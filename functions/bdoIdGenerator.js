const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * Atomic BDO ID Generation Cloud Function
 * Generates unique sequential IDs in format: [FranchiseCode]-[SequentialNumber]
 * Example: KH1-00012 (12th BDO for franchise KH1)
 * 
 * This function ensures atomic operations to prevent duplicate IDs
 * even under high concurrency scenarios.
 */

/**
 * Generate unique BDO ID for a franchise
 * @param {Object} data - Request data
 * @param {string} data.franchiseCode - Franchise code (e.g., "KH1")
 * @param {Object} context - Function context
 * @returns {Promise<Object>} Generated BDO ID and metadata
 */
exports.generateBDOId = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to generate BDO ID'
        );
    }

    // Validate input
    const { franchiseCode } = data;
    if (!franchiseCode || typeof franchiseCode !== 'string') {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Valid franchiseCode is required'
        );
    }

    const db = admin.firestore();
    
    try {
        // Use Firestore transaction for atomic operation
        const result = await db.runTransaction(async (transaction) => {
            const sequenceRef = db.collection('sequences').doc('franchiseCounters');
            const sequenceDoc = await transaction.get(sequenceRef);
            
            // Get current count for this franchise from sequences
            const sequenceData = sequenceDoc.data() || {};
            const franchiseData = sequenceData[franchiseCode] || { lastBDONumber: 0 };
            let currentCount = franchiseData.lastBDONumber || 0;
            
            // CRITICAL: Check existing BDO accounts to find the highest sequential number
            // This ensures we don't create duplicates with existing data
            const existingBDOsQuery = db.collection('bdoAccounts')
                .where('franchiseCode', '==', franchiseCode)
                .select('bdoId');
            
            const existingBDOsSnapshot = await existingBDOsQuery.get();
            let maxExistingNumber = 0;
            
            // Parse existing BDO IDs to find the highest sequential number
            existingBDOsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.bdoId) {
                    const match = data.bdoId.match(new RegExp(`^${franchiseCode}-(\\d+)$`));
                    if (match) {
                        const sequentialNum = parseInt(match[1], 10);
                        maxExistingNumber = Math.max(maxExistingNumber, sequentialNum);
                    }
                }
            });
            
            // Use the higher of sequence counter or existing max + 1
            currentCount = Math.max(currentCount, maxExistingNumber);
            
            // Generate new sequential number
            const newCount = currentCount + 1;
            const bdoId = `${franchiseCode}-${newCount.toString().padStart(5, '0')}`;
            
            // Double-check this ID doesn't exist (extra safety)
            const duplicateCheck = await db.collection('bdoAccounts')
                .where('bdoId', '==', bdoId)
                .limit(1)
                .get();
            
            if (!duplicateCheck.empty) {
                throw new Error(`BDO ID ${bdoId} already exists. Concurrent creation detected.`);
            }
            
            // Update the sequence counter atomically
            const updateData = {
                [`${franchiseCode}.lastBDONumber`]: newCount,
                [`${franchiseCode}.updatedAt`]: admin.firestore.FieldValue.serverTimestamp(),
                [`${franchiseCode}.lastGeneratedId`]: bdoId,
                [`${franchiseCode}.maxExistingChecked`]: maxExistingNumber, // Track what we checked
                [`${franchiseCode}.totalExistingBDOs`]: existingBDOsSnapshot.size
            };
            
            // If document doesn't exist, create it
            if (!sequenceDoc.exists) {
                transaction.set(sequenceRef, updateData);
            } else {
                transaction.update(sequenceRef, updateData);
            }
            
            return {
                bdoId,
                sequentialNumber: newCount,
                franchiseCode,
                generatedAt: new Date().toISOString(),
                maxExistingNumber,
                totalExistingBDOs: existingBDOsSnapshot.size
            };
        });
        
        console.log(`✅ Generated BDO ID: ${result.bdoId} for franchise: ${franchiseCode}`);
        
        return {
            success: true,
            data: result
        };
        
    } catch (error) {
        console.error('❌ Error generating BDO ID:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to generate BDO ID: ' + error.message
        );
    }
});

/**
 * Generate unique Request Number
 * Format: REQ-YYYYMMDD-XXXXX
 * @param {Object} data - Request data
 * @param {string} data.franchiseCode - Franchise code
 * @param {Object} context - Function context
 * @returns {Promise<Object>} Generated request number
 */
exports.generateRequestNumber = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to generate request number'
        );
    }

    const { franchiseCode } = data;
    if (!franchiseCode) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'franchiseCode is required'
        );
    }

    const db = admin.firestore();
    
    try {
        const result = await db.runTransaction(async (transaction) => {
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
            const sequenceRef = db.collection('sequences').doc('requestCounters');
            const sequenceDoc = await transaction.get(sequenceRef);
            
            const sequenceData = sequenceDoc.data() || {};
            const dailyKey = `${dateStr}_${franchiseCode}`;
            const currentCount = sequenceData[dailyKey] || 0;
            const newCount = currentCount + 1;
            
            const requestNumber = `REQ-${dateStr}-${newCount.toString().padStart(5, '0')}`;
            
            const updateData = {
                [`${dailyKey}`]: newCount,
                [`${dailyKey}_lastGenerated`]: requestNumber,
                [`${dailyKey}_updatedAt`]: admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (!sequenceDoc.exists) {
                transaction.set(sequenceRef, updateData);
            } else {
                transaction.update(sequenceRef, updateData);
            }
            
            return {
                requestNumber,
                sequentialNumber: newCount,
                dateStr,
                franchiseCode,
                generatedAt: new Date().toISOString()
            };
        });
        
        console.log(`✅ Generated Request Number: ${result.requestNumber} for franchise: ${franchiseCode}`);
        
        return {
            success: true,
            data: result
        };
        
    } catch (error) {
        console.error('❌ Error generating request number:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to generate request number: ' + error.message
        );
    }
});

/**
 * Get next available numbers for preview (non-atomic)
 * Used for UI preview before actual generation
 */
exports.previewNextNumbers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
        );
    }

    const { franchiseCode } = data;
    if (!franchiseCode) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'franchiseCode is required'
        );
    }

    const db = admin.firestore();
    
    try {
        // Get current BDO count from sequences
        const bdoSequenceRef = db.collection('sequences').doc('franchiseCounters');
        const bdoSequenceDoc = await bdoSequenceRef.get();
        const bdoSequenceData = bdoSequenceDoc.data() || {};
        let bdoCount = bdoSequenceData[franchiseCode]?.lastBDONumber || 0;
        
        // CRITICAL: Check existing BDO accounts to find the highest sequential number
        const existingBDOsQuery = db.collection('bdoAccounts')
            .where('franchiseCode', '==', franchiseCode)
            .select('bdoId');
        
        const existingBDOsSnapshot = await existingBDOsQuery.get();
        let maxExistingNumber = 0;
        
        // Parse existing BDO IDs to find the highest sequential number
        existingBDOsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.bdoId) {
                const match = data.bdoId.match(new RegExp(`^${franchiseCode}-(\\d+)$`));
                if (match) {
                    const sequentialNum = parseInt(match[1], 10);
                    maxExistingNumber = Math.max(maxExistingNumber, sequentialNum);
                }
            }
        });
        
        // Use the higher of sequence counter or existing max
        bdoCount = Math.max(bdoCount, maxExistingNumber);
        const nextBDOId = `${franchiseCode}-${(bdoCount + 1).toString().padStart(5, '0')}`;
        
        // Get current request count for today
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const requestSequenceRef = db.collection('sequences').doc('requestCounters');
        const requestSequenceDoc = await requestSequenceRef.get();
        const requestSequenceData = requestSequenceDoc.data() || {};
        const requestCount = requestSequenceData[`${dateStr}_${franchiseCode}`] || 0;
        const nextRequestNumber = `REQ-${dateStr}-${(requestCount + 1).toString().padStart(5, '0')}`;
        
        return {
            success: true,
            data: {
                nextBDOId,
                nextRequestNumber,
                currentBDOCount: bdoCount,
                currentRequestCount: requestCount,
                franchiseCode,
                maxExistingNumber,
                totalExistingBDOs: existingBDOsSnapshot.size
            }
        };
        
    } catch (error) {
        console.error('❌ Error previewing next numbers:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to preview next numbers: ' + error.message
        );
    }
});

/**
 * Validate BDO ID format and check if it exists
 * @param {Object} data - Request data
 * @param {string} data.bdoId - BDO ID to validate
 * @returns {Promise<Object>} Validation result
 */
exports.validateBDOId = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
        );
    }

    const { bdoId } = data;
    if (!bdoId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'bdoId is required'
        );
    }

    // Validate format: [FranchiseCode]-[5DigitNumber]
    const bdoIdPattern = /^[A-Z0-9]+-\d{5}$/;
    if (!bdoIdPattern.test(bdoId)) {
        return {
            success: false,
            error: 'Invalid BDO ID format. Expected format: [FranchiseCode]-[5DigitNumber]',
            isValid: false
        };
    }

    const db = admin.firestore();
    
    try {
        // Check if BDO ID already exists
        const bdoQuery = await db.collection('bdoAccounts')
            .where('bdoId', '==', bdoId)
            .limit(1)
            .get();
        
        const exists = !bdoQuery.empty;
        
        return {
            success: true,
            data: {
                bdoId,
                isValid: !exists, // Valid if it doesn't exist
                exists,
                message: exists ? 'BDO ID already exists' : 'BDO ID is available'
            }
        };
        
    } catch (error) {
        console.error('❌ Error validating BDO ID:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to validate BDO ID: ' + error.message
        );
    }
});
