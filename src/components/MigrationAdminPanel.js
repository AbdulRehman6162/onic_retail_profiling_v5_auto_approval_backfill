import React, { useState, useEffect } from 'react';
import { RequestMigrationService } from '../utils/migrateToV2';
import { DeviceLifecycleService } from '../services/deviceLifecycleService';
import toast from 'react-hot-toast';

/**
 * Migration Admin Panel - Manage data migration and validation
 */
function MigrationAdminPanel({ user, app, onClose }) {
    const [migrationService] = useState(() => new RequestMigrationService(app));
    const [lifecycleService] = useState(() => new DeviceLifecycleService(app));
    const [stats, setStats] = useState(null);
    const [migrationProgress, setMigrationProgress] = useState({
        isRunning: false,
        currentBatch: 0,
        totalMigrated: 0,
        currentItem: null
    });
    const [validation, setValidation] = useState(null);
    const [loading, setLoading] = useState(false);

    // Load migration stats on component mount
    useEffect(() => {
        loadMigrationStats();
    }, []);

    const loadMigrationStats = async () => {
        try {
            setLoading(true);
            const migrationStats = await migrationService.getMigrationStats();
            setStats(migrationStats);
        } catch (error) {
            console.error('Error loading migration stats:', error);
            toast.error('Failed to load migration statistics');
        } finally {
            setLoading(false);
        }
    };

    const handleStartMigration = async () => {
        try {
            setMigrationProgress({
                isRunning: true,
                currentBatch: 0,
                totalMigrated: 0,
                currentItem: null
            });

            toast.loading('Starting migration...', { id: 'migration' });

            const result = await migrationService.migrateAllRequests(
                // Progress callback for individual items
                (progress) => {
                    setMigrationProgress(prev => ({
                        ...prev,
                        currentItem: {
                            requestId: progress.requestId,
                            requestType: progress.requestType,
                            current: progress.current,
                            total: progress.total
                        }
                    }));
                },
                // Batch completion callback
                (batchInfo) => {
                    setMigrationProgress(prev => ({
                        ...prev,
                        currentBatch: batchInfo.batchNumber,
                        totalMigrated: batchInfo.totalMigrated
                    }));
                    
                    toast.success(`Batch ${batchInfo.batchNumber} completed: ${batchInfo.batchMigrated} requests`, {
                        id: `batch-${batchInfo.batchNumber}`
                    });
                }
            );

            setMigrationProgress(prev => ({ ...prev, isRunning: false }));
            toast.success(`Migration completed! ${result.totalMigrated} requests migrated`, { id: 'migration' });
            
            // Reload stats
            await loadMigrationStats();

        } catch (error) {
            console.error('Migration failed:', error);
            toast.error(`Migration failed: ${error.message}`, { id: 'migration' });
            setMigrationProgress(prev => ({ ...prev, isRunning: false }));
        }
    };

    const handleValidateMigration = async () => {
        try {
            setLoading(true);
            toast.loading('Validating migration...', { id: 'validation' });
            
            const validationResult = await migrationService.validateMigration();
            setValidation(validationResult);
            
            if (validationResult.issues.length === 0 && validationResult.countsMatch) {
                toast.success('Migration validation successful!', { id: 'validation' });
            } else {
                toast.error(`Validation found ${validationResult.issues.length} issues`, { id: 'validation' });
            }
        } catch (error) {
            console.error('Validation failed:', error);
            toast.error(`Validation failed: ${error.message}`, { id: 'validation' });
        } finally {
            setLoading(false);
        }
    };

    const handleRollback = async () => {
        if (!window.confirm('Are you sure you want to rollback the migration? This will delete all migrated data in requestsV2.')) {
            return;
        }

        try {
            setLoading(true);
            toast.loading('Rolling back migration...', { id: 'rollback' });
            
            const result = await migrationService.rollbackMigration();
            toast.success(`Rollback completed! ${result.deleted} documents removed`, { id: 'rollback' });
            
            // Reload stats
            await loadMigrationStats();
            setValidation(null);
        } catch (error) {
            console.error('Rollback failed:', error);
            toast.error(`Rollback failed: ${error.message}`, { id: 'rollback' });
        } finally {
            setLoading(false);
        }
    };

    const handleTestLifecycle = async () => {
        try {
            setLoading(true);
            toast.loading('Testing lifecycle service...', { id: 'lifecycle-test' });
            
            const analytics = await lifecycleService.getLifecycleAnalytics();
            toast.success(`Lifecycle test successful! Found ${analytics.totalDevices} devices`, { id: 'lifecycle-test' });
            
            console.log('Lifecycle Analytics:', analytics);
        } catch (error) {
            console.error('Lifecycle test failed:', error);
            toast.error(`Lifecycle test failed: ${error.message}`, { id: 'lifecycle-test' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Migration Admin Panel</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        ✕
                    </button>
                </div>

                {/* Migration Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-blue-600">Old Requests</h3>
                        <p className="text-2xl font-bold text-blue-900">
                            {loading ? '...' : stats?.oldRequestsCount || 0}
                        </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-green-600">New Requests (V2)</h3>
                        <p className="text-2xl font-bold text-green-900">
                            {loading ? '...' : stats?.newRequestsCount || 0}
                        </p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-yellow-600">Remaining</h3>
                        <p className="text-2xl font-bold text-yellow-900">
                            {loading ? '...' : stats?.remainingToMigrate || 0}
                        </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <h3 className="text-sm font-medium text-purple-600">Status</h3>
                        <p className="text-lg font-bold text-purple-900">
                            {loading ? '...' : stats?.migrationComplete ? 'Complete' : 'Pending'}
                        </p>
                    </div>
                </div>

                {/* Migration Progress */}
                {migrationProgress.isRunning && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-semibold text-blue-800 mb-2">Migration In Progress</h3>
                        <p className="text-blue-700">
                            Batch: {migrationProgress.currentBatch} | 
                            Total Migrated: {migrationProgress.totalMigrated}
                        </p>
                        {migrationProgress.currentItem && (
                            <p className="text-sm text-blue-600 mt-1">
                                Processing: {migrationProgress.currentItem.requestType} 
                                ({migrationProgress.currentItem.current}/{migrationProgress.currentItem.total})
                            </p>
                        )}
                        <div className="w-full bg-blue-200 rounded-full h-2 mt-3">
                            <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                        </div>
                    </div>
                )}

                {/* Validation Results */}
                {validation && (
                    <div className={`border rounded-lg p-4 mb-6 ${
                        validation.issues.length === 0 && validation.countsMatch 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-red-50 border-red-200'
                    }`}>
                        <h3 className="text-lg font-semibold mb-2">
                            Validation Results
                        </h3>
                        <div className="grid grid-cols-2 gap-4 mb-3">
                            <div>
                                <p className="text-sm text-gray-600">Counts Match:</p>
                                <p className={`font-semibold ${validation.countsMatch ? 'text-green-600' : 'text-red-600'}`}>
                                    {validation.countsMatch ? 'Yes' : 'No'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Issues Found:</p>
                                <p className={`font-semibold ${validation.issues.length === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {validation.issues.length}
                                </p>
                            </div>
                        </div>
                        {validation.issues.length > 0 && (
                            <div className="mt-3">
                                <p className="text-sm font-medium text-red-700 mb-1">Issues:</p>
                                <ul className="text-sm text-red-600 list-disc list-inside">
                                    {validation.issues.map((issue, index) => (
                                        <li key={index}>{issue}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button
                        onClick={handleStartMigration}
                        disabled={loading || migrationProgress.isRunning || stats?.migrationComplete}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {migrationProgress.isRunning ? 'Migrating...' : 'Start Migration'}
                    </button>

                    <button
                        onClick={handleValidateMigration}
                        disabled={loading || migrationProgress.isRunning}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Validate Migration
                    </button>

                    <button
                        onClick={handleTestLifecycle}
                        disabled={loading || migrationProgress.isRunning}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Test Lifecycle Service
                    </button>

                    <button
                        onClick={handleRollback}
                        disabled={loading || migrationProgress.isRunning || stats?.newRequestsCount === 0}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Rollback Migration
                    </button>
                </div>

                {/* Refresh Stats Button */}
                <div className="mt-4 text-center">
                    <button
                        onClick={loadMigrationStats}
                        disabled={loading}
                        className="text-blue-600 hover:text-blue-800 underline"
                    >
                        Refresh Statistics
                    </button>
                </div>
            </div>
        </div>
    );
}

export default MigrationAdminPanel;
