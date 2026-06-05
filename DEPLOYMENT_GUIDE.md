# Production Deployment Guide

## 🚀 Pre-Deployment Checklist

### 1. Code Cleanup for Production

#### Remove Debug Console Statements
**Priority: HIGH** - Your codebase currently has numerous console.log statements that should be cleaned up for production:

```bash
# Create a production-ready version by removing console logs
# Option 1: Use a build process to strip console logs
npm install --save-dev babel-plugin-transform-remove-console

# Option 2: Create a script to remove console logs
# Add to package.json scripts:
"build:clean": "npm run build && echo 'Console logs should be removed in production'"
```

**Recommended approach**: Replace debug console.log statements with a proper logging service:
- Keep `console.error` for error handling
- Remove info/debug `console.log` statements
- Consider using a logging library like `winston` or `loglevel` for conditional logging

#### Environment Configuration
- [ ] Ensure all sensitive data is in environment variables
- [ ] Configure Firebase for production environment
- [ ] Set up proper CORS policies
- [ ] Configure production database rules

### 2. Firebase Configuration

#### Firestore Rules Review
```javascript
// Ensure your firestore.rules are production-ready
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Add proper security rules here
    // Remove any overly permissive rules
  }
}
```

#### Firebase Hosting
```bash
# Deploy to Firebase Hosting
firebase deploy --only hosting

# Deploy Functions
firebase deploy --only functions

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

### 3. Performance Optimization

#### Bundle Analysis
```bash
# Analyze bundle size
npm run build
npm install -g serve
serve -s build

# Check for unused dependencies
npm install -g depcheck
depcheck
```

#### Code Splitting
- Implement lazy loading for components
- Split large components into smaller chunks
- Optimize image loading

### 4. Quality Assurance

#### Testing
```bash
# Run all tests
npm test

# Run lint checks
npm run lint

# Run security audit
npm audit
npm audit fix
```

#### Browser Compatibility
- Test on multiple browsers
- Check mobile responsiveness
- Verify PWA functionality

## 📝 Git Best Practices for Production

### 1. Commit Message Convention
Use conventional commits for better tracking:

```
feat: add OTP change workflow with Excel export
fix: resolve CNIC field mapping issue in operations dashboard
docs: update deployment guide with production checklist
refactor: optimize BDO selection to use devices collection
perf: improve dashboard stats calculation performance
```

### 2. Branching Strategy
```bash
# Create a production branch
git checkout -b production
git push -u origin production

# For hotfixes
git checkout -b hotfix/fix-cnic-export
git checkout production
git merge hotfix/fix-cnic-export
```

### 3. Pre-commit Hooks
Add to package.json:
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "src/**/*.{js,jsx}": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ]
  }
}
```

## 🔧 Recommended Commit Steps

### Step 1: Clean Console Logs
```bash
# Create a cleanup script
npm run lint --fix
# Manually review and remove debug console.log statements
```

### Step 2: Final Testing
```bash
# Test all major workflows
npm start
# Test: BDO creation, device mapping, OTP changes, transfers, dashboard exports
```

### Step 3: Commit Changes
```bash
# Stage your changes
git add .

# Commit with descriptive message
git commit -m "feat: complete device profiling system with enhanced workflows

- Add OTP mobile change workflow with previous/new OTP display
- Implement device migration from Excel with audit trail
- Fix dashboard stats to show accurate BDO counts
- Refactor BDO selection to use devices collection
- Add strict IMEI validation (15 digits, numbers only)
- Enhance Transfer of Ownership with banner and new location details
- Improve CNIC handling in operations dashboard and Excel export
- Optimize UI/UX for device transfer form and review steps"

# Push to remote
git push origin main
```

### Step 4: Create Release Branch
```bash
# Create a release branch for production
git checkout -b release/v1.0.0
git push -u origin release/v1.0.0
```

## 🔒 Security Considerations

### Environment Variables
Ensure these are set in production:
```env
REACT_APP_FIREBASE_API_KEY=your_production_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their franchise data
    match /bdoAccounts/{document} {
      allow read, write: if request.auth != null 
        && request.auth.token.franchiseCode == resource.data.franchiseCode;
    }
    
    // Requests are restricted by franchise
    match /requestsV2/{document} {
      allow read, write: if request.auth != null 
        && request.auth.token.franchiseCode == resource.data.franchiseCode;
    }
    
    // Devices are restricted by franchise
    match /devices/{document} {
      allow read, write: if request.auth != null 
        && request.auth.token.franchiseCode == resource.data.franchiseCode;
    }
  }
}
```

## 📊 Production Monitoring

### Performance Monitoring
- Set up Firebase Performance Monitoring
- Configure error tracking with Sentry or similar
- Set up analytics tracking

### Health Checks
```javascript
// Add health check endpoint
const healthCheck = {
  timestamp: new Date().toISOString(),
  status: 'healthy',
  version: process.env.REACT_APP_VERSION || '1.0.0'
};
```

## 🚀 Deployment Commands

### Local Testing
```bash
# Build and test locally
npm run build
npm install -g serve
serve -s build -l 3000
```

### Firebase Deployment
```bash
# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes
```

### Rollback Strategy
```bash
# If issues occur, rollback
firebase hosting:clone SOURCE_SITE_ID:SOURCE_VERSION TARGET_SITE_ID
```

## 📋 Post-Deployment Verification

1. **Functional Testing**
   - [ ] User authentication works
   - [ ] BDO creation and listing
   - [ ] Device mapping workflows
   - [ ] Excel imports/exports
   - [ ] Dashboard statistics accuracy

2. **Performance Testing**
   - [ ] Page load times < 3 seconds
   - [ ] Database queries optimized
   - [ ] No memory leaks

3. **Security Testing**
   - [ ] Authentication required for all actions
   - [ ] Data isolation by franchise
   - [ ] No exposed sensitive data

## 🆘 Troubleshooting

### Common Issues
1. **Console errors**: Check browser dev tools
2. **Database errors**: Verify Firestore rules
3. **Authentication issues**: Check Firebase Auth configuration
4. **Build failures**: Clear node_modules and reinstall

### Support Contacts
- Technical Lead: [Your Contact]
- DevOps: [DevOps Contact]
- Firebase Support: [Firebase Console]

---

**Remember**: Always test in a staging environment before production deployment!
