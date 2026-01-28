import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { forkJoin } from 'rxjs';
import { HifzPlanService, DailyCapacity, MemorizedVerse } from '../../../../services/hifz-plan.service';
import { MushafDataService } from '../../../../core/services/mushaf-data.service';
import { SurahMetadata, JuzMetadata } from '../../../../core/models/mushaf.model';

@Component({
    selector: 'app-hifz-wizard',
    standalone: false,
    templateUrl: './hifz-wizard.component.html',
    styleUrls: ['./hifz-wizard.component.css']
})
export class HifzWizardComponent implements OnInit {
    @Output() setupComplete = new EventEmitter<void>();
    @Output() close = new EventEmitter<void>();

    currentStep = 1;
    totalSteps = 2; // Reduced from 3 (removed Level Selection step)
    isLoading = true; // Start loading true
    error = '';
    resetProgress = false;

    // Weekday labels (Sat=0 to Fri=6)
    weekdayLabels = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

    // Per-task weekday selection (default: all days)
    tilawaDays: number[] = [0, 1, 2, 3, 4, 5, 6];
    hifzDays: number[] = [0, 1, 2, 3, 4, 5, 6];
    murajaDays: number[] = [0, 1, 2, 3, 4, 5, 6];
    rabtDays: number[] = [0, 1, 2, 3, 4, 5, 6];

    userLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
    selectionTab: 'surah' | 'juz' = 'surah';
    memorizedSurahs: {
        surahId: number;
        surahName: string;
        strength: string;
        memorizedVerseCount?: number;
        totalVerses?: number;
        fromVerse?: number;
        toVerse?: number;
        showRangeSettings?: boolean;
    }[] = [];
    surahList: SurahMetadata[] = [];
    juzList: JuzMetadata[] = [];
    searchQuery: string = '';
    isAllSelected: boolean = false;
    dailyCapacity: DailyCapacity = {
        recitationType: 'page',
        recitationAmount: 2,
        newMemorization: 'verse',
        memorizationAmount: 5, // Default for 'verses' type
        memorizationDays: 5,
        reviewType: 'light',
        reviewAmount: 1
    };

    constructor(
        private hifzPlanService: HifzPlanService,
        private dataService: MushafDataService
    ) { }

    ngOnInit(): void {
        this.loadInitialData();
    }

