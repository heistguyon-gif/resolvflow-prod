export type InboxOrderInput = {
  accountUserId: string;
  workspaceOwnerUserId: string;
  orderId: string;
  email: string;
  product: string;
  status?: string;
  price?: string;
  supplierApiId?: string | null;
};

export function buildInboxInsertRecord(input: InboxOrderInput, id: string, now: string) {
  return {
    id,
    accountUserId: input.accountUserId,
    workspaceOwnerUserId: input.workspaceOwnerUserId,
    supplierApiId: input.supplierApiId || null,
    orderId: input.orderId,
    email: input.email,
    product: input.product,
    status: input.status || "active",
    price: input.price || "",
    codesJson: "[]",
    closed: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function backfillLegacyInboxOrigin(
  workspaceOwnerUserId: string,
  supplierApiId: string,
  write: (input: { workspaceOwnerUserId: string; supplierApiId: string }) => Promise<void>,
) {
  await write({ workspaceOwnerUserId, supplierApiId });
}
