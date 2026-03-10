/**
 * Typo detection for misspelled commands.
 *
 * ASST-05: Detects misspelled/mangled commands and routes them to the AI
 * for correction. Uses Levenshtein distance to find near-matches against
 * the command catalog.
 */

/**
 * Calculate the Levenshtein edit distance between two strings.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Minimum number of single-character edits (insert, delete, substitute)
 */
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Result of typo detection.
 */
export interface TypoDetectionResult {
  /** Whether the input looks like a misspelled command */
  isTypo: boolean;
  /** Suggested correction hint for the AI */
  hint: string;
}

/**
 * Detect if user input is a possible misspelled command.
 *
 * Heuristic: input is 1-3 words, and either the category (first word) or
 * the full command (category.action) fuzzy-matches a known command within
 * a small edit distance.
 *
 * @param input - The user's terminal input
 * @param commandNames - Array of registered command names (e.g., ["sim.play", "preset.load"])
 * @returns Detection result with isTypo flag and correction hint
 */
export function detectPossibleTypo(
  input: string,
  commandNames: string[],
): TypoDetectionResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { isTypo: false, hint: '' };
  }

  const words = trimmed.split(/\s+/);

  // Only consider short inputs (1-3 words) — longer is likely natural language
  if (words.length > 3) {
    return { isTypo: false, hint: '' };
  }

  // Extract unique categories from command names
  const categories = [...new Set(commandNames.map((n) => n.split('.')[0]))];

  const inputCategory = words[0].toLowerCase();

  // Check if the first word fuzzy-matches a category
  let closestCategory = '';
  let closestCategoryDist = Infinity;
  for (const cat of categories) {
    const dist = levenshtein(inputCategory, cat);
    if (dist < closestCategoryDist) {
      closestCategoryDist = dist;
      closestCategory = cat;
    }
  }

  // If first word IS a valid category (exact match), it's not a typo at category level
  const isExactCategory = categories.includes(inputCategory);

  // For 2-word input like "sim plya", check if it fuzzy-matches a command
  if (words.length >= 2) {
    const inputAction = words[1].toLowerCase();
    // Convert to dot notation for comparison
    const inputAsCommand = `${inputCategory}.${inputAction}`;

    let closestCommand = '';
    let closestDist = Infinity;

    for (const cmdName of commandNames) {
      // Compare the dot-notation forms
      const dist = levenshtein(inputAsCommand, cmdName);
      if (dist < closestDist) {
        closestDist = dist;
        closestCommand = cmdName;
      }

      // Also compare using the category-matched version
      if (isExactCategory) {
        const cmdAction = cmdName.split('.')[1];
        if (cmdAction) {
          const actionDist = levenshtein(inputAction, cmdAction);
          const fullDist = actionDist; // category is exact, only action is off
          if (fullDist < closestDist) {
            closestDist = fullDist;
            closestCommand = cmdName;
          }
        }
      }
    }

    // If the closest command is within edit distance 3, it's likely a typo
    if (closestDist > 0 && closestDist <= 3 && closestCommand) {
      const cliForm = closestCommand.replace('.', ' ');
      return {
        isTypo: true,
        hint: `Did you mean '${cliForm}'? (closest command: ${closestCommand})`,
      };
    }
  }

  // For single-word input, check if it fuzzy-matches a category
  if (words.length === 1 && !isExactCategory && closestCategoryDist <= 2) {
    return {
      isTypo: true,
      hint: `Did you mean '${closestCategory}'? (closest category: ${closestCategory})`,
    };
  }

  return { isTypo: false, hint: '' };
}
