import { env } from 'cloudflare:workers';
import { authErrorResponse, requirePlatformOwner } from '../../../lib/auth';
import { forwardPlanPilot, type PlanPilotBinding } from '../../../lib/plan-checkout-pilot';

const headers={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'};
async function handle(request:Request) {
  try {
    const principal=await requirePlatformOwner(request);
    const binding=(env as typeof env & {PLAN_CHECKOUT_PILOT?:PlanPilotBinding}).PLAN_CHECKOUT_PILOT;
    return forwardPlanPilot(request,principal,binding);
  } catch(error){
    const response=authErrorResponse(error);
    return response
      ? new Response(response.body,{status:response.status,headers:{...Object.fromEntries(response.headers),...headers}})
      : Response.json({error:'pilot_unavailable'},{status:503,headers});
  }
}
export const GET=handle;
export const HEAD=handle;
export const POST=handle;
