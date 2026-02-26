import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCartPlus, faSearch, faPlus, faTimes, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { DataService } from '../../services/data.service';
import { AdminApiService } from '../../services/admin-api.service';
import { ModalService } from '../../services/modal.service';
import { environment } from '../../../environments/environment';

interface SaleItem {
    products_id: string;
    product_name: string;
    product_quantity: number;
    image_path?: string;
    quantity: number;
    channel: 'Amazon' | 'Store';
}

@Component({
    selector: 'app-sales-registration',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './sales-registration.component.html',
    styleUrls: ['./sales-registration.component.css']
})
export class SalesRegistrationComponent implements OnInit {
    searchTerm: string = '';
    allProducts: any[] = [];
    searchResults: any[] = [];
    sessionItems: SaleItem[] = [];
    isSubmitting: boolean = false;
    backendBaseUrl: string = environment.apiBaseUrl;

    // Icons
    faCartPlus = faCartPlus;
    faSearch = faSearch;
    faPlus = faPlus;
    faTimes = faTimes;
    faCheckCircle = faCheckCircle;
    faExclamationTriangle = faExclamationTriangle;

    constructor(
        private dataService: DataService,
        private adminApi: AdminApiService,
        private modal: ModalService
    ) { }

    ngOnInit(): void {
        this.loadProducts();
    }

    loadProducts(): void {
        this.dataService.getData().subscribe(data => {
            this.allProducts = data;
        });
    }

    searchProducts(): void {
        if (!this.searchTerm.trim()) {
            this.searchResults = [];
            return;
        }

        const term = this.searchTerm.toLowerCase();
        this.searchResults = this.allProducts.filter(p =>
            p.product_name.toLowerCase().includes(term) ||
            String(p.products_id).includes(term)
        ).slice(0, 10);
    }

    addItem(product: any): void {
        const existing = this.sessionItems.find(item => item.products_id === product.products_id);
        if (existing) {
            if (existing.quantity < product.product_quantity) {
                existing.quantity++;
            }
        } else {
            this.sessionItems.push({
                products_id: product.products_id,
                product_name: product.product_name,
                product_quantity: product.product_quantity,
                image_path: product.image_path,
                quantity: 1,
                channel: 'Amazon'
            });
        }
        this.searchTerm = '';
        this.searchResults = [];
    }

    updateQty(index: number, delta: number): void {
        const item = this.sessionItems[index];
        const newQty = item.quantity + delta;
        if (newQty >= 1 && newQty <= item.product_quantity) {
            item.quantity = newQty;
        }
    }

    removeItem(index: number): void {
        this.sessionItems.splice(index, 1);
    }

    submitSession(): void {
        if (this.sessionItems.length === 0) return;

        this.isSubmitting = true;
        const soldItems = this.sessionItems.map(item => ({
            products_id: item.products_id,
            quantity: item.quantity
        }));

        this.adminApi.registerSale(soldItems).subscribe({
            next: (res) => {
                this.modal.showSuccess('تم تسجيل المبيعات وتحديث المخزون بنجاح');
                this.sessionItems = [];
                this.loadProducts(); // Reload stock levels
                this.isSubmitting = false;
            },
            error: (err) => {
                this.modal.showError('حدث خطأ أثناء تسجيل المبيعات');
                this.isSubmitting = false;
            }
        });
    }
}
