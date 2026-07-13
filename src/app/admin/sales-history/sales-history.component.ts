import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AdminApiService } from '../../services/admin-api.service';
import { faSearch, faHistory, faUser, faPhone, faCalendarAlt, faFileInvoice, faEye, faTimes, faTrash } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-sales-history',
    templateUrl: './sales-history.component.html',
    styleUrls: ['./sales-history.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    encapsulation: ViewEncapsulation.None
})
export class SalesHistoryComponent implements OnInit {
    faSearch = faSearch;
    faHistory = faHistory;
    faUser = faUser;
    faPhone = faPhone;
    faCalendarAlt = faCalendarAlt;
    faFileInvoice = faFileInvoice;
    faEye = faEye;
    faTimes = faTimes;
    faTrash = faTrash;

    sales: any[] = [];
    filteredSales: any[] = [];
    searchTerm: string = '';
    isLoading: boolean = false;
    selectedSale: any = null;
    showInvoiceModal: boolean = false;
    isDeleting: boolean = false;

    constructor(private adminApi: AdminApiService) { }

    ngOnInit(): void {
        this.loadSalesHistory();
    }

    loadSalesHistory(): void {
        this.isLoading = true;
        this.adminApi.getSalesHistory().subscribe({
            next: (data) => {
                this.sales = data;
                this.filteredSales = data;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading sales history:', err);
                this.isLoading = false;
            }
        });
    }

    filterSales(): void {
        const term = this.searchTerm.toLowerCase().trim();
        if (!term) {
            this.filteredSales = this.sales;
            return;
        }

        this.filteredSales = this.sales.filter(sale =>
            (sale.customerName && sale.customerName.toLowerCase().includes(term)) ||
            (sale.customerPhone && sale.customerPhone.includes(term)) ||
            (sale.invoiceNumber && sale.invoiceNumber.toLowerCase().includes(term))
        );
    }

    viewInvoice(sale: any): void {
        this.selectedSale = sale;
        this.showInvoiceModal = true;
    }

    closeModal(): void {
        this.showInvoiceModal = false;
        this.selectedSale = null;
    }

    printCurrentInvoice(): void {
        window.print();
    }

    deleteSale(sale: any): void {
        if (!confirm(`هل أنت متأكد من حذف الفاتورة رقم ${sale.invoiceNumber}؟ لا يمكن التراجع عن هذا الإجراء.`)) {
            return;
        }
        this.isDeleting = true;
        this.adminApi.deleteSale(sale.id).subscribe({
            next: () => {
                this.sales = this.sales.filter(s => s.id !== sale.id);
                this.filterSales();
                if (this.selectedSale?.id === sale.id) {
                    this.closeModal();
                }
                this.isDeleting = false;
            },
            error: (err) => {
                console.error('Error deleting sale:', err);
                this.isDeleting = false;
            }
        });
    }
}
