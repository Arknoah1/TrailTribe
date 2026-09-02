import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  getGetMeQueryKey,
  useListOnboardingVolunteerOpportunities,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { formatPhoneInput } from "@/lib/utils";
import {
  Mountain, User, Home, Users, Bike, Check,
  ArrowRight, Plus, X, ChevronRight, Clock, ClipboardCheck,
} from "lucide-react";
import { DocumentConsentModal } from "@/components/document-consent-modal";
import { VolunteerSignupChoices, type VolunteerEvent } from "./volunteer";
import { hasRequiredUserName } from "@/lib/user-name";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

// ─── Progress indicator ───────────────────────────────────────────────────────

const STEPS = [
  { label: "Your name", Icon: User },
  { label: "Your family", Icon: Home },
  { label: "Your riders", Icon: Bike },
  { label: "Documents", Icon: ClipboardCheck },
  { label: "Volunteer", Icon: Users },
];

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map(({ label, Icon }, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all ${
                done ? "border-primary/70 bg-primary/10 text-primary" :
                active ? "border-primary bg-primary/20 text-primary" :
                "border-border text-muted-foreground/40"
              }`}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block whitespace-nowrap ${
                active ? "text-foreground" : done ? "text-primary/60" : "text-muted-foreground/40"
              }`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mt-[-10px] sm:mt-[-22px] rounded transition-colors ${i < step ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Name ─────────────────────────────────────────────────────────────

function StepName({
  defaultFirstName,
  defaultLastName,
  defaultPhone,
  onNext,
}: {
  defaultFirstName: string;
  defaultLastName: string;
  defaultPhone: string;
  onNext: () => void;
}) {
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [phone, setPhone] = useState(defaultPhone);
  const [saving, setSaving] = useState(false);
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleNext = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      onNext();
    } catch {
      toast({ title: "Couldn't save your name", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const valid = firstName.trim().length >= 1 && lastName.trim().length >= 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">Your name</h2>
        <p className="text-muted-foreground text-sm mt-2">Let's start with the basics.</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ob-firstName">First name <span className="text-destructive">*</span></Label>
            <Input
              id="ob-firstName"
              required
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First"
              autoFocus
              onKeyDown={e => e.key === "Enter" && valid && handleNext()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-lastName">Last name <span className="text-destructive">*</span></Label>
            <Input
              id="ob-lastName"
              required
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last"
              onKeyDown={e => e.key === "Enter" && valid && handleNext()}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-phone">
            Phone <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="ob-phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(formatPhoneInput(e.target.value))}
            placeholder="(555) 000-0000"
            onKeyDown={e => e.key === "Enter" && valid && handleNext()}
          />
          <p className="text-xs text-muted-foreground">Used for carpool coordination and urgent alerts.</p>
        </div>
      </div>

      <Button className="w-full" size="lg" onClick={handleNext} disabled={!valid || saving}>
        {saving ? "Saving…" : <>Continue <ArrowRight className="h-4 w-4 ml-1.5" /></>}
      </Button>
    </div>
  );
}

// ─── Step 2: Household ────────────────────────────────────────────────────────

type HHMode = "choose" | "create" | "join";

function StepHousehold({ onNext }: { onNext: (autoApproved: boolean) => void }) {
  const [mode, setMode] = useState<HHMode>("choose");
  const [saving, setSaving] = useState(false);
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create fields
  const [familyName, setFamilyName] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");

  // Join fields
  const [code, setCode] = useState("");

  const invalidateMe = () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });

  const handleCreate = async () => {
    if (!familyName.trim()) return;
    setSaving(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me/household`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: familyName.trim(),
          ...(ecName.trim() ? { emergencyContactName: ecName.trim() } : {}),
          ...(ecPhone.trim() ? { emergencyContactPhone: ecPhone.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to create household");
      }
      invalidateMe();
      onNext(false); // created households wait for admin approval
    } catch (e: any) {
      toast({ title: e.message ?? "Couldn't create household", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await authedFetch(`${BASE_URL}/api/users/me/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: trimmed }),
      });
      if (res.status === 409) {
        toast({ title: "You're already in a household", variant: "destructive" });
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Invalid invite code");
      }
      invalidateMe();
      onNext(true); // joining auto-approves
    } catch (e: any) {
      toast({ title: e.message ?? "Couldn't join household", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (mode === "create") {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground mb-4 block">← back</button>
          <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">Your family</h2>
          <p className="text-muted-foreground text-sm mt-2">Create a household for your family. You can add a co-parent later.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ob-famName">Family name <span className="text-destructive">*</span></Label>
            <Input
              id="ob-famName"
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              placeholder="e.g. Garcia Family"
              autoFocus
            />
          </div>

          <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Emergency Contact</p>
              <p className="text-xs text-muted-foreground mt-0.5">Required at races. You can add this later from Profile.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-ecName">Contact name</Label>
                <Input id="ob-ecName" value={ecName} onChange={e => setEcName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-ecPhone">Contact phone</Label>
                <Input id="ob-ecPhone" type="tel" value={ecPhone} onChange={e => setEcPhone(formatPhoneInput(e.target.value))} placeholder="(555) 000-0000" />
              </div>
            </div>
          </div>
        </div>

        <Button className="w-full" size="lg" onClick={handleCreate} disabled={!familyName.trim() || saving}>
          {saving ? "Creating…" : <>Create Household <ArrowRight className="h-4 w-4 ml-1.5" /></>}
        </Button>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground mb-4 block">← back</button>
          <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">Join your family</h2>
          <p className="text-muted-foreground text-sm mt-2">Enter the invite code your co-parent shared with you.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-code">Invite code</Label>
          <Input
            id="ob-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="e.g. a3f9c2b1"
            className="font-mono text-base tracking-widest"
            autoFocus
            onKeyDown={e => e.key === "Enter" && code.trim().length >= 6 && handleJoin()}
          />
          <p className="text-xs text-muted-foreground">
            Find this in your co-parent's Profile → My Family → Share Invite Link.
          </p>
        </div>

        <Button className="w-full" size="lg" onClick={handleJoin} disabled={code.trim().length < 6 || saving}>
          {saving ? "Joining…" : <>Join Household <ArrowRight className="h-4 w-4 ml-1.5" /></>}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">Your family</h2>
        <p className="text-muted-foreground text-sm mt-2">Create a household or join one your co-parent already set up.</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setMode("create")}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[#0a0c10] bg-card hover:bg-secondary transition-colors text-left"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Home className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Create a household</div>
            <div className="text-xs text-muted-foreground mt-0.5">I'm the first parent setting up our family</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>

        <button
          onClick={() => setMode("join")}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-[#0a0c10] bg-card hover:bg-secondary transition-colors text-left"
        >
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Join with a code</div>
            <div className="text-xs text-muted-foreground mt-0.5">My co-parent already set up our household</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Riders ───────────────────────────────────────────────────────────

interface RiderDraft {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
}

function StepRiders({ householdId, onNext }: { householdId: number; onNext: () => void }) {
  const [riders, setRiders] = useState<RiderDraft[]>([
    { id: "r0", firstName: "", lastName: "", grade: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();

  const addRider = () => {
    setRiders(r => [...r, { id: `r${r.length}`, firstName: "", lastName: "", grade: "" }]);
  };

  const removeRider = (id: string) => {
    setRiders(r => r.filter(x => x.id !== id));
  };

  const update = (id: string, field: keyof RiderDraft, val: string) => {
    setRiders(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  };

  const validRiders = riders.filter(r => r.firstName.trim() && r.lastName.trim());

  const handleSave = async () => {
    if (validRiders.length === 0) { onNext(); return; }
    setSaving(true);
    try {
      await Promise.all(validRiders.map(r =>
        authedFetch(`${BASE_URL}/api/households/${householdId}/riders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: r.firstName.trim(),
            lastName: r.lastName.trim(),
            ...(r.grade ? { grade: parseInt(r.grade, 10) } : {}),
          }),
        })
      ));
      onNext();
    } catch {
      toast({ title: "Couldn't save riders. Please try again or add them later from Profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">
          Your rider{riders.length !== 1 ? "s" : ""}
        </h2>
        <p className="text-muted-foreground text-sm mt-2">
          Add the student(s) in your household. Medical info, allergies, and notifications can be filled in later.
        </p>
      </div>

      <div className="space-y-3">
        {riders.map((rider, i) => (
          <div key={rider.id} className="rounded-xl border-2 border-[#0a0c10] bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rider {i + 1}</span>
              {riders.length > 1 && (
                <button onClick={() => removeRider(rider.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`fn-${rider.id}`}>First name <span className="text-destructive">*</span></Label>
                <Input
                  id={`fn-${rider.id}`}
                  value={rider.firstName}
                  onChange={e => update(rider.id, "firstName", e.target.value)}
                  placeholder="First"
                  autoFocus={i === 0}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ln-${rider.id}`}>Last name <span className="text-destructive">*</span></Label>
                <Input
                  id={`ln-${rider.id}`}
                  value={rider.lastName}
                  onChange={e => update(rider.id, "lastName", e.target.value)}
                  placeholder="Last"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`gr-${rider.id}`}>
                Grade <span className="text-muted-foreground font-normal">(optional, 5–12)</span>
              </Label>
              <Input
                id={`gr-${rider.id}`}
                type="number"
                min={5}
                max={12}
                value={rider.grade}
                onChange={e => update(rider.id, "grade", e.target.value)}
                placeholder="e.g. 9"
              />
            </div>
          </div>
        ))}

        <button
          onClick={addRider}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add another rider
        </button>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onNext} disabled={saving}>
          Skip for now
        </Button>
        <Button className="flex-1" size="default" onClick={handleSave} disabled={saving}>
          {saving
            ? "Saving…"
            : validRiders.length > 0
            ? <>Add {validRiders.length} rider{validRiders.length !== 1 ? "s" : ""} <ArrowRight className="h-4 w-4 ml-1.5" /></>
            : <>Continue <ArrowRight className="h-4 w-4 ml-1.5" /></>}
        </Button>
      </div>
    </div>
  );
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function StepDone({ approved, onGo }: { approved: boolean; onGo: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          {approved
            ? <Check className="h-10 w-10 text-primary" />
            : <Clock className="h-10 w-10 text-primary" />}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">
          {approved ? "You're in!" : "Almost there"}
        </h2>
        {approved ? (
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            Your account is all set. Head to the dashboard to see upcoming events and RSVP.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            Your account is pending approval from a coach or admin. You'll get full access once they approve you — usually within a day or two.
          </p>
        )}
      </div>

      <Button className="w-full" size="lg" onClick={onGo}>
        {approved ? <>Go to Dashboard <ArrowRight className="h-4 w-4 ml-1.5" /></> : "Got it"}
      </Button>
    </div>
  );
}

// ─── Step 4: Compliance documents ────────────────────────────────────────────

const COMPLIANCE_DOCS = [
  { type: "liability_waiver" as const, label: "Liability Waiver" },
  { type: "media_release" as const,   label: "Media Release" },
  { type: "code_of_conduct" as const, label: "Code of Conduct" },
];

function StepCompliance({ householdId, onNext }: { householdId: number; onNext: () => void }) {
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();
  const [teamDocs, setTeamDocs] = useState<Array<{ type: string; viewUrl: string | null }>>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [signedDocs, setSignedDocs] = useState<Set<string>>(new Set());
  const [consentModal, setConsentModal] = useState<{
    docType: "liability_waiver" | "media_release" | "code_of_conduct";
    label: string;
    viewUrl: string;
  } | null>(null);

  useEffect(() => {
    authedFetch(`${BASE_URL}/api/team-documents`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTeamDocs)
      .catch(() => toast({ title: "Could not load documents", variant: "destructive" }))
      .finally(() => setLoadingDocs(false));
  }, [authedFetch]);

  const docUrlByType = Object.fromEntries(teamDocs.map((d) => [d.type, d.viewUrl]));
  // All three required docs must be uploaded by the coach AND signed before continuing.
  // Docs without a URL are shown with a "waiting for coach" indicator — not skipped.
  const allSigned = COMPLIANCE_DOCS.every(
    (d) => !!docUrlByType[d.type] && signedDocs.has(d.type),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">Season documents</h2>
        <p className="text-muted-foreground text-sm mt-2">
          Open each document, read it, and click "I Accept Terms &amp; Submit" to sign.
        </p>
      </div>

      {loadingDocs ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {COMPLIANCE_DOCS.map(({ type, label }) => {
            const viewUrl = docUrlByType[type] ?? null;
            const isSigned = signedDocs.has(type);
            return (
              <div
                key={type}
                className="rounded-xl border-2 border-[#0a0c10] bg-card p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {isSigned && <Check className="h-4 w-4 text-primary shrink-0" />}
                    {label}
                  </div>
                  {!viewUrl && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Not yet uploaded by your coach.
                    </p>
                  )}
                  {isSigned && (
                    <p className="text-xs text-primary/70 mt-0.5 font-medium">Signed ✓</p>
                  )}
                </div>
                {!isSigned && viewUrl && (
                  <button
                    onClick={() => setConsentModal({ docType: type, label, viewUrl })}
                    className="shrink-0 inline-flex items-center min-h-[36px] rounded-lg border-2 border-[#0a0c10] bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs px-4 shadow-cel-sm cel-interactive transition-all"
                  >
                    Open &amp; Sign
                  </button>
                )}
                {!isSigned && !viewUrl && (
                  <span className="shrink-0 text-xs text-muted-foreground px-3 py-1.5 border rounded-lg italic">
                    Waiting for coach
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={onNext}
        disabled={!allSigned}
      >
        Continue <ArrowRight className="h-4 w-4 ml-1.5" />
      </Button>
      {!allSigned && !loadingDocs && (
        <p className="text-center text-xs text-muted-foreground">
          {COMPLIANCE_DOCS.some((d) => !docUrlByType[d.type])
            ? "Waiting for your coach to upload all required documents."
            : "All documents must be read and signed before continuing."}
        </p>
      )}

      {consentModal && (
        <DocumentConsentModal
          open={!!consentModal}
          onOpenChange={(o) => { if (!o) setConsentModal(null); }}
          label={consentModal.label}
          viewUrl={consentModal.viewUrl}
          documentType={consentModal.docType}
          householdId={householdId}
          onAccepted={() => {
            setSignedDocs((prev) => new Set([...prev, consentModal!.docType]));
            setConsentModal(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Step 5: Optional volunteer opportunities ─────────────────────────────────

function StepVolunteer({ onNext }: { onNext: () => void }) {
  const {
    data: opportunities,
    isLoading,
    isError,
    refetch,
  } = useListOnboardingVolunteerOpportunities();
  const events = (opportunities ?? []) as VolunteerEvent[];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl tracking-widest text-foreground leading-none">Pitch in, if you can</h2>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            Optional
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Every family can help, whether or not you’re racing. Choose a role at an event you expect to attend, or skip this for now.
        </p>
      </div>

      {isLoading ? (
        <div className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground" role="status">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading volunteer opportunities…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/60 bg-destructive/10 p-4" role="alert">
          <p className="text-sm font-semibold">Couldn’t load volunteer opportunities</p>
          <p className="mt-1 text-sm text-muted-foreground">You can finish onboarding now and check back later, or try again.</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-center text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-primary opacity-60" />
          <p className="text-sm font-semibold">No volunteer opportunities yet</p>
          <p className="mt-1 text-sm">Your coach will add openings for upcoming events. You can visit Volunteer later to see them.</p>
        </div>
      ) : (
        <VolunteerSignupChoices events={events} onSignupSuccess={() => void refetch()} />
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button variant="outline" className="flex-1" onClick={onNext}>
          Skip for now
        </Button>
        <Button className="flex-1" size="lg" onClick={onNext}>
          Continue to finish <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Loading household ID after creation ──────────────────────────────────────
// After creating or joining, poll /me until householdId is populated.

function AwaitHouseholdId({ onReady }: { onReady: (id: number) => void }) {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), refetchInterval: 800 } });

  if (me?.householdId) {
    onReady(me.householdId);
  }

  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading } = useGetMe();

  const [step, setStep] = useState(0);
  const [autoApproved, setAutoApproved] = useState(false);
  const [householdId, setHouseholdId] = useState<number | null>(null);
  // Direct family invites approve the account before onboarding starts. Keep
  // that server-backed state alongside the household-code join state so the
  // completion screen does not incorrectly say approval is still pending.
  const serverApproved = Boolean((me as any)?.approved);
  const hasName = hasRequiredUserName(me);

  // If they already have a household and haven't started the wizard, send them home
  if (!isLoading && me?.householdId && hasName && step === 0) {
    setLocation("/dashboard");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="border-b-2 border-[#0a0c10] px-6 py-4 flex items-center gap-3">
        <Mountain className="h-6 w-6 text-primary" />
        <span className="font-display text-xl tracking-widest text-primary">TrailTeam</span>
      </div>

      {/* Wizard body */}
      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-lg">
          {step < 5 && <ProgressBar step={step} />}

          <div className="rounded-2xl border-2 border-[#0a0c10] bg-card p-6 shadow-cel">
            {step === 0 && (
              <StepName
                defaultFirstName={hasName ? (me?.firstName ?? "") : ""}
                defaultLastName={hasName ? (me?.lastName ?? "") : ""}
                defaultPhone={me?.phone ?? ""}
                onNext={() => setStep(1)}
              />
            )}

            {step === 1 && (
              <StepHousehold
                onNext={(joined) => {
                  setAutoApproved(joined || serverApproved);
                  setStep(2);
                }}
              />
            )}

            {step === 2 && householdId === null && (
              <AwaitHouseholdId onReady={(id) => setHouseholdId(id)} />
            )}

            {step === 2 && householdId !== null && (
              <StepRiders householdId={householdId} onNext={() => setStep(3)} />
            )}

            {step === 3 && householdId !== null && (
              <StepCompliance householdId={householdId} onNext={() => setStep(4)} />
            )}

            {step === 4 && (
              <StepVolunteer onNext={() => setStep(5)} />
            )}

            {step === 5 && (
              <StepDone
                approved={autoApproved || serverApproved}
                onGo={() => setLocation("/dashboard")}
              />
            )}
          </div>

          {step < 5 && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              Step {step + 1} of 5 — you can finish this later from your Profile
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
