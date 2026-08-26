import { useEffect, useLayoutEffect, useRef, useCallback, useState, lazy, Suspense } from "react";

const Dashboard = lazy(() => import("./pages/dashboard"));
const Calendar = lazy(() => import("./pages/calendar"));
const EventDetail = lazy(() => import("./pages/event-detail"));
const CarpoolBoard = lazy(() => import("./pages/carpools"));
const CarpoolHub = lazy(() => import("./pages/carpool-hub"));
const Messages = lazy(() => import("./pages/messages"));
const BoardThread = lazy(() => import("./pages/board-thread"));
const NewBroadcast = lazy(() => import("./pages/new-broadcast"));
const ContactCoach = lazy(() => import("./pages/contact-coach"));
const Roster = lazy(() => import("./pages/roster"));
const HouseholdDetail = lazy(() => import("./pages/household-detail"));
const Profile = lazy(() => import("./pages/profile"));
const Volunteer = lazy(() => import("./pages/volunteer"));
const Admin = lazy(() => import("./pages/admin"));
const SeasonBuilder = lazy(() => import("./pages/season-builder"));
const Join = lazy(() => import("./pages/join"));
const FamilyInvite = lazy(() => import("./pages/family-invite"));
const RiderInvite = lazy(() => import("./pages/rider-invite"));
const Onboarding = lazy(() => import("./pages/onboarding"));
const Reenroll = lazy(() => import("./pages/reenroll"));
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { useGetMe } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ThemeContext, type Theme } from "@/lib/theme-context";
import { AdminViewProvider } from "@/lib/admin-view-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { NativeAppBridge } from "@/lib/native-app";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Most team data (season calendar, roster, trailheads) doesn't change
      // moment-to-moment. A 60s staleTime avoids refetching on every route
      // change/window refocus while still keeping things reasonably fresh.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        return status !== 401 && failureCount < 1;
      },
    },
  },
});

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("tt-theme") as Theme) ?? "light";
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("tt-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === "dark" ? "light" : "dark");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background overflow-hidden">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
             <h1 className="font-display text-5xl tracking-widest text-primary mb-1">TrailTeam</h1>
            <p className="text-muted-foreground text-sm font-medium">Welcome back, rider.</p>
          </div>
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        </div>
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background overflow-hidden">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
             <h1 className="font-display text-5xl tracking-widest text-primary mb-1">TrailTeam</h1>
            <p className="text-muted-foreground text-sm font-medium">Join the crew.</p>
          </div>
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        </div>
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkAuthSyncer() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const stableGetter = useCallback(() => getTokenRef.current(), []);

  useLayoutEffect(() => {
    setAuthTokenGetter(stableGetter);
    return () => setAuthTokenGetter(null);
  }, [stableGetter]);

  return null;
}

function SessionExpiryHandler() {
  const { signOut } = useClerk();
  const client = useQueryClient();
  const isSigningOut = useRef(false);

  useEffect(() => {
    return client.getQueryCache().subscribe((event) => {
      const status = (event.query.state.error as { status?: number } | null)?.status;
      if (status !== 401 || isSigningOut.current) return;

      isSigningOut.current = true;
      signOut({ redirectUrl: `${basePath}/sign-in` }).catch(() => {
        isSigningOut.current = false;
      });
    });
  }, [client, signOut]);

  return null;
}

