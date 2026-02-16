import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface UserPoints {
    balance: number;
    total_earned: number;
    reading_time_minutes: number;
    last_daily_bonus?: string; // ISO Date
}

@Injectable({
    providedIn: 'root'
})
export class GamificationService {
    private pointsSubject = new BehaviorSubject<UserPoints>(this.loadPoints());
    points$ = this.pointsSubject.asObservable();

    constructor() { }

    private loadPoints(): UserPoints {
        const saved = localStorage.getItem('kenouz_points');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            balance: 0,
            total_earned: 0,
            reading_time_minutes: 0
        };
    }

    private savePoints(points: UserPoints): void {
        localStorage.setItem('kenouz_points', JSON.stringify(points));
        this.pointsSubject.next(points);
    }

    addPoints(amount: number, reason: string): void {
        const current = this.pointsSubject.value;
        current.balance += amount;
        current.total_earned += amount;
        console.log(`Earned ${amount} points for: ${reason}`);
        this.savePoints(current);
    }

    spendPoints(amount: number): boolean {
        const current = this.pointsSubject.value;
        if (current.balance >= amount) {
            current.balance -= amount;
            this.savePoints(current);
            return true;
        }
        return false;
    }

    trackReadingTime(minutes: number): void {
        const current = this.pointsSubject.value;
        current.reading_time_minutes += minutes;

        // مكافأة لكل 5 دقائق قراءة
        const pointsToAdd = Math.floor(minutes / 5) * 10;
        if (pointsToAdd > 0) {
            this.addPoints(pointsToAdd, 'Reading Duration Bonus');
        }

        this.savePoints(current);
    }

    awardMemorizationPoints(pageNumber: number): void {
        this.addPoints(50, `Memorizing Page ${pageNumber}`);
    }
}
