/**
 * `run`, once at a time: a call while one is under way gets that one's result instead of starting another (the
 * Airtable sync, which reads Global's view: two people pressing at once read it once).
 */
export const singleFlight = <T>(run: () => Promise<T>): (() => Promise<T>) => {
  let current: Promise<T> | undefined;
  return () => {
    current ??= run().finally(() => {
      current = undefined;
    });
    return current;
  };
};
