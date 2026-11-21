/**
 * Shape every non-English locale must match: all English keys, string leaves.
 * Extra keys are allowed so languages can add plural forms English lacks
 * (Czech needs `_few` and `_many` next to `_one` / `_other`).
 */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Translation<T[K]> } & { [key: string]: unknown };
