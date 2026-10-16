// A promise that settles within `ms`. On timeout it rejects with an error
// marked `offline` (or resolves with `fallback` when one is given), so a
// network step can never keep the app waiting forever.
export class TimeoutError extends Error {
  readonly offline = true;
  constructor(label: string) { super(`${label} timed out`); this.name = 'TimeoutError'; }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Request', fallback?: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => (fallback !== undefined ? resolve(fallback) : reject(new TimeoutError(label))), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
