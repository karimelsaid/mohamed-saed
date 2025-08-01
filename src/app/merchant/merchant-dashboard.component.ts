import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface Product {
  products_id: string;
  product_name: string;
  product_quantity: number;
  product_category: string;
  product_description: string;
  product_price: number;
  price_cost: number;
  product_image?: string;
  merchantLogo?: string;
}

interface Order {
  _id: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  products: { product_name: string; product_quantity: number }[];
  status: string;
  orderDate: string;
  totalAmount: number;
}

import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-merchant-dashboard',
  standalone: true,
  imports: [DatePipe,FormsModule,CommonModule],
  templateUrl: './merchant-dashboard.component.html',
  styleUrls: ['./merchant-dashboard.component.css']  
})
export class MerchantDashboardComponent implements OnInit {
  products: Product[] = [];
  orders: Order[] = [];
  backendBaseUrl: string = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadProducts();
    this.loadOrders();
  }

  loadProducts(): void {
    this.http.get<{ success: boolean; products: Product[] }>(`${this.backendBaseUrl}/merchant/products`).subscribe({
      next: (response) => {
        if (response.success) {
          this.products = response.products;
        }
      },
      error: (err) => {
        console.error('Error loading merchant products:', err);
      }
    });
  }

  loadOrders(): void {
    this.http.get<{ success: boolean; orders: Order[] }>(`${this.backendBaseUrl}/merchant/orders`).subscribe({
      next: (response) => {
        if (response.success) {
          this.orders = response.orders;
        }
      },
      error: (err) => {
        console.error('Error loading merchant orders:', err);
      }
    });
  }

  // Additional methods for product and order management will be added here
}
