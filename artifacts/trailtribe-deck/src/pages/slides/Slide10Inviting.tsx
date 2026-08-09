const APP_BG = "#F5F3EE";
const SIDEBAR_BG = "#1A1917";
const SIDEBAR_BORDER = "#2A2724";
const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#E5E0D8";
const SECTION_BG = "#EDEAE4";
const PRIMARY = "#3B6E38";
const TEXT = "#1C1B18";
const MUTED = "#7A736A";
const AMBER = "#C49A6C";

const NAV_ITEMS = [
  { label: "Dashboard", active: false },
  { label: "Calendar", active: false },
  { label: "Carpools", active: false },
  { label: "Messages", active: false },
  { label: "Admin", active: true },
];

interface InviteRow {
  email: string;
  status: "pending" | "accepted" | "expired";
  date: string;
}

function InviteRow({ email, status, date }: InviteRow) {
  const statusColor = status === "accepted" ? PRIMARY : status === "pending" ? AMBER : MUTED;
  const statusLabel = status === "accepted" ? "✓ Accepted" : status === "pending" ? "Pending" : "Expired";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6vw", padding: "0.6vh 0.8vw", borderBottom: `1px solid ${CARD_BORDER}` }}>
      <div style={{ flex: 1, fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.6vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.5vw", color: statusColor, fontWeight: 600, letterSpacing: "0.04em", flexShrink: 0 }}>{statusLabel}</span>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.5vw", color: MUTED, flexShrink: 0 }}>{date}</span>
    </div>
  );
}

export default function Slide10Inviting() {
  const callouts = [
    { title: "Email or shareable link", body: "Paste one or many email addresses to send invites directly, or generate a signup link to post in your club newsletter." },
    { title: "Families sign up themselves", body: "Invited families create their account, enter rider details, and submit — coaches just approve and assign a pod." },
    { title: "Track every invite in one view", body: "See who accepted, who's still pending, and who needs a nudge — all in the Sent Invites list." },
  ];

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F0C0A", display: "flex" }}>

      {/* Left — mockup */}
      <div style={{ width: "56vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "4.5vh 2.5vw 4.5vh 4.5vw", boxSizing: "border-box" }}>
        <div style={{ width: "100%", height: "100%", background: "#1C1A17", borderRadius: "10px", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)" }}>
          {/* Browser chrome */}
          <div style={{ background: "#252320", height: "3.6vh", display: "flex", alignItems: "center", padding: "0 1vw", gap: "0.5vw" }}>
            <div style={{ display: "flex", gap: "0.35vw" }}>
              {["#FF5F57","#FEBC2E","#28C840"].map(c => <div key={c} style={{ width: "0.65vw", height: "0.65vw", borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ flex: 1, background: "#1A1917", borderRadius: 4, margin: "0 0.8vw", height: "1.8vh", display: "flex", alignItems: "center", paddingLeft: "0.6vw" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.58vw", color: "#5A5550" }}>trailtribe.app/admin</span>
            </div>
          </div>
          {/* App layout */}
          <div style={{ height: "calc(100% - 3.6vh)", display: "flex", overflow: "hidden" }}>
            {/* Sidebar */}
            <div style={{ width: "11vw", background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}`, flexShrink: 0, display: "flex", flexDirection: "column", padding: "1.5vh 0.6vw 1vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.6vw", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "2.2vh", paddingLeft: "0.5vw" }}>TrailTribe</div>
              {NAV_ITEMS.map(({ label, active }) => (
                <div key={label} style={{ padding: "0.65vh 0.6vw", borderRadius: 5, marginBottom: "0.2vh", background: active ? "#2A2724" : "transparent", color: active ? "#F0E8DD" : "#5A5550", fontSize: "0.62vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: active ? 600 : 400 }}>{label}</div>
              ))}
            </div>
            {/* Main */}
            <div style={{ flex: 1, background: APP_BG, overflow: "hidden", padding: "1.6vh 1.4vw", display: "flex", flexDirection: "column", gap: "1vh" }}>

              {/* Tab bar */}
              <div style={{ display: "flex", gap: "0.3vw", borderBottom: `1.5px solid ${CARD_BORDER}`, paddingBottom: "0.6vh", marginBottom: "0.2vh" }}>
                {["Approvals", "Roster", "Invites", "Events", "Settings"].map((tab, i) => (
                  <div key={tab} style={{ padding: "0.4vh 0.7vw", fontSize: "0.58vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: i === 2 ? 700 : 400, color: i === 2 ? PRIMARY : MUTED, borderBottom: i === 2 ? `2px solid ${PRIMARY}` : "2px solid transparent", marginBottom: "-1.5px", cursor: "pointer" }}>{tab}</div>
                ))}
              </div>

              {/* Invite form */}
              <div style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, padding: "1vh 1vw" }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.68vw", fontWeight: 600, marginBottom: "0.7vh" }}>Invite Families by Email</div>
                <div style={{ display: "flex", gap: "0.5vw" }}>
                  <div style={{ flex: 1, background: APP_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 6, padding: "0.55vh 0.7vw", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.58vw", color: MUTED }}>
                    parent@example.com, another@family.com
                  </div>
                  <button style={{ background: PRIMARY, color: "#fff", border: "none", borderRadius: 6, padding: "0.55vh 0.9vw", fontSize: "0.58vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                    Send Invites
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5vw", marginTop: "0.6vh" }}>
                  <div style={{ flex: 1, height: "1px", background: CARD_BORDER }} />
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.5vw", color: MUTED }}>or</span>
                  <div style={{ flex: 1, height: "1px", background: CARD_BORDER }} />
                </div>
                <button style={{ marginTop: "0.6vh", width: "100%", background: SECTION_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 6, padding: "0.55vh", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.55vw", color: MUTED, cursor: "pointer" }}>
                  🔗 Generate Signup Link
                </button>
              </div>

              {/* Sent invites list */}
              <div style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, overflow: "hidden", flex: 1 }}>
                <div style={{ padding: "0.6vh 0.8vw", borderBottom: `1px solid ${CARD_BORDER}`, background: SECTION_BG }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.6vw", fontWeight: 600 }}>Sent Invites</span>
                </div>
                <InviteRow email="johnson.family@gmail.com" status="accepted" date="Aug 3" />
                <InviteRow email="sarah.wheeler@outlook.com" status="pending" date="Aug 7" />
                <InviteRow email="mike.torres@gmail.com" status="pending" date="Aug 7" />
                <InviteRow email="chen.riders@yahoo.com" status="expired" date="Jul 28" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — callouts */}
      <div style={{ width: "44vw", height: "100vh", display: "flex", flexDirection: "column", padding: "7vh 6vw 7vh 2.5vw", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>How It Works &gt; 04</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw" }}>09</div>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3vw", margin: "0 0 5vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" as any }}>
          Onboard families<br />in seconds
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "3.5vh" }}>
          {callouts.map(({ title, body }) => (
            <div key={title}>
              <div style={{ width: "2.5vw", height: "1px", background: AMBER, marginBottom: "1.5vh" }} />
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.2vw", fontWeight: 500, marginBottom: "0.8vh" }}>{title}</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "0.95vw", lineHeight: 1.55, textWrap: "pretty" as any }}>{body}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw", letterSpacing: "0.1em" }}>trailtribe.app</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.15em", textTransform: "uppercase" }}>Coaches / 2025–26</div>
        </div>
      </div>
    </div>
  );
}
