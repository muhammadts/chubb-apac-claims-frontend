import { Routes } from '@angular/router';
import { ManagerOverviewPage } from './manager-overview.page';
import { ManagerPerformancePage } from './manager-performance.page';
import { ManagerExposurePage } from './manager-exposure.page';

export const MANAGER_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', component: ManagerOverviewPage },
  { path: 'performance', component: ManagerPerformancePage },
  { path: 'exposure', component: ManagerExposurePage },
];
