import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MutabaaService, MutabaaPlan, DailyLog, MutabaaResponse } from '../../../../services/mutabaa.service';
import { QuranProgressService } from '../../../../services/quran-progress.service';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-mutabaa-tracker',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './mutabaa-tracker.component.html',
    styleUrls: ['./mutabaa-tracker.component.css']
})
export class MutabaaTrackerComponent implements OnInit {
    plan: MutabaaPlan | null = null;
    todayLog: DailyLog | null = null;
    loading = true;

    // UI State for "Soft Penalty"
    showPostponeDialog = false;
    postponeTarget: string | null = null;
    postponeMessage = '';

    // UI State for Setup/Settings Modal
    showSetupModal = false;
    newPlan: MutabaaPlan = {
        tilawoTarget: 2,
        hifzTarget: 0,
        murajaTarget: 0,
        deepMurajaTarget: 0
    };

    successMessage: string | null = null;

    constructor(
        private mutabaaService: MutabaaService,
        private quranProgressService: QuranProgressService
    ) { }

    ngOnInit() {
        this.loadData();

        // Listen for task updates from other components
        this.mutabaaService.taskUpdated$.subscribe(() => {
            console.log('🔄 [MutabaaTracker] Update Notification Received. Reloading...');
            this.loadData();
        });
    }

    quranProgress: any | null = null; // Store global progress stats

    // ... (rest of props)

    loadData() {
        this.loading = true;
        this.mutabaaService.getMutabaaData().subscribe({
            next: (res: MutabaaResponse) => {
                // console.log('Server Response:', res);
                if (res.success) {
                    this.plan = res.plan;
                    this.todayLog = res.todayLog;
                    this.quranProgress = res.quranProgress;
                    if (res.quranProgress) {
                        this.quranProgressService.setLocalProgress(res.quranProgress);
                    }
                }
                this.loading = false;
            },
            error: (err: any) => {
                console.error(err);
                this.loading = false;
            }
        });
    }

    // Template Helpers
    get types(): string[] {
        return ['tilawo', 'hifz', 'muraja', 'deepMuraja'];
    }

    getTarget(type: string): number {
        if (!this.plan) return 0;
        const key = type + 'Target';
        return (this.plan as any)[key] || 0;
    }

    getTaskStatus(type: string): string {
        if (!this.todayLog) return 'pending';
        return (this.todayLog as any)[type]?.status || 'pending';
    }

    getGlobalProgress(type: string): { percent: number, label: string } {
        if (!this.quranProgress) return { percent: 0, label: '0%' };

        const p = this.quranProgress;

        let val = 0;
        if (type === 'tilawo') {
            // Recitation: Based on pagesRead / 604
            val = ((p.pagesRead || 0) % 604) / 6.04;
        } else if (type === 'hifz') {
            // Memorization: Based on versesMemorized / 6236
            val = ((p.versesMemorized || 0) / 6236) * 100;
        } else {
            // Revision: Based on pagesReviewed
            val = ((p.pagesReviewed || 0) % 604) / 6.04;
        }

        return {
            percent: Math.min(100, Math.max(0, val)),
            label: val.toFixed(1) + '%'
        };
    }

    getDailyCompletionPercent(): number {
        if (!this.plan || !this.todayLog) return 0;
        let total = 0;
        let done = 0;
        const tasks: Array<'tilawo' | 'hifz' | 'muraja' | 'deepMuraja'> = ['tilawo', 'hifz', 'muraja', 'deepMuraja'];

        tasks.forEach(t => {
            if (this.getTarget(t) > 0) {
                total++;
                if (this.getTaskStatus(t) === 'done') done++;
            }
        });

        if (total === 0) return 0;
        return Math.round((done / total) * 100);
    }

    getPointsForTask(type: string): number {
        const amount = this.getTarget(type);
        if (type === 'hifz') return amount * 5;
        if (type === 'tilawo') return amount * 10;
        return amount * 5; // muraja & deepMuraja
    }

