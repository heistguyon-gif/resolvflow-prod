declare module 'cloudflare:workers' {
  export class WorkerEntrypoint<Environment> {
    protected env: Environment;
  }
}
