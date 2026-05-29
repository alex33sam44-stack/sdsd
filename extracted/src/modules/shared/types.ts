// written instead of being derived from a generated Database type. Keep field
// names in snake_case so existing UI bindings (which assume PostgREST shape)
// continue to work; the REST adapter (`_camelToSnake.ts`) bridges the backend.

export type AppRole = "passenger" | "platform_owner" | "station_operator" | "platform_admin" | "support_agent";
export type PlatformRole = "platform_owner" | "platform_admin" | "support_agent";
export type TenantRole = "tenant_owner" | "tenant_admin" | "ops_manager" | "station_manager" | "line_supervisor" | "viewer";

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
};

export type TenantMembership = {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  tenant_status: "active" | "suspended" | "archived";
  role: TenantRole;
  accepted_at: string | null;
};

export type BillingProvider = "manual" | "stripe" | "lemon_squeezy";
export type BillingFeatureKey = "analytics" | "suggestions" | "interoperability" | "import_export" | "live_ops" | "validation" | "drafts" | "team_management" | "custom_domain" | "white_label" | "support_sla";

export type BillingFeatureCatalogEntry = {
  key: BillingFeatureKey;
  label: string;
  description: string;
};

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired";
export type BillingInterval = "monthly" | "yearly" | "custom";

export type BillingPlan = {
  code: string;
  name: string;
  description: string | null;
  currency: string;
  monthly_price_minor: number | null;
  yearly_price_minor: number | null;
  included_seats: number | null;
  default_limits: Record<string, unknown> | null;
  default_features: Record<string, unknown> | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BillingProfile = {
  tenant_id: string;
  provider: BillingProvider;
  billing_email: string | null;
  billing_name: string | null;
  country_code: string | null;
  tax_id: string | null;
  currency: string | null;
  external_customer_id: string | null;
  provider_metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type BillingSubscription = {
  tenant_id: string;
  provider: BillingProvider;
  external_subscription_id: string | null;
  status: SubscriptionStatus;
  plan_code: string;
  interval: BillingInterval;
  seats: number;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider_metadata?: Record<string, unknown> | null;
  last_webhook_event_id?: string | null;
  last_webhook_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingProviderOption = {
  provider: BillingProvider;
  configured: boolean;
  can_checkout: boolean;
  can_portal: boolean;
  default_provider: boolean;
};

export type BillingCheckoutSession = {
  provider: BillingProvider;
  mode: "external" | "manual";
  url: string;
  external_session_id?: string | null;
  external_customer_id?: string | null;
  message?: string | null;
};

export type BillingPortalSession = {
  provider: BillingProvider;
  mode: "external" | "manual";
  url: string;
  message?: string | null;
};

export type BillingWebhookEvent = {
  id: string;
  tenant_id: string | null;
  provider: BillingProvider;
  external_event_id: string | null;
  event_type: string;
  signature_valid: boolean;
  processed: boolean;
  status_code: number | null;
  error_message: string | null;
  payload: unknown;
  created_at: string;
  processed_at: string | null;
};

export type BillingUsage = {
  stations: number;
  lines: number;
  route_stops: number;
  members: number;
  pending_invites: number;
  seats: number;
};

export type TenantBillingOverview = {
  tenant: TenantSummary;
  plan_catalog: BillingPlan | null;
  tenant_plan: {
    tenant_id: string;
    code: string;
    status: string;
    seat_limit: number | null;
    limits: Record<string, unknown> | null;
    features: Record<string, unknown> | null;
    renews_at: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  billing_profile: BillingProfile | null;
  subscription: BillingSubscription | null;
  provider_options?: BillingProviderOption[];
  usage: BillingUsage;
  effective_limits: Record<string, unknown>;
  effective_features: Record<string, unknown>;
  usage_remaining: Record<string, number | null>;
};

export type TenantEntitlements = {
  tenant: TenantSummary;
  plan_code: string;
  effective_features: Record<string, boolean>;
  effective_limits: Record<string, unknown>;
  usage: BillingUsage;
  usage_remaining: Record<string, number | null>;
  feature_catalog: BillingFeatureCatalogEntry[];
};

export type BillingSummary = {
  tenant: TenantSummary;
  plan_code: string;
  plan_name: string;
  subscription_status: SubscriptionStatus | null;
  seats: number | null;
  currency: string;
  usage: BillingUsage;
  effective_limits: Record<string, unknown>;
  usage_remaining: Record<string, number | null>;
};
export type VehicleType = "ميكروباص" | "أتوبيس" | "ميني باص" | "تاكسي موقف";
export type LineStatus = "active" | "crowded" | "stopped";
export type DraftStatus = "pending" | "approved" | "rejected" | "applied";

export type City = {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  country_code: string | null;
  country_name: string | null;
  country_name_en: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  created_at?: string;
};

export type Station = {
  id: string;
  city_id: string | null;
  country_code: string | null;
  name: string;
  area: string | null;
  lat: number;
  lng: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type StationLayout = {
  id: string;
  station_id: string;
  viewbox: string;
  notes: string | null;
  updated_at: string;
};

export type LayoutZone = {
  id: string;
  station_id: string;
  zone_key: string;
  label: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  created_at: string;
};

export type Line = {
  id: string;
  station_id: string;
  destination: string;
  color: string;
  vehicle_type: VehicleType;
  status: LineStatus;
  cars: number;
  pickup_area: string | null;
  zone_x: number | null;
  zone_y: number | null;
  zone_w: number | null;
  zone_h: number | null;
  is_published: boolean;
  is_formal: boolean | null;
  transport_mode: string | null;
  cars_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type RouteStop = {
  id: string;
  line_id: string;
  position: number;
  name: string;
  lat: number;
  lng: number;
  keywords: string[];
  stop_class: string | null;
  created_at: string;
};

export type AvailabilityLog = {
  id: string;
  line_id: string;
  cars: number;
  status: LineStatus;
  changed_by: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  default_station_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Favorite = {
  id: string;
  user_id: string;
  kind: string;
  ref_id: string | null;
  label: string | null;
  payload: unknown;
  created_at: string;
};

export type SearchLog = {
  id: string;
  user_id: string | null;
  query: string;
  result_count: number;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  diff: unknown;
  created_at: string;
};

export type DraftChange = {
  id: string;
  author_id: string;
  entity: string;
  entity_id: string | null;
  patch: unknown;
  status: DraftStatus;
  note: string | null;
  applied_at: string | null;
  created_at: string;
};

// Composite read shapes for the passenger UI
export type StationWithLines = Station & {
  lines: (Line & { stops: RouteStop[] })[];
};

export type LineWithStops = Line & { stops: RouteStop[] };

// Haversine distance helper (km)
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