    private loadInitialData(): void {
        this.isLoading = true;
        this.error = '';

        forkJoin({
            metadata: this.dataService.getMetadata(),
            planData: this.hifzPlanService.getPlan()
        }).subscribe({
            next: (data) => {
                if (data.metadata) {
                    this.surahList = data.metadata.surahs;
                    this.juzList = data.metadata.juzs;
                }

                if (data.planData && data.planData.plan) {
                    const plan = data.planData.plan;
                    if (plan.userLevel) this.userLevel = plan.userLevel;
                    if (plan.dailyCapacity) {
                        this.dailyCapacity = { ...this.dailyCapacity, ...plan.dailyCapacity };

                        // Restore weekday selections from saved plan
                        if (plan.dailyCapacity.tilawaDays) {
                            this.tilawaDays = [...plan.dailyCapacity.tilawaDays];
                        }
                        if (plan.dailyCapacity.hifzDays) {
                            this.hifzDays = [...plan.dailyCapacity.hifzDays];
                        }
                        if (plan.dailyCapacity.murajaDays) {
                            this.murajaDays = [...plan.dailyCapacity.murajaDays];
                        }
                        if (plan.dailyCapacity.rabtDays) {
                            this.rabtDays = [...plan.dailyCapacity.rabtDays];
                        }
                    }

                    if (plan.memorizedContent && plan.memorizedContent.length > 0) {
                        // Group verses by Surah ID and count
                        const surahVerseCountMap = new Map<number, { count: number; strength: string; min: number; max: number }>();
                        plan.memorizedContent.forEach(v => {
                            const parts = v.verseKey.split(':');
                            const surahId = parseInt(parts[0]);
                            const verseNum = parseInt(parts[1]);
                            if (surahVerseCountMap.has(surahId)) {
                                const current = surahVerseCountMap.get(surahId)!;
                                current.count++;
                                if (verseNum < current.min) current.min = verseNum;
                                if (verseNum > current.max) current.max = verseNum;
                            } else {
                                surahVerseCountMap.set(surahId, {
                                    count: 1,
                                    strength: v.strength || 'medium',
                                    min: verseNum,
                                    max: verseNum
                                });
                            }
                        });

                        this.memorizedSurahs = [];
                        surahVerseCountMap.forEach((data, surahId) => {
                            const meta = this.surahList.find(s => s.id === surahId);
                            if (meta) {
                                this.memorizedSurahs.push({
                                    surahId,
                                    surahName: meta.name,
                                    strength: data.strength,
                                    memorizedVerseCount: data.count,
                                    totalVerses: meta.verses_count,
                                    fromVerse: data.min,
                                    toVerse: data.max
                                });
                            }
                        });
                        this.checkAllSelected();
                    }
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('[HifzWizard] Error loading initial data:', err);
                this.isLoading = false;
                this.error = 'فشل تحميل البيانات. يرجى التأكد من الاتصال بالإنترنت.';

                // Even with error, we try to load whatever we have in surahList from dataService
                // (It might have been loaded partially or earlier)
            }
        });

        // Fail-safe: if metadata is not loaded in 5 seconds, try to stop loading
        setTimeout(() => {
            if (this.isLoading && this.surahList.length === 0) {
                this.isLoading = false;
                console.warn('[HifzWizard] Loading timeout hit.');
            }
        }, 5000);
    }

    nextStep(): void {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
        } else {
            this.saveSetup();
        }
    }

    prevStep(): void {
        if (this.currentStep > 1) {
            this.currentStep--;
        }
    }

    selectLevel(level: 'beginner' | 'intermediate' | 'advanced'): void {
        this.userLevel = level;
        if (level === 'beginner') {
            this.dailyCapacity.newMemorization = 'verses'; // Plural for multiple
            this.dailyCapacity.memorizationAmount = 3;
            this.dailyCapacity.memorizationDays = 3;
            this.dailyCapacity.reviewType = 'light';
            this.dailyCapacity.reviewAmount = 1;
        } else if (level === 'intermediate') {
            this.dailyCapacity.newMemorization = 'half_page';
            this.dailyCapacity.memorizationAmount = 1;
            this.dailyCapacity.memorizationDays = 5;
            this.dailyCapacity.reviewType = 'weekly';
            this.dailyCapacity.reviewAmount = 1;
        } else {
            this.dailyCapacity.newMemorization = 'page';
            this.dailyCapacity.memorizationAmount = 1;
            this.dailyCapacity.memorizationDays = 7;
            this.dailyCapacity.reviewType = 'rescue';
            this.dailyCapacity.reviewAmount = 1;
        }
    }

    toggleSurah(surahId: number, surahName: string): void {
        const idx = this.memorizedSurahs.findIndex(s => s.surahId === surahId);
        if (idx === -1) {
            const meta = this.surahList.find(s => s.id === surahId);
            this.memorizedSurahs.push({
                surahId,
                surahName,
                strength: 'medium',
                totalVerses: meta?.verses_count || 0,
                memorizedVerseCount: meta?.verses_count || 0,
                fromVerse: 1,
                toVerse: meta?.verses_count || 0
            });
        } else {
            this.memorizedSurahs.splice(idx, 1);
        }
        this.checkAllSelected();
    }

    isSurahSelected(surahId: number): boolean {
        return this.memorizedSurahs.some(s => s.surahId === surahId);
    }

