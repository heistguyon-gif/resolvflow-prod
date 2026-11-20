// Saved history GETs only. Never queues or caches a Microsoft snapshot/OTP.
export function createMailHistoryQueue<T>(load: (id: string) => Promise<T>, limit = 4) {
  type Job = { id: string; promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void };
  const pending = new Map<string, Job>();
  let queued: Job[] = [], active = 0;
  function pump() {
    while (active < limit && queued.length) {
      const job = queued.shift()!; active++;
      const finish = () => { active--; if (pending.get(job.id) === job) pending.delete(job.id); pump(); };
      void Promise.resolve().then(() => load(job.id)).then(value => { finish(); job.resolve(value); }, error => { finish(); job.reject(error); });
    }
  }
  return {
    read(id: string) {
      const previous = pending.get(id); if (previous) return previous.promise;
      let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
      const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
      const job = { id, promise, resolve, reject }; pending.set(id, job); queued.push(job); pump();
      return promise;
    },
    retain(ids: string[]) {
      const selected = new Set(ids);
      queued = queued.filter(job => {
        if (selected.has(job.id)) return true;
        pending.delete(job.id); job.reject(new Error("history_selection_changed")); return false;
      });
    },
  };
}
