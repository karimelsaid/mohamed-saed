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
    baseUrl = environment.apiBaseUrl;

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
        const staticBaseUrl = this.baseUrl.endsWith('/api')
            ? this.baseUrl.slice(0, -4)
            : this.baseUrl;

        return `${staticBaseUrl}/${cleanPath}`;
    }

    ngOnInit(): void {
        this.authService.isLoggedIn$.subscribe((status: boolean) => {
            this.isLoggedIn = status;
            this.loadData();
        });
    }

    loadData() {
        this.loading = true;

        if (this.isLoggedIn) {
            // Load Profile
            this.gamificationService.getProfile().subscribe({
                next: (res: any) => {
                    if (res.success) this.profile = res.data;
                },
                error: (err: any) => console.error(err)
            });



            // Load Challenges
            this.gamificationService.getChallenges().subscribe({
                next: (res: any) => {
                    if (res.success) this.challenges = res.data;
                },
                error: (err: any) => console.error(err)
            });
        }

        // Always Load Leaderboard
        this.gamificationService.getLeaderboard().subscribe({
            next: (res: any) => {
                if (res.success) this.leaderboard = res.data;
                this.loading = false;
            },
            error: (err: any) => {
                console.error(err);
                this.loading = false;
            }
        });
    }

    calculateLevelProgress(): number {
        if (!this.profile) return 0;
        const currentLevel = this.profile.level;

        // Backend logic assumption from previous context
        const baseXP = 100 * Math.pow(Math.max(0, currentLevel - 1), 1.5);
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
            next: (res: any) => {
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
            next: (res: any) => {
                if (res.success) {
                    challenge.rewardsClaimed = true;
                    if (this.profile) {
                        this.profile.xp += challenge.xpReward;
                    }
                    alert(`🎉 تم الحصول على ${challenge.xpReward} نقطة!`);
                }
            }
        });
    }

    get hasReadToday(): boolean {
        // Safe check for profile properties
        if (!this.profile) return false;

        const lastUpdate = (this.profile as any).lastStreakUpdate;
        if (!lastUpdate) return false;

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const lastUpdateStr = new Date(lastUpdate).toISOString().split('T')[0];

        return todayStr === lastUpdateStr;
    }

    get nextStreakMilestone(): number {
        const current = this.profile?.currentStreak || 0;
        const milestones = [7, 14, 30, 60, 90, 365];
        for (const m of milestones) {
            if (current < m) return m;
        }
        return current + 30;
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
