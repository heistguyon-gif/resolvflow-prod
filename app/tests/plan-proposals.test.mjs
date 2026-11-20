import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPix } from "./helpers/pix-gateway-fixture.mjs";

const { PLAN_PROPOSALS } = loadPix("app/planos/variant/shared/planProposals.ts");
const plans = PLAN_PROPOSALS.flatMap(p => p.plans);

test("all 9 plans have concrete deliverables (no 'a definir' wording)", () => {
  assert.equal(plans.length, 9);
  for (const plan of plans) {
    assert.doesNotMatch(plan.description + " " + plan.condition, /a definir|dependem de definição|sem escopo/i, plan.id);
  }
  for (const id of ["entrada-volume", "volume-dimensionado", "anual-expansao"]) {
    const plan = plans.find(p => p.id === id);
    assert.match(plan.description, /implantação assistida/, id);
    assert.match(plan.description, /atendimento por e-mail/, id);
  }
});

test("prices are unchanged by the deliverables proposal", () => {
  const prices = Object.fromEntries(plans.map(p => [p.id, p.price.value]));
  assert.deepEqual(prices, { "entrada-essencial": "127", "entrada-operacao": "297", "entrada-volume": "A dimensionar", "volume-operacao20": "247–397", "volume-expansao60": "697–997", "volume-dimensionado": "1.497–2.997", "anual-essencial": "1.270", "anual-operacao": "2.970", "anual-expansao": "7.970" });
});

test("app and landing copies of planProposals.ts stay identical", () => {
  assert.equal(readFileSync("app/planos/variant/shared/planProposals.ts", "utf8"), readFileSync("../landing/src/shared/planProposals.ts", "utf8"));
});
