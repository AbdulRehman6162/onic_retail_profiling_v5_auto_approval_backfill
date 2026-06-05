# Deployment & Scaling Guide for BVS Device Management System

## Production Deployment Strategy

### 1. Environment Setup

#### Firebase Project Configuration
```javascript
// firebase.json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      },
      {
        "source": "/service-worker.js",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      }
    ]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs18"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

#### Environment Variables
```bash
# .env.production
REACT_APP_FIREBASE_API_KEY=your_production_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_ENVIRONMENT=production
REACT_APP_VERSION=1.0.0
```

### 2. Build Optimization

#### Webpack Bundle Analysis
```javascript
// package.json scripts
{
  "scripts": {
    "analyze": "npm run build && npx webpack-bundle-analyzer build/static/js/*.js",
    "build:production": "NODE_ENV=production npm run build",
    "preload": "node scripts/preloadCriticalData.js"
  }
}
```

#### Code Splitting Strategy
```javascript
// src/components/LazyComponents.js
import { lazy } from 'react';

// Role-based code splitting
export const FranchiseDashboard = lazy(() => import('./FranchiseDashboard'));
export const SalesTeamDashboard = lazy(() => import('./SalesTeamDashboard'));
export const OperationsTeamDashboard = lazy(() => import('./OperationsTeamDashboard'));
export const AdminDashboard = lazy(() => import('./AdminDashboard'));

// Feature-based splitting
export const RequestForm = lazy(() => import('./RequestForm'));
export const BDOForm = lazy(() => import('./BDOForm'));
export const Analytics = lazy(() => import('./Analytics'));
```

#### Service Worker for PWA
```javascript
// public/sw.js
const CACHE_NAME = 'bvs-app-v1.0.0';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event with network-first strategy for API calls
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/') || event.request.url.includes('firestore')) {
    // Network first for dynamic content
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else {
    // Cache first for static assets
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});
```

### 3. Cloud Functions for Server-Side Logic

#### Request Status Change Triggers
```javascript
// functions/src/requestTriggers.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.onRequestStatusChange = functions.firestore
  .document('requests/{requestId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const requestId = context.params.requestId;

    if (before.status !== after.status) {
      // Send notifications
      await sendStatusChangeNotifications(after, before.status, after.status);
      
      // Update analytics
      await updateRequestAnalytics(after);
      
      // Handle automatic workflows
      await handleAutomaticWorkflows(after, requestId);
    }
  });

