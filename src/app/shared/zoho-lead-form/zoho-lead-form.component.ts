import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-zoho-lead-form',
  standalone: true,
  templateUrl: './zoho-lead-form.component.html',
  styleUrls: ['./zoho-lead-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZohoLeadFormComponent {}
