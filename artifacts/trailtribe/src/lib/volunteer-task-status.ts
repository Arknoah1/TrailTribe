export type VolunteerTaskState = "available" | "claimed" | "full";

export type VolunteerTaskStatusInput = {
  mySignup?: unknown;
  signups?: unknown[];
  signupCount?: number;
  slotsNeeded?: number;
};

export function getVolunteerTaskState(task: VolunteerTaskStatusInput): VolunteerTaskState {
  if (task.mySignup) return "claimed";

  const filled = task.signupCount ?? task.signups?.length ?? 0;
  return filled >= (task.slotsNeeded ?? 0) ? "full" : "available";
}

export function getVolunteerTaskStateLabel(state: VolunteerTaskState): string {
  if (state === "claimed") return "You’re on it";
  if (state === "full") return "Full";
  return "Available";
}

export const volunteerTaskAvailableButtonClassName =
  "border-[#0a0c10] bg-primary text-primary-foreground shadow-cel hover:shadow-cel";

export const volunteerTaskUnavailableButtonClassName =
  "border-dashed border-[#0a0c10] bg-muted/70 text-foreground shadow-none opacity-100 hover:bg-muted/70 disabled:opacity-100";