    toggleJuz(juzId: number): void {
        const juz = this.juzList.find(j => j.id === juzId);
        if (!juz) return;

        const nextJuz = this.juzList.find(j => j.id === juzId + 1);
        const startPage = juz.start_page;
        const endPage = nextJuz ? nextJuz.start_page - 1 : 604;

        const surahsInJuz = this.surahList.filter(s =>
            (s.start_page >= startPage && s.start_page <= endPage) ||
            (s.end_page >= startPage && s.end_page <= endPage) ||
            (s.start_page <= startPage && s.end_page >= endPage)
        );

        const allSelected = surahsInJuz.every(s => this.isSurahSelected(s.id));

        if (allSelected) {
            surahsInJuz.forEach(s => {
                const idx = this.memorizedSurahs.findIndex(ms => ms.surahId === s.id);
                if (idx !== -1) this.memorizedSurahs.splice(idx, 1);
            });
        } else {
            surahsInJuz.forEach(s => {
                if (!this.isSurahSelected(s.id)) {
                    this.memorizedSurahs.push({
                        surahId: s.id,
                        surahName: s.name,
                        strength: 'medium',
                        totalVerses: s.verses_count,
                        memorizedVerseCount: s.verses_count,
                        fromVerse: 1,
                        toVerse: s.verses_count
                    });
                }
            });
        }
        this.checkAllSelected();
    }

    toggleRangeSettings(surah: any): void {
        surah.showRangeSettings = !surah.showRangeSettings;
    }

    getVerseRange(count: number | undefined): number[] {
        if (!count) return [];
        return Array.from({ length: count }, (_, i) => i + 1);
    }

    updateCount(surah: any): void {
        const from = surah.fromVerse || 1;
        const to = surah.toVerse || surah.totalVerses || 0;
        if (to >= from && from > 0) {
            surah.memorizedVerseCount = to - from + 1;
        } else {
            surah.memorizedVerseCount = 0;
        }
    }

    getSurahPercent(surahId: number): number {
        const ms = this.memorizedSurahs.find(s => s.surahId === surahId);
        if (!ms || !ms.memorizedVerseCount || !ms.totalVerses) return 0;
        return Math.round((ms.memorizedVerseCount / ms.totalVerses) * 100);
    }

    isJuzSelected(juzId: number): boolean {
        const juz = this.juzList.find(j => j.id === juzId);
        if (!juz) return false;

        const nextJuz = this.juzList.find(j => j.id === juzId + 1);
        const startPage = juz.start_page;
        const endPage = nextJuz ? nextJuz.start_page - 1 : 604;

        const surahsInJuz = this.surahList.filter(s =>
            (s.start_page >= startPage && s.start_page <= endPage) ||
            (s.end_page >= startPage && s.end_page <= endPage) ||
            (s.start_page <= startPage && s.end_page >= endPage)
        );

        return surahsInJuz.length > 0 && surahsInJuz.every(s => this.isSurahSelected(s.id));
    }

    toggleSelectAll(): void {
        if (this.isAllSelected) {
            this.memorizedSurahs = [];
        } else {
            this.memorizedSurahs = this.surahList.map(s => ({
                surahId: s.id,
                surahName: s.name,
                strength: 'medium',
                totalVerses: s.verses_count,
                memorizedVerseCount: s.verses_count,
                fromVerse: 1,
                toVerse: s.verses_count
            }));
        }
        this.isAllSelected = !this.isAllSelected;
    }

    checkAllSelected(): void {
        this.isAllSelected = this.surahList.length > 0 && this.memorizedSurahs.length === this.surahList.length;
    }

    get filteredSurahs() {
        if (!this.searchQuery) return this.surahList;
        return this.surahList.filter(s => s.name.includes(this.searchQuery));
    }

    get hasMemorization(): boolean {
        return this.memorizedSurahs.length > 0;
    }

    updateSurahStrength(surahId: number, strength: string): void {
        const surah = this.memorizedSurahs.find(s => s.surahId === surahId);
        if (surah) surah.strength = strength;
    }

    // --- Weekday Selection Methods ---
    toggleDay(taskType: 'tilawa' | 'hifz' | 'muraja' | 'rabt', dayIndex: number): void {
        const daysArray = this.getDaysArray(taskType);
        const idx = daysArray.indexOf(dayIndex);
        if (idx === -1) {
            daysArray.push(dayIndex);
            daysArray.sort((a, b) => a - b);
        } else {
            daysArray.splice(idx, 1);
        }
    }

