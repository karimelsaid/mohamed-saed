import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AdminApiService } from '../../services/admin-api.service';
import { faSearch, faHistory, faUser, faPhone, faCalendarAlt, faFileInvoice, faEye, faTimes } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-sales-history',
    templateUrl: './sales-history.component.html',
    styleUrls: ['./sales-history.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule]
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

    sales: any[] = [];
    filteredSales: any[] = [];
    searchTerm: string = '';
    isLoading: boolean = false;
    selectedSale: any = null;
    showInvoiceModal: boolean = false;

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
}
