import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertCircle, Calendar, MapPin, Search, Smartphone, User } from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_PAGE_SIZE = 20;
const MAPPED_STATUSES = ['ACTIVE', 'Mapped'];

/**
 * Device Selection Step for De-mapping and Location Change requests.
 *
 * Firestore read optimization:
 * - Default screen loads only the first 20 mapped devices for the franchise.
 * - Exact IMEI lookup uses a direct document read instead of loading all mapped devices.
 * - Users can still search by IMEI, while broad local search is limited to the small loaded batch.
 */
function DeviceSelectionStep({
    formData,
    updateStepData,
    user,
    db,
    onNext,
    onPrev,
    isFirstStep
}) {
    const isLocationChange = formData.requestType === 'LOCATION_UPDATE';
    const [devices, setDevices] = useState([]);
    const [filteredDevices, setFilteredDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState('all');
    const [selectedDevice, setSelectedDevice] = useState(
        formData.additionalInfo?.selectedDevice || formData.locationChangeDetails?.selectedDevice || formData.selectedDevice || null
    );
    const [searchingImei, setSearchingImei] = useState(false);

    useEffect(() => {
        loadInitialMappedDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.franchiseCode]);

    useEffect(() => {
        filterDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [devices, searchTerm, searchType]);

    const normalizeDevice = (id, deviceData) => ({
        id,
        imei: deviceData.imei || id,
        ...deviceData,
        mappingDate: deviceData.mappingDate?.toDate?.() || deviceData.createdAt?.toDate?.() || deviceData.mappedAt?.toDate?.() || null
    });

    const isValidMappedDevice = (device) => {
        if (!device) return false;
        const belongsToFranchise = device.franchiseCode === user.franchiseCode;
        const isMapped = MAPPED_STATUSES.includes(device.status);
        const hasBdo = Boolean(device.bdoId || device.bdoName);
        return belongsToFranchise && isMapped && hasBdo;
    };

    const loadInitialMappedDevices = async () => {
        try {
            setLoading(true);
            console.log('🔍 Loading initial mapped devices for franchise:', user.franchiseCode);

            const devicesQuery = query(
                collection(db, 'devices'),
                where('franchiseCode', '==', user.franchiseCode),
                where('status', 'in', MAPPED_STATUSES),
                limit(DEFAULT_PAGE_SIZE)
            );

            const snapshot = await getDocs(devicesQuery);
            const devicesData = [];

            snapshot.forEach((deviceDoc) => {
                const normalized = normalizeDevice(deviceDoc.id, deviceDoc.data());
                if (isValidMappedDevice(normalized)) {
                    devicesData.push(normalized);
                }
            });

            console.log(`✅ Loaded ${devicesData.length} mapped devices in initial batch`);
            setDevices(devicesData);
            setFilteredDevices(devicesData);
        } catch (error) {
            console.error('❌ Error loading mapped devices:', error);
            toast.error('Failed to load mapped devices');
            setDevices([]);
            setFilteredDevices([]);
        } finally {
            setLoading(false);
        }
    };

    const filterDevices = () => {
        if (!searchTerm.trim()) {
            setFilteredDevices(devices);
            return;
        }

        const term = searchTerm.toLowerCase().trim();
        const filtered = devices.filter((device) => {
            switch (searchType) {
                case 'imei':
                    return device.imei?.toLowerCase().includes(term);
                case 'bdo_name':
                    return device.bdoName?.toLowerCase().includes(term);
                case 'bdo_id':
                    return device.bdoId?.toLowerCase().includes(term);
                case 'cnic':
                    return device.bdoCnic?.toLowerCase().includes(term);
                case 'all':
                default:
                    return (
                        device.imei?.toLowerCase().includes(term) ||
                        device.bdoName?.toLowerCase().includes(term) ||
                        device.bdoId?.toLowerCase().includes(term) ||
                        device.bdoCnic?.toLowerCase().includes(term) ||
                        device.shopName?.toLowerCase().includes(term) ||
                        device.city?.toLowerCase().includes(term)
                    );
            }
        });

        setFilteredDevices(filtered);
    };

    const handleDeviceSelect = (device) => {
        setSelectedDevice(device);

        updateStepData('device_selection', {
            selectedDevice: device,
            currentMapping: {
                bdoDetails: {
                    bdoId: device.bdoId,
                    name: device.bdoName,
                    cnic: device.bdoCnic,
                    phoneNumber: device.otpMobileNumber
                },
                deviceInfo: {
                    imei: device.imei,
                    model: device.model || 'Not specified',
                    status: device.status
                },
                locationDetails: {
                    shopName: device.shopName,
                    city: device.city,
                    streetAddress: device.streetAddress,
                    latitude: device.latitude ?? null,
                    longitude: device.longitude ?? null
                },
                mappingDate: device.mappingDate,
                status: device.status
            }
        });
    };

    const searchExactImei = async () => {
        const imei = searchTerm.trim();
        if (!imei) {
            toast.error('Enter an IMEI to search');
            return;
        }

        try {
            setSearchingImei(true);
            const deviceRef = doc(db, 'devices', imei);
            const deviceSnap = await getDoc(deviceRef);

            if (!deviceSnap.exists()) {
                toast.error('IMEI not found in devices collection');
                return;
            }

            const device = normalizeDevice(deviceSnap.id, deviceSnap.data());
            if (!isValidMappedDevice(device)) {
                toast.error('IMEI is not active/mapped under your franchise');
                return;
            }

            setDevices((prev) => {
                const exists = prev.some((item) => item.id === device.id || item.imei === device.imei);
                return exists ? prev : [device, ...prev];
            });
            handleDeviceSelect(device);
            toast.success('Device selected');
        } catch (error) {
            console.error('❌ Error searching IMEI:', error);
            toast.error('Failed to search IMEI');
        } finally {
            setSearchingImei(false);
        }
    };

    const handleNext = () => {
        if (!selectedDevice) {
            toast.error(`Please select a device to ${isLocationChange ? 'change location' : 'de-map'}`);
            return;
        }
        onNext();
    };

    const formatDate = (date) => {
        if (!date) return 'Not available';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading mapped devices...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                    {isLocationChange ? 'Select Device for Location Change' : 'Select Device to De-map'}
                </h2>
                <p className="text-sm sm:text-base text-gray-600">
                    {isLocationChange
                        ? 'Choose a mapped IMEI, then optionally provide new latitude and longitude. Blank coordinates will reset lat/long to null after Operations completion.'
                        : 'Choose a device from your currently mapped devices to request de-mapping. This will remove the BDO assignment while preserving audit history.'}
                </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <p className="text-sm text-blue-800">
                        To reduce Firestore reads, only {DEFAULT_PAGE_SIZE} mapped devices load first. For any other device, enter the exact IMEI and press Search IMEI.
                    </p>
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search visible devices or enter exact IMEI..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <select
                        value={searchType}
                        onChange={(event) => setSearchType(event.target.value)}
                        className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">All Fields</option>
                        <option value="imei">IMEI</option>
                        <option value="bdo_name">BDO Name</option>
                        <option value="bdo_id">BDO ID</option>
                        <option value="cnic">CNIC</option>
                    </select>

                    <button
                        type="button"
                        onClick={searchExactImei}
                        disabled={searchingImei || !searchTerm.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {searchingImei ? 'Searching...' : 'Search IMEI'}
                    </button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-gray-600">
                    {filteredDevices.length} visible device{filteredDevices.length !== 1 ? 's' : ''}
                    {searchTerm && ` matching "${searchTerm}"`}
                </p>
                {devices.length === 0 && (
                    <div className="flex items-center text-amber-600 text-sm">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        No mapped devices found in the initial batch
                    </div>
                )}
            </div>

            <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
                {filteredDevices.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        {devices.length === 0 ? (
                            <div>
                                <Smartphone className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                <p className="text-lg font-medium">No Mapped Devices</p>
                                <p className="text-sm">Search an exact IMEI if it is not shown in the first batch.</p>
                            </div>
                        ) : (
                            <div>
                                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                <p className="text-lg font-medium">No Matching Devices</p>
                                <p className="text-sm">Try an exact IMEI search.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    filteredDevices.map((device) => (
                        <div
                            key={device.id}
                            onClick={() => handleDeviceSelect(device)}
                            className={`cursor-pointer border rounded-lg p-4 transition-all ${
                                selectedDevice?.id === device.id || selectedDevice?.imei === device.imei
                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                            }`}
                        >
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div className="flex-1 space-y-3 min-w-0">
                                    <div className="flex items-start">
                                        <Smartphone className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <h3 className="font-medium text-gray-900 break-all">IMEI: {device.imei}</h3>
                                            <p className="text-sm text-gray-500">
                                                {device.model || 'Model not specified'} • Status: {device.status}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-start">
                                        <User className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-900">{device.bdoName || 'BDO not specified'}</p>
                                            <p className="text-sm text-gray-500 break-words">
                                                ID: {device.bdoId || 'N/A'} • CNIC: {device.bdoCnic || 'N/A'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-start">
                                        <MapPin className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-900">{device.shopName || 'Shop name not specified'}</p>
                                            <p className="text-sm text-gray-500 break-words">
                                                {device.city || 'City not specified'} • {device.streetAddress || 'Address not specified'}
                                            </p>
                                            {isLocationChange && (
                                                <p className="text-xs text-gray-500 mt-1 break-all">
                                                    Current lat/lon: {device.latitude ?? 'null'}, {device.longitude ?? 'null'}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center">
                                        <Calendar className="h-5 w-5 text-purple-600 mr-2 flex-shrink-0" />
                                        <p className="text-sm text-gray-500">Mapped: {formatDate(device.mappingDate)}</p>
                                    </div>
                                </div>

                                {(selectedDevice?.id === device.id || selectedDevice?.imei === device.imei) && (
                                    <div className="sm:ml-4 flex-shrink-0">
                                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 pt-6 border-t">
                <button
                    onClick={onPrev}
                    disabled={isFirstStep}
                    className="w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Previous
                </button>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    {selectedDevice && (
                        <p className="text-sm text-green-600 break-all">✓ Selected: {selectedDevice.imei}</p>
                    )}
                    <button
                        onClick={handleNext}
                        disabled={!selectedDevice}
                        className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLocationChange ? 'Next: Location Details' : 'Next: Confirm De-mapping'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default DeviceSelectionStep;
