import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuickActionsService } from '../../services/quick-actions.service';

interface QuickAction {
  id: string;
  title: string;
  icon: string;
  action: string;
  requiresAI: boolean;
  subActions?: SubAction[];
}

interface SubAction {
  id: string;
  title: string;
  icon: string;
}

interface CategoryAction {
  id: string;
  title: string;
  icon: string;
  category: string;
}

interface QuickActionsData {
  default: QuickAction[];
  categories: CategoryAction[];
  personalized: QuickAction[];
}

@Component({
  selector: 'app-quick-actions',
  standalone: false,
  templateUrl: './quick-actions.component.html',
  styleUrls: ['./quick-actions.component.css']
})
export class QuickActionsComponent implements OnInit {
  @Input() conversationId?: string | null;
  @Input() showWelcome: boolean = true;
  @Output() actionSelected = new EventEmitter<{ action: string; data?: any }>();
  @Output() bookSelected = new EventEmitter<any>();

  quickActionsData: QuickActionsData | null = null;
  isLoading: boolean = true;
  showSubActions: boolean = false;
  selectedAction: QuickAction | null = null;
  showCategories: boolean = false;

  constructor(private quickActionsService: QuickActionsService) {}

  ngOnInit(): void {
    this.loadQuickActions();
  }

  loadQuickActions(): void {
    this.isLoading = true;
    const conversationId = this.conversationId || undefined;
    this.quickActionsService.getAllQuickActions(conversationId).subscribe({
      next: (data) => {
        this.quickActionsData = data.data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading quick actions:', error);
        this.isLoading = false;
      }
    });
  }

  onActionClick(action: QuickAction): void {
    if (action.subActions && action.subActions.length > 0) {
      // Show sub-actions for recommendation
      this.selectedAction = action;
      this.showSubActions = true;
    } else if (action.action === 'category') {
      // Show categories grid
      this.showCategories = true;
    } else {
      // Emit action to parent
      this.actionSelected.emit({ action: action.action });
    }
  }

  onSubActionClick(subAction: SubAction): void {
    this.showSubActions = false;
    this.selectedAction = null;
    this.actionSelected.emit({
      action: 'recommend',
      data: { topic: subAction.id, title: subAction.title }
    });
  }

  onCategoryClick(categoryAction: CategoryAction): void {
    this.showCategories = false;
    this.actionSelected.emit({
      action: 'category',
      data: { category: categoryAction.category }
    });
  }

  closeSubActions(): void {
    this.showSubActions = false;
    this.selectedAction = null;
  }

  closeCategories(): void {
    this.showCategories = false;
  }

  get defaultActions(): QuickAction[] {
    return this.quickActionsData?.default || [];
  }

  get categoryActions(): CategoryAction[] {
    return this.quickActionsData?.categories || [];
  }

  get personalizedActions(): QuickAction[] {
    return this.quickActionsData?.personalized || [];
  }
}
