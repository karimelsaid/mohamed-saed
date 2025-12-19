import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCoins, faUser } from '@fortawesome/free-solid-svg-icons';
import { GamificationService, GamificationProfile, Challenge } from '../../services/gamification.service';
import { SharedModule } from '../../shared/shared.module';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../environments/environment';

import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-gamification-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule, SharedModule, RouterModule],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css']
})
export class GamificationDashboardComponent implements OnInit {
    faCoins = faCoins;
    faUser = faUser;
    profile: GamificationProfile | null = null;
    challenges: Challenge[] = [];
    leaderboard: any[] = [];
    loading = true;
    showAchievementCard = false;
    isLoggedIn = false;
    baseUrl = environment.apiBaseUrl; // Expose for template

    constructor(
        private gamificationService: GamificationService,
        private authService: AuthService
    ) { }

    getImageUrl(path: string | undefined): string {
        if (!path) return '';
        if (path.startsWith('http')) return path;

        // Normalize path: replace backslashes with forward slashes
        let cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

        // Static files are usually served from root, not /api
        // If apiBaseUrl ends with /api, strip it
        const staticBaseUrl = this.baseUrl.endsWith('/api')
            ? this.baseUrl.slice(0, -4)
            : this.baseUrl;

        return `${staticBaseUrl}/${cleanPath}`;
    }

    ngOnInit(): void {
        this.authService.isLoggedIn$.subscribe(status => {
            this.isLoggedIn = status;
            this.loadData();
        });
    }

    loadData() {
        this.loading = true;

        // Only load personal data if logged in
        if (this.isLoggedIn) {
            // Load Profile
            this.gamificationService.getProfile().subscribe({
                next: (res) => {
                    if (res.success) this.profile = res.data;
                },
                error: (err) => console.error(err)
            });

            // Load Challenges
            this.gamificationService.getChallenges().subscribe({
                next: (res) => {
                    if (res.success) this.challenges = res.data;
                },
                error: (err) => console.error(err)
            });
        }

        // Always Load Leaderboard
        this.gamificationService.getLeaderboard().subscribe({
            next: (res) => {
                if (res.success) this.leaderboard = res.data;
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.loading = false;
            }
        });
    }

    calculateLevelProgress(): number {
        if (!this.profile) return 0;
        // Simple estimation based on "Next Level XP" being the Total XP needed for next level
        // and assuming current level base is prev level total.
        // For visual simplicity, we can just show XP % relative to next level target if it's cumulative?
        // Let's assume NextLevelXP provided by backend is the TARGET XP.
        // Progress = (Current XP - Previous Level XP) / (Next Level XP - Previous Level XP)

        // Reverse engineer Previous Level XP for formula: 100 * (level-1)^1.5
        const currentLevel = this.profile.level;
        const prevLevelXP = 100 * Math.pow(currentLevel - 1, 1.5); // 0 for level 1
        const nextLevelXP = 100 * Math.pow(currentLevel, 1.5); // Wait, backend sends nextLevelXP for L+1

        // The backend `nextLevelXP` is for Level+1.
        // `xp` is current TOTAL XP.

        // Example: Lvl 1. XP 50. Target 100.
        // Prev (Lvl 1 base) = 100 * 0^1.5 = 0.
        // Range = 0 to 100. Progress = 50%.

        // Example: Lvl 2. XP 150. Target 282.
        // Lvl 2 Base = 100 * 1^1.5 = 100.
        // Range = 100 to 282 (Size 182).
        // Progress = (150 - 100) = 50. 
        // % = 50 / 182 * 100 = 27%.

        const levelBaseXP = 100 * Math.pow(currentLevel - 1, 1.5); // Should equal start of this level
        // Note: My formula in backend was 100 * L^1.5 for L. 
        // Means Level 1 requires 0 XP. 
        // Level 2 requires 100 XP.

        // So if I am Level 1, Base is 0. Next Target is 100.
        // If I am Level 2, Base is 100. Next Target is 282.

        // Backend nextLevelXP is pre-calculated target for L+1.
        const baseXP = 100 * Math.pow(Math.max(0, currentLevel - 1), 1.5);

        // If we have profile.nextLevelXP from backend
        const target = this.profile.nextLevelXP;
        const totalCurrent = this.profile.xp;

        const earnedInLevel = totalCurrent - baseXP;
        const requiredInLevel = target - baseXP;

        if (requiredInLevel <= 0) return 100;

        return Math.min(100, Math.max(0, (earnedInLevel / requiredInLevel) * 100));
    }

    joinChallenge(challenge: Challenge) {
        if (!challenge._id) return;
        this.gamificationService.joinChallenge(challenge._id).subscribe({
            next: (res) => {
                if (res.success) {
                    challenge.joined = true;
                    challenge.status = 'active';
                }
            }
        });
    }

    claimReward(challenge: Challenge) {
        if (!challenge.userChallengeId) return;
        this.gamificationService.claimReward(challenge.userChallengeId).subscribe({
            next: (res) => {
                if (res.success) {
                    challenge.rewardsClaimed = true;
                    // Optimistic update of XP
                    if (this.profile) {
                        this.profile.xp += challenge.xpReward;
                    }
                    alert(`🎉 تم الحصول على ${challenge.xpReward} نقطة!`);
                }
            }
        });
    }

    // --- UI Helper Getters ---

    get hasReadToday(): boolean {
        if (!this.profile || !this.profile.currentStreak) return false;
        // Using the same logic as backend: Check if lastStreakUpdate is today (UTC)
        // However, since we don't have lastStreakUpdate in the interface yet, let's assume if streak > 0 
        // AND we want to be strict, we need that field.
        // But for now, let's rely on a check.
        // Wait, 'currentStreak' is updated on read. 
        // Actually, if I read yesterday, streak is 1. If I read today, streak becomes 2.
        // We need 'lastStreakUpdate' in the profile interface to be accurate.
        // Let's add it to the interface first if missing.
        // For now, let's assume if we just synced, it's true.
        // Better: The user profile should return 'lastStreakUpdate'.
        // I will assume profile has it (it was in the service code I saw).

        // Actually, let's look at the backend service 'getUserProfile'. 
        // It selects 'gamification username email referralCode referralBalance profileImage'.
        // 'gamification' object includes 'lastStreakUpdate'.
        // So I need to cast profile as any or update interface. I'll cast for now or update interface.

        const lastUpdate = (this.profile as any).lastStreakUpdate;
        if (!lastUpdate) return false;

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const lastUpdateStr = new Date(lastUpdate).toISOString().split('T')[0];

        return todayStr === lastUpdateStr;
    }

    get nextStreakMilestone(): number {
        const current = this.profile?.currentStreak || 0;
        // User requested 7-14-30 system. 
        // We start with 7 to establish the weekly habit.
        const milestones = [7, 14, 30, 60, 90, 365];
        for (const m of milestones) {
            if (current < m) return m;
        }
        return current + 30; // Fallback
    }

    get streakProgressPercent(): number {
        const current = this.profile?.currentStreak || 0;
        const target = this.nextStreakMilestone;
        return Math.min(100, Math.max(0, (current / target) * 100));
    }

    getIconForType(type: string): string {
        switch (type) {
            case 'reading_time': return '⏱️';
            case 'books_read': return '📚';
            case 'streak_length': return '🔥';
            default: return '🎯';
        }
    }
}
