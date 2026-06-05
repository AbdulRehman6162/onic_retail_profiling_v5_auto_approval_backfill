// --- Application Constants ---

export const REQUEST_TYPES = {
    NEW_MAPPING: 'NEW_MAPPING',
    TRANSFER_OWNERSHIP: 'TRANSFER_OWNERSHIP',
    OTP_CHANGE: 'OTP_CHANGE',
    FAULTY_REPLACEMENT: 'FAULTY_REPLACEMENT',
    DEVICE_RETURN: 'DEVICE_RETURN',
    LOCATION_UPDATE: 'LOCATION_UPDATE',
    DEVICE_DEMAP: 'DEVICE_DEMAP'
};

export const REQUEST_STATUSES = {
    DRAFT: 'DRAFT',
    SALES_REVIEW: 'SALES_REVIEW',
    OPS_REVIEW: 'OPS_REVIEW',
    IN_PROCESSING: 'IN_PROCESSING',
    COMPLETED: 'COMPLETED',
    SALES_REJECTED: 'SALES_REJECTED',
    OPS_REJECTED: 'OPS_REJECTED',
    ON_HOLD: 'ON_HOLD'
};

export const USER_ROLES = {
    FRANCHISE: 'Franchise',
    SALES_TEAM: 'Sales Team',
    OPERATIONS_TEAM: 'Operations Team',
    BVS_TEAM: 'BVS Team',
    ADMIN: 'Admin'
};

export const DEVICE_STATUS = {
    AVAILABLE: 'Available',
    MAPPED: 'Mapped',
    IN_TRANSIT: 'In_Transit',
    FAULTY: 'Faulty',
    RETURNED: 'Returned',
    DECOMMISSIONED: 'Decommissioned'
};

// Request type metadata for UI display
export const REQUEST_TYPE_METADATA = {
    [REQUEST_TYPES.NEW_MAPPING]: {
        label: 'New Device Mapping',
        description: 'Assign a new device to a BDO/Retailer',
        icon: '📱',
        color: 'blue'
    },
    [REQUEST_TYPES.TRANSFER_OWNERSHIP]: {
        label: 'Transfer Device Ownership',
        description: 'Transfer device from one BDO to another',
        icon: '🔄',
        color: 'purple'
    },
    [REQUEST_TYPES.OTP_CHANGE]: {
        label: 'OTP Number Change',
        description: 'Change BDO/Retailer OTP mobile number',
        icon: '📞',
        color: 'orange'
    },
    [REQUEST_TYPES.LOCATION_UPDATE]: {
        label: 'Location Change',
        description: 'Reset or update device latitude and longitude after approval',
        icon: '📍',
        color: 'yellow'
    },
    [REQUEST_TYPES.DEVICE_DEMAP]: {
        label: 'Device De-mapping',
        description: 'Remove device mapping and make it available',
        icon: '🔓',
        color: 'red'
    }
};

// OTP Change specific constants
export const OTP_VALIDATION = {
    PAKISTANI_MOBILE_REGEX: /^(\+92|0)?3[0-9]{9}$/,
    MIN_DIGITS: 11,
    PREFIX: '03'
};

// CNIC validation constants
export const CNIC_VALIDATION = {
    REGEX: /^\d{5}-\d{7}-\d{1}$/,
    FORMAT: '12345-6789012-3'
};

export default {
    REQUEST_TYPES,
    REQUEST_STATUSES,
    USER_ROLES,
    DEVICE_STATUS,
    REQUEST_TYPE_METADATA,
    OTP_VALIDATION,
    CNIC_VALIDATION
};
