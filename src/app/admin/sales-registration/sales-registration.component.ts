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
    product_price: number;
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

    // Customer Information
    customerName: string = '';
    customerPhone: string = '';
    invoiceDate: string = new Date().toLocaleDateString('ar-EG');
    invoiceNumber: string = '';

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
        this.generateInvoiceNumber();
    }

    generateInvoiceNumber(): void {
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        this.invoiceNumber = `INV-${datePart}-${randomPart}`;
    }

    loadProducts(): void {
        this.dataService.getData().subscribe(data => {
            this.allProducts = data;
        });
    }

    searchProducts(): void {
        if (!this.searchTerm || !this.searchTerm.trim()) {
            this.searchResults = [];
            return;
        }

        const term = this.searchTerm.toLowerCase().trim();
        this.searchResults = this.allProducts.filter(p => {
            if (!p) return false;

            const name = (p.product_name || '').toLowerCase();
            const id = String(p.products_id || '').toLowerCase();
            const barcode = String(p.barcode || '').toLowerCase();

            return name.includes(term) || id.includes(term) || barcode.includes(term);
        }).slice(0, 15); // Increased limit slightly
    }

    addItem(product: any): void {
        const existing = this.sessionItems.find(item => item.products_id === product.products_id);
        if (existing) {
            if (existing.quantity < product.product_quantity) {
                existing.quantity++;
            } else {
                this.modal.showError('الكمية المطلوبة تتجاوز المخزون المتاح');
            }
        } else {
            this.sessionItems.push({
                products_id: product.products_id,
                product_name: product.product_name,
                product_quantity: product.product_quantity,
                image_path: product.image_path,
                product_price: product.product_price || 0,
                quantity: 1,
                channel: 'Store'
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

    getSubtotal(): number {
        return this.sessionItems.reduce((sum, item) => sum + (item.product_price * item.quantity), 0);
    }

    getGrandTotal(): number {
        return this.getSubtotal(); // Add shipping or tax if needed here
    }

    printInvoice(): void {
        if (this.sessionItems.length === 0) return;

        // Update date for the print
        this.invoiceDate = new Date().toLocaleString('ar-EG');

        setTimeout(() => {
            window.print();
        }, 300);
    }

    getImageUrl(product: any): string {
        if (!product) return '';
        const baseUrl = this.backendBaseUrl.replace('/api', '');

        if (product.image_path) {
            // Ensure no double slashes when joining
            const path = product.image_path.startsWith('/') ? product.image_path : '/' + product.image_path;
            return baseUrl + path;
        }

        // Fallback for books following the standard pattern if image_path is missing
        if (product.products_id) {
            return `${baseUrl}/uploads/books/admin__karim_mohamed__/${product.products_id}/${product.products_id}.webp`;
        }

        return '';
    }

    submitSession(): void {
        if (this.sessionItems.length === 0) return;

        this.isSubmitting = true;
        const soldItems = this.sessionItems.map(item => ({
            products_id: item.products_id,
            quantity: item.quantity,
            price: item.product_price,
            total: item.product_price * item.quantity
        }));

        const saleData = {
            soldItems,
            customerName: this.customerName,
            customerPhone: this.customerPhone,
            totalAmount: this.getGrandTotal(),
            invoiceNumber: this.invoiceNumber
        };

        this.adminApi.registerSale(saleData).subscribe({
            next: (res) => {
                this.modal.showSuccess('تم تسجيل المبيعات وتحديث المخزون بنجاح');
                // Trigger print if needed or just clear
                this.sessionItems = [];
                this.customerName = '';
                this.customerPhone = '';
                this.generateInvoiceNumber();
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
