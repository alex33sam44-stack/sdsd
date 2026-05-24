import type { User } from "@/marketing/integrations/data/types";
import { communityDataLayer, isCommunityEnabled } from "@/marketing/lib/communityFlags";
type AnyRecord = Record<string, any>;
type Listener = (...args: any[]) => void;

/**
 * IMPORTANT: this client is NOT a Supabase wire connection. It mimics the
 * Supabase JS API surface but every read/write happens against the user's
 * own `localStorage`. It exists so the community/marketing feature surface
 * (under `src/marketing/**`) can develop on a Supabase-shaped contract
 * while we plan the real backend implementation under
 * `docs/COMMUNITY_FEATURES_MIGRATION.md`.
 *
 * Treat anything coming through `dataClient` as ephemeral, per-browser,
 * and un-moderated. Never use it for anything that the rest of the app
 * (which talks to the NestJS backend at `VITE_API_BASE_URL`) needs to
 * see. Use `src/lib/api.ts` for that path.
 */
let warnedOnce = false;
function warnOnceIfMisleading() {
  if (warnedOnce) return;
  warnedOnce = true;
  // Only noisy when the operator has explicitly turned community on in a
  // production build — that's the single configuration where users will be
  // led to believe they're posting to a real backend. In dev / when the
  // gate is off, the existing UI already self-describes as a local demo.
  const isProdBuild = (() => {
    try {
      return Boolean((import.meta as unknown as { env?: { PROD?: boolean } })?.env?.PROD);
    } catch {
      return false;
    }
  })();
  if (!isProdBuild) return;
  if (!isCommunityEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(
    "[community] dataClient is a localStorage-only stub; community features " +
      "are running on per-browser fake data. See docs/COMMUNITY_FEATURES_MIGRATION.md.",
  );
}
warnOnceIfMisleading();

const memoryTables: Record<string, AnyRecord[]> = {
  profiles: [
    { user_id: "guest-1", display_name: "مستخدم مواصلات", points: 120, public_slug: "guest" },
    { user_id: "faisal-hero", display_name: "خبير فيصل", points: 310, public_slug: "faisal-hero" },
  ],
  questions: [], answers: [], notifications: [], alerts: [], trips: [], trip_pings: [],
  line_channels: [
    { id: "faisal", slug: "faisal", name: "مجتمع خط فيصل", description: "اسأل أهل الخط عن الزحمة والبدائل.", members_count: 128, created_by: "system", created_at: new Date().toISOString() },
    { id: "ramses", slug: "ramses", name: "مجتمع رمسيس", description: "بلاغات ومشاوير رمسيس لايف.", members_count: 212, created_by: "system", created_at: new Date().toISOString() },
  ],
  channel_messages: [], channel_members: [], alert_disputes: [], alert_confirmations: [], alert_mentions: [],
  user_stations: [], station_confirmations: [], group_trips: [], growth_events: [], ugc_contributions: [],
  route_trust_votes: [], daily_lines: [], referrals: [],
};

function getUser(): User | null {
  if (typeof window === "undefined") return { id: "guest", email: "guest@local" };
  const raw = window.localStorage.getItem("mwasalat_local_user");
  if (raw) return JSON.parse(raw) as User;
  const user = { id: `local-${Math.random().toString(36).slice(2, 10)}`, email: null };
  window.localStorage.setItem("mwasalat_local_user", JSON.stringify(user));
  return user;
}

function save(table: string, rows: AnyRecord[]) {
  if (typeof window === "undefined") { memoryTables[table] = rows; return; }
  window.localStorage.setItem(`mwasalat_table_${table}`, JSON.stringify(rows));
}

function tableRows(table: string): AnyRecord[] {
  if (typeof window === "undefined") return memoryTables[table] ?? [];
  const raw = window.localStorage.getItem(`mwasalat_table_${table}`);
  if (!raw) return memoryTables[table] ?? [];
  try { return JSON.parse(raw) as AnyRecord[]; } catch { return memoryTables[table] ?? []; }
}

class QueryBuilder {
  private filters: Array<(r: AnyRecord) => boolean> = [];
  private selected = "*";
  private orderBy?: { key: string; ascending: boolean };
  private lim?: number;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: AnyRecord | AnyRecord[] | null = null;
  private wantSingle = false;
  private countOnly = false;

  constructor(private table: string) {}
  select(cols = "*", opts?: { count?: string; head?: boolean }) { this.selected = cols; this.countOnly = !!opts?.head; return this; }
  insert(v: AnyRecord | AnyRecord[]) { this.mode = "insert"; this.payload = v; return this; }
  update(v: AnyRecord) { this.mode = "update"; this.payload = v; return this; }
  delete() { this.mode = "delete"; return this; }
  eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
  neq(k: string, v: any) { this.filters.push((r) => r[k] !== v); return this; }
  gt(k: string, v: any) { this.filters.push((r) => r[k] > v); return this; }
  gte(k: string, v: any) { this.filters.push((r) => r[k] >= v); return this; }
  lt(k: string, v: any) { this.filters.push((r) => r[k] < v); return this; }
  lte(k: string, v: any) { this.filters.push((r) => r[k] <= v); return this; }
  ilike(k: string, v: string) { const q = v.replace(/%/g, "").toLowerCase(); this.filters.push((r) => String(r[k] ?? "").toLowerCase().includes(q)); return this; }
  or() { return this; }
  order(k: string, opts?: { ascending?: boolean }) { this.orderBy = { key: k, ascending: opts?.ascending ?? true }; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.wantSingle = true; return this; }
  maybeSingle() { this.wantSingle = true; return this; }
  then(resolve: (v: any) => void, reject?: (e: any) => void) { return this.exec().then(resolve, reject); }

  private async exec() {
    let rows = tableRows(this.table);
    try {
      if (this.mode === "insert") {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const added = input.map((r) => ({ id: r.id ?? cryptoRandom(), created_at: r.created_at ?? new Date().toISOString(), ...r }));
        rows = [...rows, ...added]; save(this.table, rows);
        return { data: this.wantSingle ? added[0] : added, error: null, count: added.length };
      }
      const matches = (r: AnyRecord) => this.filters.every((f) => f(r));
      if (this.mode === "update") {
        let updated: AnyRecord[] = [];
        rows = rows.map((r) => matches(r) ? (updated.push({ ...r, ...(this.payload as AnyRecord) }), { ...r, ...(this.payload as AnyRecord) }) : r);
        save(this.table, rows); return { data: this.wantSingle ? updated[0] ?? null : updated, error: null, count: updated.length };
      }
      if (this.mode === "delete") {
        const before = rows.length; rows = rows.filter((r) => !matches(r)); save(this.table, rows);
        return { data: null, error: null, count: before - rows.length };
      }
      let data = rows.filter(matches);
      if (this.orderBy) data.sort((a,b) => (a[this.orderBy!.key] > b[this.orderBy!.key] ? 1 : -1) * (this.orderBy!.ascending ? 1 : -1));
      if (this.lim !== undefined) data = data.slice(0, this.lim);
      if (this.countOnly) return { data: null, error: null, count: data.length };
      return { data: this.wantSingle ? data[0] ?? null : data, error: null, count: data.length };
    } catch (error) { return { data: null, error, count: 0 }; }
  }
}

function cryptoRandom() {
  try { return crypto.randomUUID(); } catch { return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function rpc(fn: string, args?: AnyRecord) {
  if (fn === "get_shared_trip") {
    return Promise.resolve({ data: { id: "demo-trip", token: args?._token, status: "active", from_label: "فيصل", to_label: "مدينة نصر", current_lat: 30.0444, current_lng: 31.2357, share_token: args?._token, created_at: new Date().toISOString() }, error: null });
  }
  if (fn === "get_shared_trip_pings") {
    return Promise.resolve({ data: [
      { lat: 30.0444, lng: 31.2357, created_at: new Date().toISOString() },
      { lat: 30.052, lng: 31.24, created_at: new Date().toISOString() },
    ], error: null });
  }
  if (fn === "get_public_group_trip") return Promise.resolve({ data: null, error: null });
  if (fn === "get_public_group_joins") return Promise.resolve({ data: [], error: null });
  if (fn === "fetch_local_leaderboard") return Promise.resolve({ data: memoryTables.profiles, error: null });
  if (fn === "get_growth_dashboard") return Promise.resolve({ data: { invite_sent: 0, invite_opened: 0, signup_from_invite: 0, first_trip_created: 0, share_trip_created: 0, k_factor: 0, viral_cycle_time_hours: 0 }, error: null });
  if (fn === "get_public_profile_card") return Promise.resolve({ data: { username: args?._slug, display_name: args?._slug ?? "مستخدم", helped_count: 127, shared_trips_count: 12, useful_reports_count: 8, favorite_area: "فيصل", favorite_line: "فيصل - رمسيس", badge: "خبير المنطقة", referral_code: args?._slug ?? "guest" }, error: null });
  return Promise.resolve({ data: null, error: null });
}

const noopChannel = { on: () => noopChannel, subscribe: () => noopChannel };

export const dataClient = {
  /**
   * Self-describing label so UI (banners, debug panels) can react without
   * importing the flag helper. Always "local" today; will switch to
   * "backend" when the real REST integration lands.
   */
  get mode(): "local" | "backend" {
    return communityDataLayer();
  },
  auth: {
    getUser: async () => ({ data: { user: getUser() }, error: null }),
    getSession: async () => ({ data: { session: { user: getUser() } }, error: null }),
    onAuthStateChange: (_cb: Listener) => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    signUp: async ({ email }: { email: string }) => ({ data: { user: { id: `local-${email}`, email } }, error: null }),
    signInWithPassword: async ({ email }: { email: string }) => ({ data: { user: { id: `local-${email}`, email } }, error: null }),
    signOut: async () => ({ error: null }),
    setSession: async () => ({ data: { session: { user: getUser() } }, error: null }),
  },
  from: (table: string) => new QueryBuilder(table),
  rpc,
  channel: () => noopChannel,
  removeChannel: () => undefined,
};
