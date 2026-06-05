// --- Notification System ---
import { useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot,
    Timestamp,
    updateDoc,
    doc,
    getDocs,
    writeBatch
} from 'firebase/firestore';

/**
 * Comprehensive notification system for real-time updates
 */
export class NotificationSystem {
    constructor(db, user, actionLogger) {
        this.db = db;
        this.user = user;
        this.actionLogger = actionLogger;
        this.listeners = new Map();
        this.isSubscribed = false;
    }

    /**
     * Initialize notification listeners for the current user
     */
    initialize() {
        if (this.isSubscribed) return;
        
        this.subscribeToUserNotifications();
        this.subscribeToRequestUpdates();
        this.subscribeToSystemAnnouncements();
        
        this.isSubscribed = true;
    }

    /**
     * Cleanup all notification listeners
     */
    cleanup() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners.clear();
        this.isSubscribed = false;
    }

    /**
     * Subscribe to user-specific notifications
     */
    subscribeToUserNotifications() {
        // Defensive: Validate user.uid before Firestore query
        if (!this.user || !this.user.uid || typeof this.user.uid === 'undefined' || this.user.uid === null || this.user.uid === '') {
            console.error('❌ Invalid user.uid for notifications query:', this.user?.uid);
            return () => {}; // Return empty unsubscribe function
        }

        const notificationsQuery = query(
            collection(this.db, 'notifications'),
            where('recipientId', '==', this.user.uid),
            where('isRead', '==', false),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const notification = { id: change.doc.id, ...change.doc.data() };
                    this.displayNotification(notification);
                }
            });
        });

        this.listeners.set('userNotifications', unsubscribe);
    }

    /**
     * Subscribe to request updates relevant to the user
     */
    subscribeToRequestUpdates() {
        // Defensive: Validate user role and ID before Firestore queries
        if (!this.user || !this.user.role || typeof this.user.role === 'undefined' || this.user.role === null || this.user.role === '') {
            console.error('❌ Invalid user.role for request updates query:', this.user?.role);
            return () => {}; // Return empty unsubscribe function
        }

        let requestQuery;

        switch (this.user.role) {
            case 'Franchise':
                // Defensive: Check for both franchiseId and franchiseCode
                const franchiseIdentifier = this.user.franchiseId || this.user.franchiseCode;
                if (!franchiseIdentifier || typeof franchiseIdentifier === 'undefined' || franchiseIdentifier === null || franchiseIdentifier === '') {
                    console.error('❌ Invalid user.franchiseId/franchiseCode for franchise request updates:', { 
                        franchiseId: this.user?.franchiseId, 
                        franchiseCode: this.user?.franchiseCode 
                    });
                    return () => {}; // Return empty unsubscribe function
                }
                requestQuery = query(
                    collection(this.db, 'requestsV2'),
                    where('franchiseCode', '==', franchiseIdentifier), // Use franchiseCode field instead
                    orderBy('metadata.updatedAt', 'desc'),
                    limit(20)
                );
                break;
            
            case 'Sales Team':
                requestQuery = query(
                    collection(this.db, 'requestsV2'),
                    where('status', 'in', ['SALES_REVIEW', 'SALES_APPROVED', 'SALES_REJECTED']),
                    orderBy('metadata.updatedAt', 'desc'),
                    limit(20)
                );
                break;
            
            case 'Operations Team':
                requestQuery = query(
                    collection(this.db, 'requestsV2'),
                    where('status', 'in', ['OPS_REVIEW', 'OPS_APPROVED', 'OPS_REJECTED', 'IN_PROCESSING']),
                    orderBy('metadata.updatedAt', 'desc'),
                    limit(20)
                );
                break;
            
            default:
                return; // No subscription for other roles
        }

        const unsubscribe = onSnapshot(requestQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'modified') {
                    const request = { id: change.doc.id, ...change.doc.data() };
                    this.handleRequestUpdate(request, change);
                }
            });
        });

        this.listeners.set('requestUpdates', unsubscribe);
    }

    /**
     * Subscribe to system-wide announcements
     */
    subscribeToSystemAnnouncements() {
        const announcementsQuery = query(
            collection(this.db, 'systemAnnouncements'),
            where('targetRoles', 'array-contains', this.user.role),
            where('isActive', '==', true),
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(announcementsQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const announcement = { id: change.doc.id, ...change.doc.data() };
                    this.displaySystemAnnouncement(announcement);
                }
            });
        });

        this.listeners.set('systemAnnouncements', unsubscribe);
    }

    /**
     * Handle request update notifications
     */
    handleRequestUpdate(request, change) {
        const oldData = change.oldIndex !== -1 ? change.doc.data() : {};
        const newData = request;

        // Check for status changes
        if (oldData.status !== newData.status) {
            this.notifyStatusChange(request, oldData.status, newData.status);
        }

        // Check for comments
        if (newData.comments && newData.comments.length > (oldData.comments?.length || 0)) {
            const newComment = newData.comments[newData.comments.length - 1];
            if (newComment.userId !== this.user.uid) {
                this.notifyNewComment(request, newComment);
            }
        }
    }

    /**
     * Notify about status changes
     */
    notifyStatusChange(request, oldStatus, newStatus) {
        const statusMessages = {
            'SALES_APPROVED': '✅ Your request has been approved by Sales Team',
            'SALES_REJECTED': '❌ Your request has been rejected by Sales Team',
            'OPS_APPROVED': '✅ Your request has been approved by Operations Team',
            'OPS_REJECTED': '❌ Your request has been rejected by Operations Team',
            'NEEDS_REVISION': '📝 Your request needs revision',
            'COMPLETED': '🎉 Your request has been completed',
            'IN_PROCESSING': '⚙️ Your request is being processed',
            'ON_HOLD': '⏸️ Your request has been put on hold'
        };

        const message = statusMessages[newStatus] || `Request status updated to ${newStatus}`;
        
        toast(message, {
            icon: this.getStatusIcon(newStatus),
            duration: 6000,
            position: 'top-right',
            style: {
                background: this.getStatusColor(newStatus),
                color: 'white',
                fontWeight: 'bold'
            }
        });

        // Create persistent notification
        this.createNotification({
            type: 'STATUS_CHANGE',
            title: 'Request Status Update',
            message: `Request ${request.requestNumber}: ${message}`,
            data: {
                requestId: request.id,
                requestNumber: request.requestNumber,
                oldStatus,
                newStatus
            },
            priority: this.getStatusPriority(newStatus)
        });
    }

    /**
     * Notify about new comments
     */
    notifyNewComment(request, comment) {
        if (!comment.isInternal || this.user.role !== 'Franchise') {
            toast(`💬 New comment on request ${request.requestNumber}`, {
                duration: 4000,
                position: 'top-right',
                onClick: () => {
                    // Navigate to request detail
                    window.location.hash = `#request/${request.id}`;
                }
            });

            this.createNotification({
                type: 'NEW_COMMENT',
                title: 'New Comment',
                message: `${comment.userName} commented on request ${request.requestNumber}`,
                data: {
                    requestId: request.id,
                    requestNumber: request.requestNumber,
                    commentId: comment.id,
                    commenterName: comment.userName
                },
                priority: 'MEDIUM'
            });
        }
    }

    /**
     * Display system announcements
     */
    displaySystemAnnouncement(announcement) {
        toast(announcement.message, {
            icon: '📢',
            duration: 8000,
            position: 'top-center',
            style: {
                background: '#2563eb',
                color: 'white',
                fontWeight: 'bold',
                maxWidth: '500px'
            }
        });
    }

    /**
     * Display a notification
     */
    displayNotification(notification) {
        const typeIcons = {
            'STATUS_CHANGE': '🔄',
            'NEW_COMMENT': '💬',
            'ASSIGNMENT': '📱',
            'APPROVAL_REQUIRED': '⏳',
            'DEADLINE_REMINDER': '⏰',
            'SYSTEM_ALERT': '⚠️'
        };

        toast(notification.message, {
            icon: typeIcons[notification.type] || '🔔',
            duration: 5000,
            position: 'top-right',
            onClick: () => {
                this.markAsRead(notification.id);
                if (notification.data?.requestId) {
                    window.location.hash = `#request/${notification.data.requestId}`;
                }
            }
        });
    }

    /**
     * Create a persistent notification
     */
    async createNotification(notificationData) {
        try {
            const notification = {
                recipientId: this.user.uid,
                recipientRole: this.user.role,
                type: notificationData.type,
                title: notificationData.title,
                message: notificationData.message,
                data: notificationData.data || {},
                priority: notificationData.priority || 'MEDIUM',
                isRead: false,
                createdAt: Timestamp.now(),
                expiresAt: Timestamp.fromDate(
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                )
            };

            await addDoc(collection(this.db, 'notifications'), notification);
        } catch (error) {
            console.error('Failed to create notification:', error);
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId) {
        try {
            await updateDoc(doc(this.db, 'notifications', notificationId), {
                isRead: true,
                readAt: Timestamp.now()
            });
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }

    /**
     * Send notification to specific user
     */
    async notifyUser(userId, notificationData) {
        try {
            const notification = {
                recipientId: userId,
                type: notificationData.type,
                title: notificationData.title,
                message: notificationData.message,
                data: notificationData.data || {},
                priority: notificationData.priority || 'MEDIUM',
                isRead: false,
                createdAt: Timestamp.now(),
                senderId: this.user.uid,
                senderName: this.user.name || this.user.email
            };

            await addDoc(collection(this.db, 'notifications'), notification);

            // Log the notification
            if (this.actionLogger) {
                await this.actionLogger.logAction({
                    type: 'NOTIFY',
                    description: `Sent notification to user ${userId}: ${notificationData.title}`,
                    category: 'SYSTEM',
                    target: {
                        entityType: 'user',
                        entityId: userId,
                        entityIdentifier: 'notification'
                    },
                    context: {
                        notificationType: notificationData.type,
                        recipientId: userId
                    },
                    severity: 'INFO'
                });
            }
        } catch (error) {
            console.error('Failed to send notification:', error);
        }
    }

    /**
     * Broadcast notification to multiple users by role
     */
    async broadcastToRole(role, notificationData) {
        try {
            // Get users with the specified role
            const usersQuery = query(
                collection(this.db, 'users'),
                where('role', '==', role),
                where('isActive', '==', true)
            );

            const usersSnapshot = await getDocs(usersQuery);
            const notifications = [];

            usersSnapshot.forEach((doc) => {
                const user = doc.data();
                notifications.push({
                    recipientId: user.uid,
                    recipientRole: role,
                    type: notificationData.type,
                    title: notificationData.title,
                    message: notificationData.message,
                    data: notificationData.data || {},
                    priority: notificationData.priority || 'MEDIUM',
                    isRead: false,
                    createdAt: Timestamp.now(),
                    senderId: this.user.uid,
                    senderName: this.user.name || this.user.email
                });
            });

            // Batch create notifications
            const batch = writeBatch(this.db);
            notifications.forEach((notification) => {
                const notificationRef = doc(collection(this.db, 'notifications'));
                batch.set(notificationRef, notification);
            });

            await batch.commit();

        } catch (error) {
            console.error('Failed to broadcast notification:', error);
        }
    }

    /**
     * Utility methods
     */
    getStatusIcon(status) {
        const icons = {
            'SALES_APPROVED': '✅',
            'SALES_REJECTED': '❌',
            'OPS_APPROVED': '✅',
            'OPS_REJECTED': '❌',
            'NEEDS_REVISION': '📝',
            'COMPLETED': '🎉',
            'IN_PROCESSING': '⚙️',
            'ON_HOLD': '⏸️'
        };
        return icons[status] || '🔔';
    }

    getStatusColor(status) {
        const colors = {
            'SALES_APPROVED': '#10b981',
            'SALES_REJECTED': '#ef4444',
            'OPS_APPROVED': '#10b981',
            'OPS_REJECTED': '#ef4444',
            'NEEDS_REVISION': '#f59e0b',
            'COMPLETED': '#10b981',
            'IN_PROCESSING': '#3b82f6',
            'ON_HOLD': '#6b7280'
        };
        return colors[status] || '#6b7280';
    }

    getStatusPriority(status) {
        const priorities = {
            'SALES_REJECTED': 'HIGH',
            'OPS_REJECTED': 'HIGH',
            'NEEDS_REVISION': 'HIGH',
            'COMPLETED': 'MEDIUM',
            'SALES_APPROVED': 'MEDIUM',
            'OPS_APPROVED': 'MEDIUM',
            'IN_PROCESSING': 'LOW',
            'ON_HOLD': 'LOW'
        };
        return priorities[status] || 'MEDIUM';
    }
}

/**
 * React hook to use notification system
 */
export const useNotificationSystem = (db, user, actionLogger) => {
    const notificationSystemRef = useRef(null);

    useEffect(() => {
        if (user && db) {
            notificationSystemRef.current = new NotificationSystem(db, user, actionLogger);
            notificationSystemRef.current.initialize();

            return () => {
                if (notificationSystemRef.current) {
                    notificationSystemRef.current.cleanup();
                }
            };
        }
    }, [db, user, actionLogger]);

    return notificationSystemRef.current;
};

export default NotificationSystem;
