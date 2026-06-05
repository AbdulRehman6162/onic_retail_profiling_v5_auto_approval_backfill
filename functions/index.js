const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

// Import BDO ID Generation functions
const bdoIdFunctions = require('./bdoIdGenerator');

// Import sequence counter sync functions
const syncFunctions = require('./syncSequenceCounters');

// Initialize Firebase Admin
const app = initializeApp();
const db = getFirestore(app);

const getQueryCount = async (queryRef) => {
  try {
    const snapshot = await queryRef.count().get();
    return snapshot.data().count || 0;
  } catch (error) {
    logger.warn('Count aggregation failed, falling back to limited count', error);
    const snapshot = await queryRef.limit(1000).get();
    return snapshot.size;
  }
};

const serializeDoc = (doc) => ({
  id: doc.id,
  ...doc.data(),
  createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
  updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null
});

const SALES_AUTO_APPROVAL_SETTING_PATH = 'systemSettings/salesAutoApproval';
const AUTO_APPROVAL_SYSTEM_USER = 'SYSTEM_SALES_AUTO_APPROVAL';

const normalizeStatus = (status) => String(status || '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const REQUEST_SALES_PENDING_STATUSES = new Set([
  'pending',
  'submitted',
  'sales_review'
]);

const BDO_AUTO_APPROVAL_PENDING_STATUSES = new Set([
  'pending',
  'pending_approval',
  'active'
]);

const REQUEST_AUTO_APPROVAL_BACKFILL_STATUSES = [
  'pending',
  'Pending',
  'Submitted',
  'SUBMITTED',
  'Sales Review',
  'SALES_REVIEW'
];

const BDO_AUTO_APPROVAL_BACKFILL_STATUSES = [
  'Pending',
  'Pending Approval',
  'PENDING_APPROVAL',
  'active',
  'Active'
];

const AUTO_APPROVAL_BACKFILL_LIMIT_PER_PASS = 100;
const AUTO_APPROVAL_BACKFILL_MAX_PASSES_PER_STATUS = 10;

const isSalesAutoApprovalEnabled = async () => {
  const settingSnap = await db.doc(SALES_AUTO_APPROVAL_SETTING_PATH).get();
  return settingSnap.exists && settingSnap.data()?.enabled === true;
};

const isRequestEligibleForSalesAutoApproval = (requestData) => {
  const normalizedStatus = normalizeStatus(requestData?.status);

  if (!REQUEST_SALES_PENDING_STATUSES.has(normalizedStatus)) {
    return false;
  }

  if (requestData?.autoApproval?.sales?.approved === true) {
    return false;
  }

  return true;
};

const isBdoEligibleForAutoApproval = (bdoData) => {
  const normalizedStatus = normalizeStatus(bdoData?.status);

  if (!BDO_AUTO_APPROVAL_PENDING_STATUSES.has(normalizedStatus)) {
    return false;
  }

  if (bdoData?.autoApproval?.sales?.approved === true || normalizedStatus === 'approved') {
    return false;
  }

  return true;
};

const buildRequestAutoApprovalPayload = (requestId, triggerSource) => {
  const now = FieldValue.serverTimestamp();

  return {
    status: 'Sales Approved',
    assignedTo: 'Operations Team',
    assignedToOperationsAt: now,
    updatedAt: now,
    lastUpdatedBy: AUTO_APPROVAL_SYSTEM_USER,
    'metadata.updatedAt': now,
    'metadata.lastModifiedBy': AUTO_APPROVAL_SYSTEM_USER,
    'approvals.sales': {
      approvedBy: AUTO_APPROVAL_SYSTEM_USER,
      approvedByName: 'Sales Auto Approval',
      approvedAt: now,
      comments: 'Automatically approved because Sales auto approval is enabled.',
      isApproved: true,
      mode: 'AUTO'
    },
    'autoApproval.sales': {
      approved: true,
      approvedAt: now,
      approvedBy: AUTO_APPROVAL_SYSTEM_USER,
      triggerSource,
      requestId
    }
  };
};

