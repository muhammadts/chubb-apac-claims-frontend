import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppSettings, SETTINGS } from '../../core/auth';
import { ClaimCard, ClaimSubmission, ClaimsApi, MotorDetails, MutationResult, PropertyDetails } from '../../core/claims-api';
import { isAmbiguousWriteOutcome, claimantErrorMessage, serverValidationMessages } from './claimant-errors';

type SubmissionStep = 'form' | 'review' | 'confirmation' | 'unknown';

@Component({
  selector: 'app-claim-submit-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page">
      <p class="eyebrow">Claimant workspace</p>
      <h1>Start a claim</h1>
      @if (markets.length === 0) {
        <section class="setup" role="status" aria-labelledby="market-setup-title">
          <h2 id="market-setup-title">Market choices are not configured</h2>
          <p>Ask your administrator to add the approved market codes and display names to the public runtime configuration. Claim submission is unavailable until those choices are provided.</p>
        </section>
      } @else if (step() === 'form') {
        <p class="intro">Enter the incident and contact details, then review the information before submitting.</p>
        @if (serverErrors().length) {
          <section class="server-errors" role="alert" aria-labelledby="server-error-title">
            <h2 id="server-error-title">The server needs some changes</h2>
            <ul>@for (message of serverErrors(); track $index) { <li>{{ message }}</li> }</ul>
          </section>
        }
        <form [formGroup]="form" (ngSubmit)="continueToReview()" novalidate>
          <fieldset>
            <legend>Claim type and market</legend>
            <div class="field">
              <label for="marketCode">Market</label>
              <select id="marketCode" formControlName="marketCode" required [attr.aria-describedby]="invalid(form.controls.marketCode) ? 'market-help market-error' : 'market-help'" [attr.aria-invalid]="invalid(form.controls.marketCode)">
                <option value="">Choose a market</option>
                @for (market of markets; track market.code) { <option [value]="market.code">{{ market.name }}</option> }
              </select>
              <small id="market-help">Choose from the markets configured for this service.</small>
              @if (invalid(form.controls.marketCode)) { <span id="market-error" class="field-error">Choose a market.</span> }
            </div>
            <div class="field">
              <label for="lineOfBusiness">Line of business</label>
              <select id="lineOfBusiness" formControlName="lineOfBusiness">
                <option value="Motor">Motor</option>
                <option value="Property">Property</option>
              </select>
            </div>
          </fieldset>

          <fieldset formGroupName="contact">
            <legend>Your contact details</legend>
            <div class="field">
              <label for="contactName">Full name</label>
              <input id="contactName" formControlName="name" autocomplete="name" required [attr.aria-invalid]="invalid(form.controls.contact.controls.name)" [attr.aria-describedby]="invalid(form.controls.contact.controls.name) ? 'contact-name-error' : null">
              @if (invalid(form.controls.contact.controls.name)) { <span id="contact-name-error" class="field-error">Enter your name.</span> }
            </div>
            <div class="field">
              <label for="contactEmail">Email address</label>
              <input id="contactEmail" type="email" formControlName="email" autocomplete="email" required [attr.aria-invalid]="invalid(form.controls.contact.controls.email)" [attr.aria-describedby]="invalid(form.controls.contact.controls.email) ? 'contact-email-error' : null">
              @if (invalid(form.controls.contact.controls.email)) { <span id="contact-email-error" class="field-error">Enter a valid email address.</span> }
            </div>
            <div class="field">
              <label for="contactPhone">Phone <span class="optional">(optional)</span></label>
              <input id="contactPhone" type="tel" formControlName="phone" autocomplete="tel">
            </div>
          </fieldset>

          <fieldset formGroupName="incident">
            <legend>Incident details</legend>
            <div class="field">
              <label for="occurredAt">When did it happen?</label>
              <input id="occurredAt" type="datetime-local" formControlName="occurredAt" required [attr.aria-invalid]="invalid(form.controls.incident.controls.occurredAt)" [attr.aria-describedby]="invalid(form.controls.incident.controls.occurredAt) ? 'occurredAt-error' : null">
              @if (invalid(form.controls.incident.controls.occurredAt)) { <span id="occurredAt-error" class="field-error">Enter when the incident occurred.</span> }
            </div>
            <div class="field">
              <label for="incidentDescription">What happened?</label>
              <textarea id="incidentDescription" formControlName="description" rows="4" required [attr.aria-invalid]="invalid(form.controls.incident.controls.description)" [attr.aria-describedby]="invalid(form.controls.incident.controls.description) ? 'incident-description-error' : null"></textarea>
              @if (invalid(form.controls.incident.controls.description)) { <span id="incident-description-error" class="field-error">Describe the incident.</span> }
            </div>
          </fieldset>
          <div class="field report-date">
            <label for="reportedAt">When are you reporting it? <span class="optional">(optional)</span></label>
            <input id="reportedAt" type="datetime-local" formControlName="reportedAt">
          </div>

          @if (form.controls.lineOfBusiness.value === 'Motor') {
            <fieldset formGroupName="motor">
              <legend>Motor details <span class="optional">(optional)</span></legend>
              <div class="grid">
                <div class="field"><label for="vehicleRegistration">Vehicle registration</label><input id="vehicleRegistration" formControlName="vehicleRegistration"></div>
                <div class="field"><label for="vehicleMake">Make</label><input id="vehicleMake" formControlName="make"></div>
                <div class="field"><label for="vehicleModel">Model</label><input id="vehicleModel" formControlName="model"></div>
                <div class="field"><label for="modelYear">Model year</label><input id="modelYear" type="number" formControlName="modelYear"></div>
                <div class="field"><label for="vehicleUse">Vehicle use</label><input id="vehicleUse" formControlName="vehicleUse"></div>
                <div class="field">
                  <label for="drivable">Is the vehicle drivable?</label>
                  <select id="drivable" formControlName="drivable"><option [ngValue]="null">Not provided</option><option [ngValue]="true">Yes</option><option [ngValue]="false">No</option></select>
                </div>
                <div class="field">
                  <label for="otherPartyInvolved">Was another party involved?</label>
                  <select id="otherPartyInvolved" formControlName="otherPartyInvolved"><option [ngValue]="null">Not provided</option><option [ngValue]="true">Yes</option><option [ngValue]="false">No</option></select>
                </div>
              </div>
            </fieldset>
          } @else {
            <fieldset formGroupName="property">
              <legend>Property details <span class="optional">(optional)</span></legend>
              <div class="grid">
                <div class="field"><label for="propertyType">Property type</label><input id="propertyType" formControlName="propertyType"></div>
                <div class="field"><label for="addressLine1">Address line 1</label><input id="addressLine1" formControlName="addressLine1" autocomplete="address-line1"></div>
                <div class="field"><label for="addressLine2">Address line 2</label><input id="addressLine2" formControlName="addressLine2" autocomplete="address-line2"></div>
                <div class="field"><label for="city">City</label><input id="city" formControlName="city" autocomplete="address-level2"></div>
                <div class="field"><label for="region">Region</label><input id="region" formControlName="region" autocomplete="address-level1"></div>
                <div class="field"><label for="postalCode">Postal code</label><input id="postalCode" formControlName="postalCode" autocomplete="postal-code"></div>
                <div class="field"><label for="countryCode">Country code</label><input id="countryCode" formControlName="countryCode" autocomplete="country"></div>
                <div class="field"><label for="lossCause">Cause of loss</label><input id="lossCause" formControlName="lossCause"></div>
                <div class="field">
                  <label for="affectedAreaDescription">Affected area</label>
                  <textarea id="affectedAreaDescription" formControlName="affectedAreaDescription" rows="3"></textarea>
                </div>
                <div class="field">
                  <label for="habitable">Is the property habitable?</label>
                  <select id="habitable" formControlName="habitable"><option [ngValue]="null">Not provided</option><option [ngValue]="true">Yes</option><option [ngValue]="false">No</option></select>
                </div>
              </div>
            </fieldset>
          }
          <p class="form-error" role="alert" aria-live="polite">{{ clientError() }}</p>
          <div class="actions">
            <button type="submit" class="primary">Review claim</button>
            <a routerLink="/claimant/claims">Cancel</a>
          </div>
        </form>
      } @else if (step() === 'review') {
        @if (serverErrors().length) {
          <section class="server-errors" role="alert"><h2>Server validation</h2><ul>@for (message of serverErrors(); track $index) { <li>{{ message }}</li> }</ul></section>
        }
        <section class="review" aria-labelledby="review-title">
          <h2 id="review-title">Review your claim</h2>
          <p>Check these details. You can go back and make changes before submitting.</p>
          <dl>
            <dt>Market</dt><dd>{{ selectedMarketName() }}</dd>
            <dt>Line of business</dt><dd>{{ payload()?.lineOfBusiness }}</dd>
            <dt>Name</dt><dd>{{ payload()?.contact?.name }}</dd>
            <dt>Email</dt><dd>{{ payload()?.contact?.email }}</dd>
            @if (payload()?.contact?.phone) { <dt>Phone</dt><dd>{{ payload()?.contact?.phone }}</dd> }
            <dt>Incident occurred</dt><dd>{{ payload()?.incident?.occurredAt | date:'medium' }}</dd>
            @if (payload()?.reportedAt) { <dt>Reported at</dt><dd>{{ payload()?.reportedAt | date:'medium' }}</dd> }
            <dt>Incident description</dt><dd class="description">{{ payload()?.incident?.description }}</dd>
          </dl>
          @if (payload()?.motor; as motor) {
            <h3>Motor details</h3>
            <dl class="details">
              @if (motor.vehicleRegistration) { <dt>Vehicle registration</dt><dd>{{ motor.vehicleRegistration }}</dd> }
              @if (motor.make) { <dt>Make</dt><dd>{{ motor.make }}</dd> }
              @if (motor.model) { <dt>Model</dt><dd>{{ motor.model }}</dd> }
              @if (motor.modelYear != null) { <dt>Model year</dt><dd>{{ motor.modelYear }}</dd> }
              @if (motor.vehicleUse) { <dt>Vehicle use</dt><dd>{{ motor.vehicleUse }}</dd> }
              @if (motor.drivable != null) { <dt>Drivable</dt><dd>{{ motor.drivable ? 'Yes' : 'No' }}</dd> }
              @if (motor.otherPartyInvolved != null) { <dt>Other party involved</dt><dd>{{ motor.otherPartyInvolved ? 'Yes' : 'No' }}</dd> }
              @if (!hasMotorDetails()) { <dt>Additional details</dt><dd>None provided</dd> }
            </dl>
          }
          @if (payload()?.property; as property) {
            <h3>Property details</h3>
            <dl class="details">
              @if (property.propertyType) { <dt>Property type</dt><dd>{{ property.propertyType }}</dd> }
              @if (property.addressLine1) { <dt>Address line 1</dt><dd>{{ property.addressLine1 }}</dd> }
              @if (property.addressLine2) { <dt>Address line 2</dt><dd>{{ property.addressLine2 }}</dd> }
              @if (property.city) { <dt>City</dt><dd>{{ property.city }}</dd> }
              @if (property.region) { <dt>Region</dt><dd>{{ property.region }}</dd> }
              @if (property.postalCode) { <dt>Postal code</dt><dd>{{ property.postalCode }}</dd> }
              @if (property.countryCode) { <dt>Country code</dt><dd>{{ property.countryCode }}</dd> }
              @if (property.lossCause) { <dt>Cause of loss</dt><dd>{{ property.lossCause }}</dd> }
              @if (property.affectedAreaDescription) { <dt>Affected area</dt><dd>{{ property.affectedAreaDescription }}</dd> }
              @if (property.habitable != null) { <dt>Habitable</dt><dd>{{ property.habitable ? 'Yes' : 'No' }}</dd> }
              @if (!hasPropertyDetails()) { <dt>Additional details</dt><dd>None provided</dd> }
            </dl>
          }
        </section>
        @if (submitError()) { <p class="form-error" role="alert">{{ submitError() }}</p> }
        <div class="actions">
          <button type="button" class="primary" (click)="submit()" [disabled]="submitting()">{{ submitting() ? 'Submitting…' : 'Submit claim' }}</button>
          <button type="button" (click)="backToForm()" [disabled]="submitting()">Back to edit</button>
        </div>
      } @else if (step() === 'confirmation') {
        <section class="confirmation" role="status" aria-labelledby="confirmation-title">
          <h2 id="confirmation-title">Claim submitted</h2>
          <p>Your claim has been received. Keep the claim number for your records.</p>
          <dl><dt>Claim number</dt><dd>{{ result()?.claimNumber }}</dd><dt>Claim ID</dt><dd>{{ result()?.claimId }}</dd><dt>Status</dt><dd>{{ result()?.status }}</dd></dl>
          <a class="primary" [routerLink]="['/claimant/claims', result()?.claimId]">View claim</a>
          <a class="secondary-link" routerLink="/claimant/claims">Go to your claims</a>
        </section>
      } @else {
        <section class="unknown" role="alert" aria-labelledby="unknown-title">
          <h2 id="unknown-title">Submission outcome not confirmed</h2>
          <p>{{ submitError() }}</p>
          <p>We did not submit the claim again. Check your claims before taking further action.</p>
          @if (checkingClaims()) { <p role="status">Refreshing your claim list…</p> }
          @if (listCheckError()) { <p class="form-error">{{ listCheckError() }}</p><button type="button" (click)="checkClaims()">Refresh claim list</button> }
          @if (checkedClaims(); as claims) {
            @if (claims.length) {
              <ul>
                @for (claim of claims; track claim.claimId) {
                  <li><a [routerLink]="['/claimant/claims', claim.claimId]">{{ claim.claimNumber }} — {{ claim.status }}</a></li>
                }
              </ul>
            } @else { <p>The refreshed first page contains no claims. Use your claims list to check older pages before deciding what to do.</p> }
          }
          @if (unknownListCursor()) { <button type="button" (click)="loadMoreUnknownClaims()" [disabled]="checkingClaims()">Load more claims</button> }
          <div class="actions">
            <a class="primary" routerLink="/claimant/claims">Open your claims</a>
          </div>
        </section>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:900px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,5vw,3rem) 3rem; }
    .eyebrow { margin:0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; }
    h2 { margin-top:0; }
    .intro,.optional { color:#586676; }
    fieldset,.review,.confirmation,.unknown,.setup { margin:1.2rem 0; padding:1.2rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    legend { padding:0 .4rem; color:#263645; font-size:1.1rem; font-weight:700; }
    .field { display:grid; gap:.4rem; margin:.8rem 0; }
    label { color:#263645; font-weight:650; }
    input,select,textarea { width:100%; min-height:2.75rem; padding:.65rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#17232e; }
    textarea { min-height:6rem; resize:vertical; }
    small { color:#586676; }
    .field-error,.form-error { color:#8c1f1f; }
    .field-error { font-size:.88rem; }
    .form-error:empty { display:none; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 1rem; }
    .actions { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; margin:1.25rem 0; }
    button,.primary,.secondary-link { min-height:2.75rem; padding:.65rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; text-decoration:none; }
    .primary { display:inline-flex; align-items:center; justify-content:center; border-color:#9d1228; background:#9d1228; color:#fff; }
    button:disabled { opacity:.65; cursor:wait; }
    .secondary-link { border:0; color:#8f1025; }
    .server-errors,.setup { border-color:#e4d8b8; background:#fff9ea; color:#493b1e; }
    .server-errors { margin:1rem 0; padding:1rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    .server-errors h2 { font-size:1.05rem; }
    dl { display:grid; grid-template-columns:minmax(8rem, .45fr) minmax(0,1fr); gap:.55rem 1rem; margin:1rem 0; }
    dt { color:#586676; font-weight:650; }
    dd { margin:0; overflow-wrap:anywhere; }
    .description { white-space:pre-wrap; }
    .details { border-top:1px solid #e5e9ed; padding-top:.8rem; }
    .confirmation { border-color:#a9d2b7; background:#f3fbf5; }
    .unknown { border-color:#e4d8b8; background:#fff9ea; }
    @media (max-width:620px) {
      .page { margin:1.5rem auto; }
      .grid { grid-template-columns:1fr; }
      fieldset,.review,.confirmation,.unknown,.setup { padding:.9rem; }
      dl { grid-template-columns:1fr; gap:.2rem; }
      dd { margin-bottom:.65rem; }
      .actions > * { flex:1 1 100%; text-align:center; }
    }
  `],
})
export class ClaimSubmitPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClaimsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly settings: AppSettings = inject(SETTINGS);
  readonly markets = this.settings.markets;
  readonly form = this.fb.group({
    marketCode: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(/\S/)]),
    lineOfBusiness: this.fb.nonNullable.control<'Motor' | 'Property'>('Motor'),
    contact: this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.pattern(/\S/)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
    }),
    incident: this.fb.nonNullable.group({
      occurredAt: ['', Validators.required],
      description: ['', [Validators.required, Validators.pattern(/\S/)]],
    }),
    reportedAt: this.fb.nonNullable.control(''),
    motor: this.fb.nonNullable.group({
      vehicleRegistration: [''],
      make: [''],
      model: [''],
      modelYear: this.fb.control<number | null>(null),
      vehicleUse: [''],
      drivable: this.fb.control<boolean | null>(null),
      otherPartyInvolved: this.fb.control<boolean | null>(null),
    }),
    property: this.fb.nonNullable.group({
      propertyType: [''],
      addressLine1: [''],
      addressLine2: [''],
      city: [''],
      region: [''],
      postalCode: [''],
      countryCode: [''],
      lossCause: [''],
      affectedAreaDescription: [''],
      habitable: this.fb.control<boolean | null>(null),
    }),
  });
  readonly step = signal<SubmissionStep>('form');
  readonly payload = signal<ClaimSubmission | null>(null);
  readonly result = signal<MutationResult | null>(null);
  readonly submitting = signal(false);
  readonly clientError = signal('');
  readonly submitError = signal('');
  readonly serverErrors = signal<string[]>([]);
  readonly checkedClaims = signal<ClaimCard[] | null>(null);
  readonly unknownListCursor = signal<string | null>(null);
  readonly checkingClaims = signal(false);
  readonly listCheckError = signal('');

  invalid(control: { invalid: boolean; touched: boolean }): boolean { return control.invalid && control.touched; }

  continueToReview(): void {
    this.form.markAllAsTouched();
    this.clientError.set('');
    this.serverErrors.set([]);
    if (this.markets.length === 0) return;
    if (this.form.invalid) {
      this.clientError.set('Check the highlighted fields before reviewing your claim.');
      return;
    }
    try {
      this.payload.set(this.toSubmission());
      this.step.set('review');
    } catch {
      this.clientError.set('Enter valid incident and reporting dates.');
    }
  }

  backToForm(): void {
    this.submitError.set('');
    this.step.set('form');
  }

  submit(): void {
    const body = this.payload();
    if (!body || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set('');
    this.serverErrors.set([]);
    this.api.submitClaim(body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.result.set(response.body);
        this.step.set('confirmation');
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (isAmbiguousWriteOutcome(error)) {
          this.submitError.set('The service did not confirm whether it received your claim.');
          this.step.set('unknown');
          this.checkClaims();
          return;
        }
        this.submitError.set(claimantErrorMessage(error));
        this.serverErrors.set(serverValidationMessages(error));
        this.step.set(error instanceof HttpErrorResponse && error.status === 400 ? 'form' : 'review');
      },
    });
  }

  checkClaims(): void {
    if (this.checkingClaims()) return;
    this.checkingClaims.set(true);
    this.listCheckError.set('');
    this.api.claimantClaims().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => {
        this.checkedClaims.set(page.items);
        this.unknownListCursor.set(page.nextCursor);
        this.checkingClaims.set(false);
      },
      error: (error: unknown) => {
        this.listCheckError.set(claimantErrorMessage(error));
        this.checkingClaims.set(false);
      },
    });
  }

  loadMoreUnknownClaims(): void {
    const cursor = this.unknownListCursor();
    if (!cursor || this.checkingClaims()) return;
    this.checkingClaims.set(true);
    this.listCheckError.set('');
    this.api.claimantClaims(20, cursor).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => {
        this.checkedClaims.update((claims) => [...(claims ?? []), ...page.items]);
        this.unknownListCursor.set(page.nextCursor);
        this.checkingClaims.set(false);
      },
      error: (error: unknown) => {
        this.listCheckError.set(claimantErrorMessage(error));
        this.checkingClaims.set(false);
      },
    });
  }

  selectedMarketName(): string {
    const code = this.payload()?.marketCode;
    return this.markets.find((market) => market.code === code)?.name ?? code ?? '';
  }

  hasMotorDetails(): boolean {
    const motor = this.payload()?.motor;
    return !!motor && Object.values(motor).some((value) => value !== undefined && value !== null && value !== '');
  }

  hasPropertyDetails(): boolean {
    const property = this.payload()?.property;
    return !!property && Object.values(property).some((value) => value !== undefined && value !== null && value !== '');
  }

  private toSubmission(): ClaimSubmission {
    const raw = this.form.getRawValue();
    const common = {
      marketCode: raw.marketCode,
      contact: {
        name: raw.contact.name.trim(),
        email: raw.contact.email.trim(),
        ...(raw.contact.phone.trim() ? { phone: raw.contact.phone.trim() } : {}),
      },
      incident: {
        occurredAt: toIsoDate(raw.incident.occurredAt),
        description: raw.incident.description.trim(),
      },
      ...(raw.reportedAt ? { reportedAt: toIsoDate(raw.reportedAt) } : {}),
    };
    return raw.lineOfBusiness === 'Motor'
      ? { ...common, lineOfBusiness: 'Motor', motor: compactMotor(raw.motor) }
      : { ...common, lineOfBusiness: 'Property', property: compactProperty(raw.property) };
  }
}

function toIsoDate(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error('Invalid date.');
  return date.toISOString();
}

function compactMotor(value: ReturnType<ClaimSubmitPage['form']['getRawValue']>['motor']): MotorDetails {
  const result: MotorDetails = {};
  const textFields: Array<keyof Pick<MotorDetails, 'vehicleRegistration' | 'make' | 'model' | 'vehicleUse'>> =
    ['vehicleRegistration', 'make', 'model', 'vehicleUse'];
  for (const field of textFields) {
    const text = value[field]?.trim();
    if (text) result[field] = text;
  }
  if (value.modelYear !== null) result.modelYear = value.modelYear;
  if (value.drivable !== null) result.drivable = value.drivable;
  if (value.otherPartyInvolved !== null) result.otherPartyInvolved = value.otherPartyInvolved;
  return result;
}

function compactProperty(value: ReturnType<ClaimSubmitPage['form']['getRawValue']>['property']): PropertyDetails {
  const result: PropertyDetails = {};
  const textFields: Array<keyof Omit<PropertyDetails, 'habitable'>> = [
    'propertyType', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode',
    'countryCode', 'lossCause', 'affectedAreaDescription',
  ];
  for (const field of textFields) {
    const text = value[field]?.trim();
    if (text) result[field] = text;
  }
  if (value.habitable !== null) result.habitable = value.habitable;
  return result;
}
