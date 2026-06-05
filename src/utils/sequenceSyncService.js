// --- Sequence Counter Sync Service ---
import { httpsCallable } from 'firebase/functions';

/**
 * Service for managing BDO sequence counters and data integrity
 */
export class SequenceSyncService {
    constructor(functions) {
        this.functions = functions;
        this.syncSequenceCounters = httpsCallable(functions, 'syncSequenceCounters');
        this.analyzeBDOData = httpsCallable(functions, 'analyzeBDOData');
    }

    /**
     * Sync sequence counters with existing BDO data
     * Should be run once when deploying to production with existing data
     */
    async syncCounters() {
        try {
            console.log('🔄 Starting sequence counter sync...');
            
            const result = await this.syncSequenceCounters();
            
            if (result.data.success) {
                console.log('✅ Sequence counters synced successfully:', result.data);
                return {
                    success: true,
                    message: result.data.message,
                    stats: result.data.stats
                };
            } else {
                throw new Error(result.data.error || 'Unknown error during sync');
            }
            
        } catch (error) {
            console.error('❌ Failed to sync sequence counters:', error);
            throw new Error(`Sequence counter sync failed: ${error.message}`);
        }
    }

    /**
     * Analyze BDO data integrity
     * Provides detailed analysis of existing BDO data quality
     */
    async analyzeBDOData() {
        try {
            console.log('🔍 Starting BDO data analysis...');
            
            const result = await this.analyzeBDOData();
            
            if (result.data.success) {
                console.log('✅ BDO data analysis completed:', result.data.data);
                return {
                    success: true,
                    analysis: result.data.data
                };
            } else {
                throw new Error(result.data.error || 'Unknown error during analysis');
            }
            
        } catch (error) {
            console.error('❌ Failed to analyze BDO data:', error);
            throw new Error(`BDO data analysis failed: ${error.message}`);
        }
    }

    /**
     * Get a formatted report of data integrity issues
     */
    async getDataIntegrityReport() {
        try {
            const analysis = await this.analyzeBDOData();
            
            if (!analysis.success) {
                throw new Error('Analysis failed');
            }
            
            const data = analysis.analysis;
            
            // Create a formatted report
            const report = {
                overview: {
                    totalBDOs: data.summary.totalBDOs,
                    totalFranchises: data.summary.totalFranchises,
                    healthScore: this.calculateHealthScore(data.summary),
                    analyzedAt: data.analyzedAt
                },
                issues: {
                    duplicateBDOIds: {
                        count: data.summary.duplicateBDOIds,
                        severity: data.summary.duplicateBDOIds > 0 ? 'HIGH' : 'NONE',
                        details: data.duplicates
                    },
                    invalidFormats: {
                        count: data.summary.invalidFormats,
                        severity: data.summary.invalidFormats > 0 ? 'MEDIUM' : 'NONE',
                        details: data.invalidFormats
                    },
                    missingData: {
                        count: data.summary.missingData,
                        severity: data.summary.missingData > 0 ? 'HIGH' : 'NONE',
                        details: data.missingData
                    }
                },
                franchiseStatus: this.analyzeFranchiseHealth(data.franchises),
                recommendations: this.generateRecommendations(data)
            };
            
            return report;
            
        } catch (error) {
            console.error('❌ Failed to generate data integrity report:', error);
            throw error;
        }
    }

    /**
     * Calculate overall data health score (0-100)
     */
    calculateHealthScore(summary) {
        if (summary.totalBDOs === 0) return 100;
        
        let deductions = 0;
        
        // Duplicate BDO IDs are critical
        deductions += (summary.duplicateBDOIds / summary.totalBDOs) * 50;
        
        // Invalid formats are significant
        deductions += (summary.invalidFormats / summary.totalBDOs) * 30;
        
        // Missing data is critical
        deductions += (summary.missingData / summary.totalBDOs) * 40;
        
        const score = Math.max(0, 100 - deductions);
        return Math.round(score);
    }

    /**
     * Analyze health of each franchise's data
     */
    analyzeFranchiseHealth(franchises) {
        const franchiseHealth = {};
        
        Object.entries(franchises).forEach(([code, data]) => {
            const gapPercentage = data.gaps ? (data.gaps.length / data.count) * 100 : 0;
            
            let healthStatus = 'EXCELLENT';
            if (gapPercentage > 20) healthStatus = 'POOR';
            else if (gapPercentage > 10) healthStatus = 'FAIR';
            else if (gapPercentage > 5) healthStatus = 'GOOD';
            
            franchiseHealth[code] = {
                ...data,
                gapPercentage: Math.round(gapPercentage * 100) / 100,
                healthStatus,
                needsAttention: gapPercentage > 10 || data.hasGaps
            };
        });
        
        return franchiseHealth;
    }

    /**
     * Generate actionable recommendations based on analysis
     */
    generateRecommendations(data) {
        const recommendations = [];
        
        if (data.summary.duplicateBDOIds > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'DUPLICATES',
                title: 'Resolve Duplicate BDO IDs',
                description: `Found ${data.summary.duplicateBDOIds} duplicate BDO ID(s). These must be resolved immediately to prevent data conflicts.`,
                action: 'Review and merge or remove duplicate entries',
                affectedCount: data.summary.duplicateBDOIds
            });
        }
        
        if (data.summary.missingData > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'DATA_INTEGRITY',
                title: 'Fix Missing Essential Data',
                description: `Found ${data.summary.missingData} BDO record(s) with missing essential fields (bdoId or franchiseCode).`,
                action: 'Update records with missing data or archive if invalid',
                affectedCount: data.summary.missingData
            });
        }
        
        if (data.summary.invalidFormats > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'FORMAT_ISSUES',
                title: 'Standardize BDO ID Formats',
                description: `Found ${data.summary.invalidFormats} BDO ID(s) with non-standard formats.`,
                action: 'Update BDO IDs to follow standard format: [FranchiseCode]-[5DigitNumber]',
                affectedCount: data.summary.invalidFormats
            });
        }
        
        // Check for franchises with significant gaps
        const franchisesWithGaps = Object.entries(data.franchises)
            .filter(([code, franchise]) => franchise.hasGaps && franchise.gaps.length > 5);
        
        if (franchisesWithGaps.length > 0) {
            recommendations.push({
                priority: 'LOW',
                category: 'SEQUENCE_GAPS',
                title: 'Review Sequential Number Gaps',
                description: `Found ${franchisesWithGaps.length} franchise(s) with significant gaps in BDO ID sequences.`,
                action: 'Consider if gaps are intentional or if data migration is needed',
                affectedFranchises: franchisesWithGaps.map(([code]) => code)
            });
        }
        
        return recommendations;
    }
}

export default SequenceSyncService;
