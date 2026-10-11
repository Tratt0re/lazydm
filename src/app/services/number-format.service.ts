import { Injectable } from '@angular/core';

import {
  formatCurrency,
  formatNumber,
  formatPercent,
  normalizeCurrencySymbol,
  normalizeLocalizedNumericInput,
  normalizeNumberFormatStyle,
  parseLocalizedNumber,
  type AppNumberFormatOptions,
  type AppNumberParseOptions,
  type NumberFormatStyle,
} from '@/shared/utils/number-format';

const DEFAULT_FORMAT_STYLE: NumberFormatStyle = 'US';

@Injectable({
  providedIn: 'root',
})
export class NumberFormatService {
  formatNumber(value: number, options: AppNumberFormatOptions = {}): string {
    return formatNumber(value, DEFAULT_FORMAT_STYLE, options);
  }

  formatCurrency(value: number, symbol: string, options: AppNumberFormatOptions = {}): string {
    return formatCurrency(value, symbol, DEFAULT_FORMAT_STYLE, options);
  }

  formatPercent(value: number, options: AppNumberFormatOptions = {}): string {
    return formatPercent(value, DEFAULT_FORMAT_STYLE, options);
  }

  normalizeInput(value: unknown, options: AppNumberParseOptions = {}): string {
    return normalizeLocalizedNumericInput(value, DEFAULT_FORMAT_STYLE, options);
  }

  parse(value: unknown, options: AppNumberParseOptions = {}): number | null {
    return parseLocalizedNumber(value, DEFAULT_FORMAT_STYLE, options);
  }

  normalizeCurrencySymbol(value: unknown): string {
    return normalizeCurrencySymbol(value);
  }

  normalizeFormatStyle(value: unknown): NumberFormatStyle {
    return normalizeNumberFormatStyle(value);
  }
}
