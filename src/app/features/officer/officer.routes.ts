import { Routes } from '@angular/router';
import { WorkspacePage } from '../workspace-page';
export const OFFICER_ROUTES: Routes = [{ path: '', component: WorkspacePage, data: { title: 'Claims queue', eyebrow: 'Officer workspace', description: 'Your scoped claims queue.' } }, { path: 'queue', component: WorkspacePage, data: { title: 'Claims queue', eyebrow: 'Officer workspace' } }, { path: 'claims/:claimId', component: WorkspacePage, data: { title: 'Claim workbench', eyebrow: 'Officer workspace' } }];