const buildBdoAutoApprovalPayload = (bdoId, triggerSource) => {
  const now = FieldValue.serverTimestamp();

  return {
    status: 'Approved',
    approvedAt: now,
    approvedBy: AUTO_APPROVAL_SYSTEM_USER,
    approvalMode: 'AUTO',
    updatedAt: now,
    lastUpdatedBy: AUTO_APPROVAL_SYSTEM_USER,
    assignedTo: 'Sales Team',
    'metadata.updatedAt': now,
    'metadata.lastModifiedBy': AUTO_APPROVAL_SYSTEM_USER,
    'autoApproval.sales': {
      approved: true,
      approvedAt: now,
      approvedBy: AUTO_APPROVAL_SYSTEM_USER,
      triggerSource,
      bdoDocumentId: bdoId
    }
  };
};

const maybeAutoApproveRequest = async (docRef, requestId, requestData, triggerSource) => {
  if (!isRequestEligibleForSalesAutoApproval(requestData)) {
    return false;
  }

  const enabled = await isSalesAutoApprovalEnabled();
  if (!enabled) {
    logger.info(`[SalesAutoApproval] Skipped request ${requestId}; setting is OFF`);
    return false;
  }

  await docRef.update(buildRequestAutoApprovalPayload(requestId, triggerSource));
  logger.info(`[SalesAutoApproval] Auto-approved request ${requestId}`);
  return true;
};

const maybeAutoApproveBdo = async (docRef, bdoDocId, bdoData, triggerSource) => {
  if (!isBdoEligibleForAutoApproval(bdoData)) {
    return false;
  }

  const enabled = await isSalesAutoApprovalEnabled();
  if (!enabled) {
    logger.info(`[SalesAutoApproval] Skipped BDO/Retailer ${bdoDocId}; setting is OFF`);
    return false;
  }

  await docRef.update(buildBdoAutoApprovalPayload(bdoDocId, triggerSource));
  logger.info(`[SalesAutoApproval] Auto-approved BDO/Retailer ${bdoDocId}`);
  return true;
};

const backfillSalesAutoApprovalCollection = async ({
  collectionName,
  statuses,
  isEligible,
  buildPayload,
  label,
  triggerSource
}) => {
  let totalUpdated = 0;

  for (const status of statuses) {
    for (let pass = 0; pass < AUTO_APPROVAL_BACKFILL_MAX_PASSES_PER_STATUS; pass += 1) {
      const snapshot = await db
        .collection(collectionName)
        .where('status', '==', status)
        .limit(AUTO_APPROVAL_BACKFILL_LIMIT_PER_PASS)
        .get();

      if (snapshot.empty) {
        break;
      }

      const eligibleDocs = snapshot.docs.filter((doc) => isEligible(doc.data()));

      if (eligibleDocs.length === 0) {
        logger.info(`[SalesAutoApproval] Backfill found ${snapshot.size} ${label} records with status ${status}, but none were eligible`);
        break;
      }

      const batch = db.batch();
      eligibleDocs.forEach((doc) => {
        batch.update(doc.ref, buildPayload(doc.id, triggerSource));
      });

      await batch.commit();
      totalUpdated += eligibleDocs.length;
      logger.info(`[SalesAutoApproval] Backfilled ${eligibleDocs.length} ${label} records with status ${status}`);

      if (snapshot.size < AUTO_APPROVAL_BACKFILL_LIMIT_PER_PASS) {
        break;
      }
    }
  }

  return totalUpdated;
};

const runSalesAutoApprovalBackfill = async (triggerSource) => {
  const enabled = await isSalesAutoApprovalEnabled();
  if (!enabled) {
    logger.info('[SalesAutoApproval] Backfill skipped because setting is OFF');
    return { requestsUpdated: 0, bdosUpdated: 0 };
  }

  const [requestsUpdated, bdosUpdated] = await Promise.all([
    backfillSalesAutoApprovalCollection({
      collectionName: 'requestsV2',
      statuses: REQUEST_AUTO_APPROVAL_BACKFILL_STATUSES,
      isEligible: isRequestEligibleForSalesAutoApproval,
      buildPayload: (requestId) => buildRequestAutoApprovalPayload(requestId, triggerSource),
      label: 'request',
      triggerSource
    }),
    backfillSalesAutoApprovalCollection({
      collectionName: 'bdoAccounts',
      statuses: BDO_AUTO_APPROVAL_BACKFILL_STATUSES,
      isEligible: isBdoEligibleForAutoApproval,
      buildPayload: (bdoDocId) => buildBdoAutoApprovalPayload(bdoDocId, triggerSource),
      label: 'BDO/Retailer',
      triggerSource
    })
  ]);

  logger.info(`[SalesAutoApproval] Backfill completed. Requests: ${requestsUpdated}, BDO/Retailers: ${bdosUpdated}`);
  return { requestsUpdated, bdosUpdated };
};

