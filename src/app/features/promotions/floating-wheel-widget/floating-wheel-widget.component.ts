import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faGift, faTimes } from '@fortawesome/free-solid-svg-icons';
import { LuckyWheelComponent } from '../lucky-wheel/lucky-wheel.component';
import { PrizeRevealComponent } from '../lucky-wheel/prize-reveal.component';
import { PromotionService } from '../../../services/promotion.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
    selector: 'app-floating-wheel-widget',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule, LuckyWheelComponent, PrizeRevealComponent],
    templateUrl: './floating-wheel-widget.component.html',
    styleUrls: ['./floating-wheel-widget.component.css'],
    animations: [
        trigger('slideInOut', [
            transition(':enter', [
                style({ transform: 'translateY(100%)', opacity: 0 }),
                animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
            ]),
            transition(':leave', [
                animate('300ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
            ])
        ]),
        trigger('fadeInOut', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms ease-out', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('200ms ease-in', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class FloatingWheelWidgetComponent implements OnInit {
    isOpen = false;
    activeTheme: any = null;
    winningPrize: any = null;
    faGift = faGift;
    faTimes = faTimes;

    constructor(private promotionService: PromotionService) { }

    ngOnInit() {
        this.loadActiveTheme();
    }

    loadActiveTheme() {
        this.promotionService.getActiveTheme().subscribe({
            next: (res: any) => {
                if (res && res.theme) {
                    this.activeTheme = res.theme;
                }
            },
            error: (err) => console.error('Failed to load active promotion theme', err)
        });
    }

    toggleWidget() {
        this.isOpen = !this.isOpen;
    }

    closeWidget() {
        this.isOpen = false;
    }
}
