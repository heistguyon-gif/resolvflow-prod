// Operator-only tool. Token comes from a private process environment.
const endpoint='https://resolvflow-landing-variants-20261118.lucasbgn-affiliate.workers.dev/api/checkout/support';
const token=process.env.PLAN_SUPPORT_TOKEN;
if (!token || !/^[0-9a-f]{64}$/.test(token)) throw Error('Missing private support token.');
const [action,arg]=process.argv.slice(2);
if (!['list','handled'].includes(action)) throw Error('Use list [cursor] or handled <order-id>.');
if(action==='handled'&&!/^[0-9a-f]{64}$/.test(arg??''))throw Error('Invalid order ID.');
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
const url=new URL(action==='handled'?endpoint+'/handled':endpoint);
if(action==='list'&&arg)url.searchParams.set('cursor',arg);
const response=await fetch(url,{method:action==='handled'?'POST':'GET',headers:action==='handled'?{...headers,'Content-Type':'application/json'}:headers,body:action==='handled'?JSON.stringify({id:arg}):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Support request failed with HTTP '+response.status);
process.stdout.write(await response.text());