    toggleAllDays(taskType: 'tilawa' | 'hifz' | 'muraja' | 'rabt'): void {
        const daysArray = this.getDaysArray(taskType);
        if (daysArray.length === 7) {
            // Clear all
            daysArray.length = 0;
        } else {
            // Select all
            daysArray.length = 0;
            daysArray.push(0, 1, 2, 3, 4, 5, 6);
        }
    }

    isDaySelected(taskType: 'tilawa' | 'hifz' | 'muraja' | 'rabt', dayIndex: number): boolean {
        return this.getDaysArray(taskType).includes(dayIndex);
    }

    areAllDaysSelected(taskType: 'tilawa' | 'hifz' | 'muraja' | 'rabt'): boolean {
        return this.getDaysArray(taskType).length === 7;
    }

    private getDaysArray(taskType: 'tilawa' | 'hifz' | 'muraja' | 'rabt'): number[] {
        switch (taskType) {
            case 'tilawa': return this.tilawaDays;
            case 'hifz': return this.hifzDays;
            case 'muraja': return this.murajaDays;
            case 'rabt': return this.rabtDays;
        }
    }

    closeWizard(): void {
        this.close.emit();
    }

    saveSetup(): void {
        // Validate: At least one day must be selected for each active task
        const validationErrors: string[] = [];

        if (this.tilawaDays.length === 0) {
            validationErrors.push('ورد التلاوة');
        }
        if (this.hifzDays.length === 0) {
            validationErrors.push('الحفظ الجديد');
        }
        // مراجعة required only if user has memorization
        if (this.hasMemorization && this.murajaDays.length === 0) {
            validationErrors.push('المراجعة البعيدة');
        }

        if (validationErrors.length > 0) {
            this.error = `يجب تحديد يوم واحد على الأقل لـ: ${validationErrors.join('، ')}`;
            return;
        }

        this.isLoading = true;
        this.error = '';

        const memorizedContent: MemorizedVerse[] = [];
        let totalVersesFactor = 0;

        this.memorizedSurahs.forEach(ms => {
            const meta = this.surahList.find(s => s.id === ms.surahId);
            if (meta) {
                const start = ms.fromVerse || 1;
                const end = ms.toVerse || meta.verses_count;
                for (let v = start; v <= end; v++) {
                    memorizedContent.push({
                        verseKey: `${ms.surahId}:${v}`,
                        strength: ms.strength as any
                    });
                    totalVersesFactor++;
                }
            }
        });

        // --- NEW: Calculate first unmemorized verse as the starting position ---
        let currentPosition = { surah: 1, verse: 1 };
        const memoSet = new Set(memorizedContent.map(m => m.verseKey));

        // Loop through Quran to find the first "gap"
        let found = false;
        for (const surah of this.surahList) {
            for (let v = 1; v <= surah.verses_count; v++) {
                if (!memoSet.has(`${surah.id}:${v}`)) {
                    currentPosition = { surah: surah.id, verse: v };
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        // Merge weekday selections into dailyCapacity
        const fullCapacity = {
            ...this.dailyCapacity,
            tilawaDays: this.tilawaDays,
            hifzDays: this.hifzDays,
            murajaDays: this.murajaDays,
            rabtDays: this.rabtDays
        };

        this.hifzPlanService.saveSetup({
            userLevel: this.userLevel,
            dailyCapacity: fullCapacity,
            memorizedContent,
            totalVersesMemorized: totalVersesFactor,
            resetProgress: this.resetProgress,
            currentPosition // Pass explicitly to advance the cursor to the first gap
        }).subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res.success) {
                    this.setupComplete.emit();
                } else {
                    this.error = 'حدث خطأ أثناء حفظ الإعدادات';
                }
            },
            error: (err) => {
                this.isLoading = false;
                this.error = err.error?.message || 'حدث خطأ في الاتصال';
            }
        });
    }
}
