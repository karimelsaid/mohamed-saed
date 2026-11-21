import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AmazonCatalogComponent } from '../amazon-catalog/amazon-catalog.component';

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [CommonModule, AmazonCatalogComponent],
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.css']
})
export class ProductManagementComponent implements OnInit {
  ngOnInit(): void {}
}
