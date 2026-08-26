import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { Mountain, Bike, Phone, Mail, CheckCircle2, RotateCcw, Check } from "lucide-react";
import { DocumentConsentModal } from "@/components/document-consent-modal";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const COMPLIANCE_DOCS = [
  { type: "liability_waiver" as const, label: "Liability Waiver" },
  { type: "media_release" as const,   label: "Media Release" },
  { type: "code_of_conduct" as const, label: "Code of Conduct" },
] as const;

export default function Reenroll() {
  const { data: me, isLoading: meLoading } = useGetMe();
  const queryClient = useQueryClient();
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [household, setHousehold] = useState<any>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [loadingHousehold, setLoadingHousehold] = useState(true);

  const [teamDocs, setTeamDocs] = useState<Array<{ type: string; viewUrl: string | null }>>([]);
  const [signedDocs, setSignedDocs] = useState<Set<string>>(new Set());
  const [consentModal, setConsentModal] = useState<{
    docType: "liability_waiver" | "media_release" | "code_of_conduct";
    label: string;
    viewUrl: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Fetch household + riders
  useEffect(() => {
    if (!me?.householdId) return;
    setLoadingHousehold(true);
    Promise.all([
      authedFetch(`${BASE_URL}/api/households/${me.householdId}`).then((r) => r.ok ? r.json() : null),
      authedFetch(`${BASE_URL}/api/households/${me.householdId}/riders`).then((r) => r.ok ? r.json() : []),
    ]).then(([h, r]) => {
      setHousehold(h);
      setRiders(r ?? []);
    }).catch(() => {}).finally(() => setLoadingHousehold(false));
  }, [me?.householdId, authedFetch]);

  // Fetch team documents for consent modals
  useEffect(() => {
    authedFetch(`${BASE_URL}/api/team-documents`)
      .then((r) => r.ok ? r.json() : [])
      .then(setTeamDocs)
      .catch(() => {});
  }, [authedFetch]);

  const docUrlByType = Object.fromEntries(teamDocs.map((d) => [d.type, d.viewUrl]));

  // Docs that require signing: those with an uploaded URL
  const requiredDocs = COMPLIANCE_DOCS.filter((d) => !!docUrlByType[d.type]);
  const canSubmit = requiredDocs.every((d) => signedDocs.has(d.type));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      setEnrollError(null);
      const res = await authedFetch(`${BASE_URL}/api/users/me/reenroll`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error ?? "Re-enrollment failed";
        setEnrollError(msg);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch {
      toast({ title: "Something went wrong — please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (meLoading || loadingHousehold) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const emergencyContact = household?.emergencyContactName;
  const emergencyPhone = household?.emergencyContactPhone;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 flex items-center gap-3">
        <Mountain className="h-6 w-6 text-primary" />
        <span className="font-display text-2xl tracking-widest text-primary">TrailTeam</span>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6">
          {/* Welcome back banner */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <RotateCcw className="h-3.5 w-3.5" />
              Welcome back!
            </div>
            <h1 className="font-display text-3xl tracking-widest text-foreground">
              Re-enroll for the new season
            </h1>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your family info is pre-filled. Open and sign each compliance document to re-enroll.
            </p>
          </div>

          {/* Family info summary (read-only) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Your Family
                <Badge variant="secondary" className="font-normal text-xs">Pre-filled</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Contact your coach if any details need updating.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Family name */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Family</p>
                <p className="font-semibold">{household?.name ?? "—"}</p>
              </div>

              {/* Riders */}
              {riders.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Bike className="h-3 w-3" /> Riders
                  </p>
                  <div className="space-y-1">
                    {riders.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-sm">
                        <span>{r.firstName} {r.lastName}</span>
                        {r.grade && <span className="text-muted-foreground text-xs">Grade {r.grade}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergency contact */}
              {(emergencyContact || emergencyPhone) && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Emergency Contact</p>
                  <div className="space-y-0.5 text-sm">
                    {emergencyContact && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {emergencyContact}
                      </div>
                    )}
                    {emergencyPhone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {formatPhone(emergencyPhone)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Compliance re-sign */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Re-sign Documents</CardTitle>
              <CardDescription className="text-xs">
                These must be re-signed each season. Open each document to read and accept it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {COMPLIANCE_DOCS.map(({ type, label }) => {
                const viewUrl = docUrlByType[type] ?? null;
                const isSigned = signedDocs.has(type);
                return (
                  <div key={type} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {isSigned && <Check className="h-4 w-4 text-green-500 shrink-0" />}
                        {label}
                      </div>
                      {!viewUrl && (
                        <p className="text-xs text-muted-foreground mt-0.5">Not yet uploaded by your coach.</p>
                      )}
                      {isSigned && (
                        <p className="text-xs text-primary/70 mt-0.5 font-medium">Signed ✓</p>
                      )}
                    </div>
                    {!isSigned && viewUrl && (
                      <Button
                        size="sm"
                        onClick={() => setConsentModal({ docType: type, label, viewUrl })}
                      >
                        Open &amp; Sign
                      </Button>
                    )}
                    {!isSigned && !viewUrl && (
                      <Button size="sm" disabled variant="outline">Not Available</Button>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 border-t space-y-3">
                {enrollError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {enrollError}
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={!canSubmit || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {submitting ? "Re-enrolling…" : "Complete Re-enrollment"}
                </Button>
                {!canSubmit && requiredDocs.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    All documents must be read and signed before continuing.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pod note */}
          <p className="text-xs text-muted-foreground text-center">
            Pod assignments are managed by your coach — you'll be assigned once you re-enroll.
          </p>
        </div>
      </div>

      {consentModal && me?.householdId && (
        <DocumentConsentModal
          open={!!consentModal}
          onOpenChange={(o) => { if (!o) setConsentModal(null); }}
          label={consentModal.label}
          viewUrl={consentModal.viewUrl}
          documentType={consentModal.docType}
          householdId={me.householdId}
          onAccepted={() => {
            setSignedDocs((prev) => new Set([...prev, consentModal!.docType]));
            setConsentModal(null);
          }}
        />
      )}
    </div>
  );
}
