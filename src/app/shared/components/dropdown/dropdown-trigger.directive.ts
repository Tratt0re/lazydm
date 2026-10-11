import { Directive, ElementRef, inject, input, type OnInit, ViewContainerRef } from '@angular/core';

import type { ArcTechDropdownMenuContentComponent } from './dropdown-menu-content.component';
import { ArcTechDropdownService } from './dropdown.service';

@Directive({
  selector: '[arc-dropdown], [arcDropdown]',
  host: {
    '[attr.tabindex]': '0',
    '[attr.role]': '"button"',
    '[attr.aria-haspopup]': '"menu"',
    '[attr.aria-expanded]': 'dropdownService.isOpen()',
    '[attr.aria-disabled]': 'arcDisabled()',
    '(click.prevent-with-stop)': 'onClick()',
    '(mouseenter)': 'onHoverToggle($event)',
    '(mouseleave)': 'onHoverToggle($event)',
    '(keydown.{enter,space}.prevent-with-stop)': 'toggleDropdown()',
    '(keydown.arrowdown.prevent)': 'openDropdown()',
  },
  exportAs: 'arcDropdown',
})
export class ArcTechDropdownDirective implements OnInit {
  private readonly elementRef = inject(ElementRef);
  private readonly viewContainerRef = inject(ViewContainerRef);
  protected readonly dropdownService = inject(ArcTechDropdownService);

  readonly arcDropdownMenu = input<ArcTechDropdownMenuContentComponent>();
  readonly arcTrigger = input<'click' | 'hover'>('click');
  readonly arcDisabled = input<boolean>(false);

  ngOnInit() {
    // Ensure button has proper accessibility attributes
    const element = this.elementRef.nativeElement;
    if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
      const label = element.textContent?.trim();
      element.setAttribute('aria-label', label?.length ? label : 'Open menu');
    }
  }

  protected onClick() {
    if (this.arcTrigger() !== 'click') {
      return;
    }

    this.toggleDropdown();
  }

  protected onHoverToggle(event: MouseEvent) {
    if (this.arcTrigger() !== 'hover' || this.arcDisabled()) {
      return;
    }

    if (event.type === 'mouseenter') {
      this.openDropdown();
    } else if (event.type === 'mouseleave') {
      this.closeDropdown();
    }
  }

  protected toggleDropdown() {
    if (this.arcDisabled()) {
      return;
    }

    const menuContent = this.arcDropdownMenu();
    if (menuContent) {
      this.dropdownService.toggle(this.elementRef, menuContent.contentTemplate(), this.viewContainerRef);
    }
  }

  protected openDropdown() {
    if (this.arcDisabled()) {
      return;
    }

    const menuContent = this.arcDropdownMenu();
    if (menuContent && !this.dropdownService.isOpen()) {
      this.dropdownService.toggle(this.elementRef, menuContent.contentTemplate(), this.viewContainerRef);
    }
  }

  protected closeDropdown() {
    this.dropdownService.close();
  }
}
