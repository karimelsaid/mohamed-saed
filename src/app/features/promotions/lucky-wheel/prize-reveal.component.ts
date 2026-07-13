import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faShoppingCart, faBolt, faGift, faTimes, faStar, faArrowRight, faBoxOpen, faClock } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../../auth/auth.service';
import { Router } from '@angular/router';
import { ModalService } from '../../../services/modal.service';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-prize-reveal',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule],
    encapsulation: ViewEncapsulation.None,
    template: `
    <div class="prize-reveal-overlay" *ngIf="prize" (click)="close()">
        <div class="prize-card-reveal animate-pop-in" [class.is-book-win]="prize.books?.length > 0" (click)="$event.stopPropagation()">
            <button class="close-reveal-btn" (click)="close()">
                <fa-icon [icon]="faTimes"></fa-icon>
            </button>

            <div class="reveal-header">
                <h2 class="text-3xl font-black mb-1 bg-clip-text text-transparent"
                    [style.background-image]="'linear-gradient(to right, var(--promo-accent), var(--promo-primary))'">
                    مبروك! 🎉
                </h2>
                <p class="text-lg opacity-80">لقد حصلت على ميزة رائعة</p>
            </div>

            <!-- Books Section (Smaller & Horizontal) -->
            <div *ngIf="prize.books?.length > 0" class="books-reveal-section">
                <div class="books-reveal-flex" [class.single-item]="prize.books.length === 1">
                    <div *ngFor="let book of prize.books; let idx = index" class="book-reveal-item" 
                         [style.animation-delay]="(idx * 0.1) + 's'">
                        <div class="book-card-container">
                            <img [src]="getBookImage(book.image)" class="book-image-small" (error)="book.image = null">
                            <div class="reveal-glow"></div>
                        </div>
                        <div class="book-info-reveal">
                            <h3 class="font-bold text-xs text-center truncate w-full px-1">{{ book.name }}</h3>
                        </div>
                    </div>
                </div>

                <div class="actions-reveal-container">
                    <button class="reveal-btn-cart" (click)="addToCart()"
                            [style.background]="'linear-gradient(135deg, var(--promo-primary), var(--promo-accent))'"
                            [style.box-shadow]="'0 8px 16px var(--promo-primary-alpha-20)'">
                        <fa-icon [icon]="faShoppingCart" class="ml-2"></fa-icon>
                        أضف الهدايا للسلة (مجاناً)
                    </button>
                </div>
            </div>

            <!-- Generic Prize -->
            <div *ngIf="!prize.books || prize.books.length === 0" class="generic-reveal-section">
                <div class="prize-icon-reveal animate-bounce">
                    <fa-icon [icon]="faGift"></fa-icon>
                </div>
                <h3 class="text-2xl font-bold my-4">{{ prize.label }}</h3>
                
                <div class="actions-reveal-container">
                    <button class="reveal-btn-primary" (click)="goToReward()" *ngIf="prize.type !== 'nothing'"
                            [style.background]="'linear-gradient(135deg, var(--promo-primary), var(--promo-accent))'"
                            [style.box-shadow]="'0 8px 16px var(--promo-primary-alpha-20)'">
                        <span *ngIf="prize.type === 'coupon'">استخدم الكوبون الآن</span>
                        <span *ngIf="prize.type === 'points'">شاهد نقاطك</span>
                        <span *ngIf="!['coupon', 'points'].includes(prize.type)">عرض التفاصيل</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
    `,
    styles: [`
    .prize-reveal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.82);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: revealFadeIn 0.3s ease-out;
    }

    .prize-card-reveal {
        background: #fff;
        padding: 30px;
        border-radius: 32px;
        width: 90%;
        max-width: 420px;
        position: relative;
        box-shadow: 0 40px 80px rgba(0,0,0,0.6);
        text-align: center;
        overflow: hidden;
    }

    :host-context(.dark) .prize-card-reveal {
        background: #1f2937;
        color: #fff;
        border: 1px solid rgba(255,255,255,0.1);
    }

    .prize-card-reveal.is-book-win {
        max-width: 550px;
        background: linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%);
    }

    :host-context(.dark) .prize-card-reveal.is-book-win {
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
    }

    .close-reveal-btn {
        position: absolute;
        top: 15px;
        right: 15px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(0,0,0,0.05);
        border: none;
        cursor: pointer;
        color: #6b7280;
        z-index: 10;
    }

    .books-reveal-flex {
        display: flex;
        justify-content: center;
        gap: 20px;
        margin: 25px 0;
        overflow-x: auto;
        padding: 10px;
        scrollbar-width: thin;
    }

    .book-reveal-item {
        width: 120px;
        flex-shrink: 0;
        animation: itemSlideUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .book-card-container {
        position: relative;
        margin-bottom: 10px;
    }

    .book-image-small {
        width: 100px;
        height: 140px;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 10px 20px rgba(0,0,0,0.25);
        background: #fff;
    }

    :host-context(.dark) .book-image-small {
        background: #1f2937;
    }

    .reveal-glow {
        position: absolute;
        inset: -15%;
        background: radial-gradient(circle, var(--promo-accent-alpha-20) 0%, transparent 70%);
        z-index: -1;
        animation: revealPulse 2s infinite alternate;
    }

    .actions-reveal-container {
        margin-top: 15px;
        padding-top: 20px;
        border-top: 1px solid rgba(0,0,0,0.05);
    }

    :host-context(.dark) .actions-reveal-container {
        border-top-color: rgba(255,255,255,0.05);
    }

    .reveal-btn-cart {
        width: 100%;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 14px;
        border-radius: 16px;
        font-weight: 800;
        border: none;
        cursor: pointer;
        box-shadow: 0 8px 16px rgba(16, 185, 129, 0.25);
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    :host-context(.dark) .reveal-btn-cart {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
    }

    .reveal-btn-primary {
        width: 100%;
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        color: white;
        padding: 14px;
        border-radius: 16px;
        font-weight: 800;
        border: none;
        cursor: pointer;
        box-shadow: 0 8px 16px rgba(99, 102, 241, 0.25);
        transition: all 0.2s;
    }

    :host-context(.dark) .reveal-btn-primary {
        background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
    }

    .reveal-btn-close {
        width: 100%;
        background: #e5e7eb;
        color: #374151;
        padding: 14px;
        border-radius: 16px;
        font-weight: 700;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
        margin-top: 10px;
    }

    :host-context(.dark) .reveal-btn-close {
        background: #374151;
        color: #d1d5db;
    }

    .prize-icon-reveal {
        font-size: 4rem;
        color: var(--promo-accent);
        filter: drop-shadow(0 0 15px var(--promo-accent-alpha-20));
    }

    @keyframes revealFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes itemSlideUp { 
        from { opacity: 0; transform: translateY(30px); } 
        to { opacity: 1; transform: translateY(0); } 
    }
    @keyframes revealPulse { 
        from { opacity: 0.4; transform: scale(0.9); } 
        to { opacity: 1; transform: scale(1.1); } 
    }
    `]
})
export class PrizeRevealComponent {
    @Input() prize: any = null;
    @Input() theme: any = null;
    @Output() onClose = new EventEmitter<void>();

