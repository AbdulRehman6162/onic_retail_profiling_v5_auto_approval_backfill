// --- Device Transfer Debug Tool ---
import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

/**
 * Debug tool to help understand why Device Transfer isn't showing mapped devices
 */
function DeviceTransferDebugger({ user, app }) {
    const [debugData, setDebugData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [db] = useState(() => getFirestore(app));

    const runDebugAnalysis = async () => {
        setLoading(true);
        try {
            console.log('🔍 Starting Device Transfer Debug Analysis...');
            
            const analysis = {
                timestamp: new Date().toISOString(),
                user: {
                    uid: user.uid,
                    email: user.email,
                    franchiseCode: user.franchiseCode
                },
                collections: {},
                bdos: [],
                deviceMappings: []
            };

            // 1. Check BDO Accounts
            console.log('📋 Checking BDO Accounts...');
            const bdoQuery = query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', user.franchiseCode)
            );
            const bdoSnapshot = await getDocs(bdoQuery);
            
            analysis.collections.bdoAccounts = {
                total: bdoSnapshot.size,
                approved: 0,
                pending: 0,
                rejected: 0
            };

            bdoSnapshot.docs.forEach(doc => {
                const bdo = { id: doc.id, ...doc.data() };
                analysis.bdos.push({
                    id: bdo.id,
                    bdoId: bdo.bdoId,
                    name: bdo.name,
                    status: bdo.status,
                    cnic: bdo.cnic,
                    otpMobileNumber: bdo.otpMobileNumber
                });

                if (bdo.status === 'Approved') analysis.collections.bdoAccounts.approved++;
                else if (bdo.status === 'pending') analysis.collections.bdoAccounts.pending++;
                else analysis.collections.bdoAccounts.rejected++;
            });

            // 2. Check deviceRequests collection
            console.log('📱 Checking deviceRequests collection...');
            try {
                const deviceRequestsQuery = query(
                    collection(db, 'deviceRequests'),
                    where('franchiseCode', '==', user.franchiseCode)
                );
                const deviceRequestsSnapshot = await getDocs(deviceRequestsQuery);
                
                analysis.collections.deviceRequests = {
                    total: deviceRequestsSnapshot.size,
                    pending: 0,
                    approved: 0,
                    completed: 0,
                    rejected: 0
                };

                deviceRequestsSnapshot.docs.forEach(doc => {
                    const request = { id: doc.id, ...doc.data() };
                    analysis.deviceMappings.push({
                        id: request.id,
                        requestNumber: request.requestNumber,
                        requestType: request.requestType,
                        status: request.status,
                        bdoId: request.bdoDetails?.bdoId,
                        bdoName: request.bdoDetails?.name,
                        imei: request.deviceDetails?.imei,
                        shopName: request.deviceDetails?.shopName,
                        createdAt: request.createdAt
                    });

                    const status = request.status?.toLowerCase();
                    if (status === 'pending') analysis.collections.deviceRequests.pending++;
                    else if (status === 'approved') analysis.collections.deviceRequests.approved++;
                    else if (status === 'completed') analysis.collections.deviceRequests.completed++;
                    else analysis.collections.deviceRequests.rejected++;
                });
            } catch (error) {
                console.log('⚠️ deviceRequests collection not accessible:', error.message);
                analysis.collections.deviceRequests = { error: error.message };
            }

            // 3. Check requests collection (production)
            console.log('📊 Checking requests collection...');
            try {
                const requestsQuery = query(
                    collection(db, 'requestsV2'),
                    where('franchiseCode', '==', user.franchiseCode)
                );
                const requestsSnapshot = await getDocs(requestsQuery);
                
                analysis.collections.requests = {
                    total: requestsSnapshot.size,
                    pending: 0,
                    approved: 0,
                    completed: 0,
                    rejected: 0
                };

                requestsSnapshot.docs.forEach(doc => {
                    const request = { id: doc.id, ...doc.data() };
                    analysis.deviceMappings.push({
                        id: request.id,
                        requestNumber: request.requestNumber,
                        requestType: request.requestType,
                        status: request.status,
                        bdoId: request.bdoDetails?.bdoId,
                        bdoName: request.bdoDetails?.name,
                        imei: request.deviceDetails?.imei,
                        shopName: request.deviceDetails?.shopName,
                        createdAt: request.createdAt,
                        collection: 'requestsV2'
                    });

                    const status = request.status?.toLowerCase();
                    if (status === 'pending') analysis.collections.requests.pending++;
                    else if (status === 'approved') analysis.collections.requests.approved++;
                    else if (status === 'completed') analysis.collections.requests.completed++;
                    else analysis.collections.requests.rejected++;
                });
            } catch (error) {
                console.log('⚠️ requests collection not accessible:', error.message);
                analysis.collections.requests = { error: error.message };
            }

            // 4. Analysis and recommendations
            analysis.recommendations = [];
            
            if (analysis.collections.bdoAccounts.approved === 0) {
                analysis.recommendations.push('❌ No approved BDOs found. BDOs need to be approved before device transfer.');
            }
            
            const totalMappings = analysis.deviceMappings.length;
            const approvedMappings = analysis.deviceMappings.filter(m => 
                m.status?.toLowerCase() === 'approved' || m.status?.toLowerCase() === 'completed'
            ).length;
            
            if (totalMappings === 0) {
                analysis.recommendations.push('❌ No device mappings found in either collection.');
            } else if (approvedMappings === 0) {
                analysis.recommendations.push('⚠️ Device mappings found, but none are approved/completed. Only approved mappings can be transferred.');
            } else {
                analysis.recommendations.push(`✅ Found ${approvedMappings} approved device mappings that can be transferred.`);
            }

            console.log('📊 Debug Analysis Complete:', analysis);
            setDebugData(analysis);
            
            toast.success('Debug analysis complete! Check console for details.');

        } catch (error) {
            console.error('❌ Debug analysis failed:', error);
            toast.error('Debug analysis failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Device Transfer Debugger</h3>
                <button
                    onClick={runDebugAnalysis}
                    disabled={loading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Analyzing...' : 'Run Debug Analysis'}
                </button>
            </div>

            <div className="text-sm text-gray-600 mb-4">
                This tool analyzes your database to understand why Device Transfer might not be showing mapped devices.
            </div>

            {debugData && (
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span className="text-gray-600">Total BDOs:</span>
                                <span className="ml-2 font-medium">{debugData.collections.bdoAccounts?.total || 0}</span>
                            </div>
                            <div>
                                <span className="text-gray-600">Approved BDOs:</span>
                                <span className="ml-2 font-medium text-green-600">{debugData.collections.bdoAccounts?.approved || 0}</span>
                            </div>
                            <div>
                                <span className="text-gray-600">Device Mappings:</span>
                                <span className="ml-2 font-medium">{debugData.deviceMappings?.length || 0}</span>
                            </div>
                            <div>
                                <span className="text-gray-600">Approved Mappings:</span>
                                <span className="ml-2 font-medium text-green-600">
                                    {debugData.deviceMappings?.filter(m => 
                                        m.status?.toLowerCase() === 'approved' || m.status?.toLowerCase() === 'completed'
                                    ).length || 0}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="font-medium text-yellow-800 mb-2">Recommendations</h4>
                        <ul className="space-y-1 text-sm">
                            {debugData.recommendations?.map((rec, index) => (
                                <li key={index} className="text-yellow-700">{rec}</li>
                            ))}
                        </ul>
                    </div>

                    {/* Device Mappings Details */}
                    {debugData.deviceMappings?.length > 0 && (
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">Device Mappings Found</h4>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Request #</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">BDO</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">IMEI</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {debugData.deviceMappings.slice(0, 10).map((mapping, index) => (
                                            <tr key={index}>
                                                <td className="px-3 py-2 text-sm font-mono">{mapping.requestNumber}</td>
                                                <td className="px-3 py-2 text-sm">
                                                    {mapping.bdoName} ({mapping.bdoId})
                                                </td>
                                                <td className="px-3 py-2 text-sm font-mono">{mapping.imei}</td>
                                                <td className="px-3 py-2 text-sm">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                                        mapping.status?.toLowerCase() === 'approved' || mapping.status?.toLowerCase() === 'completed'
                                                            ? 'bg-green-100 text-green-800'
                                                            : mapping.status?.toLowerCase() === 'pending'
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {mapping.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-sm">{mapping.requestType}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default DeviceTransferDebugger;
