import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/i18n.service';
import { IconComponent } from '../shared/icon';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink, TPipe, IconComponent],
  template: `
    <div class="card"><div class="empty"><app-icon name="lock" /><h3>{{ 'error.forbiddenTitle' | t }}</h3><p>{{ 'error.forbiddenText' | t }}</p>
      <a class="btn btn-primary btn-sm" routerLink="/dashboard">{{ 'common.backDashboard' | t }}</a></div></div>
  `,
})
export class ForbiddenPage {}
