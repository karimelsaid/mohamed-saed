import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { LuckyWheelComponent } from './lucky-wheel/lucky-wheel.component';
import { PrizeRevealComponent } from './lucky-wheel/prize-reveal.component';
import { PromotionService } from '../../services/promotion.service';
import { AuthService } from '../../auth/auth.service';
import { faGift, faBoxOpen, faStar, faChevronLeft, faArrowRight, faCopy } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-promotions',
    templateUrl: './promotions.component.html',
    styleUrls: ['./promotions.component.css'],
    standalone: true,
    imports: [CommonModule, FontAwesomeModule, LuckyWheelComponent, PrizeRevealComponent]
})
export class PromotionsComponent implements OnInit {
    theme: any;
    packages: any[] = [];
    loading = true;
    user: any = null;
    winningPrize: any = null;

    faGift = faGift;
    faBoxOpen = faBoxOpen;
    faStar = faStar;
    faChevronLeft = faChevronLeft;
    faArrowRight = faArrowRight;
    faCopy = faCopy;

    constructor(
        private promotionService: PromotionService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.loadInitialData();
        this.authService.user$.subscribe(user => this.user = user);
    }

    loadInitialData() {
        this.loading = true;
        // Fetch theme
        this.promotionService.getActiveTheme().subscribe({
            next: (res: any) => {
                this.theme = res.theme;
                if (this.theme) {
                    this.applyTheme(this.theme.themeConfig);
                }
            },
            error: (err: any) => console.error(err)
        });

        // Fetch packages
        this.promotionService.getAllPackages().subscribe({
            next: (res: any) => {
                this.packages = Array.isArray(res) ? res : (res.packages || []);
                this.loading = false;
            },
            error: (err: any) => {
                console.error(err);
                this.loading = false;
            }
        });
    }

    applyTheme(config: any) {
        if (!config) return;
        const root = document.documentElement;
        if (config.primaryColor) root.style.setProperty('--promo-primary', config.primaryColor);
        if (config.secondaryColor) root.style.setProperty('--promo-secondary', config.secondaryColor);
        if (config.accentColor) root.style.setProperty('--promo-accent', config.accentColor);
    }

    copyCode(code: string) {
        navigator.clipboard.writeText(code).then(() => {
            alert('تم نسخ الكود بنجاح! 🎉');
        });
    }

    calculateDiscount(original: number, promo: number): number {
        if (!original || original <= 0) return 0;
        return Math.round(((original - promo) / original) * 100);
    }
}
