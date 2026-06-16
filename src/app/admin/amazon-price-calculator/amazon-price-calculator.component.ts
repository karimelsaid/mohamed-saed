import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
    selector: 'app-amazon-price-calculator',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './amazon-price-calculator.component.html',
    styleUrls: []
})
export class AmazonPriceCalculatorComponent {
    // Inputs
    costPrice: number = 100;
    targetProfitPercent: number = 80;
    amazonCommissionRate: number = 13;
    taxRate: number = 14;
    customerShippingFee: number = 30;
    sellerShippingFee: number = 34;

    // Outputs
    sellingPrice: number = 0;
    commissionValue: number = 0;
    taxValue: number = 0;
    totalDeductions: number = 0;
    netPayout: number = 0;
    actualNetProfit: number = 0;
    actualProfitPercent: number = 0;

    constructor() {
        this.calculate();
    }

    calculate() {
        // 1. Calculate Target Net Payout
        // Net Payout = Cost + (Cost * Profit%)
        const targetNetPayout = this.costPrice + (this.costPrice * (this.targetProfitPercent / 100));

        // 2. Solve for P (Selling Price)
        // Formula derived from:
        // Net = (P + Fc) - [ (P + Fc)*R + ((P + Fc)*R)*T + S ]
        // Net = (P + Fc) - (P + Fc)*R*(1 + T) - S
        // Net + S = (P + Fc) * (1 - R*(1 + T))
        // (Net + S) / (1 - R*(1 + T)) = P + Fc
        // P = [ (Net + S) / (1 - R*(1 + T)) ] - Fc

        const R = this.amazonCommissionRate / 100;
        const T = this.taxRate / 100;
        const Fc = this.customerShippingFee;
        const S = this.sellerShippingFee;
        const Net = targetNetPayout;

        // Commission + Tax combined factor = R * (1 + T)
        // e.g., 0.13 * 1.14 = 0.1482
        const commissionTaxFactor = R * (1 + T);

        // Denominator = 1 - 0.1482 = 0.8518
        const denominator = 1 - commissionTaxFactor;

        if (denominator <= 0) {
            // Safety check to avoid division by zero or negative price if fees are > 100%
            this.sellingPrice = 0;
            return;
        }

        const numerator = Net + S;
        const P = (numerator / denominator) - Fc;

        this.sellingPrice = Math.ceil(P); // Round up to nearest integer

        // 3. Verify and Calculate Breakdown based on rounded Selling Price
        this.calculateBreakdown();
    }

    calculateBreakdown() {
        const P = this.sellingPrice;
        const Fc = this.customerShippingFee;
        const R = this.amazonCommissionRate / 100;
        const T = this.taxRate / 100;
        const S = this.sellerShippingFee;

        const baseForCommission = P + Fc;
        this.commissionValue = baseForCommission * R;
        this.taxValue = this.commissionValue * T;

        this.totalDeductions = this.commissionValue + this.taxValue + S;

        // Net Payout = (P + Fc) - Deductions
        this.netPayout = baseForCommission - this.totalDeductions;

        this.actualNetProfit = this.netPayout - this.costPrice;
        this.actualProfitPercent = (this.actualNetProfit / this.costPrice) * 100;
    }
}
