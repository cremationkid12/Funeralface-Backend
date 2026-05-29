import type { SettingsRecord, SettingsService, SettingsUpdateInput } from "../../src/services/settingsService";

export function createInMemorySettingsService(): SettingsService {
  const store = new Map<string, SettingsRecord>();

  return {
    async getByOrgId(orgId: string): Promise<SettingsRecord> {
      return (
        store.get(orgId) ?? {
          org_id: orgId,
          director_name: "",
          director_phone: "",
          director_email: null,
          director_image_url: null,
          funeral_home_name: "",
          funeral_home_phone: "",
          funeral_home_address: "",
          logo_url: null,
          default_message: null,
        }
      );
    },

    async upsertByOrgId(orgId: string, input: SettingsUpdateInput): Promise<SettingsRecord> {
      const current = await this.getByOrgId(orgId);
      const next: SettingsRecord = {
        ...current,
        ...input,
        org_id: orgId,
      };
      store.set(orgId, next);
      return next;
    },
  };
}
