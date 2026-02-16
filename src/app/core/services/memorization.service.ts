import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserProgress, PageProgress } from '../models/mushaf.model';

@Injectable({
    providedIn: 'root'
})
export class MemorizationService {
    private progressSubject = new BehaviorSubject<UserProgress>(this.loadProgress());
    progress$ = this.progressSubject.asObservable();

    constructor() {
        this.checkTransitions();
    }

    private loadProgress(): UserProgress {
        const saved = localStorage.getItem('kenouz_progress');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            current_page: 1,
            pages: [],
            last_activity: new Date().toISOString()
        };
    }

    saveProgress(progress: UserProgress): void {
        localStorage.setItem('kenouz_progress', JSON.stringify(progress));
        this.progressSubject.next(progress);
    }

    addPageToMemorization(pageNumber: number): void {
        const current = this.progressSubject.value;
        const existing = current.pages.find((p: PageProgress) => p.page_number === pageNumber);

        if (!existing) {
            current.pages.push({
                page_number: pageNumber,
                added_date: new Date().toISOString(),
                last_reviewed: new Date().toISOString(),
                level: 'new'
            });
            current.last_activity = new Date().toISOString();
            this.saveProgress(current);
        }
    }

    markAsForgotten(pageNumber: number): void {
        const current = this.progressSubject.value;
        const page = current.pages.find((p: PageProgress) => p.page_number === pageNumber);

        if (page) {
            page.level = 'forgotten';
            page.last_reviewed = new Date().toISOString();
            this.saveProgress(current);
        }
    }

    moveToReview(pageNumber: number): void {
        const current = this.progressSubject.value;
        const page = current.pages.find((p: PageProgress) => p.page_number === pageNumber);

        if (page) {
            page.level = 'review';
            page.last_reviewed = new Date().toISOString();
            this.saveProgress(current);
        }
    }

    private checkTransitions(): void {
        const current = this.progressSubject.value;
        let changed = false;
        const now = new Date();

        current.pages.forEach((page: PageProgress) => {
            if (page.level === 'new') {
                const added = new Date(page.added_date);
                const diffDays = (now.getTime() - added.getTime()) / (1000 * 3600 * 24);

                // الانتقال التلقائي بعد 4 أيام
                if (diffDays >= 4) {
                    page.level = 'review';
                    changed = true;
                }
            }
        });

        if (changed) {
            this.saveProgress(current);
        }
    }
}
