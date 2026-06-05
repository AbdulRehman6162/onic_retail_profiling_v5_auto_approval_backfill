// --- Admin Data Integrity Panel ---
import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { getFunctions } from 'firebase/functions';
import SequenceSyncService from '../utils/sequenceSyncService';

const AdminDataIntegrityPanel = ({ user }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [syncResults, setSyncResults] = useState(null);
    const [analysisResults, setAnalysisResults] = useState(null);
    const [integrityReport, setIntegrityReport] = useState(null);
    
    const functions = getFunctions();
    const sequenceSyncService = new SequenceSyncService(functions);

    // Only allow admin users to access this panel
    if (!user?.isAdmin) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                    <div className="text-red-600">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Access Denied</h3>
                        <p className="text-sm text-red-700 mt-1">Only admin users can access the Data Integrity Panel.</p>
                    </div>
                </div>
            </div>
        );
    }

    const handleSyncCounters = async () => {
        setIsLoading(true);
        try {
            const result = await sequenceSyncService.syncCounters();
            setSyncResults(result);
            toast.success('✅ Sequence counters synced successfully!');
        } catch (error) {
            console.error('Sync failed:', error);
            toast.error(`❌ Sync failed: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalyzeBDOData = async () => {
        setIsLoading(true);
        try {
            const result = await sequenceSyncService.analyzeBDOData();
            setAnalysisResults(result);
            toast.success('✅ BDO data analysis completed!');
        } catch (error) {
            console.error('Analysis failed:', error);
            toast.error(`❌ Analysis failed: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateIntegrityReport = async () => {
        setIsLoading(true);
        try {
            const report = await sequenceSyncService.getDataIntegrityReport();
            setIntegrityReport(report);
            toast.success('✅ Data integrity report generated!');
        } catch (error) {
            console.error('Report generation failed:', error);
            toast.error(`❌ Report generation failed: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const renderSyncResults = () => {
        if (!syncResults) return null;

        return (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <h4 className="text-lg font-semibold text-green-800 mb-3">Sync Results</h4>
                <div className="text-sm text-green-700">
                    <p className="font-medium">{syncResults.message}</p>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                            <span className="font-medium">Total BDOs Processed:</span>
                            <span className="ml-2">{syncResults.stats.totalBDOsProcessed}</span>
                        </div>
                        <div>
                            <span className="font-medium">Valid BDO IDs:</span>
                            <span className="ml-2">{syncResults.stats.validBDOIds}</span>
                        </div>
                        <div>
                            <span className="font-medium">Franchises Found:</span>
                            <span className="ml-2">{syncResults.stats.franchisesFound}</span>
                        </div>
                    </div>
                    
                    {syncResults.stats.franchiseCounters && (
                        <div className="mt-4">
                            <span className="font-medium">Franchise Counters:</span>
                            <div className="mt-2 bg-white rounded border p-3">
                                {Object.entries(syncResults.stats.franchiseCounters).map(([franchise, count]) => (
                                    <div key={franchise} className="flex justify-between py-1">
                                        <span>{franchise}:</span>
                                        <span className="font-mono">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderIntegrityReport = () => {
        if (!integrityReport) return null;

        const getHealthColor = (score) => {
            if (score >= 90) return 'text-green-600';
            if (score >= 70) return 'text-yellow-600';
            return 'text-red-600';
        };

        const getSeverityColor = (severity) => {
            switch (severity) {
                case 'HIGH': return 'text-red-600 bg-red-100';
                case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
                case 'LOW': return 'text-blue-600 bg-blue-100';
                default: return 'text-green-600 bg-green-100';
            }
        };

        return (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mt-4">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Data Integrity Report</h4>
                
                {/* Overview */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <h5 className="font-semibold text-gray-700 mb-3">Overview</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-800">{integrityReport.overview.totalBDOs}</div>
                            <div className="text-sm text-gray-600">Total BDOs</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-800">{integrityReport.overview.totalFranchises}</div>
                            <div className="text-sm text-gray-600">Franchises</div>
                        </div>
                        <div className="text-center">
                            <div className={`text-2xl font-bold ${getHealthColor(integrityReport.overview.healthScore)}`}>
                                {integrityReport.overview.healthScore}%
                            </div>
                            <div className="text-sm text-gray-600">Health Score</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-800">{integrityReport.recommendations.length}</div>
                            <div className="text-sm text-gray-600">Issues</div>
                        </div>
                    </div>
                </div>

                {/* Issues */}
                <div className="mb-6">
                    <h5 className="font-semibold text-gray-700 mb-3">Issues Detected</h5>
                    <div className="space-y-3">
                        {Object.entries(integrityReport.issues).map(([issueType, issue]) => (
                            <div key={issueType} className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <span className="font-medium capitalize">{issueType.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    <span className="ml-2 text-gray-600">({issue.count} instances)</span>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(issue.severity)}`}>
                                    {issue.severity}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recommendations */}
                {integrityReport.recommendations.length > 0 && (
                    <div className="mb-6">
                        <h5 className="font-semibold text-gray-700 mb-3">Recommendations</h5>
                        <div className="space-y-3">
                            {integrityReport.recommendations.map((rec, index) => (
                                <div key={index} className="border rounded-lg p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <h6 className="font-medium text-gray-800">{rec.title}</h6>
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(rec.priority)}`}>
                                            {rec.priority}
                                        </span>
                                    </div>
                                    <p className="text-gray-600 text-sm mb-2">{rec.description}</p>
                                    <p className="text-gray-800 text-sm font-medium">Action: {rec.action}</p>
                                    {rec.affectedCount && (
                                        <p className="text-gray-500 text-xs mt-1">Affects {rec.affectedCount} records</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Franchise Status */}
                <div>
                    <h5 className="font-semibold text-gray-700 mb-3">Franchise Status</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(integrityReport.franchiseStatus).map(([code, status]) => (
                            <div key={code} className="border rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-medium">{code}</span>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        status.healthStatus === 'EXCELLENT' ? 'text-green-600 bg-green-100' :
                                        status.healthStatus === 'GOOD' ? 'text-blue-600 bg-blue-100' :
                                        status.healthStatus === 'FAIR' ? 'text-yellow-600 bg-yellow-100' :
                                        'text-red-600 bg-red-100'
                                    }`}>
                                        {status.healthStatus}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600">
                                    <div>BDOs: {status.count} ({status.minNumber}-{status.maxNumber})</div>
                                    {status.hasGaps && (
                                        <div className="text-yellow-600">
                                            {status.gaps ? status.gaps.length : 0} gaps ({status.gapPercentage}%)
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="border-b border-gray-200 pb-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-800">Data Integrity Management</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Sync sequence counters and analyze BDO data integrity to prevent duplicate IDs.
                </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                    onClick={handleSyncCounters}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    )}
                    Sync Counters
                </button>

                <button
                    onClick={handleAnalyzeBDOData}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    )}
                    Analyze Data
                </button>

                <button
                    onClick={handleGenerateIntegrityReport}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    )}
                    Generate Report
                </button>
            </div>

            {/* Warning Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                    <div className="text-yellow-600">
                        <svg className="w-5 h-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h4 className="text-sm font-medium text-yellow-800">Important</h4>
                        <div className="text-sm text-yellow-700 mt-1">
                            <p>• Run "Sync Counters" first to fix the duplicate BDO ID issue you're experiencing.</p>
                            <p>• This will analyze existing BDO accounts and update sequence counters accordingly.</p>
                            <p>• After syncing, new BDO IDs will be generated correctly without duplicates.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results */}
            {renderSyncResults()}
            {renderIntegrityReport()}
            
            {analysisResults && !integrityReport && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Raw Analysis Results</h4>
                    <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                        {JSON.stringify(analysisResults, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};

export default AdminDataIntegrityPanel;
