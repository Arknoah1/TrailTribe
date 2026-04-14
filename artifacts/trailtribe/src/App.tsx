import Dashboard from "./pages/dashboard";
import Calendar from "./pages/calendar";
import EventDetail from "./pages/event-detail";
import CarpoolBoard from "./pages/carpools";
import CarpoolHub from "./pages/carpool-hub";
import Messages from "./pages/messages";
import NewBroadcast from "./pages/new-broadcast";
import ContactCoach from "./pages/contact-coach";
import Roster from "./pages/roster";
import HouseholdDetail from "./pages/household-detail";
import Profile from "./pages/profile";
import Admin from "./pages/admin";
import Join from "./pages/join";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
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

function Home() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background p-6">
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-5xl font-bold tracking-tight mb-4 text-primary">TrailTribe</h1>
        <p className="text-muted-foreground mb-8 text-lg font-medium">
          The app mountain bike parents actually want to open.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={`${basePath}/sign-up`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8">
            Get Started
          </a>
          <a href={`${basePath}/sign-in`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-8">
            Sign In
          </a>
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

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
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
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthSyncer />
        <ClerkQueryClientCacheInvalidator />
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
          <Route path="/messages/new" component={() => <ProtectedRoute component={NewBroadcast} />} />
          <Route path="/messages/contact" component={() => <ProtectedRoute component={ContactCoach} />} />
          <Route path="/roster" component={() => <ProtectedRoute component={Roster} />} />
          <Route path="/roster/:householdId" component={() => <ProtectedRoute component={HouseholdDetail} />} />
          <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
          <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
          <Route path="/join/:code" component={Join} />
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <WouterRouter base={basePath}>
        <TooltipProvider>
          <ClerkProviderWithRoutes />
          <Toaster />
        </TooltipProvider>
      </WouterRouter>
    </ThemeProvider>
  );
}
