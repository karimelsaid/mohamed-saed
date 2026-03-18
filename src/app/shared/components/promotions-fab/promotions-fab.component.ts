import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { faGift } from '@fortawesome/free-solid-svg-icons';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
    selector: 'app-promotions-fab',
    standalone: true,
    imports: [CommonModule, FontAwesomeModule],
    templateUrl: './promotions-fab.component.html',
    styleUrls: ['./promotions-fab.component.css']
})
export class PromotionsFabComponent {
    faGift = faGift;

    constructor(private router: Router) { }

    navigateToPromotions() {
        this.router.navigate(['/promotions']);
    }
}
