import React from "react";
import { createRoot } from "react-dom/client";
import { Card, CardContent } from "../../src/components/ui/card";
import { FamilyLinkAction } from "../../src/components/family-link-action";
import "../../src/index.css";

declare global {
  interface Window {
    familyLinkEvents: Array<Record<string, unknown>>;
  }
}

const scenario = new URLSearchParams(window.location.search).get("scenario");
window.familyLinkEvents = [];

Object.defineProperty(navigator, "share", {
  configurable: true,
  value: scenario?.startsWith("share")
    ? async (data: ShareData) => {
        window.familyLinkEvents.push({ type: "share", ...data });
        if (scenario === "share-cancel") throw new DOMException("Cancelled", "AbortError");
        if (scenario === "share-failure") throw new DOMException("Unavailable", "NotAllowedError");
      }
    : undefined,
});

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: scenario === "manual"
    ? { writeText: async () => { throw new DOMException("Blocked", "NotAllowedError"); } }
    : {
        writeText: async (url: string) => {
          window.familyLinkEvents.push({ type: "clipboard", url });
        },
      },
});

function RosterCard({ archived = false }: { archived?: boolean }) {
  return (
    <Card data-testid={archived ? "archived-family-card" : "active-family-card"} className={archived ? "opacity-70" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">
              {archived ? "Archived Long-Named Household" : "Active Long-Named Household"}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            {!archived && (
              <FamilyLinkAction
                householdName="Active Long-Named Household"
                basePath="/trailteam"
                getInviteCode={async () => "family/code"}
                notify={(notice) => window.familyLinkEvents.push({ type: "notice", ...notice })}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-4xl space-y-4 p-4">
    <RosterCard />
    <RosterCard archived />
  </main>,
);