/**
 * Backfill existing pending Sales queue records when the Sales auto approval setting is created as ON.
 * This covers projects where the setting document did not exist before the toggle was first enabled.
 */
exports.backfillSalesAutoApprovalQueueOnSettingCreate = onDocumentCreated(SALES_AUTO_APPROVAL_SETTING_PATH, async (event) => {
  const settingData = event.data?.data();
  if (settingData?.enabled !== true) {
    return null;
  }

  await runSalesAutoApprovalBackfill('settingCreateBackfill');
  return null;
});

/**
 * Backfill existing pending Sales queue records whenever the Sales auto approval toggle is turned ON.
 * The create/update triggers handle new records. This trigger handles records that were already pending.
 */
exports.backfillSalesAutoApprovalQueueOnSettingUpdate = onDocumentUpdated(SALES_AUTO_APPROVAL_SETTING_PATH, async (event) => {
  const beforeData = event.data?.before?.data() || {};
  const afterData = event.data?.after?.data() || {};

  if (afterData.enabled !== true) {
    return null;
  }

  const wasAlreadyEnabled = beforeData.enabled === true;
  const updatedAtChanged = String(beforeData.updatedAt?.toMillis?.() || beforeData.updatedAt || '') !== String(afterData.updatedAt?.toMillis?.() || afterData.updatedAt || '');

  if (wasAlreadyEnabled && !updatedAtChanged) {
    return null;
  }

  await runSalesAutoApprovalBackfill(wasAlreadyEnabled ? 'settingRefreshBackfill' : 'settingToggleBackfill');
  return null;
});

/**
 * Auto-approve newly created sales requests when the Sales Team toggle is ON.
 * This avoids loading these records in the Sales dashboard only to approve them manually.
 */
exports.autoApproveIncomingRequest = onDocumentCreated('requestsV2/{requestId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return null;

  const requestId = event.params.requestId;
  await maybeAutoApproveRequest(snapshot.ref, requestId, snapshot.data(), 'onCreate');
  return null;
});

/**
 * Auto-approve existing requests that are resubmitted while the toggle is ON.
 */
exports.autoApproveResubmittedRequest = onDocumentUpdated('requestsV2/{requestId}', async (event) => {
  const after = event.data?.after;
  if (!after) return null;

  const requestId = event.params.requestId;
  await maybeAutoApproveRequest(after.ref, requestId, after.data(), 'onUpdate');
  return null;
});

/**
 * Auto-approve newly created BDO/Retailer accounts when the Sales Team toggle is ON.
 */
exports.autoApproveIncomingBdoAccount = onDocumentCreated('bdoAccounts/{bdoDocId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return null;

  const bdoDocId = event.params.bdoDocId;
  await maybeAutoApproveBdo(snapshot.ref, bdoDocId, snapshot.data(), 'onCreate');
  return null;
});

/**
 * Auto-approve BDO/Retailer accounts that are resubmitted or corrected while the toggle is ON.
 */
exports.autoApproveUpdatedBdoAccount = onDocumentUpdated('bdoAccounts/{bdoDocId}', async (event) => {
  const after = event.data?.after;
  if (!after) return null;

  const bdoDocId = event.params.bdoDocId;
  await maybeAutoApproveBdo(after.ref, bdoDocId, after.data(), 'onUpdate');
  return null;
});

/**
 * Cloud Function to initialize dashboard data
 * This eliminates race conditions and provides atomic data loading
 */