const sendStatusChangeNotifications = async (requestData, oldStatus, newStatus) => {
  const notifications = [];
  
  // Notify franchise
  notifications.push({
    to: requestData.franchise.contactUserId,
    notification: {
      title: 'Request Status Update',
      body: `Request ${requestData.requestNumber} status changed to ${newStatus}`,
      icon: '/icon-192x192.png'
    },
    data: {
      type: 'STATUS_CHANGE',
      requestId: requestData.id,
      newStatus
    }
  });

  // Notify relevant teams
  if (newStatus === 'SALES_REVIEW') {
    const salesTeamQuery = await admin.firestore()
      .collection('users')
      .where('role', '==', 'Sales Team')
      .where('isActive', '==', true)
      .get();
    
    salesTeamQuery.forEach(doc => {
      const user = doc.data();
      if (user.fcmToken) {
        notifications.push({
          to: user.fcmToken,
          notification: {
            title: 'New Request for Review',
            body: `Request ${requestData.requestNumber} needs sales review`,
            icon: '/icon-192x192.png'
          }
        });
      }
    });
  }

  // Send all notifications
  for (const notification of notifications) {
    try {
      await admin.messaging().send(notification);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
};
```

#### Scheduled Cleanup Functions
```javascript
// functions/src/scheduledTasks.js
exports.dailyCleanup = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .timeZone('Asia/Karachi')
  .onRun(async (context) => {
    // Clean old notifications
    const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    const oldNotificationsQuery = admin.firestore()
      .collection('notifications')
      .where('createdAt', '<', thirtyDaysAgo);
    
    const batch = admin.firestore().batch();
    const oldNotifications = await oldNotificationsQuery.get();
    
    oldNotifications.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    // Generate daily reports
    await generateDailyReport();
    
    console.log('Daily cleanup completed');
  });

exports.weeklyAnalytics = functions.pubsub
  .schedule('0 9 * * 1') // Monday at 9 AM
  .timeZone('Asia/Karachi')
  .onRun(async (context) => {
    await generateWeeklyAnalytics();
    await sendPerformanceReports();
  });
```

### 4. Monitoring and Analytics

#### Firebase Performance Monitoring
```javascript
// src/utils/performance.js
import { getPerformance, trace } from 'firebase/performance';

const perf = getPerformance();

export const measureRequestCreation = () => {
  const requestTrace = trace(perf, 'request_creation');
  requestTrace.start();
  
  return {
    stop: () => requestTrace.stop(),
    incrementMetric: (metricName, value) => {
      requestTrace.incrementMetric(metricName, value);
    }
  };
};

export const measurePageLoad = (pageName) => {
  const pageTrace = trace(perf, `page_load_${pageName}`);
  pageTrace.start();
  
  return () => pageTrace.stop();
};

// Usage in components
const RequestForm = () => {
  useEffect(() => {
    const stopTrace = measurePageLoad('request_form');
    return stopTrace;
  }, []);
  
  const handleSubmit = async (data) => {
    const requestTrace = measureRequestCreation();
    
    try {
      await createRequest(data);
      requestTrace.incrementMetric('successful_requests', 1);
    } catch (error) {
      requestTrace.incrementMetric('failed_requests', 1);
    } finally {
      requestTrace.stop();
    }
  };
};
```

#### Custom Analytics Dashboard
```javascript
// functions/src/analytics.js
exports.generateAnalytics = functions.https.onCall(async (data, context) => {
  // Verify admin access
  if (!context.auth || context.auth.token.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { startDate, endDate, metrics } = data;
  
  const analytics = {};
  
  if (metrics.includes('request_volume')) {
    analytics.requestVolume = await getRequestVolumeAnalytics(startDate, endDate);
  }
  
  if (metrics.includes('processing_times')) {
    analytics.processingTimes = await getProcessingTimeAnalytics(startDate, endDate);
  }
  
  if (metrics.includes('franchise_performance')) {
    analytics.franchisePerformance = await getFranchisePerformanceAnalytics(startDate, endDate);
  }
  
  return analytics;
});

const getRequestVolumeAnalytics = async (startDate, endDate) => {
  const requestsQuery = admin.firestore()
    .collection('requests')
    .where('metadata.createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)))
    .where('metadata.createdAt', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
  
  const requestsSnapshot = await requestsQuery.get();
  
  const volumeByDay = {};
  const volumeByType = {};
  const volumeByStatus = {};
  
  requestsSnapshot.forEach(doc => {
    const request = doc.data();
    const day = request.metadata.createdAt.toDate().toDateString();
    
    volumeByDay[day] = (volumeByDay[day] || 0) + 1;
    volumeByType[request.type] = (volumeByType[request.type] || 0) + 1;
    volumeByStatus[request.status] = (volumeByStatus[request.status] || 0) + 1;
  });
  
  return { volumeByDay, volumeByType, volumeByStatus };
};
```

### 5. Scalability Considerations

#### Database Optimization
```javascript
// Firestore composite indexes (firestore.indexes.json)
{
  "indexes": [
    {
      "collectionGroup": "requests",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "franchise.id", "order": "ASCENDING"},
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "metadata.createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "requests",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "type", "order": "ASCENDING"},
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "metadata.updatedAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "actionLogs",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "target.entityId", "order": "ASCENDING"},
        {"fieldPath": "timestamp", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "notifications",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "recipientId", "order": "ASCENDING"},
        {"fieldPath": "isRead", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    }
  ],
  "fieldOverrides": []
}
```

#### Horizontal Scaling with Microservices
```javascript
// functions/src/microservices/requestService.js
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Request processing microservice
app.post('/process-request', async (req, res) => {
  try {
    const { requestId, action, metadata } = req.body;
    
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Process request based on action
    const result = await processRequestAction(requestId, action, decodedToken.uid, metadata);
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.requestService = functions.https.onRequest(app);
```

#### Caching Strategy
```javascript
// src/utils/cache.js
import { openDB } from 'idb';

class CacheManager {
  constructor() {
    this.dbName = 'bvs-cache';
    this.version = 1;
    this.init();
  }

  async init() {
    this.db = await openDB(this.dbName, this.version, {
      upgrade(db) {
        // Create object stores
        db.createObjectStore('requests', { keyPath: 'id' });
        db.createObjectStore('bdoAccounts', { keyPath: 'id' });
        db.createObjectStore('userProfiles', { keyPath: 'uid' });
      }
    });
  }

  async set(storeName, key, data, ttl = 300000) { // 5 minutes default
    const item = {
      id: key,
      data,
      timestamp: Date.now(),
      ttl
    };
    
    await this.db.put(storeName, item);
  }

  async get(storeName, key) {
    const item = await this.db.get(storeName, key);
    
    if (!item) return null;
    
    // Check if expired
    if (Date.now() - item.timestamp > item.ttl) {
      await this.db.delete(storeName, key);
      return null;
    }
    
    return item.data;
  }

  async clear(storeName) {
    const tx = this.db.transaction(storeName, 'readwrite');
    await tx.objectStore(storeName).clear();
  }
}

export const cacheManager = new CacheManager();
```

### 6. Security Hardening

#### Content Security Policy
```html
<!-- public/index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https://firebasestorage.googleapis.com;
  connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com;
  frame-src 'none';
  object-src 'none';
">
```

#### API Rate Limiting
```javascript
// functions/src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID for authenticated requests
      return req.user?.uid || req.ip;
    }
  });
};

// Different limits for different endpoints
exports.generalLimit = createRateLimit(15 * 60 * 1000, 100, 'Too many requests'); // 100 per 15 min
exports.createRequestLimit = createRateLimit(60 * 60 * 1000, 10, 'Too many request creations'); // 10 per hour
exports.uploadLimit = createRateLimit(60 * 60 * 1000, 20, 'Too many file uploads'); // 20 per hour
```

### 7. Disaster Recovery

#### Backup Strategy
```javascript
// functions/src/backup.js
exports.dailyBackup = functions.pubsub
  .schedule('0 1 * * *')
  .timeZone('Asia/Karachi')
  .onRun(async (context) => {
    const projectId = process.env.GCLOUD_PROJECT;
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Backup Firestore
    const client = new v1.FirestoreAdminClient();
    const databaseName = `projects/${projectId}/databases/(default)`;
    const bucket = `gs://${projectId}-backups`;
    
    const [operation] = await client.exportDocuments({
      name: databaseName,
      outputUriPrefix: `${bucket}/firestore-${timestamp}`,
      collectionIds: ['requests', 'bdoAccounts', 'users', 'actionLogs']
    });
    
    console.log(`Backup operation: ${operation.name}`);
    
    // Backup user uploaded files
    await backupStorageFiles(timestamp);
  });

const backupStorageFiles = async (timestamp) => {
  const bucket = admin.storage().bucket();
  const backupBucket = admin.storage().bucket(`${process.env.GCLOUD_PROJECT}-backups`);
  
  const [files] = await bucket.getFiles({ prefix: 'uploads/' });
  
  for (const file of files) {
    const backupPath = `storage-backup-${timestamp}/${file.name}`;
    await file.copy(backupBucket.file(backupPath));
  }
};
```

### 8. Deployment Pipeline

#### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm run test:ci
        env:
          CI: true

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
        env:
          REACT_APP_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          REACT_APP_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          REACT_APP_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          REACT_APP_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
          REACT_APP_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          REACT_APP_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-files
          path: build/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      - uses: actions/download-artifact@v3
        with:
          name: build-files
          path: build/
      
      - name: Install Firebase CLI
        run: npm install -g firebase-tools
      
      - name: Deploy to Firebase
        run: |
          firebase deploy --only hosting,functions,firestore:rules,storage:rules
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
      
      - name: Run smoke tests
        run: npm run test:smoke
        env:
          BASE_URL: https://your-app.firebaseapp.com
```

### 9. Monitoring and Alerting

#### Cloud Functions for Monitoring
```javascript
// functions/src/monitoring.js
exports.healthCheck = functions.https.onRequest(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };

  try {
    // Check Firestore
    await admin.firestore().collection('health').doc('check').get();
    health.services.firestore = 'healthy';
  } catch (error) {
    health.services.firestore = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Check Storage
    await admin.storage().bucket().getMetadata();
    health.services.storage = 'healthy';
  } catch (error) {
    health.services.storage = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Alert on errors
exports.errorReporting = functions.crashlytics.issue().onCreate(async (issue) => {
  if (issue.data.impactLevel > 0.1) { // More than 10% of users affected
    await sendCriticalAlert({
      title: 'Critical Application Error',
      message: `Error affecting ${issue.data.impactLevel * 100}% of users: ${issue.data.title}`,
      urgency: 'high'
    });
  }
});
```

This comprehensive deployment and scaling guide ensures your BVS device management system can handle production loads while maintaining high availability, security, and performance.
