import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewEncapsulation, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faShoppingCart, faBolt, faSignInAlt, faGift, faTimes } from '@fortawesome/free-solid-svg-icons';
import { PromotionService } from '../../../services/promotion.service';
import { AuthService } from '../../../auth/auth.service';
import { Router } from '@angular/router';
import { ModalService } from '../../../services/modal.service';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-lucky-wheel',
    encapsulation: ViewEncapsulation.None,
    templateUrl: './lucky-wheel.component.html',
    styleUrls: ['./lucky-wheel.component.css'],
    standalone: true,
    imports: [CommonModule, FontAwesomeModule]
})
export class LuckyWheelComponent implements OnInit, OnChanges {
    @Input() theme: any;
    @Output() onActionComplete = new EventEmitter<void>();
    @Output() onWin = new EventEmitter<any>();

    prizes: any[] = [];
    isSpinning = false;
    currentRotation = 0;
    canSpin = true;
    showLoginModal = false;

    // Icons
    faShoppingCart = faShoppingCart;
    faBolt = faBolt;
    faSignInAlt = faSignInAlt;
    faGift = faGift;
    faTimes = faTimes;

    constructor(
        private promotionService: PromotionService,
        private authService: AuthService,
        private router: Router,
        private modalService: ModalService
    ) { }

    ngOnInit(): void {
        this.initializePrizes();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['theme']) {
            this.initializePrizes();
        }
    }

    private initializePrizes(): void {
        console.log('[LuckyWheel] Initializing prizes. Theme:', this.theme?.name);
        
        if (this.theme?.luckyWheel?.prizes && this.theme.luckyWheel.prizes.length > 0) {
            console.log(`[LuckyWheel] Loading ${this.theme.luckyWheel.prizes.length} real prizes from theme`);
            // Clone to avoid mutating original
            let basePrizes = [...this.theme.luckyWheel.prizes];
            
            // Filter out invalid prizes just in case
            basePrizes = basePrizes.filter(p => p.label && p.type);

            // CRITICAL: Ensure even count for perfect light/dark color alternation
            if (basePrizes.length % 2 !== 0) {
                // Add a "Better Luck" segment to balance the colors
                basePrizes.push({
                    label: 'حظ أوفر',
                    type: 'nothing'
                });
            }
            this.prizes = basePrizes;
        } else {
            // Mock prizes (Exactly 12 items for balanced colors)
            this.prizes = [
                { label: 'خصم 10%', type: 'coupon' },
                { label: 'حظ أوفر', type: 'nothing' },
                { label: '100 نقطة', type: 'points' },
                { label: 'حظ أوفر', type: 'nothing' },
                { label: 'كتاب هدية', type: 'book' },
                { label: 'حظ أوفر', type: 'nothing' },
                { label: 'خصم 5%', type: 'coupon' },
                { label: 'مرة أخرى', type: 'nothing' },
                { label: '50 نقطة', type: 'points' },
                { label: 'حظ أوفر', type: 'nothing' },
                { label: '200 نقطة', type: 'points' },
                { label: 'حظ أوفر', type: 'nothing' }
            ];
        }
    }

    spin() {
        if (this.isSpinning || !this.canSpin) return;

        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = userData.id || userData._id;

        if (!userId) {
            this.showLoginModal = true;
            return;
        }

        this.isSpinning = true;

        this.promotionService.spinWheel(userId).subscribe({
            next: (res: any) => {
                const prizeIndex = this.prizes.findIndex(p => p.label === res.prize.label);
                const sectorAngle = 360 / this.prizes.length;

                const extraLoops = Math.floor(Math.random() * 8) + 8;
                const duration = Math.floor(Math.random() * 4000) + 4000;

                document.documentElement.style.setProperty('--spin-duration', `${duration}ms`);

                const jitter = (Math.random() * 4) - 2;
                // Gradient starts at 90deg (3 o'clock). Pointer is at top (0deg).
                // Segment i center is at: 90 + i*sectorAngle + sectorAngle/2 from top.
                // To align with pointer: rotation = 360 - (90 + i*sectorAngle + sectorAngle/2)
                const targetAngle = (360 + 270 - (sectorAngle / 2) - (prizeIndex * sectorAngle)) % 360;

                console.log(`[LuckyWheel] Won: ${res.prize.label}, Index: ${prizeIndex}, TargetAngle: ${targetAngle}`);

                const baseRotation = Math.ceil(this.currentRotation / 360) * 360;
                this.currentRotation = baseRotation + (extraLoops * 360) + targetAngle + jitter;

                setTimeout(() => {
                    this.isSpinning = false;
                    this.canSpin = false;

                    // Emit the win event so the parent can show the prize independently
                    this.onWin.emit(res.prize);

                    this.authService.loadUserData(userId);
                }, duration);
            },
            error: (err: any) => {
                console.error(err);
                this.isSpinning = false;
                alert(err.error?.message || 'عذراً، حدث خطأ ما');
            }
        });
    }

    openLogin() {
        window.dispatchEvent(new CustomEvent('open-login-modal'));
        this.showLoginModal = false;
    }

    getFontSize(): string {
        const count = this.prizes.length;
        if (count <= 6) return '0.85rem';
        if (count <= 8) return '0.75rem';
        if (count <= 10) return '0.65rem';
        if (count <= 14) return '0.55rem';
        return '0.45rem';
    }

    getWheelBackground(): string {
        const n = this.prizes.length;
        if (n === 0) return '#ccc';
        const angle = 360 / n;
        const primary = this.theme?.themeConfig?.primaryColor || 'var(--promo-primary)';
        const secondary = this.theme?.themeConfig?.secondaryColor || 'var(--promo-secondary)';
        let stops: string[] = [];
        for (let i = 0; i < n; i++) {
            const color = i % 2 === 0 ? primary : secondary;
            stops.push(`${color} ${i * angle}deg ${(i + 1) * angle}deg`);
        }
        return `conic-gradient(from 90deg, ${stops.join(', ')})`;
    }

    getLabelRotation(i: number): number {
        const sectorAngle = 360 / this.prizes.length;
        // Rotate to the middle of the segment (bisector)
        return i * sectorAngle + sectorAngle / 2;
    }
}
