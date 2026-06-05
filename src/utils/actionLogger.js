// --- Lightweight Action Logging Utility ---
import { useMemo } from 'react';
import { addDoc, collection, Timestamp } from 'firebase/firestore';

/**
 * Audit log mode:
 * - minimal: writes only approval/rejection/status/device/security/error events.
 * - full: writes every logAction call.
 * - off: writes nothing.
 */
const AUDIT_LOG_MODE = process.env.REACT_APP_AUDIT_LOG_MODE || 'minimal';

const IMPORTANT_ACTION_TYPES = new Set([
    'APPROVE',
    'REJECT',
    'RESUBMIT',
    'STATUS_CHANGE',
    'ASSIGN',
    'DEVICE_MAPPED',
    'DEVICE_TRANSFERRED',
    'DEVICE_DEMAPPED',
    'SECURITY_EVENT',
    'ERROR'
]);

const IMPORTANT_SEVERITIES = new Set(['WARNING', 'ERROR', 'CRITICAL']);

const cleanObject = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    if (Array.isArray(value)) {
        return value
            .map(item => cleanObject(item))
            .filter(item => item !== undefined);
    }

    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') return value;

        return Object.fromEntries(
            Object.entries(value)
                .map(([key, item]) => [key, cleanObject(item)])
                .filter(([, item]) => item !== undefined)
        );
    }

    return value;
};

/**
 * Lightweight action logger for audit trails.
 * Keeps the same public methods as the previous logger, but avoids routine writes.
 */
