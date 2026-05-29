import {
  type AssignmentService,
  type AssignmentStatus,
  type PickupAssignmentRecord,
} from "../../src/services/assignmentService";

export type AssignmentAuditEntry = {
  assignmentId: string;
  orgId: string;
  fromStatus: AssignmentStatus;
  toStatus: AssignmentStatus;
  actorUserId: string;
};

export function createInMemoryAssignmentService() {
  const data = new Map<string, PickupAssignmentRecord[]>();
  const audits: AssignmentAuditEntry[] = [];
  let counter = 1;

  const listFor = (orgId: string) => data.get(orgId) ?? [];

  const service: AssignmentService = {
    async listByOrgId(orgId, sort) {
      const items = [...listFor(orgId)];
      if (sort === "-created_at") return items.reverse();
      return items;
    },

    async createByOrgId(orgId, input) {
      const item: PickupAssignmentRecord = {
        id: `assignment-${counter++}`,
        org_id: orgId,
        decedent_name: input.decedent_name,
        pickup_address: input.pickup_address,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        notes: input.notes ?? null,
        assigned_staff_id: input.assigned_staff_id ?? null,
        status: (input.status ?? "pending") as AssignmentStatus,
      };
      data.set(orgId, [...listFor(orgId), item]);
      return item;
    },

    async updateByOrgIdAndId(orgId, id, input, actorUserId) {
      const items = listFor(orgId);
      const idx = items.findIndex((i) => i.id === id);
      if (idx < 0) return null;

      const current = items[idx];
      const nextStatus = (input.status ?? current.status) as AssignmentStatus;

      const next: PickupAssignmentRecord = {
        ...current,
        ...input,
        status: nextStatus,
      };
      const arr = [...items];
      arr[idx] = next;
      data.set(orgId, arr);

      if (current.status !== next.status) {
        audits.push({
          assignmentId: id,
          orgId,
          fromStatus: current.status,
          toStatus: next.status,
          actorUserId,
        });
      }

      return next;
    },

    async getFamilyShareEmailContextByOrgIdAndId() {
      return null;
    },
  };

  return { service, audits };
}
