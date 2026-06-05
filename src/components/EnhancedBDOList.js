// --- Enhanced BDO List Component with low-read pagination ---
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getFirestore, collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

const PAGE_SIZE = 15;

const formatDate = (value) => {
    if (!value) return 'N/A';
    try {
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
    } catch (error) {
        return 'N/A';
    }
};

const statusClasses = (status = '') => {
    const normalized = String(status).toLowerCase();
    if (normalized.includes('approved') || normalized.includes('active')) return 'bg-green-100 text-green-800';
    if (normalized.includes('revision')) return 'bg-orange-100 text-orange-800';
    if (normalized.includes('reject')) return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
};

function EnhancedBDOList({ user, app }) {
    const [bdoAccounts, setBdoAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [selectedBDO, setSelectedBDO] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [loadingDevice, setLoadingDevice] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [db] = useState(() => getFirestore(app));

    const loadBDOAccounts = useCallback(async (reset = false) => {
        if (!user?.franchiseCode) return;

        try {
            reset ? setLoading(true) : setLoadingMore(true);

            const constraints = [
                where('franchiseCode', '==', user.franchiseCode),
                orderBy('createdAt', 'desc')
            ];

            if (!reset && lastDoc) constraints.push(startAfter(lastDoc));
            constraints.push(limit(PAGE_SIZE));

            const bdoQuery = query(collection(db, 'bdoAccounts'), ...constraints);
            const snapshot = await getDocs(bdoQuery);
            const nextAccounts = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));

            setBdoAccounts(prev => reset ? nextAccounts : [...prev, ...nextAccounts]);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (error) {
            console.error('Error loading BDO accounts:', error);
            toast.error('Failed to load BDO accounts');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [db, lastDoc, user?.franchiseCode]);

    useEffect(() => {
        setBdoAccounts([]);
        setLastDoc(null);
        setHasMore(false);
        loadBDOAccounts(true);
    }, [user?.franchiseCode]);

    const filteredAccounts = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        if (!search) return bdoAccounts;

        return bdoAccounts.filter(bdo => [
            bdo.name,
            bdo.bdoName,
            bdo.bdoId,
            bdo.cnic,
            bdo.cnicNumber,
            bdo.otpMobileNumber,
            bdo.boundIMEI,
            bdo.handlerType,
            bdo.franchiseCode,
            bdo.franchiseName,
            bdo.status
        ].some(value => String(value || '').toLowerCase().includes(search)));
    }, [bdoAccounts, searchTerm]);

    const loadMappedDeviceForBDO = async (bdo) => {
        if (!bdo?.bdoId) {
            setSelectedDevice(null);
            return;
        }

        setLoadingDevice(true);
        try {
            const deviceQuery = query(
                collection(db, 'devices'),
                where('bdoId', '==', bdo.bdoId),
                where('status', '==', 'Mapped'),
                limit(1)
            );
            const snapshot = await getDocs(deviceQuery);

            if (snapshot.empty) {
                setSelectedDevice(null);
            } else {
                const deviceDoc = snapshot.docs[0];
                setSelectedDevice({ id: deviceDoc.id, imei: deviceDoc.id, ...deviceDoc.data() });
            }
        } catch (error) {
            console.error('Error loading mapped device:', error);
            toast.error('Could not load mapped device details');
            setSelectedDevice(null);
        } finally {
            setLoadingDevice(false);
        }
    };

    const showBDODetails = (bdo) => {
        setSelectedBDO(bdo);
        setSelectedDevice(null);
        setShowModal(true);
        loadMappedDeviceForBDO(bdo);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedBDO(null);
        setSelectedDevice(null);
    };

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                <p className="text-gray-600">Loading BDO/Retailer accounts...</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-md">
            <div className="p-4 md:p-6 border-b border-gray-200">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">BDO/Retailer Accounts</h3>
                        <p className="text-sm text-gray-500">Showing {bdoAccounts.length} loaded records. Device lookup is loaded only when a record is opened.</p>
                    </div>
                    <button
                        onClick={() => loadBDOAccounts(true)}
                        disabled={loading}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Refresh
                    </button>
                </div>

                <div className="mt-4 relative">
                    <input
                        type="text"
                        placeholder="Search loaded BDOs: name, BDO ID, CNIC, mobile, status..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            Clear
                        </button>
                    )}
                </div>
                {searchTerm && (
                    <p className="mt-2 text-xs text-gray-500">Search runs against loaded records only. Use Load More to extend the searchable set.</p>
                )}
            </div>

            {filteredAccounts.length === 0 ? (
                <div className="p-8 text-center">
                    <p className="text-gray-500">No BDO/Retailer records found in the loaded set.</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {filteredAccounts.map(bdo => (
                        <button
                            key={bdo.id}
                            onClick={() => showBDODetails(bdo)}
                            className="w-full text-left p-4 md:p-5 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="font-semibold text-gray-900 truncate">{bdo.name || bdo.bdoName || 'Unnamed BDO/Retailer'}</h4>
                                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${statusClasses(bdo.status)}`}>
                                            {bdo.status || 'Pending'}
                                        </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                                        <p><span className="font-medium">BDO ID:</span> {bdo.bdoId || 'N/A'}</p>
                                        <p><span className="font-medium">Type:</span> {bdo.handlerType || 'N/A'}</p>
                                        <p><span className="font-medium">CNIC:</span> {bdo.cnicNumber || bdo.cnic || 'N/A'}</p>
                                        <p><span className="font-medium">Mobile:</span> {bdo.otpMobileNumber || 'N/A'}</p>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">Created {formatDate(bdo.createdAt)}</p>
                                </div>
                                <span className="text-sm text-blue-600 whitespace-nowrap">Open details</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <div className="p-4 md:p-6 border-t bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-600">Loaded {bdoAccounts.length} account{bdoAccounts.length === 1 ? '' : 's'}</p>
                {hasMore && !searchTerm && (
                    <button
                        onClick={() => loadBDOAccounts(false)}
                        disabled={loadingMore}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loadingMore ? 'Loading...' : `Load More (${PAGE_SIZE})`}
                    </button>
                )}
            </div>

            {showModal && selectedBDO && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-lg max-w-2xl w-full max-h-[92vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-4 md:p-6 border-b sticky top-0 bg-white">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">{selectedBDO.name || selectedBDO.bdoName || 'BDO/Retailer'} Details</h3>
                                <p className="text-sm text-gray-500">{selectedBDO.bdoId || 'N/A'}</p>
                            </div>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">x</button>
                        </div>

                        <div className="p-4 md:p-6 space-y-6">
                            <section>
                                <h4 className="font-medium text-gray-900 mb-3">Account Information</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    <p><span className="font-medium text-gray-600">Name:</span> {selectedBDO.name || selectedBDO.bdoName || 'N/A'}</p>
                                    <p><span className="font-medium text-gray-600">Type:</span> {selectedBDO.handlerType || 'N/A'}</p>
                                    <p><span className="font-medium text-gray-600">CNIC:</span> {selectedBDO.cnicNumber || selectedBDO.cnic || 'N/A'}</p>
                                    <p><span className="font-medium text-gray-600">Mobile:</span> {selectedBDO.otpMobileNumber || 'N/A'}</p>
                                    <p><span className="font-medium text-gray-600">Status:</span> {selectedBDO.status || 'Pending'}</p>
                                    <p><span className="font-medium text-gray-600">Created:</span> {formatDate(selectedBDO.createdAt)}</p>
                                </div>
                            </section>

                            <section>
                                <h4 className="font-medium text-gray-900 mb-3">Mapped Device</h4>
                                {loadingDevice ? (
                                    <p className="text-sm text-gray-500">Loading device details...</p>
                                ) : selectedDevice ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-green-50 rounded-lg p-4">
                                        <p><span className="font-medium text-gray-600">IMEI:</span> {selectedDevice.imei || selectedDevice.id}</p>
                                        <p><span className="font-medium text-gray-600">Status:</span> {selectedDevice.status || 'Mapped'}</p>
                                        <p><span className="font-medium text-gray-600">Shop:</span> {selectedDevice.shopName || 'N/A'}</p>
                                        <p><span className="font-medium text-gray-600">City:</span> {selectedDevice.city || 'N/A'}</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">No mapped device found for this BDO/Retailer.</p>
                                )}
                            </section>

                            <section>
                                <h4 className="font-medium text-gray-900 mb-3">Documents</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    {(selectedBDO.cnicFrontImage || selectedBDO.imageUrls?.front) ? (
                                        <a href={selectedBDO.cnicFrontImage || selectedBDO.imageUrls.front} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View CNIC Front</a>
                                    ) : <span className="text-gray-500">CNIC front not uploaded</span>}
                                    {(selectedBDO.cnicBackImage || selectedBDO.imageUrls?.back) ? (
                                        <a href={selectedBDO.cnicBackImage || selectedBDO.imageUrls.back} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View CNIC Back</a>
                                    ) : <span className="text-gray-500">CNIC back not uploaded</span>}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EnhancedBDOList;