export class ActionLogger {
    constructor(db, user) {
        this.db = db;
        this.user = user;
        this.sessionId = this.generateSessionId();
        this.mode = AUDIT_LOG_MODE;
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    shouldPersist(actionData = {}) {
        if (this.mode === 'off') return false;
        if (this.mode === 'full') return true;

        const type = actionData.type || actionData.action || '';
        const severity = actionData.severity || actionData.metadata?.severity || 'INFO';

        return IMPORTANT_ACTION_TYPES.has(type) || IMPORTANT_SEVERITIES.has(severity);
    }

    async logAction(actionData = {}) {
        try {
            if (!this.shouldPersist(actionData)) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('Audit log skipped by minimal mode:', actionData.type || actionData.action || 'ACTION');
                }
                return { skipped: true };
            }

            if (!this.user || !this.user.uid || !this.user.role) {
                console.warn('ActionLogger: Invalid user data, skipping log entry');
                return null;
            }

            const actionType = actionData.type || actionData.action || 'ACTION';
            const target = actionData.target || {};
            const contextData = cleanObject({
                requestId: actionData.context?.requestId,
                deviceImei: actionData.context?.deviceImei || actionData.context?.imei,
                bdoId: actionData.context?.bdoId,
                franchiseCode: actionData.context?.franchiseCode || this.user.franchiseCode || null,
                sessionId: this.sessionId,
                ...actionData.context
            }) || {};

            const logEntry = cleanObject({
                timestamp: Timestamp.now(),
                actor: {
                    userId: this.user.uid,
                    userName: this.user.name || this.user.email,
                    userRole: this.user.role,
                    userEmail: this.user.email
                },
                action: {
                    type: actionType,
                    description: actionData.description || actionData.details?.description || actionType,
                    category: actionData.category || actionData.metadata?.category || 'GENERAL'
                },
                target: {
                    entityType: target.entityType || target.type || 'unknown',
                    entityId: target.entityId || target.id || null,
                    entityIdentifier: target.entityIdentifier || target.identifier || target.entityId || target.id || null
                },
                changes: actionData.changes || {},
                context: contextData,
                metadata: {
                    severity: actionData.severity || 'INFO',
                    isAuditable: actionData.isAuditable !== false,
                    category: actionData.metadata?.category || 'general',
                    tags: actionData.metadata?.tags || []
                }
            });

            await addDoc(collection(this.db, 'actionLogs'), logEntry);

            if (process.env.NODE_ENV === 'development') {
                console.log('Action logged:', logEntry);
            }

            return logEntry;
        } catch (error) {
            console.error('Failed to log action:', error);
            return null;
        }
    }

    async logRequestCreated(requestData) {
        await this.logAction({
            type: 'CREATE',
            description: `Request ${requestData.requestNumber} created`,
            category: 'REQUEST',
            target: {
                entityType: 'request',
                entityId: requestData.id,
                entityIdentifier: requestData.requestNumber
            },
            context: {
                requestId: requestData.id,
                deviceImei: requestData.device?.imei
            },
            severity: 'INFO'
        });
    }

    async logRequestStatusChange(requestId, requestNumber, oldStatus, newStatus, comments = '') {
        await this.logAction({
            type: 'STATUS_CHANGE',
            description: `Request ${requestNumber} status changed from ${oldStatus} to ${newStatus}`,
            category: 'REQUEST',
            target: {
                entityType: 'request',
                entityId: requestId,
                entityIdentifier: requestNumber
            },
            changes: {
                before: { status: oldStatus },
                after: { status: newStatus },
                fields: ['status'],
                comments
            },
            context: { requestId },
            severity: String(newStatus).toLowerCase().includes('reject') ? 'WARNING' : 'INFO'
        });
    }

    async logRequestApproval(requestId, requestNumber, approvalType, approved, comments = '') {
        await this.logAction({
            type: approved ? 'APPROVE' : 'REJECT',
            description: `Request ${requestNumber} ${approved ? 'approved' : 'rejected'} by ${approvalType} team`,
            category: 'REQUEST',
            target: {
                entityType: 'request',
                entityId: requestId,
                entityIdentifier: requestNumber
            },
            changes: {
                before: { [`approvals.${approvalType}.isApproved`]: null },
                after: { [`approvals.${approvalType}.isApproved`]: approved },
                fields: [`approvals.${approvalType}`],
                comments
            },
            context: { requestId, approvalType },
            severity: approved ? 'INFO' : 'WARNING'
        });
    }

    async logDeviceAssignment(deviceImei, bdoId, requestId) {
        await this.logAction({
            type: 'ASSIGN',
            description: `Device ${deviceImei} assigned to BDO ${bdoId}`,
            category: 'DEVICE',
            target: {
                entityType: 'device',
                entityId: deviceImei,
                entityIdentifier: deviceImei
            },
            context: { deviceImei, bdoId, requestId },
            severity: 'INFO'
        });
    }

    async logBDOCreated(bdoData) {
        await this.logAction({
            type: 'CREATE',
            description: `BDO account ${bdoData.bdoId} created`,
            category: 'BDO',
            target: {
                entityType: 'bdo',
                entityId: bdoData.id,
                entityIdentifier: bdoData.bdoId
            },
            context: {
                bdoId: bdoData.bdoId,
                franchiseId: bdoData.franchiseId
            },
            severity: 'INFO'
        });
    }

    async logBDOStatusChange(bdoId, oldStatus, newStatus, comments = '') {
        await this.logAction({
            type: 'STATUS_CHANGE',
            description: `BDO ${bdoId} status changed from ${oldStatus} to ${newStatus}`,
            category: 'BDO',
            target: {
                entityType: 'bdo',
                entityId: bdoId,
                entityIdentifier: bdoId
            },
            changes: {
                before: { status: oldStatus },
                after: { status: newStatus },
                fields: ['status'],
                comments
            },
            context: { bdoId },
            severity: String(newStatus).toLowerCase().includes('reject') ? 'WARNING' : 'INFO'
        });
    }

    async logUserLogin() {
        await this.logAction({
            type: 'LOGIN',
            description: `User ${this.user.email} logged in`,
            category: 'USER',
            target: {
                entityType: 'user',
                entityId: this.user.uid,
                entityIdentifier: this.user.email
            },
            severity: 'INFO'
        });
    }

    async logUserLogout() {
        await this.logAction({
            type: 'LOGOUT',
            description: `User ${this.user.email} logged out`,
            category: 'USER',
            target: {
                entityType: 'user',
                entityId: this.user.uid,
                entityIdentifier: this.user.email
            },
            severity: 'INFO'
        });
    }

    async logSecurityEvent(eventType, description, severity = 'WARNING') {
        await this.logAction({
            type: 'SECURITY_EVENT',
            description,
            category: 'SYSTEM',
            target: {
                entityType: 'system',
                entityId: 'security',
                entityIdentifier: eventType
            },
            metadata: {
                category: 'security',
                tags: ['security', eventType]
            },
            severity
        });
    }

    async logError(error, context = {}) {
        await this.logAction({
            type: 'ERROR',
            description: `Error: ${error.message}`,
            category: 'SYSTEM',
            target: {
                entityType: 'system',
                entityId: 'error',
                entityIdentifier: error.name || 'UnknownError'
            },
            context: {
                errorStack: error.stack,
                ...context
            },
            metadata: {
                category: 'error',
                tags: ['error', 'system']
            },
            severity: 'ERROR'
        });
    }
}

export const useActionLogger = (db, user) => {
    return useMemo(() => {
        if (!user) return null;
        return new ActionLogger(db, user);
    }, [db, user]);
};

export const withActionLogging = (WrappedComponent) => {
    return function WithActionLoggingComponent(props) {
        const logger = useActionLogger(props.db, props.user);
        return <WrappedComponent {...props} actionLogger={logger} />;
    };
};

export default ActionLogger;
