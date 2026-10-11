import { Directive, inject, Injectable, input, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
class ArcTechIdInternalService {
  private counter = 0;
  generate(prefix: string) {
    return `${prefix}-${++this.counter}`;
  }
}

@Directive({
  selector: '[arcTechId]',
  exportAs: 'arcTechId',
})
export class ArcTechIdDirective {
  private idService = inject(ArcTechIdInternalService);

  readonly arcTechId = input('ssr');

  readonly id = computed(() => this.idService.generate(this.arcTechId()));
}
