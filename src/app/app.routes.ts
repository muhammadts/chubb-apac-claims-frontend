import { Routes } from '@angular/router';
import { roleGuard } from './core/auth';
import { WorkspacePage } from './features/workspace-page';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'claimant/dashboard' },
  { path: 'claimant', canActivate: [roleGuard], data: { role: 'Claimant' }, loadChildren: () => import('./features/claimant/claimant.routes').then((m) => m.CLAIMANT_ROUTES) },
  { path: 'officer', canActivate: [roleGuard], data: { role: 'ClaimsOfficer' }, loadChildren: () => import('./features/officer/officer.routes').then((m) => m.OFFICER_ROUTES) },
  { path: 'manager', canActivate: [roleGuard], data: { role: 'Manager' }, loadChildren: () => import('./features/manager/manager.routes').then((m) => m.MANAGER_ROUTES) },
  { path: 'sign-in-required', component: WorkspacePage, data: { title: 'Sign-in required', eyebrow: 'Authentication required', description: 'Sign in with a configured identity provider before opening a claims workspace. API access requires a valid access token.' } },
  { path: 'forbidden', component: WorkspacePage, data: { title: 'Access unavailable', eyebrow: 'Forbidden', description: 'Your signed-in role does not have access to this workspace. The backend authorization remains authoritative.' } },
  { path: '**', component: WorkspacePage, data: { title: 'Page not found', eyebrow: '404', description: 'This page does not exist.' } },
];
