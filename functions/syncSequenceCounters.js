const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * Utility Cloud Function to sync sequence counters with existing BDO data
 * This function analyzes all existing BDO accounts and updates the sequence counters
 * to ensure no duplicates are created going forward.
 * 
 * Should be run once during deployment to production to sync existing data.
 */
exports.syncSequenceCounters = functions.https.onCall(async (data, context) => {
    // Verify authentication and admin role
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
        );
    }

    // Only allow admin users to run this function
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData || !userData.isAdmin) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admin users can sync sequence counters'
        );
    }

    const db = admin.firestore();
    
    try {
        console.log('🔄 Starting sequence counter sync...');
        
        // Get all BDO accounts
        const bdoAccountsSnapshot = await db.collection('bdoAccounts').get();
        
        // Group by franchise and find max sequential numbers
        const franchiseMaxNumbers = new Map();
        let totalProcessed = 0;
        let validBDOIds = 0;
        
        bdoAccountsSnapshot.forEach(doc => {
            const data = doc.data();
            totalProcessed++;
            
            if (data.bdoId && data.franchiseCode) {
                // Parse BDO ID to extract sequential number
                const match = data.bdoId.match(new RegExp(`^${data.franchiseCode}-(\\d+)$`));
                if (match) {
                    validBDOIds++;
                    const sequentialNum = parseInt(match[1], 10);
                    const currentMax = franchiseMaxNumbers.get(data.franchiseCode) || 0;
                    franchiseMaxNumbers.set(data.franchiseCode, Math.max(currentMax, sequentialNum));
                } else {
                    console.warn(`⚠️ Invalid BDO ID format: ${data.bdoId} for franchise: ${data.franchiseCode}`);
                }
            } else {
                console.warn(`⚠️ Missing bdoId or franchiseCode in document: ${doc.id}`);
            }
        });
        
        console.log(`📊 Processed ${totalProcessed} BDO accounts, found ${validBDOIds} valid BDO IDs`);
        console.log(`🏢 Found ${franchiseMaxNumbers.size} franchises with BDO accounts`);
        
        // Update sequence counters
        const sequenceRef = db.collection('sequences').doc('franchiseCounters');
        const updateData = {};
        
        franchiseMaxNumbers.forEach((maxNumber, franchiseCode) => {
            updateData[`${franchiseCode}.lastBDONumber`] = maxNumber;
            updateData[`${franchiseCode}.updatedAt`] = admin.firestore.FieldValue.serverTimestamp();
            updateData[`${franchiseCode}.syncedAt`] = admin.firestore.FieldValue.serverTimestamp();
            updateData[`${franchiseCode}.syncedMaxNumber`] = maxNumber;
            
            console.log(`✅ Franchise ${franchiseCode}: Setting counter to ${maxNumber}`);
        });
        
        // Add sync metadata
        updateData['_syncMetadata'] = {
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            syncedBy: context.auth.uid,
            totalBDOsProcessed: totalProcessed,
            validBDOIds: validBDOIds,
            franchisesFound: franchiseMaxNumbers.size,
            franchisesSynced: Array.from(franchiseMaxNumbers.keys())
        };
        
        // Update the sequence document
        await sequenceRef.set(updateData, { merge: true });
        
        const result = {
            success: true,
            message: 'Sequence counters synced successfully',
            stats: {
                totalBDOsProcessed: totalProcessed,
                validBDOIds: validBDOIds,
                franchisesFound: franchiseMaxNumbers.size,
                franchiseCounters: Object.fromEntries(franchiseMaxNumbers)
            }
        };
        
        console.log('✅ Sequence counter sync completed:', result);
        
        return result;
        
    } catch (error) {
        console.error('❌ Error syncing sequence counters:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to sync sequence counters: ' + error.message
        );
    }
});

/**
 * Get detailed analysis of BDO ID data integrity
 * Useful for debugging and monitoring data quality
 */
