import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FreeShippingService, FreeShippingRules } from '../../../services/free-shipping.service';

@Component({
  selector: 'app-free-shipping-rules',
  templateUrl: './free-shipping-rules.component.html',
  styleUrls: ['./free-shipping-rules.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class FreeShippingRulesComponent implements OnInit {
  minQuantity: number = 3;
  minOrderValue: number = 0;
  userGroups: string[] = [];
  selectedUserGroups: string[] = [];
  includedProducts: string[] = [];
  includedCategories: string[] = [];
  includedGovernorates: string[] = [];
  freeShippingEnabled: boolean = true;

  loading: boolean = false;
  errorMessage: string = '';

  constructor(private freeShippingService: FreeShippingService) {}

  ngOnInit(): void {
    this.loadRules();
  }

  loadRules(): void {
    this.loading = true;
    this.freeShippingService.getRules().subscribe({
      next: (rules: FreeShippingRules) => {
        this.minQuantity = rules.minQuantity;
        this.minOrderValue = rules.minOrderValue;
        this.userGroups = rules.userGroups;
        this.includedProducts = rules.includedProducts;
        this.includedCategories = rules.includedCategories;
        this.includedGovernorates = rules.includedGovernorates;
        this.freeShippingEnabled = rules.freeShippingEnabled;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading free shipping rules:', error);
        this.errorMessage = 'خطأ في تحميل قواعد الشحن المجاني';
        this.loading = false;
      }
    });
  }

  saveRules(): void {
    this.loading = true;
    const rules: FreeShippingRules = {
      minQuantity: this.minQuantity,
      minOrderValue: this.minOrderValue,
      userGroups: this.userGroups,
      includedProducts: this.includedProducts,
      includedCategories: this.includedCategories,
      includedGovernorates: this.includedGovernorates,
      freeShippingEnabled: this.freeShippingEnabled
    };
    this.freeShippingService.saveRules(rules).subscribe({
      next: () => {
        alert('تم حفظ قواعد الشحن المجاني بنجاح');
        this.loading = false;
      },
      error: (error) => {
        console.error('Error saving free shipping rules:', error);
        alert('حدث خطأ أثناء حفظ قواعد الشحن المجاني');
        this.loading = false;
      }
    });
  }
}
