import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../auth/auth.service';
import { Observable, of } from 'rxjs';
import { map, take, tap } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class AdminAuthGuard implements CanActivate {

    constructor(
        private router: Router,
        private authService: AuthService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    canActivate(): Observable<boolean> {
        if (!isPlatformBrowser(this.platformId)) {
            return of(true);
        }

        return this.authService.user$.pipe(
            take(1),
            map(user => {
                console.log('🛡️ [AdminAuthGuard] Current user role:', user?.role);
                
                // Also check localStorage as a fallback if AuthService hasn't emitted yet (though it's a BehaviorSubject)
                let finalRole = user?.role;
                if (!finalRole) {
                    const userStr = localStorage.getItem('user');
                    if (userStr) {
                        try {
                            const localUser = JSON.parse(userStr);
                            finalRole = localUser.role;
                        } catch (e) {}
                    }
                }

                if (finalRole === 'admin' || finalRole === 'staff') {
                    console.log('✅ [AdminAuthGuard] Access granted for:', finalRole);
                    return true;
                }

                console.warn('❌ [AdminAuthGuard] Access denied for role:', finalRole);
                alert('ليس لديك صلاحية للوصول لهذا المحتوى.');
                this.router.navigate(['/']);
                return false;
            })
        );
    }
}