exports.initializeDashboard = onCall(async (request) => {
  try {
    const { auth, data } = request;
    
    // Verify user is authenticated
    if (!auth) {
      throw new Error('User not authenticated');
    }

    const uid = auth.uid;
    const userRole = data?.role;
    const franchiseCode = data?.franchiseCode;

    logger.info(`[CloudFunction] Dashboard initialization requested for user: ${uid}, role: ${userRole}, franchise: ${franchiseCode}`);

    // Defensive: Validate required data
    if (typeof userRole === 'undefined' || userRole === null || userRole === '' || typeof franchiseCode === 'undefined' || franchiseCode === null || franchiseCode === '') {
      logger.error('[CloudFunction] Missing or invalid userRole or franchiseCode', { userRole, franchiseCode, data });
      throw new Error('Missing or invalid user data (role or franchiseCode)');
    }
    logger.info(`[CloudFunction] Querying Firestore with:`, { franchiseCode, userRole });

    const result = {
      user: {
        uid,
        role: userRole,
        franchiseCode
      },
      timestamp: new Date().toISOString()
    };

    // Based on user role, fetch appropriate data
    switch (userRole) {
      case 'Franchise':
        result.data = await initializeFranchiseDashboard(franchiseCode);
        break;
      case 'Sales Team':
        result.data = await initializeSalesTeamDashboard();
        break;
      case 'Admin':
        result.data = await initializeAdminDashboard();
        break;
      default:
        throw new Error(`Unknown user role: ${userRole}`);
    }

    logger.info(`Dashboard data loaded successfully for ${uid}`);
    return result;

  } catch (error) {
    logger.error('Dashboard initialization failed:', error);
    throw new Error(`Dashboard initialization failed: ${error.message}`);
  }
});

/**
 * Initialize franchise dashboard data
 */
