// --- BDO/Retailer Selection Step ---
import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

/**
 * Step 2: BDO/Retailer Selection
 * Allows user to select existing BDO or create new one
 */
function BDOSelectionStep({ 
    formData, 
    updateStepData, 
    stepData,
    user, 
    app,
    db,
    onNext, 
    onPrev,
    isFirstStep, 
    isLastStep 
}) {
    const [bdoAccounts, setBdoAccounts] = useState([]);
    const [filteredBDOs, setFilteredBDOs] = useState([]);
    const [selectedBDO, setSelectedBDO] = useState(formData.bdoDetails || null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isValid, setIsValid] = useState(false);
    const [activeMappings, setActiveMappings] = useState(new Set()); // Track BDOs with active mappings

    useEffect(() => {
        loadBDOAccounts();
    }, [user?.franchiseCode]);

    // Reload BDO accounts when request type changes to ensure fresh mapping data
    useEffect(() => {
        console.log(`🔄 NEW_MAPPING useEffect triggered:`);
        console.log(`Request type (stepData?.requestType): ${stepData?.requestType}`);
        console.log(`Request type (stepData?.request_type): ${stepData?.request_type}`);
        console.log(`User franchise: ${user?.franchiseCode}`);
        console.log(`Current activeMappings size: ${activeMappings.size}`);
        
        const requestType = stepData?.requestType || stepData?.request_type;
        
        if (requestType === 'NEW_MAPPING') {
            console.log('🔄 Request type is NEW_MAPPING, reloading BDO accounts with fresh mapping data...');
            console.log('🔍 About to call loadActiveMappings...');
            loadActiveMappings().then(() => {
                console.log('✅ loadActiveMappings completed');
            }).catch(error => {
                console.error('❌ loadActiveMappings failed:', error);
            });
            loadBDOAccounts();
        } else if (requestType === 'OTP_CHANGE') {
            console.log('🔄 Request type is OTP_CHANGE, reloading BDO accounts with fresh mapping data...');
            console.log('🔍 About to call loadActiveMappings for OTP_CHANGE...');
            loadActiveMappings().then(() => {
                console.log('✅ loadActiveMappings completed for OTP_CHANGE');
            }).catch(error => {
                console.error('❌ loadActiveMappings failed for OTP_CHANGE:', error);
            });
            loadBDOAccounts();
        } else if (requestType === 'DE_MAPPING') {
            console.log('🔄 Request type is DE_MAPPING, reloading BDO accounts with fresh mapping data...');
            console.log('🔍 About to call loadActiveMappings for DE_MAPPING...');
            loadActiveMappings().then(() => {
                console.log('✅ loadActiveMappings completed for DE_MAPPING');
            }).catch(error => {
                console.error('❌ loadActiveMappings failed for DE_MAPPING:', error);
            });
            loadBDOAccounts();
        } else {
            console.log(`⏭️ Request type is not NEW_MAPPING, OTP_CHANGE, or DE_MAPPING (${requestType}), skipping mapping load`);
        }
    }, [stepData?.requestType, stepData?.request_type]);

    // Also watch for when stepData itself becomes available
    useEffect(() => {
        if (stepData) {
            console.log('📋 Step data received:', stepData);
            const requestType = stepData.requestType || stepData.request_type;
            // If we have step data and it's a request type that needs mapping data, ensure we have the latest data
            if ((requestType === 'NEW_MAPPING' || requestType === 'OTP_CHANGE' || requestType === 'DE_MAPPING') && bdoAccounts.length > 0) {
                filterBDOs();
            }
        }
    }, [stepData]);

    useEffect(() => {
        filterBDOs();
    }, [searchTerm, bdoAccounts, activeMappings, stepData?.requestType, stepData?.request_type]);

    useEffect(() => {
        setIsValid(selectedBDO !== null);
    }, [selectedBDO]);

    /**
     * Load active mappings from devices collection - the single source of truth
     * This directly queries the devices collection to find which BDOs currently have mapped devices
     */
    const loadActiveMappings = async () => {
        try {
            console.log('🔍 Loading active device mappings from devices collection...');
            console.log('📡 Franchise Code:', user.franchiseCode);
            
            // Query the devices collection for all mapped devices in this franchise
            const devicesQuery = query(
                collection(db, 'devices'),
                where('franchiseCode', '==', user.franchiseCode),
                where('status', '==', 'Mapped')
            );

            const devicesSnapshot = await getDocs(devicesQuery);
            console.log(`� Found ${devicesSnapshot.docs.length} mapped devices in devices collection`);

            // Extract all BDO IDs that have mapped devices
            const mappedBDOIds = new Set();
            
            devicesSnapshot.forEach(doc => {
                const deviceData = doc.data();
                const bdoId = deviceData.bdoId;
                
                if (bdoId) {
                    mappedBDOIds.add(bdoId.trim());
                    console.log(`📱 Device ${doc.id} (IMEI) → BDO ${bdoId}`);
                }
            });

            console.log(`✅ Found ${mappedBDOIds.size} BDOs with active device mappings:`, Array.from(mappedBDOIds));
            
            // For debugging: show specific BDO status
            ['TTTTT1-00011', 'TTTTT1-00012', 'TTTTT1-00013'].forEach(bdoId => {
                if (mappedBDOIds.has(bdoId)) {
                    console.log(`🎯 ${bdoId}: ✅ HAS active device mapping (from devices collection)`);
                } else {
                    console.log(`🎯 ${bdoId}: ❌ NO active device mapping (from devices collection)`);
                }
            });
            
            setActiveMappings(mappedBDOIds);
            return mappedBDOIds;
            
        } catch (error) {
            console.error('❌ Error loading active mappings from devices collection:', error);
            return new Set();
        }
    };

    /**
     * Load BDO accounts for the franchise
     */
    const loadBDOAccounts = async () => {
        try {
            setLoading(true);
            
            // Load active mappings first from devices collection
            console.log('🔄 Loading active mappings from devices collection...');
            const activeMappingsSet = await loadActiveMappings();

            // Then load BDO accounts
            console.log('🔄 Loading BDO accounts...');
            const bdoQuery = await getDocs(query(
                collection(db, 'bdoAccounts'),
                where('franchiseCode', '==', user.franchiseCode),
                orderBy('createdAt', 'desc')
            ));

            const accounts = bdoQuery.docs.map(doc => {
                const bdoData = { id: doc.id, ...doc.data() };
                
                // Check if this BDO has an active device mapping using the bdoId field
                const isAlreadyMapped = bdoData.bdoId && activeMappingsSet.has(bdoData.bdoId.trim());
                
                return {
                    ...bdoData,
                    isAlreadyMapped
                };
            });

            console.log(`📊 Loaded ${accounts.length} BDO accounts, ${accounts.filter(a => a.isAlreadyMapped).length} already mapped`);

            setBdoAccounts(accounts);
            
            // Apply immediate filtering based on request type
            const requestType = stepData?.requestType || stepData?.request_type;
            if (requestType) {
                console.log(`🔄 Applying immediate filtering for request type: ${requestType}`);
                applyRequestTypeFiltering(accounts, requestType, activeMappingsSet);
            } else {
                setFilteredBDOs(accounts);
            }
        } catch (error) {
            console.error('❌ Error loading BDO accounts:', error);
            toast.error('Failed to load BDO accounts');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Apply filtering based on request type
     */
    const applyRequestTypeFiltering = (accounts, requestType, activeMappingsSet) => {
        let filteredAccounts = accounts;

        if (requestType === 'NEW_MAPPING') {
            // For NEW_MAPPING: exclude BDOs that already have mapped devices
            filteredAccounts = accounts.filter(bdo => {
                const isExcluded = bdo.bdoId && activeMappingsSet.has(bdo.bdoId.trim());
                
                if (isExcluded) {
                    console.log(`❌ NEW_MAPPING - Excluding BDO ${bdo.name} (${bdo.bdoId}) - already has mapped device`);
                } else {
                    console.log(`✅ NEW_MAPPING - Including BDO ${bdo.name} (${bdo.bdoId}) - available for mapping`);
                }
                
                return !isExcluded;
            });
            
            console.log(`✅ NEW_MAPPING filtering result: ${filteredAccounts.length} available BDOs`);
        } 
        else if (requestType === 'OTP_CHANGE' || requestType === 'DE_MAPPING') {
            // For OTP_CHANGE and DE_MAPPING: include ONLY BDOs that have mapped devices
            filteredAccounts = accounts.filter(bdo => {
                const hasMapping = bdo.bdoId && activeMappingsSet.has(bdo.bdoId.trim());
                
                if (hasMapping) {
                    console.log(`✅ ${requestType} - Including BDO ${bdo.name} (${bdo.bdoId}) - has mapped device`);
                } else {
                    console.log(`❌ ${requestType} - Excluding BDO ${bdo.name} (${bdo.bdoId}) - no mapped device`);
                }
                
                return hasMapping;
            });
            
            console.log(`✅ ${requestType} filtering result: ${filteredAccounts.length} BDOs with mappings`);
        }

        setFilteredBDOs(filteredAccounts);
    };

    /**
     * Filter BDOs based on search term and request type
     */
    const filterBDOs = () => {
        let baseBDOs = bdoAccounts;
        
        const requestType = stepData?.requestType || stepData?.request_type;
        
        console.log('🔍 filterBDOs called with:', {
            'stepData': stepData,
            'requestType': requestType,
            'bdoAccounts.length': bdoAccounts.length,
            'activeMappings.size': activeMappings.size,
            'activeMappings': Array.from(activeMappings)
        });
        
        // Apply request type specific filtering
        if (requestType === 'NEW_MAPPING') {
            console.log(`🔍 Filtering BDOs for NEW_MAPPING request. Total BDOs: ${bdoAccounts.length}`);
            console.log(`🚫 Excluded BDO IDs (have mapped devices):`, Array.from(activeMappings));
            
            baseBDOs = bdoAccounts.filter(bdo => {
                // For NEW_MAPPING: exclude BDOs that have mapped devices
                const isExcluded = bdo.bdoId && activeMappings.has(bdo.bdoId.trim());
                
                if (isExcluded) {
                    console.log(`❌ NEW_MAPPING - Filtering out BDO ${bdo.name} (${bdo.bdoId}) - already has mapped device`);
                } else {
                    console.log(`✅ NEW_MAPPING - BDO ${bdo.name} (${bdo.bdoId}) - available for mapping`);
                }
                
                return !isExcluded;
            });
            
            console.log(`✅ Available BDOs after NEW_MAPPING filtering: ${baseBDOs.length}`);
        } 
        else if (requestType === 'OTP_CHANGE') {
            console.log(`🔍 Filtering BDOs for OTP_CHANGE request. Total BDOs: ${bdoAccounts.length}`);
            console.log(`✅ Included BDO IDs (have mapped devices):`, Array.from(activeMappings));
            
            baseBDOs = bdoAccounts.filter(bdo => {
                // For OTP_CHANGE: include ONLY BDOs that have mapped devices
                const hasMapping = bdo.bdoId && activeMappings.has(bdo.bdoId.trim());
                
                if (hasMapping) {
                    console.log(`✅ OTP_CHANGE - Including BDO ${bdo.name} (${bdo.bdoId}) - has mapped device`);
                } else {
                    console.log(`❌ OTP_CHANGE - Excluding BDO ${bdo.name} (${bdo.bdoId}) - no mapped device`);
                }
                
                return hasMapping;
            });
            
            console.log(`✅ After OTP_CHANGE filtering: ${baseBDOs.length} BDOs with mappings`);
        }
        else if (requestType === 'DE_MAPPING') {
            console.log(`🔍 Filtering BDOs for DE_MAPPING request. Total BDOs: ${bdoAccounts.length}`);
            console.log(`✅ Included BDO IDs (have mapped devices):`, Array.from(activeMappings));
            
            baseBDOs = bdoAccounts.filter(bdo => {
                // For DE_MAPPING: include ONLY BDOs that have mapped devices
                const hasMapping = bdo.bdoId && activeMappings.has(bdo.bdoId.trim());
                
                if (hasMapping) {
                    console.log(`✅ DE_MAPPING - Including BDO ${bdo.name} (${bdo.bdoId}) - has mapped device`);
                } else {
                    console.log(`❌ DE_MAPPING - Excluding BDO ${bdo.name} (${bdo.bdoId}) - no mapped device`);
                }
                
                return hasMapping;
            });
            
            console.log(`✅ After DE_MAPPING filtering: ${baseBDOs.length} BDOs with mappings`);
        }
        
        // Apply search term filtering
        if (!searchTerm.trim()) {
            setFilteredBDOs(baseBDOs);
        } else {
            const searchLower = searchTerm.toLowerCase();
            const filtered = baseBDOs.filter(bdo => {
                return (
                    bdo.name?.toLowerCase().includes(searchLower) ||
                    bdo.bdoId?.toLowerCase().includes(searchLower) ||
                    bdo.cnic?.toLowerCase().includes(searchLower) ||
                    bdo.otpMobileNumber?.toLowerCase().includes(searchLower)
                );
            });
            setFilteredBDOs(filtered);
        }
    };

    /**
     * Handle BDO selection
     */
    const handleBDOSelect = (bdo) => {
        const requestType = stepData?.requestType || stepData?.request_type;
        
        // For NEW_MAPPING: prevent selection of BDOs that already have mapped devices
        if (requestType === 'NEW_MAPPING') {
            const isExcluded = bdo.bdoId && activeMappings.has(bdo.bdoId.trim());
            
            if (isExcluded) {
                toast.error('This BDO/Retailer already has a mapped device. Please select another one or use Transfer request.');
                console.log(`🚫 NEW_MAPPING selection blocked for BDO ${bdo.name} (${bdo.bdoId}) - already has mapped device`);
                return;
            }
        }
        
        // For OTP_CHANGE and DE_MAPPING: ensure BDO has a mapped device
        if (requestType === 'OTP_CHANGE' || requestType === 'DE_MAPPING') {
            const hasMapping = bdo.bdoId && activeMappings.has(bdo.bdoId.trim());
            
            if (!hasMapping) {
                const requestTypeLabel = requestType === 'OTP_CHANGE' ? 'OTP change' : 'de-mapping';
                toast.error(`This BDO/Retailer has no mapped device. Please select a BDO with a mapped device for ${requestTypeLabel}.`);
                console.log(`🚫 ${requestType} selection blocked for BDO ${bdo.name} (${bdo.bdoId}) - no mapped device`);
                return;
            }
        }
        
        setSelectedBDO(bdo);
        updateStepData('bdo_selection', bdo);
        console.log(`✅ BDO selected: ${bdo.name} (${bdo.bdoId}) for ${requestType}`);
    };

    /**
     * Handle next step
     */
    const handleNext = () => {
        if (isValid) {
            onNext();
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select BDO/Retailer
                </h3>
                <p className="text-sm text-gray-600">
                    Choose an existing BDO/Retailer or create a new profile
                </p>
                {(stepData?.requestType === 'NEW_MAPPING' || stepData?.request_type === 'NEW_MAPPING') && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-blue-700">
                                    <strong>New Mapping Request:</strong> Only BDOs/Retailers without active device mappings are shown.
                                    Disabled entries already have devices mapped or have mappings in progress.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                {(stepData?.requestType === 'OTP_CHANGE' || stepData?.request_type === 'OTP_CHANGE') && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-green-700">
                                    <strong>OTP Change Request:</strong> Only BDOs/Retailers with active device mappings are shown.
                                    Select the BDO whose OTP number you want to change.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
                <div className="px-4 py-2 rounded-md font-medium bg-blue-600 text-white">
                    Select Existing BDO/Retailer
                </div>
            </div>

            {/* Search Box */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search by name, BDO ID, CNIC, or mobile..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg 
                    className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            {/* Selected BDO Display */}
            {selectedBDO && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div className="ml-3 flex-1">
                            <h4 className="text-sm font-medium text-green-800">Selected BDO/Retailer</h4>
                            <div className="mt-1 text-sm text-green-700">
                                <p><strong>{selectedBDO.name}</strong> ({selectedBDO.handlerType})</p>
                                <p>ID: {selectedBDO.bdoId} | CNIC: {selectedBDO.cnic}</p>
                                <p>Mobile: {selectedBDO.otpMobileNumber}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedBDO(null)}
                            className="text-green-600 hover:text-green-700"
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* BDO List */}
            {loading ? (
                <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-600">Loading BDO accounts...</span>
                </div>
            ) : filteredBDOs.length === 0 ? (
                <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-gray-500 mb-4">
                        {(stepData?.requestType === 'NEW_MAPPING' || stepData?.request_type === 'NEW_MAPPING')
                            ? 'No available Retailer/BDOs for new mapping.'
                            : searchTerm 
                                ? 'No BDO accounts match your search' 
                                : 'No BDO accounts found'
                        }
                    </p>
                    {(stepData?.requestType === 'NEW_MAPPING' || stepData?.request_type === 'NEW_MAPPING') ? (
                        <div className="space-y-4">
                            <p className="text-sm text-blue-600">
                                Goto + Create BDO/Retailer tab and  <strong>create new Retailer/BDO</strong> first.
                            </p>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <h4 className="text-sm font-medium text-blue-800 mb-2">Need a New BDO/Retailer?</h4>
                                        <p className="text-sm text-blue-700 mb-3">
                                            To create a new mapping request, you need to first create a BDO/Retailer profile.
                                        </p>
                                        <button
                                            onClick={() => {
                                                // Navigate to Create BDO/Retailer tab
                                                window.location.hash = '#create-bdo';
                                                // Or if using React Router: navigate('/create-bdo');
                                            }}
                                            className="inline-flex items-center px-3 py-2 border border-blue-300 text-sm leading-4 font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 transition-colors"
                                        >
                                            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                            </svg>
                                            Go to Create BDO/Retailer Tab
                                        </button>
                                        <p className="text-xs text-blue-600 mt-2">
                                            After creating the BDO profile, return here to create your mapping request.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">
                                {searchTerm 
                                    ? 'No BDO accounts match your search' 
                                    : 'No BDO accounts found'
                                }
                            </p>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <h4 className="text-sm font-medium text-gray-800 mb-2">Create BDO/Retailer Profile First</h4>
                                        <p className="text-sm text-gray-600 mb-3">
                                            Please create a BDO/Retailer profile first before creating requests.
                                        </p>
                                        <button
                                            onClick={() => {
                                                // Navigate to Create BDO/Retailer tab
                                                window.location.hash = '#create-bdo';
                                                // Or if using React Router: navigate('/create-bdo');
                                            }}
                                            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                        >
                                            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                            </svg>
                                            Go to Create BDO/Retailer Tab
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredBDOs.map(bdo => {
                        const requestType = stepData?.requestType || stepData?.request_type;
                        // For NEW_MAPPING, disable BDOs that have mapped devices
                        const isDisabled = requestType === 'NEW_MAPPING' && bdo.bdoId && activeMappings.has(bdo.bdoId.trim());
                        
                        return (
                            <div 
                                key={bdo.id}
                                onClick={() => !isDisabled && handleBDOSelect(bdo)}
                                className={`border rounded-lg p-4 transition-all ${
                                    isDisabled 
                                        ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-75'
                                        : selectedBDO?.id === bdo.id
                                            ? 'border-blue-500 bg-blue-50 cursor-pointer hover:shadow-md'
                                            : 'border-gray-200 hover:border-gray-300 cursor-pointer hover:shadow-md'
                                }`}
                            >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h4 className={`font-semibold ${isDisabled ? 'text-gray-500' : 'text-gray-900'}`}>
                                            {bdo.name}
                                        </h4>
                                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                            {bdo.handlerType}
                                        </span>
                                        {isDisabled && (
                                            <span className="inline-flex items-center px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                                Has Mapped Device
                                            </span>
                                        )}
                                        {(requestType === 'OTP_CHANGE' || requestType === 'DE_MAPPING') && bdo.bdoId && activeMappings.has(bdo.bdoId.trim()) && (
                                            <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Device Mapped
                                            </span>
                                        )}
                                        {(bdo.cnicFrontImage || bdo.cnicBackImage || bdo.imageUrls?.front || bdo.imageUrls?.back) && (
                                            <span className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                Images
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                                        <div>
                                            <span className="font-medium">ID:</span> {bdo.bdoId}
                                        </div>
                                        <div>
                                            <span className="font-medium">CNIC:</span> {bdo.cnic}
                                        </div>
                                        <div>
                                            <span className="font-medium">Mobile:</span> {bdo.otpMobileNumber}
                                        </div>
                                    </div>
                                </div>
                                {selectedBDO?.id === bdo.id && (
                                    <div className="ml-4">
                                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onPrev}
                    className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                    Previous
                </button>
                <button
                    onClick={handleNext}
                    disabled={!isValid}
                    className={`px-6 py-2 rounded-md font-medium transition-colors ${
                        isValid
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}

export default BDOSelectionStep;
