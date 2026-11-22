import { Routes } from '@angular/router';
import { OfficerQueuePage } from './officer-queue.page';
import { OfficerWorkbenchPage } from './officer-workbench.page';

export const OFFICER_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'queue' },
  { path: 'queue', component: OfficerQueuePage },
  { path: 'claims/:claimId', component: OfficerWorkbenchPage },
];