exports.analyzeBDOData = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
        );
    }

    const db = admin.firestore();
    
    try {
        console.log('🔍 Starting BDO data analysis...');
        
        // Get all BDO accounts
        const bdoAccountsSnapshot = await db.collection('bdoAccounts').get();
        
        const analysis = {
            totalBDOs: bdoAccountsSnapshot.size,
            franchises: new Map(),
            duplicateBDOIds: new Map(),
            invalidFormats: [],
            missingData: [],
            statusBreakdown: new Map()
        };
        
        // Analyze each BDO account
        bdoAccountsSnapshot.forEach(doc => {
            const data = doc.data();
            const docId = doc.id;
            
            // Check for missing essential data
            if (!data.bdoId || !data.franchiseCode) {
                analysis.missingData.push({
                    docId,
                    missingFields: {
                        bdoId: !data.bdoId,
                        franchiseCode: !data.franchiseCode
                    }
                });
                return;
            }
            
            // Track status breakdown
            const status = data.status || 'Unknown';
            analysis.statusBreakdown.set(status, (analysis.statusBreakdown.get(status) || 0) + 1);
            
            // Check BDO ID format
            const match = data.bdoId.match(new RegExp(`^${data.franchiseCode}-(\\d+)$`));
            if (!match) {
                analysis.invalidFormats.push({
                    docId,
                    bdoId: data.bdoId,
                    franchiseCode: data.franchiseCode,
                    issue: 'Format mismatch'
                });
                return;
            }
            
            const sequentialNum = parseInt(match[1], 10);
            
            // Track by franchise
            if (!analysis.franchises.has(data.franchiseCode)) {
                analysis.franchises.set(data.franchiseCode, {
                    count: 0,
                    minNumber: sequentialNum,
                    maxNumber: sequentialNum,
                    bdoIds: [],
                    gaps: []
                });
            }
            
            const franchiseData = analysis.franchises.get(data.franchiseCode);
            franchiseData.count++;
            franchiseData.minNumber = Math.min(franchiseData.minNumber, sequentialNum);
            franchiseData.maxNumber = Math.max(franchiseData.maxNumber, sequentialNum);
            franchiseData.bdoIds.push({
                bdoId: data.bdoId,
                sequentialNum,
                docId,
                status: data.status,
                createdAt: data.createdAt
            });
            
            // Check for duplicate BDO IDs
            if (analysis.duplicateBDOIds.has(data.bdoId)) {
                analysis.duplicateBDOIds.get(data.bdoId).push(docId);
            } else {
                analysis.duplicateBDOIds.set(data.bdoId, [docId]);
            }
        });
        
        // Find duplicates (more than one document with same BDO ID)
        const actualDuplicates = new Map();
        analysis.duplicateBDOIds.forEach((docIds, bdoId) => {
            if (docIds.length > 1) {
                actualDuplicates.set(bdoId, docIds);
            }
        });
        
        // Find gaps in sequential numbers for each franchise
        analysis.franchises.forEach((franchiseData, franchiseCode) => {
            franchiseData.bdoIds.sort((a, b) => a.sequentialNum - b.sequentialNum);
            
            for (let i = 1; i < franchiseData.bdoIds.length; i++) {
                const current = franchiseData.bdoIds[i].sequentialNum;
                const previous = franchiseData.bdoIds[i - 1].sequentialNum;
                
                if (current - previous > 1) {
                    for (let missing = previous + 1; missing < current; missing++) {
                        franchiseData.gaps.push(missing);
                    }
                }
            }
        });
        
        const result = {
            summary: {
                totalBDOs: analysis.totalBDOs,
                totalFranchises: analysis.franchises.size,
                duplicateBDOIds: actualDuplicates.size,
                invalidFormats: analysis.invalidFormats.length,
                missingData: analysis.missingData.length
            },
            franchises: Object.fromEntries(
                Array.from(analysis.franchises.entries()).map(([code, data]) => [
                    code,
                    {
                        count: data.count,
                        minNumber: data.minNumber,
                        maxNumber: data.maxNumber,
                        gaps: data.gaps,
                        hasGaps: data.gaps.length > 0
                    }
                ])
            ),
            statusBreakdown: Object.fromEntries(analysis.statusBreakdown),
            duplicates: Object.fromEntries(actualDuplicates),
            invalidFormats: analysis.invalidFormats,
            missingData: analysis.missingData,
            analyzedAt: new Date().toISOString()
        };
        
        console.log('✅ BDO data analysis completed');
        
        return {
            success: true,
            data: result
        };
        
    } catch (error) {
        console.error('❌ Error analyzing BDO data:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to analyze BDO data: ' + error.message
        );
    }
});
