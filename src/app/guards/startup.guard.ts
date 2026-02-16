import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class StartupGuard implements CanActivate {

    constructor(private router: Router) { }

    canActivate(): boolean | UrlTree {
        const lastState = localStorage.getItem('last_mushaf_state');
        const hasNavigated = sessionStorage.getItem('app_has_launched');

        // Only redirect on fresh launch (sessionStorage is cleared on browser close/tab close)
        // For mobile apps, this might persist longer, but generally we want this only on "startup".
        // Actually, localStorage check is enough if we just want to restore state.
        // But we don't want to redirect if the user clicked "Home" button explicitly and then refreshed? 
        // The requirement is "open app -> white screen -> open mushaf".

        if (lastState === 'mushaf') {
            // If we are already going to mushaf, this guard checks. 
            // But this guard is placed on the ROOT ('') path.
            return this.router.parseUrl('/mushaf');
        }

        // Default behavior: Allow navigation to proceed (which will usually hit the redirectTo: '/Home')
        // We strictly return true to let the route config handle the rest (e.g. redirection).
        return true;
    }
}
