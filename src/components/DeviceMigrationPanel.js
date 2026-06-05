// --- Device Migration Panel ---
import React, { useState } from 'react';
import { collection, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Upload, Download, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

/**
 * Panel for migrating device mapping data from Excel to Firestore devices collection
 */
function DeviceMigrationPanel({ user, db, onClose }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [excelData, setExcelData] = useState([]);
    const [validationResults, setValidationResults] = useState(null);
    const [migrationProgress, setMigrationProgress] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Column mapping configuration - Complete device schema
    const REQUIRED_COLUMNS = [
        'imei',                    // Device Identity
        'franchiseCode',           // Franchise Information
        'franchiseName',
        'bdoId',                   // BDO Information  
        'bdoName',
        'bdoCnic',
        'otpMobileNumber',
        'shopName',                // Shop Information
        'streetAddress',
        'city'
    ];

    const OPTIONAL_COLUMNS = [
        'premiseRelationship',     // Shop relationship (Owner/Tenant/etc)
        'latitude',                // Location coordinates
        'longitude',
        'cnicFrontUrl',           // Document URLs
        'cnicBackUrl',
        'shopInsideImageUrl',
        'shopOutsideImageUrl',
        'model',                  // Device model/type
        'status',                 // Device status (will default to "Mapped")
        'migrationNotes',         // Migration metadata
        'migrationSource',        // Source of migration
        'deviceType',             // Mobile/Tablet (legacy field)
        'deviceModel',            // Device model details
        'manufacturer',           // Device manufacturer
        'serialNumber',           // Device serial number
        'purchaseDate',           // Device purchase date
        'warrantyDate',           // Warranty expiry date
        'deviceCondition',        // Device condition
        'notes'                   // General notes
    ];

    /**
     * Handle file selection and parsing
     */
    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            toast.error('Please select an Excel file (.xlsx or .xls)');
            return;
        }

        setSelectedFile(file);
        parseExcelFile(file);
    };

    /**
     * Parse Excel file to JSON with proper data type handling
     */
    const parseExcelFile = (file) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                // Convert to JSON with raw values to handle numbers properly
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    raw: false,  // This ensures numbers are converted to strings
                    defval: ''   // Default value for empty cells
                });

                // Ensure IMEI and other critical fields are strings
                const processedData = jsonData.map(row => ({
                    ...row,
                    // Convert critical numeric fields to strings
                    imei: row.imei ? String(row.imei).trim() : '',
                    bdoCnic: row.bdoCnic ? String(row.bdoCnic).replace(/-/g, '') : '',
                    otpMobileNumber: row.otpMobileNumber ? String(row.otpMobileNumber).trim() : '',
                    franchiseCode: row.franchiseCode ? String(row.franchiseCode).trim() : '',
                    // Ensure other fields are properly formatted
                    bdoId: row.bdoId ? String(row.bdoId).trim() : '',
                    serialNumber: row.serialNumber ? String(row.serialNumber).trim() : ''
                }));

                console.log('📊 Parsed Excel data:', {
                    totalRows: processedData.length,
                    columns: Object.keys(processedData[0] || {}),
                    sampleRow: processedData[0],
                    sampleImei: processedData[0]?.imei,
                    imeiType: typeof processedData[0]?.imei
                });

                setExcelData(processedData);
                validateData(processedData);
                toast.success(`📊 Loaded ${processedData.length} rows from Excel`);

            } catch (error) {
                console.error('❌ Error parsing Excel:', error);
                toast.error('Failed to parse Excel file');
            }
        };

        reader.readAsArrayBuffer(file);
    };

    /**
     * Validate Excel data structure and content
     */
    const validateData = (data) => {
        if (!data || data.length === 0) {
            setValidationResults({ isValid: false, errors: ['No data found in Excel file'] });
            return;
        }

        const errors = [];
        const warnings = [];
        const sampleRow = data[0];
        const columns = Object.keys(sampleRow);

        // Check required columns
        const missingColumns = REQUIRED_COLUMNS.filter(col => !columns.includes(col));
        if (missingColumns.length > 0) {
            errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        // Check for duplicate IMEIs
        const imeis = data.map(row => String(row.imei || '').trim()).filter(imei => imei);
        const duplicateImeis = imeis.filter((imei, index) => imeis.indexOf(imei) !== index);
        if (duplicateImeis.length > 0) {
            errors.push(`Duplicate IMEIs found: ${[...new Set(duplicateImeis)].join(', ')}`);
        }

        // Validate data quality
        data.forEach((row, index) => {
            const rowNum = index + 2; // Excel row number (1-indexed + header)

            // Check required fields
            REQUIRED_COLUMNS.forEach(col => {
                if (!row[col] || String(row[col]).trim() === '') {
                    warnings.push(`Row ${rowNum}: Missing ${col}`);
                }
            });

            // Validate IMEI format (15 digits)
            if (row.imei) {
                const imeiStr = String(row.imei).trim();
                if (!/^\d{15}$/.test(imeiStr)) {
                    warnings.push(`Row ${rowNum}: Invalid IMEI format (should be 15 digits): ${imeiStr}`);
                }
            }

            // Validate CNIC format (13 digits)
            if (row.bdoCnic) {
                const cnicStr = String(row.bdoCnic).replace(/-/g, '');
                if (!/^\d{13}$/.test(cnicStr)) {
                    warnings.push(`Row ${rowNum}: Invalid CNIC format: ${row.bdoCnic}`);
                }
            }

            // Validate mobile number format
            if (row.otpMobileNumber) {
                const mobileStr = String(row.otpMobileNumber).replace(/[-\s]/g, '');
                if (!/^(\+92|0)[0-9]{10}$/.test(mobileStr)) {
                    warnings.push(`Row ${rowNum}: Invalid mobile number format: ${row.otpMobileNumber}`);
                }
            }

            // Validate coordinates if provided
            if (row.latitude && (isNaN(row.latitude) || row.latitude < -90 || row.latitude > 90)) {
                warnings.push(`Row ${rowNum}: Invalid latitude: ${row.latitude}`);
            }
            if (row.longitude && (isNaN(row.longitude) || row.longitude < -180 || row.longitude > 180)) {
                warnings.push(`Row ${rowNum}: Invalid longitude: ${row.longitude}`);
            }

            // Validate device-specific fields
            if (row.serialNumber && row.serialNumber.length > 50) {
                warnings.push(`Row ${rowNum}: Serial number too long (max 50 chars): ${row.serialNumber}`);
            }

            // Validate device type if provided
            if (row.deviceType && !['Mobile', 'Tablet', 'Other'].includes(row.deviceType)) {
                warnings.push(`Row ${rowNum}: Invalid device type (should be Mobile, Tablet, or Other): ${row.deviceType}`);
            }

            // Validate status if provided
            if (row.status && !['Mapped', 'Unmapped', 'Transferred'].includes(row.status)) {
                warnings.push(`Row ${rowNum}: Invalid status (should be Mapped, Unmapped, or Transferred): ${row.status}`);
            }

            // Validate dates if provided
            if (row.purchaseDate && isNaN(new Date(row.purchaseDate).getTime())) {
                warnings.push(`Row ${rowNum}: Invalid purchase date format: ${row.purchaseDate}`);
            }
            if (row.warrantyDate && isNaN(new Date(row.warrantyDate).getTime())) {
                warnings.push(`Row ${rowNum}: Invalid warranty date format: ${row.warrantyDate}`);
            }

            // Validate URLs if provided
            const urlFields = ['cnicFrontUrl', 'cnicBackUrl', 'shopInsideImageUrl', 'shopOutsideImageUrl'];
            urlFields.forEach(field => {
                if (row[field] && !row[field].startsWith('http')) {
                    warnings.push(`Row ${rowNum}: Invalid URL format for ${field}: ${row[field]}`);
                }
            });

            // Validate device condition if provided
            if (row.deviceCondition && !['New', 'Used', 'Refurbished', 'Damaged'].includes(row.deviceCondition)) {
                warnings.push(`Row ${rowNum}: Invalid device condition (should be New, Used, Refurbished, or Damaged): ${row.deviceCondition}`);
            }
        });

        const results = {
            isValid: errors.length === 0,
            totalRows: data.length,
            validRows: data.filter(row => row.imei && row.bdoId).length,
            errors,
            warnings,
            columns,
            missingOptionalColumns: OPTIONAL_COLUMNS.filter(col => !columns.includes(col))
        };

        setValidationResults(results);
        console.log('🔍 Validation results:', results);
    };

    /**
     * Create GeoJSON Point from coordinates
     */
    const createGeoPoint = (latitude, longitude) => {
        if (!latitude || !longitude) return null;
        
        return {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };
    };

    /**
     * Check if device already exists
     */
    const checkDeviceExists = async (imei) => {
        try {
            // Ensure IMEI is a string
            const imeiStr = String(imei).trim();
            console.log(`🔍 Checking device exists: ${imeiStr} (type: ${typeof imeiStr})`);
            
            const deviceRef = doc(db, 'devices', imeiStr);
            const deviceDoc = await getDoc(deviceRef);
            return deviceDoc.exists();
        } catch (error) {
            console.error(`Error checking device ${imei}:`, error);
            return false;
        }
    };

    /**
     * Migrate single device record with complete schema support
     */
    const migrateDevice = async (deviceData, migrationId) => {
        try {
            // Ensure critical fields are strings
            const imeiStr = String(deviceData.imei).trim();
            console.log(`📱 Migrating device: ${imeiStr} (type: ${typeof imeiStr})`);

            const deviceDoc = {
                // Device Identity - ensure string
                imei: imeiStr,
                
                // Franchise Information
                franchiseCode: deviceData.franchiseCode ? String(deviceData.franchiseCode).trim() : null,
                franchiseName: deviceData.franchiseName ? String(deviceData.franchiseName).trim() : null,
                
                // BDO Information - ensure strings
                bdoId: deviceData.bdoId ? String(deviceData.bdoId).trim() : null,
                bdoName: deviceData.bdoName ? String(deviceData.bdoName).trim() : null,
                bdoCnic: deviceData.bdoCnic ? String(deviceData.bdoCnic).replace(/-/g, '') : null,
                otpMobileNumber: deviceData.otpMobileNumber ? String(deviceData.otpMobileNumber).trim() : null,
                
                // Shop Information
                shopName: deviceData.shopName ? String(deviceData.shopName).trim() : null,
                streetAddress: deviceData.streetAddress ? String(deviceData.streetAddress).trim() : null,
                city: deviceData.city ? String(deviceData.city).trim() : null,
                premiseRelationship: deviceData.premiseRelationship ? String(deviceData.premiseRelationship).trim() : null,
                
                // Location Data
                latitude: deviceData.latitude ? parseFloat(deviceData.latitude) : null,
                longitude: deviceData.longitude ? parseFloat(deviceData.longitude) : null,
                location: createGeoPoint(deviceData.latitude, deviceData.longitude),
                
                // Document URLs
                cnicFrontUrl: deviceData.cnicFrontUrl ? String(deviceData.cnicFrontUrl).trim() : null,
                cnicBackUrl: deviceData.cnicBackUrl ? String(deviceData.cnicBackUrl).trim() : null,
                shopInsideImageUrl: deviceData.shopInsideImageUrl ? String(deviceData.shopInsideImageUrl).trim() : null,
                shopOutsideImageUrl: deviceData.shopOutsideImageUrl ? String(deviceData.shopOutsideImageUrl).trim() : null,
                
                // Device Details
                model: deviceData.model ? String(deviceData.model).trim() : null,
                deviceType: deviceData.deviceType ? String(deviceData.deviceType).trim() : null,
                deviceModel: deviceData.deviceModel ? String(deviceData.deviceModel).trim() : null,
                manufacturer: deviceData.manufacturer ? String(deviceData.manufacturer).trim() : null,
                serialNumber: deviceData.serialNumber ? String(deviceData.serialNumber).trim() : null,
                deviceCondition: deviceData.deviceCondition ? String(deviceData.deviceCondition).trim() : null,
                
                // Device Dates (parse if provided)
                purchaseDate: deviceData.purchaseDate ? new Date(deviceData.purchaseDate) : null,
                warrantyDate: deviceData.warrantyDate ? new Date(deviceData.warrantyDate) : null,
                
                // Status and Metadata
                status: deviceData.status ? String(deviceData.status).trim() : "Mapped",
                createdAt: Timestamp.now(),
                lastUpdatedAt: Timestamp.now(),
                
                // Migration metadata
                migratedAt: Timestamp.now(),
                migrationId: migrationId,
                migrationSource: deviceData.migrationSource ? String(deviceData.migrationSource).trim() : "excel_import",
                migrationBy: user.uid,
                migrationNotes: deviceData.migrationNotes ? String(deviceData.migrationNotes).trim() : "Migrated from legacy data",
                
                // General notes
                notes: deviceData.notes ? String(deviceData.notes).trim() : null,
                
                // Audit Trail with initial mapping
                auditTrail: [{
                    action: "INITIAL_MAPPING",
                    timestamp: Timestamp.now(),
                    requestId: `migration_${migrationId}`,
                    previousState: null,
                    newState: {
                        bdoId: deviceData.bdoId ? String(deviceData.bdoId).trim() : null,
                        bdoName: deviceData.bdoName ? String(deviceData.bdoName).trim() : null,
                        bdoCnic: deviceData.bdoCnic ? String(deviceData.bdoCnic).replace(/-/g, '') : null,
                        otpMobileNumber: deviceData.otpMobileNumber ? String(deviceData.otpMobileNumber).trim() : null,
                        shopName: deviceData.shopName ? String(deviceData.shopName).trim() : null,
                        streetAddress: deviceData.streetAddress ? String(deviceData.streetAddress).trim() : null,
                        city: deviceData.city ? String(deviceData.city).trim() : null,
                        premiseRelationship: deviceData.premiseRelationship ? String(deviceData.premiseRelationship).trim() : null,
                        status: deviceData.status ? String(deviceData.status).trim() : "Mapped",
                        model: deviceData.model ? String(deviceData.model).trim() : null,
                        deviceType: deviceData.deviceType ? String(deviceData.deviceType).trim() : null,
                        manufacturer: deviceData.manufacturer ? String(deviceData.manufacturer).trim() : null
                    },
                    performedBy: user.uid,
                    description: `Device initially mapped during data migration from Excel. Source: ${deviceData.migrationSource || 'excel_import'}`
                }]
            };

            const deviceRef = doc(db, 'devices', imeiStr);
            await setDoc(deviceRef, deviceDoc);

            return { success: true, imei: imeiStr };

        } catch (error) {
            console.error(`❌ Error migrating device ${deviceData.imei}:`, error);
            return { 
                success: false, 
                imei: String(deviceData.imei), 
                error: error.message 
            };
        }
    };

    /**
     * Start migration process
     */
    const startMigration = async () => {
        if (!validationResults?.isValid) {
            toast.error('Please fix validation errors before migrating');
            return;
        }

        if (!window.confirm(`Are you sure you want to migrate ${excelData.length} devices? This will create/update records in the devices collection.`)) {
            return;
        }

        setIsProcessing(true);
        const migrationId = `migration_${Date.now()}`;
        const progress = {
            total: excelData.length,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            startTime: new Date()
        };

        setMigrationProgress(progress);

        try {
            for (let i = 0; i < excelData.length; i++) {
                const deviceData = excelData[i];
                
                // Skip rows with missing critical data
                if (!deviceData.imei || !deviceData.bdoId) {
                    progress.skipped++;
                    progress.processed++;
                    setMigrationProgress({ ...progress });
                    continue;
                }

                // Check if device already exists
                const exists = await checkDeviceExists(deviceData.imei);
                if (exists) {
                    console.log(`⚠️ Device ${deviceData.imei} already exists, skipping...`);
                    progress.skipped++;
                    progress.processed++;
                    setMigrationProgress({ ...progress });
                    continue;
                }

                // Migrate device
                const result = await migrateDevice(deviceData, migrationId);
                
                if (result.success) {
                    progress.successful++;
                } else {
                    progress.failed++;
                    progress.errors.push(`${result.imei}: ${result.error}`);
                }

                progress.processed++;
                setMigrationProgress({ ...progress });

                // Small delay to prevent overwhelming Firestore
                if (i % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            progress.endTime = new Date();
            toast.success(`✅ Migration completed! ${progress.successful} devices migrated, ${progress.skipped} skipped, ${progress.failed} failed`);

        } catch (error) {
            console.error('❌ Migration failed:', error);
            toast.error('Migration failed: ' + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    /**
     * Download template Excel file with all device schema columns
     */
    const downloadTemplate = () => {
        const templateData = [
            {
                // === REQUIRED COLUMNS ===
                // Device Identity
                imei: '123456789012345',
                
                // Franchise Information
                franchiseCode: 'FR001',
                franchiseName: 'Sample Franchise Ltd',
                
                // BDO Information
                bdoId: 'BDO001',
                bdoName: 'John Doe',
                bdoCnic: '1234567890123',
                otpMobileNumber: '03001234567',
                
                // Shop Information
                shopName: 'ABC Electronics',
                streetAddress: '123 Main Street, Block A',
                city: 'Karachi',
                
                // === OPTIONAL COLUMNS ===
                // Shop Relationship
                premiseRelationship: 'Owner',
                
                // Location Coordinates
                latitude: '24.8607',
                longitude: '67.0011',
                
                // Document URLs
                cnicFrontUrl: 'https://storage.googleapis.com/bucket/cnic_front.jpg',
                cnicBackUrl: 'https://storage.googleapis.com/bucket/cnic_back.jpg',
                shopInsideImageUrl: 'https://storage.googleapis.com/bucket/shop_inside.jpg',
                shopOutsideImageUrl: 'https://storage.googleapis.com/bucket/shop_outside.jpg',
                
                // Device Details
                model: 'Samsung Galaxy Tab A',
                deviceType: 'Tablet',
                deviceModel: 'SM-T515',
                manufacturer: 'Samsung',
                serialNumber: 'ABC123456789',
                purchaseDate: '2024-01-15',
                warrantyDate: '2025-01-15',
                deviceCondition: 'New',
                
                // Status & Metadata
                status: 'Mapped',
                migrationNotes: 'Migrated from legacy Excel system',
                migrationSource: 'excel_import_2024',
                notes: 'Device in excellent condition, primary location'
            },
            {
                // Second example row with minimal required data
                imei: '987654321098765',
                franchiseCode: 'FR002',
                franchiseName: 'City Electronics',
                bdoId: 'BDO002',
                bdoName: 'Jane Smith',
                bdoCnic: '9876543210987',
                otpMobileNumber: '03009876543',
                shopName: 'Tech Hub',
                streetAddress: '456 Commercial Avenue',
                city: 'Lahore',
                premiseRelationship: 'Tenant',
                model: 'iPad Air',
                deviceType: 'Tablet',
                status: 'Mapped',
                migrationNotes: 'Secondary location device'
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(templateData);
        
        // Add column headers with descriptions
        const columnDescriptions = {
            'A1': 'Device IMEI (15 digits, required)',
            'B1': 'Franchise Code (required)',
            'C1': 'Franchise Name (required)',
            'D1': 'BDO ID (required)',
            'E1': 'BDO Name (required)',
            'F1': 'BDO CNIC (13 digits, required)',
            'G1': 'OTP Mobile Number (required)',
            'H1': 'Shop Name (required)',
            'I1': 'Street Address (required)',
            'J1': 'City (required)',
            'K1': 'Premise Relationship (optional)',
            'L1': 'Latitude (optional)',
            'M1': 'Longitude (optional)',
            'N1': 'CNIC Front URL (optional)',
            'O1': 'CNIC Back URL (optional)',
            'P1': 'Shop Inside Image URL (optional)',
            'Q1': 'Shop Outside Image URL (optional)',
            'R1': 'Device Model (optional)',
            'S1': 'Device Type (optional)',
            'T1': 'Device Model Details (optional)',
            'U1': 'Manufacturer (optional)',
            'V1': 'Serial Number (optional)',
            'W1': 'Purchase Date (optional)',
            'X1': 'Warranty Date (optional)',
            'Y1': 'Device Condition (optional)',
            'Z1': 'Status (optional)',
            'AA1': 'Migration Notes (optional)',
            'AB1': 'Migration Source (optional)',
            'AC1': 'General Notes (optional)'
        };

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Device Migration Template');
        
        // Add a second sheet with column descriptions
        const descriptionData = [
            { Column: 'imei', Required: 'YES', Description: 'Device IMEI number (exactly 15 digits)', Example: '123456789012345' },
            { Column: 'franchiseCode', Required: 'YES', Description: 'Franchise identifier code', Example: 'FR001' },
            { Column: 'franchiseName', Required: 'YES', Description: 'Full franchise business name', Example: 'Sample Franchise Ltd' },
            { Column: 'bdoId', Required: 'YES', Description: 'BDO unique identifier', Example: 'BDO001' },
            { Column: 'bdoName', Required: 'YES', Description: 'BDO full name', Example: 'John Doe' },
            { Column: 'bdoCnic', Required: 'YES', Description: 'BDO CNIC number (13 digits)', Example: '1234567890123' },
            { Column: 'otpMobileNumber', Required: 'YES', Description: 'BDO mobile number for OTP', Example: '03001234567' },
            { Column: 'shopName', Required: 'YES', Description: 'Shop or business name', Example: 'ABC Electronics' },
            { Column: 'streetAddress', Required: 'YES', Description: 'Complete street address', Example: '123 Main Street, Block A' },
            { Column: 'city', Required: 'YES', Description: 'City name', Example: 'Karachi' },
            { Column: 'premiseRelationship', Required: 'NO', Description: 'Relationship to premise', Example: 'Owner, Tenant, Manager' },
            { Column: 'latitude', Required: 'NO', Description: 'GPS latitude coordinate', Example: '24.8607' },
            { Column: 'longitude', Required: 'NO', Description: 'GPS longitude coordinate', Example: '67.0011' },
            { Column: 'cnicFrontUrl', Required: 'NO', Description: 'URL to CNIC front image', Example: 'https://storage.../cnic_front.jpg' },
            { Column: 'cnicBackUrl', Required: 'NO', Description: 'URL to CNIC back image', Example: 'https://storage.../cnic_back.jpg' },
            { Column: 'shopInsideImageUrl', Required: 'NO', Description: 'URL to shop interior image', Example: 'https://storage.../shop_inside.jpg' },
            { Column: 'shopOutsideImageUrl', Required: 'NO', Description: 'URL to shop exterior image', Example: 'https://storage.../shop_outside.jpg' },
            { Column: 'model', Required: 'NO', Description: 'Device model name', Example: 'Samsung Galaxy Tab A' },
            { Column: 'deviceType', Required: 'NO', Description: 'Type of device', Example: 'Tablet, Mobile' },
            { Column: 'deviceModel', Required: 'NO', Description: 'Specific device model code', Example: 'SM-T515' },
            { Column: 'manufacturer', Required: 'NO', Description: 'Device manufacturer', Example: 'Samsung, Apple, Huawei' },
            { Column: 'serialNumber', Required: 'NO', Description: 'Device serial number', Example: 'ABC123456789' },
            { Column: 'purchaseDate', Required: 'NO', Description: 'Device purchase date', Example: '2024-01-15' },
            { Column: 'warrantyDate', Required: 'NO', Description: 'Warranty expiry date', Example: '2025-01-15' },
            { Column: 'deviceCondition', Required: 'NO', Description: 'Device condition', Example: 'New, Used, Refurbished' },
            { Column: 'status', Required: 'NO', Description: 'Device status (defaults to Mapped)', Example: 'Mapped, Unmapped' },
            { Column: 'migrationNotes', Required: 'NO', Description: 'Notes about this migration', Example: 'Migrated from legacy system' },
            { Column: 'migrationSource', Required: 'NO', Description: 'Source of migration data', Example: 'excel_import_2024' },
            { Column: 'notes', Required: 'NO', Description: 'General notes about device', Example: 'Primary location device' }
        ];
        
        const descSheet = XLSX.utils.json_to_sheet(descriptionData);
        XLSX.utils.book_append_sheet(workbook, descSheet, 'Column Descriptions');
        
        XLSX.writeFile(workbook, 'device_migration_template_complete.xlsx');
        toast.success('📥 Complete template downloaded with all device schema columns');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                                <Upload className="w-6 h-6 mr-2 text-blue-600" />
                                Device Data Migration
                            </h2>
                            <p className="text-gray-600 mt-1">Import device mappings from Excel to devices collection</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-800 mb-2 flex items-center">
                            <Info className="w-5 h-5 mr-2" />
                            Migration Instructions - Complete Device Schema
                        </h3>
                        <div className="text-sm text-blue-700 space-y-2">
                            <div>
                                <p className="font-medium mb-1">📋 Required Columns (Must Include):</p>
                                <p className="ml-4">• {REQUIRED_COLUMNS.join(', ')}</p>
                            </div>
                            <div>
                                <p className="font-medium mb-1">📋 Optional Columns (Preserve All Your Data):</p>
                                <p className="ml-4">• {OPTIONAL_COLUMNS.slice(0, 10).join(', ')}</p>
                                <p className="ml-4">• {OPTIONAL_COLUMNS.slice(10).join(', ')}</p>
                            </div>
                            <div className="border-t border-blue-200 pt-2 mt-2">
                                <p className="font-medium mb-1">✅ Data Validation Rules:</p>
                                <ul className="ml-4 space-y-1">
                                    <li>• IMEI: Exactly 15 digits</li>
                                    <li>• CNIC: Exactly 13 digits</li>
                                    <li>• Mobile: Pakistani format (03xxxxxxxxx)</li>
                                    <li>• Device Type: Mobile, Tablet, or Other</li>
                                    <li>• Status: Mapped, Unmapped, or Transferred</li>
                                    <li>• Dates: YYYY-MM-DD format</li>
                                    <li>• URLs: Must start with http:// or https://</li>
                                </ul>
                            </div>
                            <div className="border-t border-blue-200 pt-2 mt-2">
                                <p className="font-medium mb-1">🔒 Migration Safety:</p>
                                <ul className="ml-4 space-y-1">
                                    <li>• Existing devices will be skipped (no duplicates)</li>
                                    <li>• Complete audit trail created for each mapping</li>
                                    <li>• All data preserved with proper validation</li>
                                    <li>• Migration source and timestamp recorded</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Template Download */}
                    <div className="flex justify-center">
                        <button
                            onClick={downloadTemplate}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Download Excel Template
                        </button>
                    </div>

                    {/* File Upload */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="excel-upload"
                        />
                        <label
                            htmlFor="excel-upload"
                            className="cursor-pointer flex flex-col items-center"
                        >
                            <Upload className="w-12 h-12 text-gray-400 mb-4" />
                            <p className="text-lg font-medium text-gray-700">Upload Excel File</p>
                            <p className="text-sm text-gray-500">Click to select your device data Excel file</p>
                            {selectedFile && (
                                <p className="text-sm text-blue-600 mt-2">Selected: {selectedFile.name}</p>
                            )}
                        </label>
                    </div>

                    {/* Validation Results */}
                    {validationResults && (
                        <div className="space-y-4">
                            <div className={`border rounded-lg p-4 ${
                                validationResults.isValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                            }`}>
                                <h3 className="font-semibold flex items-center mb-2">
                                    {validationResults.isValid ? (
                                        <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                                    ) : (
                                        <XCircle className="w-5 h-5 text-red-600 mr-2" />
                                    )}
                                    Validation Results
                                </h3>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-gray-800">{validationResults.totalRows}</p>
                                        <p className="text-sm text-gray-600">Total Rows</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-green-600">{validationResults.validRows}</p>
                                        <p className="text-sm text-gray-600">Valid Rows</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-red-600">{validationResults.errors.length}</p>
                                        <p className="text-sm text-gray-600">Errors</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-yellow-600">{validationResults.warnings.length}</p>
                                        <p className="text-sm text-gray-600">Warnings</p>
                                    </div>
                                </div>

                                {validationResults.errors.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="font-medium text-red-800 mb-2">Errors (must fix):</h4>
                                        <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                                            {validationResults.errors.map((error, index) => (
                                                <li key={index}>{error}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {validationResults.warnings.length > 0 && (
                                    <div>
                                        <h4 className="font-medium text-yellow-800 mb-2">Warnings (recommended to fix):</h4>
                                        <div className="max-h-32 overflow-y-auto">
                                            <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                                                {validationResults.warnings.slice(0, 10).map((warning, index) => (
                                                    <li key={index}>{warning}</li>
                                                ))}
                                                {validationResults.warnings.length > 10 && (
                                                    <li>... and {validationResults.warnings.length - 10} more</li>
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Migration Progress */}
                    {migrationProgress && (
                        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                            <h3 className="font-semibold text-blue-800 mb-3">Migration Progress</h3>
                            
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                                <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(migrationProgress.processed / migrationProgress.total) * 100}%` }}
                                ></div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="text-center">
                                    <p className="text-lg font-bold text-gray-800">{migrationProgress.processed}/{migrationProgress.total}</p>
                                    <p className="text-sm text-gray-600">Processed</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-green-600">{migrationProgress.successful}</p>
                                    <p className="text-sm text-gray-600">Successful</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-yellow-600">{migrationProgress.skipped}</p>
                                    <p className="text-sm text-gray-600">Skipped</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-red-600">{migrationProgress.failed}</p>
                                    <p className="text-sm text-gray-600">Failed</p>
                                </div>
                            </div>

                            {migrationProgress.errors.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-red-800 mb-2">Migration Errors:</h4>
                                    <div className="max-h-32 overflow-y-auto">
                                        <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                                            {migrationProgress.errors.map((error, index) => (
                                                <li key={index}>{error}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end space-x-4">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={startMigration}
                            disabled={!validationResults?.isValid || isProcessing}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {isProcessing ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Migrating...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Start Migration
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DeviceMigrationPanel;
