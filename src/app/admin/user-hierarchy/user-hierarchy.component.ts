import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSitemap, faSpinner, faExclamationTriangle, faChevronLeft } from '@fortawesome/free-solid-svg-icons';

interface UserNode {
  _id: string;
  username: string;
  email: string;
  referredBy?: {
    _id: string;
    username: string;
  };
  children: UserNode[];
  level: number;
  expanded: boolean;
}

@Component({
  selector: 'app-user-hierarchy',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule],
  templateUrl: './user-hierarchy.component.html',
  styleUrls: ['./user-hierarchy.component.css']
})
export class UserHierarchyComponent implements OnInit {
  faSitemap = faSitemap;
  faSpinner = faSpinner;
  faExclamationTriangle = faExclamationTriangle;
  faChevronLeft = faChevronLeft;

  userHierarchy: UserNode[] = [];
  isLoading = true;

  constructor(private http: HttpClient, library: FaIconLibrary) {
    // Register icons to ensure they are available in the template
    library.addIcons(faSitemap, faSpinner, faExclamationTriangle, faChevronLeft);
  }

  ngOnInit() {
    this.loadUserHierarchy();
  }

  loadUserHierarchy() {
    this.isLoading = true;
    this.http.get<any[]>(`${environment.apiBaseUrl}/admin/user-hierarchy`).subscribe({
      next: (users) => {
        this.userHierarchy = this.buildTree(users);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading user hierarchy:', error);
        this.isLoading = false;
      }
    });
  }

  buildTree(users: any[]): UserNode[] {
    const userMap = new Map<string, UserNode>();
    const nodes: UserNode[] = [];

    // Initialize all nodes and add them to the map.
    users.forEach(user => {
      const node: UserNode = { ...user, children: [], level: 0, expanded: false };
      userMap.set(user._id, node);
      nodes.push(node);
    });

    // Link children to their parents.
    nodes.forEach(node => {
      if (node.referredBy && userMap.has(node.referredBy._id)) {
        const parent = userMap.get(node.referredBy._id)!;
        parent.children.push(node);
      }
    });

    // Recursively set levels
    const setLevel = (nodeList: UserNode[], level: number) => {
      nodeList.forEach(node => {
        node.level = level;
        if (node.children.length > 0) {
          setLevel(node.children, level + 1);
        }
      });
    };

    // A user is a root if they have no referrer, or their referrer is not in the provided user list.
    const roots = nodes.filter(node => !node.referredBy || !userMap.has(node.referredBy._id));
    setLevel(roots, 0);
    return roots;
  }

  toggleNode(node: UserNode) {
    node.expanded = !node.expanded;
  }
}
