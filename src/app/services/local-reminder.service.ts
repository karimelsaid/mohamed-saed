import { Injectable, NgZone } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';

export interface ReminderSettings {
    recitation: { enabled: boolean; time: string };
    memorization: { enabled: boolean; time: string };
    revision: { enabled: boolean; time: string };
    kahfFriday: { enabled: boolean; time: string };
}

interface ScheduledNotification {
    id: string;
    type: 'recitation' | 'memorization' | 'revision' | 'kahfFriday';
    scheduledTime: number; // timestamp
    title: string;
    body: string;
}

@Injectable({
    providedIn: 'root'
})
export class LocalReminderService {
    private readonly STORAGE_KEY = 'local_reminders';
    private readonly NOTIFICATION_STORAGE_KEY = 'scheduled_notifications';
    private checkInterval: any = null;
    private readonly CHECK_INTERVAL_MS = 60000; // Check every minute

    constructor(
        private zone: NgZone,
        private router: Router
    ) {
        // Initialize on service creation
        // Initialize on service creation
        // this.initializeReminders();
        // this.setupNotificationListeners();
    }

    /**
     * Initialize and start checking reminders
     */
    initializeReminders(): void {
        // Clear any old scheduled notifications
        if (Capacitor.isNativePlatform()) {
            this.requestPermissions();
        } else {
            this.clearOldNotifications();
            // Start periodic check only for web
            this.startPeriodicCheck();
        }

        // Check immediately on load
        this.checkAndTriggerReminders();

        // Listen for visibility changes to check when app becomes visible
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    this.checkAndTriggerReminders();
                }
            });
        }
    }

    /**
     * Request permissions for notifications
     */
    async requestPermissions(): Promise<boolean> {
        if (Capacitor.isNativePlatform()) {
            const result = await LocalNotifications.requestPermissions();
            return result.display === 'granted';
        } else {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
    }

    /**
     * Setup listeners for notification actions
     */
    private setupNotificationListeners() {
        if (Capacitor.isNativePlatform()) {
            LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
                this.zone.run(() => {
                    if (this.router.url !== '/mushaf') {
                        this.router.navigate(['/mushaf']);
                    }
                });
            });
        }
    }

    /**
     * Schedule reminders based on current settings
     */
    async scheduleReminders(reminders: ReminderSettings): Promise<void> {
        const scheduled: ScheduledNotification[] = [];

        // For native: Cancel all pending notifications first to avoid duplicates
        if (Capacitor.isNativePlatform()) {
            const pending = await LocalNotifications.getPending();
            if (pending.notifications.length > 0) {
                await LocalNotifications.cancel(pending);
            }
        }

        // Helper to get today's date at specific time
        const getTimeToday = (timeStr: string): Date => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const today = new Date();
            today.setHours(hours, minutes, 0, 0);
            return today;
        };

        // Helper to get next occurrence (if time has passed today, schedule for tomorrow)
        const getNextOccurrence = (timeStr: string): Date => {
            const targetTime = getTimeToday(timeStr);
            const now = new Date();
            if (targetTime <= now) {
                // Time has passed today, schedule for tomorrow
                targetTime.setDate(targetTime.getDate() + 1);
            }
            return targetTime;
        };

        // 1. Recitation Reminder
        if (reminders.recitation.enabled) {
            const nextTime = getNextOccurrence(reminders.recitation.time);
            scheduled.push({
                id: `recitation_${nextTime.getTime()}`,
                type: 'recitation',
                scheduledTime: nextTime.getTime(),
                title: '📖 ورد التلاوة',
                body: 'حان الآن موعد ورد التلاوة اليومي. افتح المصحف وابدأ رحلتك.'
            });
        }

        // 2. Memorization Reminder
        if (reminders.memorization.enabled) {
            const nextTime = getNextOccurrence(reminders.memorization.time);
            scheduled.push({
                id: `memorization_${nextTime.getTime()}`,
                type: 'memorization',
                scheduledTime: nextTime.getTime(),
                title: '🧠 ورد الحفظ',
                body: 'حان الآن موعد ورد الحفظ اليومي. افتح المصحف وابدأ حفظك الجديد.'
            });
        }

        // 3. Revision Reminder
        if (reminders.revision.enabled) {
            const nextTime = getNextOccurrence(reminders.revision.time);
            scheduled.push({
                id: `revision_${nextTime.getTime()}`,
                type: 'revision',
                scheduledTime: nextTime.getTime(),
                title: '📚 ورد المراجعة',
                body: 'حان الآن موعد ورد المراجعة. افتح المصحف وراجع محفوظك السابق.'
            });
        }

        // 4. Kahf Friday Reminder (only on Fridays)
        if (reminders.kahfFriday.enabled) {
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
            const isFriday = dayOfWeek === 5;

            if (isFriday) {
                const nextTime = getNextOccurrence(reminders.kahfFriday.time);
                // Only schedule if it's Friday and time hasn't passed
                if (nextTime.getDay() === 5) {
                    scheduled.push({
                        id: `kahfFriday_${nextTime.getTime()}`,
                        type: 'kahfFriday',
                        scheduledTime: nextTime.getTime(),
                        title: '🕌 تذكير قراءة سورة الكهف',
                        body: 'يوم الجمعة المبارك! تذكر قراءة سورة الكهف اليوم.'
                    });
                }
            }
        }

        // Save to localStorage
        try {
            localStorage.setItem(this.NOTIFICATION_STORAGE_KEY, JSON.stringify(scheduled));
            console.log(`[LocalReminder] Scheduled ${scheduled.length} reminders`);

            // If native, actually schedule them with the OS
            if (Capacitor.isNativePlatform()) {
                const nativeNotifications = scheduled.map(n => ({
                    id: Math.floor(n.scheduledTime / 1000), // Integer ID for Capacitor
                    title: n.title,
                    body: n.body,
                    schedule: { at: new Date(n.scheduledTime), allowWhileIdle: true },
                    sound: undefined,
                    attachments: undefined,
                    actionTypeId: '',
                    extra: {
                        type: n.type,
                        originalId: n.id
                    }
                }));

                if (nativeNotifications.length > 0) {
                    await LocalNotifications.schedule({ notifications: nativeNotifications });
                    console.log(`[LocalReminder] Native: Scheduled ${nativeNotifications.length} notifications`);
                }
            }

        } catch (e) {
            console.error('[LocalReminder] Failed to save scheduled reminders:', e);
        }

        // Save reminder settings
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reminders));
        } catch (e) {
            console.error('[LocalReminder] Failed to save reminder settings:', e);
        }
    }

    /**
     * Check if current time matches any scheduled reminder and trigger notification
     */
    checkAndTriggerReminders(): void {
        try {
            const stored = localStorage.getItem(this.NOTIFICATION_STORAGE_KEY);
            if (!stored) return;

            const scheduled: ScheduledNotification[] = JSON.parse(stored);
            const now = Date.now();
            const currentTimeStr = this.getCurrentTimeString();

            scheduled.forEach(notification => {
                const timeDiff = notification.scheduledTime - now;

                // Check if time has arrived (within 1 minute window)
                if (timeDiff >= 0 && timeDiff <= this.CHECK_INTERVAL_MS) {
                    console.log(`[LocalReminder] Triggering reminder: ${notification.type}`);
                    this.showNotification(notification.title, notification.body);

                    // Remove this notification from schedule
                    this.removeScheduledNotification(notification.id);

                    // Reschedule for next day if it's a recurring reminder
                    if (notification.type !== 'kahfFriday') {
                        this.rescheduleReminder(notification);
                    }
                }
            });

            // Also check current time match (backup method)
            this.checkCurrentTimeMatch();

        } catch (e) {
            console.error('[LocalReminder] Error checking reminders:', e);
        }
    }

    /**
     * Check if current time matches reminder settings (backup method)
     */
    private checkCurrentTimeMatch(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return;

            const reminders: ReminderSettings = JSON.parse(stored);
            const currentTimeStr = this.getCurrentTimeString();

            // Check each reminder type
            if (reminders.recitation.enabled && reminders.recitation.time === currentTimeStr) {
                this.showNotification('📖 ورد التلاوة', 'حان الآن موعد ورد التلاوة اليومي. افتح المصحف وابدأ رحلتك.');
            }
            if (reminders.memorization.enabled && reminders.memorization.time === currentTimeStr) {
                this.showNotification('🧠 ورد الحفظ', 'حان الآن موعد ورد الحفظ اليومي. افتح المصحف وابدأ حفظك الجديد.');
            }
            if (reminders.revision.enabled && reminders.revision.time === currentTimeStr) {
                this.showNotification('📚 ورد المراجعة', 'حان الآن موعد ورد المراجعة. افتح المصحف وراجع محفوظك السابق.');
            }

            // Check Friday reminder
            const today = new Date();
            if (today.getDay() === 5 && reminders.kahfFriday.enabled && reminders.kahfFriday.time === currentTimeStr) {
                this.showNotification('🕌 تذكير قراءة سورة الكهف', 'يوم الجمعة المبارك! تذكر قراءة سورة الكهف اليوم.');
            }

        } catch (e) {
            console.error('[LocalReminder] Error in current time match check:', e);
        }
    }

    /**
     * Get current time string in HH:MM format
     */
    private getCurrentTimeString(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Show browser notification
     */
    private async showNotification(title: string, body: string): Promise<void> {
        // Check if notifications are supported
        if (!('Notification' in window)) {
            console.warn('[LocalReminder] Notifications not supported');
            return;
        }

        // Check permission
        if (Notification.permission === 'granted') {
            // Show notification
            const notification = new Notification(title, {
                body: body,
                icon: '/assets/icons/icon-192x192.png',
                badge: '/assets/icons/icon-192x192.png',
                tag: 'quran-reminder',
                requireInteraction: false
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
                // Navigate to mushaf page
                if (window.location.pathname !== '/mushaf') {
                    window.location.href = '/mushaf';
                }
            };

            // Auto close after 5 seconds
            setTimeout(() => {
                notification.close();
            }, 5000);

        } else if (Notification.permission === 'default') {
            // Request permission
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                // Retry showing notification
                this.showNotification(title, body);
            }
        }
    }

    /**
     * Remove a scheduled notification
     */
    private removeScheduledNotification(id: string): void {
        try {
            const stored = localStorage.getItem(this.NOTIFICATION_STORAGE_KEY);
            if (!stored) return;

            const scheduled: ScheduledNotification[] = JSON.parse(stored);
            const filtered = scheduled.filter(n => n.id !== id);
            localStorage.setItem(this.NOTIFICATION_STORAGE_KEY, JSON.stringify(filtered));
        } catch (e) {
            console.error('[LocalReminder] Error removing scheduled notification:', e);
        }
    }

    /**
     * Reschedule a reminder for next day
     */
    private rescheduleReminder(notification: ScheduledNotification): void {
        const nextDay = new Date(notification.scheduledTime);
        nextDay.setDate(nextDay.getDate() + 1);

        const updated: ScheduledNotification = {
            ...notification,
            id: `${notification.type}_${nextDay.getTime()}`,
            scheduledTime: nextDay.getTime()
        };

        try {
            const stored = localStorage.getItem(this.NOTIFICATION_STORAGE_KEY);
            const scheduled: ScheduledNotification[] = stored ? JSON.parse(stored) : [];
            scheduled.push(updated);
            localStorage.setItem(this.NOTIFICATION_STORAGE_KEY, JSON.stringify(scheduled));
        } catch (e) {
            console.error('[LocalReminder] Error rescheduling reminder:', e);
        }
    }

    /**
     * Clear old notifications (older than today)
     */
    private clearOldNotifications(): void {
        try {
            const stored = localStorage.getItem(this.NOTIFICATION_STORAGE_KEY);
            if (!stored) return;

            const scheduled: ScheduledNotification[] = JSON.parse(stored);
            const now = Date.now();
            const filtered = scheduled.filter(n => n.scheduledTime > now);
            localStorage.setItem(this.NOTIFICATION_STORAGE_KEY, JSON.stringify(filtered));
        } catch (e) {
            console.error('[LocalReminder] Error clearing old notifications:', e);
        }
    }

    /**
     * Start periodic check for reminders
     */
    private startPeriodicCheck(): void {
        // Clear any existing interval
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Start new interval
        this.checkInterval = setInterval(() => {
            this.checkAndTriggerReminders();
        }, this.CHECK_INTERVAL_MS);
    }

    /**
     * Stop periodic check
     */
    stopPeriodicCheck(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Get stored reminder settings
     */
    getStoredReminders(): ReminderSettings | null {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            console.error('[LocalReminder] Error getting stored reminders:', e);
            return null;
        }
    }
}
