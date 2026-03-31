import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FreeShippingService, FreeShippingRules } from '../../../services/free-shipping.service';
import { ModalService } from '../../../services/modal.service';

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
  codFee: number = 10;
  communityShippingCost: number = 70;
  swapShippingCost: number = 70;
  auctionShippingCost: number = 70;
  regionCosts: { [key: string]: number } = {
    'القاهرة والجيزة والقليوبية': 55,
    'الإسكندرية والدلتا': 65,
    'مدن القناة': 70,
    'شمال الصعيد': 75,
    'جنوب الصعيد': 100,
    'المناطق النائية': 110
  };
  regionKeys: string[] = Object.keys(this.regionCosts);

  loading: boolean = false;
  errorMessage: string = '';

  constructor(private freeShippingService: FreeShippingService, private modalService: ModalService) { }

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
        this.codFee = rules.codFee ?? 10;
        this.communityShippingCost = rules.communityShippingCost ?? 70;
        this.swapShippingCost = rules.swapShippingCost ?? 70;
        this.auctionShippingCost = rules.auctionShippingCost ?? 70;
        if (rules.regionCosts) {
          this.regionCosts = { ...this.regionCosts, ...rules.regionCosts };
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading free shipping rules:', error);
        this.errorMessage = 'خطأ في تحميل قواعد مصاريف الشحن';
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
      freeShippingEnabled: this.freeShippingEnabled,
      codFee: this.codFee,
      communityShippingCost: this.communityShippingCost,
      swapShippingCost: this.swapShippingCost,
      auctionShippingCost: this.auctionShippingCost,
      regionCosts: this.regionCosts
    };
    this.freeShippingService.saveRules(rules).subscribe({
      next: () => {
        this.modalService.showSuccess('تم حفظ قواعد مصاريف الشحن بنجاح');
        this.loading = false;
      },
      error: (error) => {
        console.error('Error saving free shipping rules:', error);
        this.modalService.showError('حدث خطأ أثناء حفظ قواعد مصاريف الشحن');
        this.loading = false;
      }
    });
  }
}
