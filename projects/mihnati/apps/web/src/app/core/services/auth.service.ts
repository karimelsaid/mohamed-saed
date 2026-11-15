import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, switchMap } from 'rxjs';

export interface UserDto {
  id: string;
  phone: string;
  name: string;
  locale?: string;
  status: string;
}

export interface UserRoleDto {
  id: string;
  userId: string;
  roleKey: 'customer' | 'professional' | 'merchant' | 'admin';
  status: 'active' | 'suspended';
  grantedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1';

  readonly currentUser = signal<UserDto | null>(null);
  readonly userRoles = signal<UserRoleDto[]>([]);
  readonly activeRole = signal<'customer' | 'professional' | 'merchant' | 'admin'>(
    (localStorage.getItem('mihnati_active_role') as any) || 'customer'
  );

  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isAdmin = computed(() => 
    this.activeRole() === 'admin' ||
    this.userRoles().some((r) => r.roleKey === 'admin' && r.status === 'active')
  );
  readonly isMerchant = computed(() => this.activeRole() === 'merchant');
  readonly isProfessional = computed(() => this.activeRole() === 'professional');
  readonly isCustomer = computed(() => this.activeRole() === 'customer');

  constructor() {
    this.checkSession();
  }

  checkSession(): void {
    this.http.get<{ data: UserDto }>(`${this.baseUrl}/me`).pipe(
      tap((res) => {
        this.currentUser.set(res.data);
        this.loadRoles();
      }),
      catchError(() => {
        this.currentUser.set(null);
        this.userRoles.set([]);
        return of(null);
      })
    ).subscribe();
  }

  /**
   * Determine primary account role based on server assignments.
   * Priority: Admin > Merchant > Professional > Customer.
   * Role is mandatory and fixed at registration.
   */
  private determinePrimaryRole(roles: UserRoleDto[]): 'customer' | 'professional' | 'merchant' | 'admin' {
    const activeRoles = roles.filter((r) => r.status === 'active').map((r) => r.roleKey);
    if (activeRoles.includes('admin')) return 'admin';
    if (activeRoles.includes('merchant')) return 'merchant';
    if (activeRoles.includes('professional')) return 'professional';
    return 'customer';
  }

  loadRoles(): void {
    this.http.get<{ data: UserRoleDto[] }>(`${this.baseUrl}/me/roles`).pipe(
      tap((res) => {
        this.userRoles.set(res.data);
        const fixedRole = this.determinePrimaryRole(res.data);
        this.activeRole.set(fixedRole);
        localStorage.setItem('mihnati_active_role', fixedRole);
      }),
      catchError(() => of([]))
    ).subscribe();
  }

  login(phone: string, password: string): Observable<any> {
    return this.http.post<{ data: { user: UserDto } }>(`${this.baseUrl}/auth/login`, { phone, password }).pipe(
      tap((res) => {
        this.currentUser.set(res.data.user);
        this.loadRoles();
      })
    );
  }

  /**
   * Registers a new user with their chosen mandatory role.
   * Chaining: Register -> Login -> Activate Selected Role -> Load Roles.
   */
  register(
    phone: string,
    password: string,
    name: string,
    roleKey: 'customer' | 'professional' | 'merchant' = 'customer'
  ): Observable<any> {
    return this.http.post<{ data: UserDto }>(`${this.baseUrl}/auth/register`, { phone, password, name }).pipe(
      switchMap(() => this.login(phone, password)),
      switchMap(() => this.http.post(`${this.baseUrl}/me/roles/${roleKey}/activate`, {})),
      tap(() => {
        this.activeRole.set(roleKey);
        localStorage.setItem('mihnati_active_role', roleKey);
        this.loadRoles();
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/logout`, {}).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.userRoles.set([]);
        this.activeRole.set('customer');
        localStorage.removeItem('mihnati_active_role');
      }),
      catchError(() => {
        this.currentUser.set(null);
        this.userRoles.set([]);
        this.activeRole.set('customer');
        localStorage.removeItem('mihnati_active_role');
        return of(null);
      })
    );
  }

  activateRole(roleKey: 'customer' | 'professional' | 'merchant'): Observable<any> {
    return this.http.post(`${this.baseUrl}/me/roles/${roleKey}/activate`, {}).pipe(
      tap(() => {
        this.loadRoles();
      })
    );
  }
}
