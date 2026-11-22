import { Routes } from '@angular/router';
import { ClaimDetailPage } from './claim-detail.page';
import { ClaimListPage } from './claim-list.page';
import { ClaimSubmitPage } from './claim-submit.page';

export const CLAIMANT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: ClaimListPage },
  { path: 'claims', component: ClaimListPage },
  { path: 'claims/new', component: ClaimSubmitPage },
  { path: 'claims/:claimId', component: ClaimDetailPage },
];
