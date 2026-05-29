import { useTenant } from "./TenantContext";

export function TenantSwitcher() {
  const { memberships, currentTenant, switchTenant } = useTenant();
  if (memberships.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm font-bold text-secondary">
      <span>الجهة</span>
      <select
        value={currentTenant?.slug ?? ""}
        onChange={(e) => switchTenant(e.target.value)}
        className="h-9 rounded-lg border-2 border-secondary bg-surface px-3 text-sm font-semibold text-secondary"
      >
        {memberships.map((m) => (
          <option key={m.tenant_id} value={m.tenant_slug}>
            {m.tenant_name}
          </option>
        ))}
      </select>
    </label>
  );
}
