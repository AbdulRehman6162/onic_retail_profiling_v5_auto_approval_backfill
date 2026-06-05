// Enhanced Request Components with Conflict Resolution and Action Logging
import React, { useState } from 'react';
import { Timestamp, addDoc, collection, updateDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { createUnifiedRequest, getTypeSpecificData } from '../utils/requestStructure';

// Helper function to generate request number
const generateRequestNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `REQ-${timestamp}-${random}`;
};

/**
 * Enhanced Request Form with conflict resolution
 */
const EnhancedRequestForm = ({ 
    user, 
    appServices, 
    editingRequest, 
    onSuccess, 
    onCancel,
    db
}) => {
    const [formData, setFormData] = useState({
        type: 'NEW_MAPPING',
        imei: '',
        bdoName: '',
        cnicNumber: '',
        mobileNumber: '',
        otpMobileNumber: '',
        newOtpMobileNumber: '',
        shopName: '',
        shopAddress: '',
        city: '',
        demapReason: '',
        currentBdoId: '',
        targetBdoId: '',
        ...editingRequest
    });
    
    const [loading, setLoading] = useState(false);
    const [documents, setDocuments] = useState({
        shopImage1: null,
        shopImage2: null,
        cnicFront: null,
        cnicBack: null
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (!appServices.conflictResolver) {
                throw new Error('Conflict resolver not available');
            }

            // Prepare base data for unified request structure
            const baseData = {
                franchiseId: user.franchiseId || user.uid,
                franchiseName: user.franchiseName || user.name,
                franchiseCode: user.franchiseCode,
                submittedBy: user.uid,
                userRole: user.role || 'Franchise',
                
                imei: formData.imei,
                bdoId: formData.targetBdoId || null,
                bdoName: formData.bdoName,
                cnicNumber: formData.cnicNumber,
                otpMobileNumber: formData.otpMobileNumber,
                handlerType: 'Retailer',
                
                shopName: formData.shopName,
                city: formData.city,
                streetAddress: formData.shopAddress,
                latitude: formData.latitude || 0,
                longitude: formData.longitude || 0,
                premiseRelationship: formData.premiseRelationship || 'Owner',
                
                documents: documents
            };

            // Get type-specific data
            const typeSpecificData = getTypeSpecificData(formData.type, {
                originalBdoId: formData.currentBdoId,
                originalBdoName: formData.currentBdoName,
                transferReason: formData.transferReason,
                oldOtpMobile: formData.otpMobileNumber,
                newOtpMobile: formData.newOtpMobileNumber,
                changeReason: formData.changeReason,
                demapReason: formData.demapReason
            });

            // Create unified request structure
            const requestData = createUnifiedRequest(formData.type, baseData, typeSpecificData);

            let requestId;

            // Use conflict resolver based on request type
            if (formData.type === 'NEW_MAPPING') {
                requestId = await appServices.conflictResolver.claimIMEIForRequest(
                    formData.imei,
                    requestData
                );
            } else if (formData.type === 'TRANSFER_OWNERSHIP') {
                requestId = await appServices.conflictResolver.handleOwnershipTransfer(
                    formData.imei,
                    formData.currentBdoId,
                    formData.targetBdoId,
                    requestData
                );
            } else {
                // For OTP_CHANGE and other types, create in requestsV2 collection
                const requestRef = await addDoc(collection(db, 'requestsV2'), requestData);
                requestId = requestRef.id;
                
                // Update with generated ID
                await updateDoc(doc(db, 'requestsV2', requestId), { id: requestId });
            }

            // Log request creation
            if (appServices.actionLogger) {
                await appServices.actionLogger.logRequestCreated({
                    id: requestId,
                    type: formData.type,
                    ...requestData
                });
            }

            toast.success(`${formData.type.replace('_', ' ')} request created successfully!`);
            onSuccess();

        } catch (error) {
            console.error('Error creating request:', error);
            toast.error(error.message || 'Failed to create request');

            // Log error
            if (appServices.actionLogger) {
                await appServices.actionLogger.logError(error, {
                    action: 'createRequest',
                    requestType: formData.type,
                    imei: formData.imei
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    return (
        <div className="bg-white rounded-lg shadow-lg">
            <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                    {editingRequest ? 'Edit Request' : 'Create New Request'}
                </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Request Type Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Request Type
                    </label>
                    <select
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                    >
                        <option value="NEW_MAPPING">New Device Mapping</option>
                        <option value="TRANSFER_OWNERSHIP">Transfer Ownership</option>
                        <option value="OTP_CHANGE">OTP Number Change</option>
                        <option value="DEVICE_DEMAP">Device De-mapping</option>
                    </select>
                </div>

                {/* IMEI Field - Always required */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Device IMEI *
                    </label>
                    <input
                        type="text"
                        name="imei"
                        value={formData.imei}
                        onChange={handleInputChange}
                        placeholder="Enter 15-digit IMEI number"
                        maxLength={15}
                        pattern="[0-9]{15}"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                    />
                </div>

                {/* Conditional Fields Based on Request Type */}
                {formData.type === 'NEW_MAPPING' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    BDO/Retailer Name *
                                </label>
                                <input
                                    type="text"
                                    name="bdoName"
                                    value={formData.bdoName}
                                    onChange={handleInputChange}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    CNIC Number *
                                </label>
                                <input
                                    type="text"
                                    name="cnicNumber"
                                    value={formData.cnicNumber}
                                    onChange={handleInputChange}
                                    placeholder="12345-6789012-3"
                                    maxLength={15}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Mobile Number *
                                </label>
                                <input
                                    type="tel"
                                    name="mobileNumber"
                                    value={formData.mobileNumber}
                                    onChange={handleInputChange}
                                    placeholder="923001234567"
                                    maxLength={12}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    OTP Mobile Number *
                                </label>
                                <input
                                    type="tel"
                                    name="otpMobileNumber"
                                    value={formData.otpMobileNumber}
                                    onChange={handleInputChange}
                                    placeholder="923001234567"
                                    maxLength={12}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Shop Name *
                                </label>
                                <input
                                    type="text"
                                    name="shopName"
                                    value={formData.shopName}
                                    onChange={handleInputChange}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    City *
                                </label>
                                <input
                                    type="text"
                                    name="city"
                                    value={formData.city}
                                    onChange={handleInputChange}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Shop Address *
                            </label>
                            <textarea
                                name="shopAddress"
                                value={formData.shopAddress}
                                onChange={handleInputChange}
                                rows={3}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            />
                        </div>
                    </>
                )}

                {formData.type === 'TRANSFER_OWNERSHIP' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Current BDO ID *
                                </label>
                                <input
                                    type="text"
                                    name="currentBdoId"
                                    value={formData.currentBdoId}
                                    onChange={handleInputChange}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Target BDO ID *
                                </label>
                                <input
                                    type="text"
                                    name="targetBdoId"
                                    value={formData.targetBdoId}
                                    onChange={handleInputChange}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>
                    </>
                )}

                {formData.type === 'OTP_CHANGE' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Current OTP Number *
                                </label>
                                <input
                                    type="tel"
                                    name="otpMobileNumber"
                                    value={formData.otpMobileNumber}
                                    onChange={handleInputChange}
                                    placeholder="923001234567"
                                    maxLength={12}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    New OTP Number *
                                </label>
                                <input
                                    type="tel"
                                    name="newOtpMobileNumber"
                                    value={formData.newOtpMobileNumber}
                                    onChange={handleInputChange}
                                    placeholder="923001234567"
                                    maxLength={12}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                        </div>
                    </>
                )}

                {formData.type === 'DEVICE_DEMAP' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Current BDO ID *
                            </label>
                            <input
                                type="text"
                                name="currentBdoId"
                                value={formData.currentBdoId}
                                onChange={handleInputChange}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Reason for De-mapping *
                            </label>
                            <select
                                name="demapReason"
                                value={formData.demapReason}
                                onChange={handleInputChange}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            >
                                <option value="">Select reason</option>
                                <option value="BDO Left Company">BDO Left Company</option>
                                <option value="Device Faulty">Device Faulty</option>
                                <option value="Returning to Warehouse">Returning to Warehouse</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                    </>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? 'Creating...' : (editingRequest ? 'Update Request' : 'Create Request')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EnhancedRequestForm;
