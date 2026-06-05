import { 
    getFirestore, 
    collection, 
    query, 
    getDocs, 
    writeBatch, 
    doc,
    orderBy,
    limit,
    startAfter,
    where,
    Timestamp 
} from 'firebase/firestore';
import { convertLegacyToUnified } from './requestStructure';

/**
 * Data Migration Utility for migrating requests to requestsV2
 */
export class RequestMigrationService {
    constructor(app) {
        this.db = getFirestore(app);
        this.batchSize = 100; // Process in batches to avoid memory issues
    }

    /**
     * Get migration statistics
     */
    async getMigrationStats() {
        try {
            const [oldRequestsSnapshot, newRequestsSnapshot] = await Promise.all([
                getDocs(collection(this.db, 'requests')),
                getDocs(collection(this.db, 'requestsV2'))
            ]);

            return {
                oldRequestsCount: oldRequestsSnapshot.size,
                newRequestsCount: newRequestsSnapshot.size,
                remainingToMigrate: oldRequestsSnapshot.size,
                migrationComplete: oldRequestsSnapshot.size === 0 || newRequestsSnapshot.size >= oldRequestsSnapshot.size
            };
        } catch (error) {
            console.error('Error getting migration stats:', error);
            throw error;
        }
    }

    /**
     * Migrate a batch of requests from requests to requestsV2
     */
    async migrateBatch(startAfterDoc = null, onProgress = null) {
        try {
            console.log('🔄 Starting batch migration...');
            
            // Build query for old requests
            let q = query(
                collection(this.db, 'requests'),
                orderBy('createdAt', 'asc'),
                limit(this.batchSize)
            );

            if (startAfterDoc) {
                q = query(
                    collection(this.db, 'requests'),
                    orderBy('createdAt', 'asc'),
                    startAfter(startAfterDoc),
                    limit(this.batchSize)
                );
            }

            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                console.log('✅ No more requests to migrate');
                return { migrated: 0, hasMore: false, lastDoc: null };
            }

            console.log(`📋 Processing ${querySnapshot.size} requests in this batch`);

            // Use batch writes for atomic operations
            const batch = writeBatch(this.db);
            let migratedCount = 0;

            querySnapshot.docs.forEach((requestDoc) => {
                try {
                    const oldRequest = { id: requestDoc.id, ...requestDoc.data() };
                    
                    // Convert to unified structure
                    const newRequest = convertLegacyToUnified(oldRequest);
                    
                    // Add migration metadata
                    newRequest.migrationMetadata = {
                        migratedAt: Timestamp.now(),
                        originalId: requestDoc.id,
                        migrationVersion: '1.0',
                        sourceCollection: 'requests'
                    };

                    // Create new document in requestsV2
                    const newDocRef = doc(collection(this.db, 'requestsV2'));
                    batch.set(newDocRef, newRequest);
                    
                    migratedCount++;
                    
                    if (onProgress) {
                        onProgress({
                            current: migratedCount,
                            total: querySnapshot.size,
                            requestId: oldRequest.id,
                            requestType: oldRequest.type
                        });
                    }
                } catch (error) {
                    console.error(`❌ Error converting request ${requestDoc.id}:`, error);
                }
            });

            // Commit the batch
            await batch.commit();
            console.log(`✅ Successfully migrated ${migratedCount} requests`);

            const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
            const hasMore = querySnapshot.size === this.batchSize;

            return {
                migrated: migratedCount,
                hasMore,
                lastDoc: hasMore ? lastDoc : null
            };

        } catch (error) {
            console.error('❌ Batch migration failed:', error);
            throw error;
        }
    }

    /**
     * Migrate all requests with progress tracking
     */
    async migrateAllRequests(onProgress = null, onBatchComplete = null) {
        try {
            console.log('🚀 Starting full migration of requests to requestsV2...');
            
            let totalMigrated = 0;
            let hasMore = true;
            let lastDoc = null;
            let batchNumber = 1;

            while (hasMore) {
                console.log(`📦 Processing batch ${batchNumber}...`);
                
                const result = await this.migrateBatch(lastDoc, onProgress);
                
                totalMigrated += result.migrated;
                hasMore = result.hasMore;
                lastDoc = result.lastDoc;

                if (onBatchComplete) {
                    onBatchComplete({
                        batchNumber,
                        batchMigrated: result.migrated,
                        totalMigrated,
                        hasMore
                    });
                }

                batchNumber++;
                
                // Add small delay to prevent overwhelming Firestore
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`🎉 Migration complete! Total migrated: ${totalMigrated} requests`);
            return { totalMigrated, success: true };

        } catch (error) {
            console.error('❌ Full migration failed:', error);
            throw error;
        }
    }

    /**
     * Validate migrated data by comparing counts and sampling records
     */
    async validateMigration() {
        try {
            console.log('🔍 Validating migration...');
            
            const stats = await this.getMigrationStats();
            
            // Sample a few records to compare
            const oldSample = await getDocs(query(
                collection(this.db, 'requests'),
                limit(5)
            ));
            
            const newSample = await getDocs(query(
                collection(this.db, 'requestsV2'),
                where('migrationMetadata.sourceCollection', '==', 'requests'),
                limit(5)
            ));

            const validation = {
                countsMatch: stats.newRequestsCount >= stats.oldRequestsCount,
                oldSampleSize: oldSample.size,
                newSampleSize: newSample.size,
                stats,
                issues: []
            };

            // Check for basic data integrity
            newSample.docs.forEach(doc => {
                const data = doc.data();
                if (!data.type || !data.franchiseId || !data.createdAt) {
                    validation.issues.push(`Missing required fields in ${doc.id}`);
                }
                if (!data.migrationMetadata) {
                    validation.issues.push(`Missing migration metadata in ${doc.id}`);
                }
            });

            console.log('✅ Migration validation complete:', validation);
            return validation;

        } catch (error) {
            console.error('❌ Migration validation failed:', error);
            throw error;
        }
    }

    /**
     * Rollback migration (for testing purposes)
     */
    async rollbackMigration() {
        try {
            console.log('⚠️ Rolling back migration...');
            
            const batch = writeBatch(this.db);
            
            // Query all migrated documents
            const migratedDocs = await getDocs(query(
                collection(this.db, 'requestsV2'),
                where('migrationMetadata.sourceCollection', '==', 'requests')
            ));

            migratedDocs.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            
            console.log(`🔄 Rollback complete. Deleted ${migratedDocs.size} migrated documents`);
            return { deleted: migratedDocs.size };

        } catch (error) {
            console.error('❌ Rollback failed:', error);
            throw error;
        }
    }
}

/**
 * Quick utility function for one-time migration
 */
export const migrateRequestsToV2 = async (app, onProgress = null) => {
    const migrationService = new RequestMigrationService(app);
    return await migrationService.migrateAllRequests(onProgress);
};
