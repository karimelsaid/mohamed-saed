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
    totalSteps = 3;
    isLoading = true; // Start loading true
    error = '';

    // ... variables ... 
    // We need to keep class properties intact, but ReplcementContent replaces text block.
    // So I will include the checks.

    userLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
    selectionTab: 'surah' | 'juz' = 'surah';
    memorizedSurahs: { surahId: number; surahName: string; strength: string }[] = [];
    surahList: SurahMetadata[] = [];
    juzList: JuzMetadata[] = [];
    searchQuery: string = '';
    isAllSelected: boolean = false;
    dailyCapacity: DailyCapacity = {
        recitationType: 'page',
        recitationAmount: 2,
        newMemorization: 'verse',
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
        forkJoin({
            metadata: this.dataService.getMetadata(),
            planData: this.hifzPlanService.getPlan()
        }).subscribe({
            next: (data) => {
                // 1. Setup Metadata
                this.surahList = data.metadata.surahs;
                this.juzList = data.metadata.juzs;

                // 2. Setup Existing Plan Data (if valid)
                if (data.planData && data.planData.plan) {
                    const plan = data.planData.plan;

                    // Restore User Level
                    if (plan.userLevel) this.userLevel = plan.userLevel;

                    // Restore Daily Capacity
                    if (plan.dailyCapacity) {
                        this.dailyCapacity = { ...this.dailyCapacity, ...plan.dailyCapacity };
                    }

                    // Restore Memorized Surahs
                    if (plan.memorizedContent && plan.memorizedContent.length > 0) {
                        const restoredSurahs = new Map<number, string>(); // id -> strength

                        plan.memorizedContent.forEach(v => {
                            const parts = v.verseKey.split(':');
                            const surahId = parseInt(parts[0]);
                            if (!restoredSurahs.has(surahId)) {
                                // Use the strength of the first encounter or keep logic simple
                                restoredSurahs.set(surahId, v.strength);
                            }
                        });

                        this.memorizedSurahs = [];
                        restoredSurahs.forEach((strength, surahId) => {
                            const meta = this.surahList.find(s => s.id === surahId);
                            if (meta) {
                                this.memorizedSurahs.push({
                                    surahId,
                                    surahName: meta.name,
                                    strength
                                });
                            }
                        });
                        this.checkAllSelected();
                    }
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading wizard data', err);
                this.isLoading = false;
                // Fallback: still let user use wizard but empty
            }
        });
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
            this.dailyCapacity.newMemorization = 'verse';
            this.dailyCapacity.memorizationDays = 3;
            this.dailyCapacity.reviewType = 'light';
        } else if (level === 'intermediate') {
            this.dailyCapacity.newMemorization = 'half_page';
            this.dailyCapacity.memorizationDays = 5;
            this.dailyCapacity.reviewType = 'weekly';
        } else {
            this.dailyCapacity.newMemorization = 'page';
            this.dailyCapacity.memorizationDays = 7;
            this.dailyCapacity.reviewType = 'rescue';
        }
    }

    toggleSurah(surahId: number, surahName: string): void {
        const idx = this.memorizedSurahs.findIndex(s => s.surahId === surahId);
        if (idx === -1) {
            this.memorizedSurahs.push({ surahId, surahName, strength: 'medium' });
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

        // Calculate end page for Juz if not present (Juz is roughly 20 pages)
        // Better: find next juz start page or user total pages (604)
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
                    this.memorizedSurahs.push({ surahId: s.id, surahName: s.name, strength: 'medium' });
                }
            });
        }

        console.log(`[HifzWizard] Memorized Surahs Updated. Count: ${this.memorizedSurahs.length}`);
        this.checkAllSelected();
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
                strength: 'medium'
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

    closeWizard(): void {
        this.close.emit();
    }

    saveSetup(): void {
        this.isLoading = true;
        this.error = '';

        const memorizedContent: MemorizedVerse[] = this.memorizedSurahs.map(s => ({
            verseKey: `${s.surahId}:1`,
            strength: s.strength as any
        }));

        const totalVerses = this.memorizedSurahs.reduce((sum, ms) => {
            const meta = this.surahList.find(s => s.id === ms.surahId);
            if (!meta?.verses_count) {
                console.warn(`[HifzWizard] Missing verses_count for Surah ${ms.surahId}`, meta);
            }
            return sum + (meta?.verses_count || 0);
        }, 0);

        // DEBUG: Alert user to confirm data presence
        alert(`جاري حفظ الخطة...\nعدد السور المختارة: ${this.memorizedSurahs.length}\nمجموع الآيات المحسوب: ${totalVerses}`);

        console.log('[HifzWizard] Calculated Total Verses:', totalVerses);
        console.log('[HifzWizard] Selected Surahs:', this.memorizedSurahs);
        console.log('[HifzWizard] First Surah Meta:', this.surahList[0]);

        this.hifzPlanService.saveSetup({
            userLevel: this.userLevel,
            dailyCapacity: this.dailyCapacity,
            memorizedContent,
            totalVersesMemorized: totalVerses
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