async function initializeFranchiseDashboard(franchiseCode) {
  try {
    if (!franchiseCode || typeof franchiseCode !== 'string') {
      throw new Error('Invalid franchise code');
    }

    logger.info(`Loading franchise dashboard for: ${franchiseCode}`);

    const activeStatuses = [
      'pending',
      'Pending',
      'Submitted',
      'Sales Review',
      'Operations Review',
      'In Processing',
      'Needs Revision',
      'SUBMITTED',
      'SALES_REVIEW',
      'NEEDS_REVISION'
    ];

    const requestsBase = db.collection('requestsV2').where('franchiseCode', '==', franchiseCode);
    const bdoBase = db.collection('bdoAccounts').where('franchiseCode', '==', franchiseCode);

    const [requestsSnapshot, bdoAccountsSnapshot, totalRequests, totalBDOs] = await Promise.all([
      requestsBase
        .where('status', 'in', activeStatuses)
        .orderBy('createdAt', 'desc')
        .limit(25)
        .get(),
      bdoBase
        .orderBy('createdAt', 'desc')
        .limit(25)
        .get(),
      getQueryCount(requestsBase),
      getQueryCount(bdoBase)
    ]);

    const requests = requestsSnapshot.docs.map(serializeDoc);
    const bdoAccounts = bdoAccountsSnapshot.docs.map(serializeDoc);

    const requestsByStatus = requests.reduce((acc, req) => {
      const status = req.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const bdosByStatus = bdoAccounts.reduce((acc, bdo) => {
      const status = bdo.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const stats = {
      totalRequests,
      totalBDOs,
      requestsByStatus,
      bdosByStatus,
      returnedRequests: requests.length,
      returnedBDOs: bdoAccounts.length
    };

    logger.info(`Franchise dashboard loaded with limited data: ${requests.length} requests, ${bdoAccounts.length} BDOs, totals ${totalRequests}/${totalBDOs}`);

    return {
      requests,
      bdoAccounts,
      stats,
      franchiseCode
    };
  } catch (error) {
    logger.error('Franchise dashboard initialization failed:', error);
    throw error;
  }
}

/**
 * Initialize sales team dashboard data
 */
async function initializeSalesTeamDashboard() {
  try {
    logger.info('Loading sales team dashboard');

    const bdoStatuses = ['Pending Approval', 'Needs Revision', 'Pending', 'PENDING_APPROVAL', 'NEEDS_REVISION'];
    const requestStatuses = ['pending', 'Pending', 'Submitted', 'Sales Review', 'Needs Revision', 'SUBMITTED', 'SALES_REVIEW', 'NEEDS_REVISION'];

    const [bdoRequestsSnapshot, mappingRequestsSnapshot] = await Promise.all([
      db.collection('bdoAccounts')
        .where('status', 'in', bdoStatuses)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
      db.collection('requestsV2')
        .where('status', 'in', requestStatuses)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
    ]);

    const bdoRequests = bdoRequestsSnapshot.docs.map(serializeDoc);
    const mappingRequests = mappingRequestsSnapshot.docs.map(serializeDoc);

    return {
      bdoRequests,
      mappingRequests,
      stats: {
        pendingBDOs: bdoRequests.length,
        pendingMappings: mappingRequests.length
      }
    };
  } catch (error) {
    logger.error('Sales team dashboard initialization failed:', error);
    throw error;
  }
}

/**
 * Initialize admin dashboard data
 */
async function initializeAdminDashboard() {
  try {
    logger.info('Loading admin dashboard');

    // Fetch overview data - use requestsV2 for new unified structure
    const [requestsSnapshot, bdoSnapshot, analyticsData] = await Promise.all([
      db.collection('requestsV2')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
      db.collection('bdoAccounts')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
      generateAnalytics()
    ]);

    const [totalRequests, totalBDOs] = await Promise.all([
      getQueryCount(db.collection('requestsV2')),
      getQueryCount(db.collection('bdoAccounts'))
    ]);

    const requests = requestsSnapshot.docs.map(serializeDoc);
    const bdoAccounts = bdoSnapshot.docs.map(serializeDoc);

    return {
      requests,
      bdoAccounts,
      analytics: analyticsData,
      stats: {
        totalRequests,
        totalBDOs,
        returnedRequests: requests.length,
        returnedBDOs: bdoAccounts.length
      }
    };

  } catch (error) {
    logger.error('Admin dashboard initialization failed:', error);
    throw error;
  }
}

/**
 * Generate analytics data
 */
async function generateAnalytics() {
  try {
    // This would contain more complex analytics logic
    return {
      requestTrends: [],
      franchisePerformance: [],
      deviceUtilization: [],
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Analytics generation failed:', error);
    return null;
  }
}

/**
 * Search BDO accounts with validation
 */
exports.searchBDOAccounts = onCall(async (request) => {
  try {
    const { auth, data } = request;
    
    if (!auth) {
      throw new Error('User not authenticated');
    }

    const { franchiseCode, searchTerm, searchType } = data;
    
    // Validate inputs
    if (!franchiseCode || typeof franchiseCode !== 'string') {
      throw new Error('Invalid franchise code');
    }

    if (!searchTerm || typeof searchTerm !== 'string') {
      throw new Error('Invalid search term');
    }

    logger.info(`BDO search: franchise=${franchiseCode}, term=${searchTerm}, type=${searchType}`);

    let query = db.collection('bdoAccounts')
      .where('franchiseCode', '==', franchiseCode);

    // Add specific search criteria based on type
    if (searchType === 'cnic' && searchTerm.length === 13) {
      query = query.where('cnicNumber', '==', searchTerm);
    } else if (searchType === 'mobile' && searchTerm.length === 12) {
      query = query.where('otpMobileNumber', '==', searchTerm);
    }

    const snapshot = await query.limit(20).get();
    
    let results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null
    }));

    // If no specific field search, filter by text search
    if (!searchType || (searchType !== 'cnic' && searchType !== 'mobile')) {
      const searchLower = searchTerm.toLowerCase();
      results = results.filter(bdo =>
        bdo.name?.toLowerCase().includes(searchLower) ||
        bdo.bdoId?.toLowerCase().includes(searchLower) ||
        bdo.cnicNumber?.includes(searchTerm)
      );
    }

    logger.info(`BDO search completed: ${results.length} results`);

    return {
      results,
      searchTerm,
      searchType,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('BDO search failed:', error);
    throw new Error(`BDO search failed: ${error.message}`);
  }
});

/**
 * Health check endpoint
 */
exports.healthCheck = onRequest(async (req, res) => {
  try {
    // Test database connection
    await db.collection('health').doc('test').set({
      timestamp: new Date(),
      status: 'healthy'
    });

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      functions: ['initializeDashboard', 'searchBDOAccounts', 'autoApproveIncomingRequest', 'autoApproveResubmittedRequest', 'autoApproveIncomingBdoAccount', 'autoApproveUpdatedBdoAccount']
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Export BDO ID Generation functions
exports.generateBDOId = bdoIdFunctions.generateBDOId;
exports.generateRequestNumber = bdoIdFunctions.generateRequestNumber;
exports.previewNextNumbers = bdoIdFunctions.previewNextNumbers;
exports.validateBDOId = bdoIdFunctions.validateBDOId;

// Export sequence counter sync functions
exports.syncSequenceCounters = syncFunctions.syncSequenceCounters;
exports.analyzeBDOData = syncFunctions.analyzeBDOData;