function Home() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background overflow-hidden">
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="text-center max-w-sm mx-auto">
           <h1 className="font-display text-6xl tracking-widest text-primary mb-2 leading-none">TrailTeam</h1>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`${basePath}/sign-up`}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg border-2 border-[#0a0c10] bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm px-8 shadow-cel cel-interactive transition-all"
            >
              Get Started
            </a>
            <a
              href={`${basePath}/sign-in`}
              className="inline-flex items-center justify-center min-h-[44px] rounded-lg border-2 border-[#0a0c10] border-dashed bg-transparent text-foreground font-bold uppercase tracking-wide text-sm px-8 transition-all hover:bg-secondary"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

// Redirect users who have no household to onboarding, or returning parents to re-enrollment.
// Coaches/admins are exempt — they're created by the system and may not have a household.
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && me && me.role === "parent") {
      const meAny = me as any;
      if (!me.householdId) {
        setLocation("/onboarding");
      } else if (!meAny.approved && meAny.isReturningFamily) {
        setLocation("/reenroll");
      }
    }
  }, [me, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't render the layout while redirecting
  if (me && me.role === "parent") {
    const meAny = me as any;
    if (!me.householdId) return null;
    if (!meAny.approved && meAny.isReturningFamily) return null;
  }

  return <>{children}</>;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <OnboardingGuard>
          <Layout>
            <Component />
          </Layout>
        </OnboardingGuard>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function OnboardingRoute() {
  return (
    <>
      <Show when="signed-in">
        <Onboarding />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function DummyPage({ title }: { title: string }) {
  return <div className="p-8 max-w-4xl mx-auto"><h1 className="text-3xl font-bold">{title}</h1><p className="text-muted-foreground mt-4">Under construction...</p></div>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      appearance={{
        variables: {
          colorPrimary: "#00c2a8",
          colorBackground: "#0f1115",
          colorInput: "#e8e9eb",
          colorForeground: "#e8e9eb",
          colorMutedForeground: "#8a8f99",
          colorDanger: "#ef4444",
          borderRadius: "0.5rem",
          fontFamily: "'DM Sans', sans-serif",
        },
        elements: {
          card: "shadow-none !border-2 !border-[#0a0c10] bg-[#0f1115] !rounded-xl",
          formButtonPrimary: "!bg-[#00c2a8] !text-[#0a0c10] !font-bold !uppercase !tracking-wide !text-sm !border-2 !border-[#0a0c10] hover:!bg-[#00a892] !transition-all",
          footerActionLink: "!text-[#00c2a8] !font-semibold hover:!underline",
          headerTitle: "!font-bold !text-lg",
          socialButtonsBlockButton: "!border-2 !border-[#0a0c10] !bg-[#1c1f26] hover:!bg-[#262b35] !text-[#e8e9eb] !font-medium !transition-all",
          identityPreviewEditButton: "!text-[#00c2a8]",
          otpCodeFieldInput: "!bg-[#1c1f26] !border-2 !border-[#2e3340] !text-[#e8e9eb] focus:!border-[#00c2a8] !rounded-lg",
        },
      }}
      localization={{
        socialButtonsBlockButton: "Continue with {{provider|titleize}}",
        signIn: {
          start: {
             title: "Sign in to TrailTeam",
            subtitle: "Welcome back! Please sign in to continue",
          },
        },
        signUp: {
          start: {
             title: "Create your TrailTeam account",
            subtitle: "Welcome! Please fill in the details to get started",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <NativeAppBridge />
        <ClerkAuthSyncer />
        <ClerkQueryClientCacheInvalidator />
        <SessionExpiryHandler />
        <Suspense fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
            <Route path="/calendar" component={() => <ProtectedRoute component={Calendar} />} />
            <Route path="/events/:id" component={() => <ProtectedRoute component={EventDetail} />} />
            <Route path="/carpools" component={() => <ProtectedRoute component={CarpoolHub} />} />
            <Route path="/carpools/:eventId" component={() => <ProtectedRoute component={CarpoolBoard} />} />
            <Route path="/messages" component={() => <ProtectedRoute component={Messages} />} />
            <Route path="/messages/thread/:id" component={() => <ProtectedRoute component={BoardThread} />} />
            <Route path="/messages/new" component={() => <ProtectedRoute component={NewBroadcast} />} />
            <Route path="/messages/contact" component={() => <ProtectedRoute component={ContactCoach} />} />
            <Route path="/roster" component={() => <ProtectedRoute component={Roster} />} />
            <Route path="/roster/:householdId" component={() => <ProtectedRoute component={HouseholdDetail} />} />
            <Route path="/volunteer" component={() => <ProtectedRoute component={Volunteer} />} />
            <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
            <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
            <Route path="/season-builder" component={() => <ProtectedRoute component={SeasonBuilder} />} />
            <Route path="/onboarding" component={OnboardingRoute} />
            <Route path="/reenroll" component={() => (
              <>
                <Show when="signed-in"><Reenroll /></Show>
                <Show when="signed-out"><Redirect to="/sign-in" /></Show>
              </>
            )} />
            <Route path="/join/:code" component={Join} />
            <Route path="/family-invite/:token" component={FamilyInvite} />
            <Route path="/rider-invite/:token" component={RiderInvite} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AdminViewProvider>
        <WouterRouter base={basePath}>
          <TooltipProvider>
            <ClerkProviderWithRoutes />
            <Toaster />
          </TooltipProvider>
        </WouterRouter>
      </AdminViewProvider>
    </ThemeProvider>
  );
}
