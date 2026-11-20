import { WorkerEntrypoint } from 'cloudflare:workers';
import { createPilotService } from './pilot-service';
import { createCheckout, type Bindings } from './worker';
import { pilotAssets } from './pilot-assets.generated';

const serve=createPilotService(fetch,Date.now,pilotAssets);
const commercial=createCheckout(fetch,Date.now,'commercial');
export class PlanCheckoutPilot extends WorkerEntrypoint<Bindings> {
  fetch(request:Request) { return serve(request,this.env); }
}
export class PlanCheckoutCommercial extends WorkerEntrypoint<Bindings> {
  fetch(request:Request) { return commercial.fetch(request,this.env); }
}
export { default } from './worker';
