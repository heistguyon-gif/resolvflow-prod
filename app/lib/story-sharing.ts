import { MASTER_STORY_OWNER, expire, fail, mutate, onlyKeys, overview, projectOverview, publicDispatch, publish, readState, record, uuid, textField, type Browser, type Target } from "./story-bridge";

function selectedTargets(input: unknown, binding = false): (Target & { assignedOwnerUserId?: string })[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) fail("selection_required", "Selecione de 1 a 100 navegadores.");
  const targets = input.map(value => {
    const target = record(value); onlyKeys(target, ["browserId", "sessionId", "instagramUserId", ...(binding ? ["assignedOwnerUserId"] : [])]);
    const instagramUserId = textField(target.instagramUserId, 30);
    if (!/^\d+$/.test(instagramUserId)) fail();
    return { browserId: uuid(target.browserId), sessionId: uuid(target.sessionId), instagramUserId, ...(binding ? { assignedOwnerUserId: textField(target.assignedOwnerUserId, 180) } : {}) };
  });
  if (new Set(targets.map(t => t.browserId)).size !== targets.length) fail();
  return targets;
}

// Binding and publication claims serialize through the SAME principal CAS state.
// No credentials are copied to the recipient and no browser is selected implicitly.
export async function bindMasterBrowsers(bucket: R2Bucket, input: unknown, delegation: Pick<NonNullable<Browser["delegation"]>, "owner" | "accountUserId"> | undefined, now = Date.now()) {
  const targets = selectedTargets(input, true);
  return mutate(bucket, MASTER_STORY_OWNER, state => {
    expire(state, now);
    if (!state.credentialHash) fail("not_configured", "A extensão principal ainda não foi configurada.", 409);
    const browsers = targets.map(target => {
      const browser = state.browsers.find(b => b.id === target.browserId && b.sessionId === target.sessionId && b.instagramUserId === target.instagramUserId);
      if (!browser) fail("selected_browsers_unavailable", "A identidade de um navegador mudou. Atualize a lista.", 409);
      const currentOwner = browser.delegation?.owner ?? MASTER_STORY_OWNER, desiredOwner = delegation?.owner ?? MASTER_STORY_OWNER;
      if (target.assignedOwnerUserId !== currentOwner && currentOwner !== desiredOwner) fail("binding_changed", "O vínculo deste navegador mudou em outra operação. Atualize a lista.", 409);
      if (currentOwner === desiredOwner && browser.delegation?.accountUserId === delegation?.accountUserId) return browser;
      const busy = [...state.dispatches, ...(state.profileSetups ?? [])].some(d => d.jobs.some(job => (job.browserId === browser.id || job.instagramUserId === browser.instagramUserId) && ["queued", "claimed"].includes(job.status)));
      if (busy) fail("browser_busy", "Um navegador selecionado tem um comando pendente. Aguarde o encerramento antes de mudar o vínculo.", 409);
      return browser;
    });
    for (const browser of browsers) {
      if (delegation) browser.delegation = { ...delegation, instagramUserId: browser.instagramUserId };
      else delete browser.delegation;
    }
    return { updated: browsers.length };
  });
}

export async function masterBrowsers(bucket: R2Bucket) {
  const state = await readState(bucket, MASTER_STORY_OWNER), projected = projectOverview(state);
  return projected.browsers.map(browser => ({ ...browser, assignedOwnerUserId: state.browsers.find(b => b.id === browser.id)?.delegation?.owner ?? MASTER_STORY_OWNER }));
}

export async function sharedOverview(bucket: R2Bucket, owner: string, now = Date.now()) {
  const principal = await readState(bucket, MASTER_STORY_OWNER); expire(principal, now);
  const own = owner === MASTER_STORY_OWNER ? projectOverview(principal, now) : await overview(bucket, owner, now);
  if (owner === MASTER_STORY_OWNER) {
    const delegatedIds = new Set(principal.browsers.filter(b => b.delegation).map(b => b.id));
    return { ...own, browsers: own.browsers.filter(b => !delegatedIds.has(b.id)), dispatches: principal.dispatches.filter(d => !d.delegatedOwner).map(publicDispatch) };
  }
  const delegatedIds = new Set(principal.browsers.filter(b => b.delegation?.owner === owner).map(b => b.id));
  const projected = delegatedIds.size ? projectOverview(principal, now) : null;
  const shared = (projected?.browsers ?? []).filter(b => delegatedIds.has(b.id)).map(b => ({ ...b, extensionSource: "principal" as const }));
  const ownIds = new Set(own.browsers.map(b => b.id));
  // A browser that just changed ZIP may still have two fresh heartbeats. Do not
  // offer ambiguous identities from different credentials as two destinations.
  const conflicts = new Set(shared.filter(b => ownIds.has(b.id) && b.available && own.browsers.some(o => o.id === b.id && o.available)).map(b => b.id));
  const sharedIds = new Set(shared.map(b => b.id));
  const ownBrowsers = own.browsers.filter(b => !sharedIds.has(b.id) || conflicts.has(b.id));
  const sharedBrowsers = shared.filter(b => !conflicts.has(b.id));
  return { ...own, extensionConfigured: own.extensionConfigured || shared.length > 0,
    browsers: [...ownBrowsers.map(b => conflicts.has(b.id) ? { ...b, available: false } : b), ...sharedBrowsers],
    dispatches: [...own.dispatches, ...principal.dispatches.filter(d => d.delegatedOwner === owner).map(publicDispatch)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export async function publishForWorkspace(bucket: R2Bucket, owner: string, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["templateId", "requestId", "targets"]);
  const requestId = uuid(body.requestId), templateId = uuid(body.templateId);
  const principal = owner === MASTER_STORY_OWNER ? null : await readState(bucket, MASTER_STORY_OWNER);
  const replay = principal?.dispatches.find(d => d.requestId === requestId && d.delegatedOwner === owner);
  if (replay) return publish(bucket, MASTER_STORY_OWNER, body, now, { owner, template: replay.template });
  const own = await readState(bucket, owner);
  if (own.dispatches.some(d => d.requestId === requestId)) return publish(bucket, owner, body, now);
  const targets = selectedTargets(body.targets);
  const fromMaster = targets.filter(t => principal?.browsers.some(b => b.id === t.browserId && b.delegation?.owner === owner));
  if (!fromMaster.length) return publish(bucket, owner, body, now);
  if (fromMaster.length !== targets.length) fail("mixed_extensions", "Selecione uma origem de extensão por publicação: desta conta ou principal.", 409);
  const template = own.templates.find(t => t.id === templateId);
  if (!template) fail("not_found", "Template não encontrado.", 404);
  return publish(bucket, MASTER_STORY_OWNER, body, now, { owner, template });
}
