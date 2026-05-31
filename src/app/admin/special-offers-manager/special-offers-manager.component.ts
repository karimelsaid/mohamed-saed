import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SpecialOffersService, WhitelistedOffer } from '../../services/special-offers.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faTrash, faGift, faCrown, faPercent, faClock } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-special-offers-manager',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './special-offers-manager.component.html',
    styleUrl: './special-offers-manager.component.css'
})
export class SpecialOffersManagerComponent implements OnInit {
    offers: WhitelistedOffer[] = [];
    newOffer: Partial<WhitelistedOffer> = {
        email: '',
        type: 'free_months',
        value: 1,
        notes: ''
    };
    
    isLoading = false;
    message = { type: '', text: '' };

    // Icons
    icons = {
        plus: faPlus,
        trash: faTrash,
        gift: faGift,
        crown: faCrown,
        percent: faPercent,
        clock: faClock
    };

    constructor(private specialOffersService: SpecialOffersService) { }

    ngOnInit(): void {
        this.loadOffers();
    }

    loadOffers() {
        this.isLoading = true;
        this.specialOffersService.getAllOffers().subscribe({
            next: (res) => {
                this.offers = res.data;
                this.isLoading = false;
            },
            error: (err) => {
                console.error(err);
                this.isLoading = false;
            }
        });
    }

    addOffer() {
        if (!this.newOffer.email || !this.newOffer.type) {
            this.showMessage('error', 'يرجى إدخال البريد الإلكتروني ونوع العرض');
            return;
        }

        this.isLoading = true;
        this.specialOffersService.addOffer(this.newOffer).subscribe({
            next: (res) => {
                this.offers.unshift(res.data);
                this.newOffer = { email: '', type: 'free_months', value: 1, notes: '' };
                this.showMessage('success', 'تم إضافة العرض بنجاح');
                this.isLoading = false;
            },
            error: (err) => {
                this.showMessage('error', err.error?.message || 'فشل إضافة العرض');
                this.isLoading = false;
            }
        });
    }

    deleteOffer(id: string) {
        if (!confirm('هل أنت متأكد من حذف هذا العرض؟')) return;

        this.specialOffersService.deleteOffer(id).subscribe({
            next: () => {
                this.offers = this.offers.filter(o => o._id !== id);
                this.showMessage('success', 'تم حذف العرض');
            },
            error: (err) => {
                this.showMessage('error', 'فشل حذف العرض');
            }
        });
    }

    showMessage(type: string, text: string) {
        this.message = { type, text };
        setTimeout(() => this.message = { type: '', text: '' }, 3000);
    }

    getOfferTypeName(type: string): string {
        switch (type) {
            case 'discount': return 'خصم إضافي';
            case 'free_months': return 'شهور مجانية';
            case 'free_days': return 'أيام مجانية';
            case 'lifetime': return 'مدى الحياة مجاناً';
            default: return type;
        }
    }
}
