import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
@Component({ selector: 'app-workspace-page', template: '<section class="content"><p class="eyebrow">{{ eyebrow() }}</p><h1>{{ title() }}</h1><p>{{ description() }}</p></section>' })
export class WorkspacePage {
  private readonly data = toSignal(inject(ActivatedRoute).data, { requireSync: true });
  readonly eyebrow = computed(() => String(this.data()['eyebrow'] ?? 'Claims workspace'));
  readonly title = computed(() => String(this.data()['title'] ?? 'Workspace'));
  readonly description = computed(() => String(this.data()['description'] ?? 'This feature area will be delivered in its scheduled stage.'));
}