    markDoneWithRating(type: string, rating: string) {
        if (rating === 'retry') {
            this.requestPostpone(type);
            return;
        }

        const msg = rating === 'excellent' ? 'ما شاء الله! حفظ متقن 👑' : 'أحسنت! تقبل الله منك ✅';
        this.markDone(type, msg);
    }

    showSuccess(msg: string) {
        this.successMessage = msg;
        setTimeout(() => this.successMessage = null, 3000);
    }

    markDone(type: string, customMsg?: string) {
        // Cast to specific type for internal logic
        const specificType = type as 'tilawo' | 'hifz' | 'muraja' | 'deepMuraja';

        let amount = 0;
        if (this.plan) {
            if (specificType === 'tilawo') amount = this.plan.tilawoTarget;
            if (specificType === 'hifz') amount = this.plan.hifzTarget;
            if (specificType === 'muraja') amount = this.plan.murajaTarget;
            if (specificType === 'deepMuraja') amount = this.plan.deepMurajaTarget;
        }

        this.mutabaaService.updateTaskStatus(specificType, 'done', amount).subscribe({
            next: (res: any) => {
                if (res.success && this.todayLog) {
                    this.todayLog = res.todayLog;
                    this.quranProgress = res.quranProgress || this.quranProgress;
                    if (res.quranProgress) {
                        this.quranProgressService.setLocalProgress(res.quranProgress);
                    }
                    this.showSuccess(customMsg || 'ممتاز! تقبل الله منك 🌟');
                }
            }
        });
    }

    requestPostpone(type: string) {
        this.postponeTarget = type;
        this.postponeMessage = this.getPostponeMessage();
        this.showPostponeDialog = true;
    }

    confirmPostpone() {
        if (!this.postponeTarget) return;

        this.mutabaaService.updateTaskStatus(this.postponeTarget as any, 'postponed').subscribe({
            next: (res: any) => {
                if (res.success && this.todayLog) {
                    this.todayLog = res.todayLog;
                    this.quranProgress = res.quranProgress || this.quranProgress;
                    if (res.quranProgress) {
                        this.quranProgressService.setLocalProgress(res.quranProgress);
                    }
                    this.showPostponeDialog = false;
                }
            }
        });
    }

    cancelPostpone() {
        this.showPostponeDialog = false;
        this.postponeTarget = null;
    }

    getPostponeMessage(): string {
        const messages = [
            "القرآن يشتاق إليك... هل حقاً ستؤجله؟ 🥺",
            "وردك هو نور يومك، لا تطفئه بالتأجيل.",
            "قليل دائم خير من كثير منقطع... صفحة واحدة تكفي!",
            "هل أنت متأكد؟ الشيطان يحب هذا التأجيل..."
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }


    getTaskLabel(type: string): string {
        switch (type) {
            case 'tilawo': return 'التلاوة اليومية';
            case 'hifz': return 'الحفظ الجديد';
            case 'muraja': return 'المراجعة القريبة';
            case 'deepMuraja': return 'الماضي البعيد';
            default: return type;
        }
    }

    openSetup() {
        if (this.plan) {
            this.newPlan = { ...this.plan };
        }
        this.showSetupModal = true;
    }

    closeSetup() {
        this.showSetupModal = false;
    }

    savePlan() {
        console.log('[Mutabaa] Saving new plan:', this.newPlan);
        this.loading = true;
        this.mutabaaService.updatePlanSettings(this.newPlan).subscribe({
            next: (res: any) => {
                console.log('[Mutabaa] Server Response:', res);
                if (res.success) {
                    this.plan = res.plan;
                    // Update todayLog and quranProgress from server
                    if (res.todayLog) {
                        this.todayLog = res.todayLog;
                    }
                    if (res.quranProgress) {
                        this.quranProgress = res.quranProgress;
                        this.quranProgressService.setLocalProgress(res.quranProgress);
                    }

                    this.showSetupModal = false;
                    this.showSuccess('تم حفظ خطة المتابعة بنجاح! 🎉');
                    this.loading = false;
                } else {
                    this.loading = false;
                }
            },
            error: (err: any) => {
                console.error('[Mutabaa] Error saving plan:', err);
                this.loading = false;
            }
        });
    }
}
