import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class MockLocalReminderService {

    constructor() { }

    async scheduleReminder(id: number, title: string, body: string, time: Date): Promise<void> {
        console.log(`[MockLocalReminder] Scheduled reminder ${id}: ${title} at ${time}`);
    }

    async cancelReminder(id: number): Promise<void> {
        console.log(`[MockLocalReminder] Cancelled reminder ${id}`);
    }

    async clearAll(): Promise<void> {
        console.log('[MockLocalReminder] Cleared all reminders');
    }

    async requestPermissions(): Promise<boolean> {
        return true;
    }

    getStoredReminders(): any {
        return {
            recitation: { enabled: false, time: '00:00' },
            memorization: { enabled: false, time: '00:00' },
            revision: { enabled: false, time: '00:00' },
            kahfFriday: { enabled: false, time: '00:00' }
        };
    }

    async scheduleReminders(reminders: any): Promise<void> {
        return;
    }
}
