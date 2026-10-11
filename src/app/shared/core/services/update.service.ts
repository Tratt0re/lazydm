import { Injectable, signal } from '@angular/core';

export interface UpdateResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly _updateResult = signal<UpdateResult | null>(null);
  private readonly _updateAvailable = signal(false);

  readonly updateResult = this._updateResult.asReadonly();
  readonly updateAvailable = this._updateAvailable.asReadonly();

  openReleasePage(): void {
    // TODO: Implement opening release page
    console.log('Opening release page...');
  }

  dismissModal(): void {
    // TODO: Implement dismissing modal
    console.log('Dismissing update modal...');
  }

  ignoreVersion(version: string): void {
    // TODO: Implement ignoring version
    console.log('Ignoring version:', version);
  }
}

// Made with Bob
