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

            {/* Deep Dive marketing / growth routes */}
            <Route path="/marketing" element={<MarketingHome />} />
            <Route path="/alerts" element={<MarketingAlerts />} />
            <Route path="/areas/:slug" element={<MarketingArea />} />
            <Route path="/daily" element={<MarketingDaily />} />
            <Route path="/channels" element={<MarketingChannels />} />
            <Route path="/c/:slug" element={<MarketingChannel />} />
            <Route path="/chat" element={<MarketingChat />} />
            <Route path="/group/new" element={<MarketingGroupNew />} />
            <Route path="/g/:token" element={<MarketingGroupShare />} />
            <Route path="/growth" element={<MarketingGrowth />} />
            <Route path="/heatmap" element={<MarketingHeatmap />} />
            <Route path="/inbox" element={<MarketingInbox />} />
            <Route path="/invite" element={<MarketingInvite />} />
            <Route path="/leaderboard" element={<MarketingLeaderboard />} />
            <Route path="/login" element={<MarketingLogin />} />
            <Route path="/savings" element={<MarketingSavings />} />
            <Route path="/t/:token" element={<MarketingTripShare />} />
            <Route path="/trip" element={<MarketingTrip />} />
            <Route path="/u/:username" element={<MarketingPublicProfile />} />
            <Route path="/cairo-university" element={<MarketingLaunchCampaign />} />
            <Route path="/ramses" element={<MarketingLaunchCampaign />} />
            <Route path="/faisal" element={<MarketingLaunchCampaign />} />
            <Route path="/nasr-city" element={<MarketingLaunchCampaign />} />

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
