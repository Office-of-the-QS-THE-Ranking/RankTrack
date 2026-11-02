/** Owner names that mean many units at once ("Every unit (SDG narrative report)"), or the ranking body itself. */
export const collective = (label: string) => /^every\b|^all\b|times higher education|quacquarelli|\(scopus\)/i.test(label);
