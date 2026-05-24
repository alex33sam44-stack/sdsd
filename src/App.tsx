import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Welcome from "./pages/Welcome.tsx";
import StationPage from "./pages/StationPage.tsx";
import RoutePage from "./pages/RoutePage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import AuthPage from "./modules/auth/AuthPage.tsx";
import { RoleGuard } from "./modules/auth/RoleGuard.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { NetworkStatusBanner } from "./components/NetworkStatusBanner.tsx";
import { SmartInstallPrompt } from "./components/SmartInstallPrompt.tsx";
import { setupQueryPersistence } from "./lib/queryPersist";
import { TenantProvider } from "./modules/tenancy/TenantContext";
import { EntitlementGuard } from "./modules/billing/EntitlementGuard";
import { CommunityGate } from "./marketing/components/CommunityGate";

// ─── Code-split admin and operator surfaces ──────────────────────────────────
// These are accessed by a small number of staff users; lazy-loading them keeps
// the passenger entry bundle (Welcome / Station / Route) lean. PWA precaching
// (workbox) will still pick the resulting chunks up after first build.
const PlannerPage = lazy(() => import("./pages/PlannerPage.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminLineEditor = lazy(() => import("./pages/admin/AdminLineEditor.tsx"));
const AdminRouteEditor = lazy(() => import("./pages/admin/AdminRouteEditor.tsx"));
const AdminLayoutEditor = lazy(() => import("./pages/admin/AdminLayoutEditor.tsx"));
const AdminDataTools = lazy(() => import("./pages/admin/AdminDataTools.tsx"));
const AdminDrafts = lazy(() => import("./pages/admin/AdminDrafts.tsx"));
const AdminReview = lazy(() => import("./pages/admin/AdminReview.tsx"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit.tsx"));
const AdminValidation = lazy(() => import("./pages/admin/AdminValidation.tsx"));
const AdminSuggestions = lazy(() => import("./pages/admin/AdminSuggestions.tsx"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics.tsx"));
const AdminInteroperability = lazy(() => import("./pages/admin/AdminInteroperability.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminTenantTeam = lazy(() => import("./pages/admin/AdminTenantTeam.tsx"));
const AdminBilling = lazy(() => import("./pages/admin/AdminBilling.tsx"));
const TenantSetupPage = lazy(() => import("./pages/TenantSetupPage.tsx"));
const AdminDeploymentChecklist = lazy(() => import("./pages/admin/AdminDeploymentChecklist.tsx"));
const OpsDashboard = lazy(() => import("./modules/ops/OpsDashboard.tsx"));
const PlatformAdmin = lazy(() => import("./modules/admin/PlatformAdmin.tsx"));

// Deep Dive marketing / growth routes migrated from the prototype bundle.
const MarketingHome = lazy(() => import("./marketing/routes/index.tsx"));
const MarketingAlerts = lazy(() => import("./marketing/routes/alerts.tsx"));
const MarketingArea = lazy(() => import("./marketing/routes/areas.$slug.tsx"));
const MarketingDaily = lazy(() => import("./marketing/routes/daily.tsx"));
const MarketingChannels = lazy(() => import("./marketing/routes/channels.tsx"));
const MarketingChannel = lazy(() => import("./marketing/routes/c.$slug.tsx"));
const MarketingChat = lazy(() => import("./marketing/routes/chat.tsx"));
const MarketingGroupNew = lazy(() => import("./marketing/routes/group.new.tsx"));
const MarketingGroupShare = lazy(() => import("./marketing/routes/g.$token.tsx"));
const MarketingGrowth = lazy(() => import("./marketing/routes/growth.tsx"));
const MarketingHeatmap = lazy(() => import("./marketing/routes/heatmap.tsx"));
const MarketingInbox = lazy(() => import("./marketing/routes/inbox.tsx"));
const MarketingInvite = lazy(() => import("./marketing/routes/invite.tsx"));
const MarketingLeaderboard = lazy(() => import("./marketing/routes/leaderboard.tsx"));
const MarketingLogin = lazy(() => import("./marketing/routes/login.tsx"));
const MarketingSavings = lazy(() => import("./marketing/routes/savings.tsx"));
const MarketingTripShare = lazy(() => import("./marketing/routes/t.$token.tsx"));
const MarketingTrip = lazy(() => import("./marketing/routes/trip.tsx"));
const MarketingPublicProfile = lazy(() => import("./marketing/routes/u.$username.tsx"));
const MarketingLaunchCampaign = lazy(() => import("./marketing/routes/launch-campaign.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep cached data visible while offline / weak so passenger essentials
      // (stations list, station detail, cities) survive a cold reload.
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
    },
  },
});
setupQueryPersistence(queryClient);

// Minimal suspense fallback — matches background, no flash on fast networks.
const RouteFallback = () => (
  <div className="min-h-screen bg-background" aria-hidden />
);

const App = () => (
  <ErrorBoundary scope="app.root">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TenantProvider>
          <div className="app-shell">
          <NetworkStatusBanner />
          <SmartInstallPrompt />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Passenger (public) — kept eager for fast first paint */}
            <Route path="/" element={<Welcome />} />
            <Route path="/station/:stationId" element={<StationPage />} />
            <Route path="/route/:stationId/:lineId" element={<RoutePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/planner" element={<PlannerPage />} />

            {/* Deep Dive marketing / growth routes.
              * NOTE: every page below depends on the localStorage-only
              * `dataClient` (src/marketing/integrations/data/client.ts).
              * We wrap them with <CommunityGate /> so production builds
              * render a "coming soon" notice instead of a fake backend,
              * and dev/preview builds get a clear "local demo" banner.
              * Setting VITE_COMMUNITY_FEATURES_ENABLED=true forces the
              * gate open in any build. See docs/COMMUNITY_FEATURES_MIGRATION.md.
              */}
            <Route path="/marketing" element={<CommunityGate><MarketingHome /></CommunityGate>} />
            <Route path="/alerts" element={<CommunityGate><MarketingAlerts /></CommunityGate>} />
            <Route path="/areas/:slug" element={<CommunityGate><MarketingArea /></CommunityGate>} />
            <Route path="/daily" element={<CommunityGate><MarketingDaily /></CommunityGate>} />
            <Route path="/channels" element={<CommunityGate><MarketingChannels /></CommunityGate>} />
            <Route path="/c/:slug" element={<CommunityGate><MarketingChannel /></CommunityGate>} />
            <Route path="/chat" element={<CommunityGate><MarketingChat /></CommunityGate>} />
            <Route path="/group/new" element={<CommunityGate><MarketingGroupNew /></CommunityGate>} />
            <Route path="/g/:token" element={<CommunityGate><MarketingGroupShare /></CommunityGate>} />
            <Route path="/growth" element={<CommunityGate><MarketingGrowth /></CommunityGate>} />
            <Route path="/heatmap" element={<CommunityGate><MarketingHeatmap /></CommunityGate>} />
            <Route path="/inbox" element={<CommunityGate><MarketingInbox /></CommunityGate>} />
            <Route path="/invite" element={<CommunityGate><MarketingInvite /></CommunityGate>} />
            <Route path="/leaderboard" element={<CommunityGate><MarketingLeaderboard /></CommunityGate>} />
            <Route path="/login" element={<CommunityGate><MarketingLogin /></CommunityGate>} />
            <Route path="/savings" element={<CommunityGate><MarketingSavings /></CommunityGate>} />
            <Route path="/t/:token" element={<CommunityGate><MarketingTripShare /></CommunityGate>} />
            <Route path="/trip" element={<CommunityGate><MarketingTrip /></CommunityGate>} />
            <Route path="/u/:username" element={<CommunityGate><MarketingPublicProfile /></CommunityGate>} />
            <Route path="/cairo-university" element={<CommunityGate><MarketingLaunchCampaign /></CommunityGate>} />
            <Route path="/ramses" element={<CommunityGate><MarketingLaunchCampaign /></CommunityGate>} />
            <Route path="/faisal" element={<CommunityGate><MarketingLaunchCampaign /></CommunityGate>} />
            <Route path="/nasr-city" element={<CommunityGate><MarketingLaunchCampaign /></CommunityGate>} />

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/tenant/setup"
              element={
                <RoleGuard>
                  <TenantSetupPage />
                </RoleGuard>
              }
            />

            {/* Operator dashboard (tenant operator OR platform admin/support) */}
            <Route
              path="/ops"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor"]}
                  platformRoles={["platform_owner", "platform_admin", "support_agent"]}
                >
                  <OpsDashboard />
                </RoleGuard>
              }
            />

            {/* Platform admin only */}
            <Route
              path="/platform"
              element={
                <RoleGuard platformRoles={["platform_owner", "platform_admin"]}>
                  <PlatformAdmin />
                </RoleGuard>
              }
            />

            {/* Tenant-admin/operator surfaces */}
            <Route
              path="/admin"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor", "viewer"]}
                  platformRoles={["platform_owner", "platform_admin", "support_agent"]}
                >
                  <AdminDashboard />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/line/:stationId/:lineId"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor"]}
                  platformRoles={["platform_owner", "platform_admin"]}
                >
                  <AdminLineEditor />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/route/:stationId/:lineId"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor"]}
                  platformRoles={["platform_owner", "platform_admin"]}
                >
                  <AdminRouteEditor />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/layout/:stationId"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager"]}
                  platformRoles={["platform_owner", "platform_admin"]}
                >
                  <AdminLayoutEditor />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/tools"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager"]}
                  platformRoles={["platform_owner", "platform_admin"]}
                >
                  <EntitlementGuard feature="import_export"><AdminDataTools /></EntitlementGuard>
                </RoleGuard>
              }
            />
            <Route
              path="/admin/drafts"
              element={
                <RoleGuard
                  tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor"]}
                  platformRoles={["platform_owner", "platform_admin"]}
                >
                  <EntitlementGuard feature="drafts"><AdminDrafts /></EntitlementGuard>
                </RoleGuard>
              }
            />
            <Route path="/admin/review" element={<RoleGuard platformRoles={["platform_owner", "platform_admin"]}><EntitlementGuard feature="drafts"><AdminReview /></EntitlementGuard></RoleGuard>} />
            <Route path="/admin/audit" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor", "viewer"]} platformRoles={["platform_owner", "platform_admin", "support_agent"]}><AdminAudit /></RoleGuard>} />
            <Route path="/admin/validation" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "line_supervisor", "viewer"]} platformRoles={["platform_owner", "platform_admin", "support_agent"]}><EntitlementGuard feature="validation"><AdminValidation /></EntitlementGuard></RoleGuard>} />
            <Route path="/admin/suggestions" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager"]} platformRoles={["platform_owner", "platform_admin"]}><EntitlementGuard feature="suggestions"><AdminSuggestions /></EntitlementGuard></RoleGuard>} />
            <Route path="/admin/analytics" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "viewer"]} platformRoles={["platform_owner", "platform_admin", "support_agent"]}><EntitlementGuard feature="analytics"><AdminAnalytics /></EntitlementGuard></RoleGuard>} />
            <Route path="/admin/interop" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager"]} platformRoles={["platform_owner", "platform_admin"]}><EntitlementGuard feature="interoperability"><AdminInteroperability /></EntitlementGuard></RoleGuard>} />
            <Route path="/admin/users" element={<RoleGuard platformRoles={["platform_owner", "platform_admin"]}><AdminUsers /></RoleGuard>} />
            <Route path="/admin/team" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin", "ops_manager", "station_manager", "viewer"]} platformRoles={["platform_owner", "platform_admin"]}><EntitlementGuard feature="team_management"><AdminTenantTeam /></EntitlementGuard></RoleGuard>} />
            <Route path="/admin/billing" element={<RoleGuard tenantRoles={["tenant_owner", "tenant_admin"]} platformRoles={["platform_owner", "platform_admin", "support_agent"]}><AdminBilling /></RoleGuard>} />
            <Route path="/admin/deploy" element={<RoleGuard platformRoles={["platform_owner", "platform_admin", "support_agent"]}><AdminDeploymentChecklist /></RoleGuard>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </div>
        </TenantProvider>
      </BrowserRouter>
    </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