    faShoppingCart = faShoppingCart;
    faBolt = faBolt;
    faGift = faGift;
    faTimes = faTimes;

    getThemeIcon(propName: string, fallback: any): any {
        if (!this.theme?.themeConfig?.icons) return fallback;
        const iconName = this.theme.themeConfig.icons[propName];
        if (!iconName) return fallback;

        // Map string names from DB to FontAwesome objects
        switch (iconName) {
            case 'gift': return faGift;
            case 'box': return faBoxOpen;
            case 'star': return faStar; // Fixed: using faStar from imports
            case 'arrow-right': return faArrowRight;
            case 'clock': return faClock;
            default: return fallback;
        }
    }

    constructor(
        private authService: AuthService,
        private router: Router,
        private modalService: ModalService
    ) { }

    close() {
        this.onClose.emit();
    }

    getBookImage(imagePath: string): string {
        if (!imagePath) return 'assets/image/book-placeholder.jpg';
        if (imagePath.startsWith('http')) return imagePath;

        const base = environment.apiBaseUrl.includes('localhost')
            ? 'http://localhost:3000'
            : 'https://knoozbook.com/Backend';

        return `${base}/uploads/${imagePath}`;
    }

    addToCart() {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = userData.id || userData._id;
        if (!userId || !this.prize?.books) return;

        const books = this.prize.books;
        let successCount = 0;

        books.forEach((b: any, index: number) => {
            // APPEND :free to the bookId to signify it's a prize reward
            const freeBookId = `${b.id}:free`;

            this.authService.addToCart(userId, freeBookId).subscribe({
                next: () => {
                    successCount++;
                    if (index === books.length - 1) {
                        this.authService.loadUserData(userId);
                        this.modalService.showSuccess(`تم إضافة ${books.length} هدايا إلى السلة مجاناً! 🎁✨`);
                        this.close();
                    }
                }
            });
        });
    }

    buyNow() {
        // Obsolete but kept for signature compatibility if needed elsewhere, 
        // though we removed it from template
        this.addToCart();
        this.router.navigate(['/basket']);
    }

    goToReward() {
        if (!this.prize) return;
        const type = this.prize.type;
        const value = this.prize.value;
        this.close();

        if (type === 'coupon') {
            this.router.navigate(['/research'], { queryParams: { q: value } });
        } else if (type === 'points') {
            this.router.navigate(['/profile']);
        }
    }
}
