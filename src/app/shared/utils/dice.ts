/** Most dice and most sides one term can have: more is a typo, and keeps a roll instant. */
const DICE_COUNT_MAX = 100;
const DICE_SIDES_MAX = 1000;

/** A term: dice (`1d20`, `d6`), a whole number, or a `{key}` variable. */
const TERM_PATTERN = /^(?:(\d*)d(\d+)|(\d+)|\{([a-z][a-z0-9_]*)\})$/i;

export interface DiceRoll {
  /** What the formula came to. */
  readonly total: number;
  /** Each dice term with the faces it rolled (`1d20` → `[14]`), in the order of the formula. */
  readonly rolls: readonly (readonly number[])[];
}

/** Splits `1d20 + {dex} - 2` into signed terms; null when it is malformed (empty, `1d20 +`, `1d20 2`). */
function splitTerms(formula: string): { sign: 1 | -1; term: string }[] | null {
  // Two terms with only a space between them (`1d20 2`) are a typo, not one long number.
  if (/[\w}]\s+[\w{]/.test(formula.trim())) {
    return null;
  }

  const parts = formula.replace(/\s+/g, '').split(/(?=[+-])/);
  const terms: { sign: 1 | -1; term: string }[] = [];
  for (const part of parts) {
    const term = part.replace(/^[+-]/, '');
    if (term.length === 0) {
      return null;
    }
    terms.push({ sign: part.startsWith('-') ? -1 : 1, term });
  }

  return terms.length > 0 ? terms : null;
}

/** Why a formula cannot be rolled, or null when it can. `variables` are the integers `{key}` may stand for. */
export function getDiceFormulaError(
  formula: string,
  variables: Readonly<Record<string, number>> = {},
): string | null {
  const terms = splitTerms(formula);
  if (!terms) {
    return 'Not a formula, e.g. 1d20 + {dex}';
  }

  for (const { term } of terms) {
    const match = TERM_PATTERN.exec(term);
    if (!match) {
      return `Unknown term "${term}"`;
    }

    const [, count, sides, , variable] = match;
    if (
      sides !== undefined &&
      (Number(count || 1) < 1 ||
        Number(count || 1) > DICE_COUNT_MAX ||
        Number(sides) < 1 ||
        Number(sides) > DICE_SIDES_MAX)
    ) {
      return `Dice out of range in "${term}"`;
    }
    if (variable !== undefined && !Number.isInteger(variables[variable])) {
      return `No whole number for {${variable}}`;
    }
  }

  return null;
}

/**
 * Rolls a dice formula such as `1d20`, `1d100`, `2d6 + 3` or `1d20 + {dex}`. A `{key}` stands for the integer in
 * `variables`: a positive one is added, a negative one subtracts. Only dice, whole numbers, variables, `+` and `-`
 * are understood (never evaluated as code); anything else throws with the reason. `random` returns [0, 1).
 */
export function rollDice(
  formula: string,
  variables: Readonly<Record<string, number>> = {},
  random: () => number = Math.random,
): DiceRoll {
  const error = getDiceFormulaError(formula, variables);
  if (error) {
    throw new Error(error);
  }

  const rolls: number[][] = [];
  let total = 0;
  for (const { sign, term } of splitTerms(formula) ?? []) {
    const [, count, sides, number, variable] = TERM_PATTERN.exec(term) ?? [];
    if (sides !== undefined) {
      const faces = Array.from(
        { length: Number(count || 1) },
        () => 1 + Math.floor(random() * Number(sides)),
      );
      rolls.push(faces);
      total += sign * faces.reduce((sum, face) => sum + face, 0);
    } else {
      total += sign * (number !== undefined ? Number(number) : variables[variable]);
    }
  }

  return { total, rolls };
}
