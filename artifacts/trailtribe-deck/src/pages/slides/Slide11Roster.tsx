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

interface RosterEntry {
  family: string;
  riders: string;
  pod: string;
  podColor: string;
}

function RosterRow({ family, riders, pod, podColor }: RosterEntry) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.7vw", padding: "0.55vh 0.8vw", borderBottom: `1px solid ${CARD_BORDER}` }}>
      <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", background: `${PRIMARY}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.55vw", fontWeight: 700, color: PRIMARY }}>{family[0]}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.6vw", fontWeight: 600 }}>{family}</div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.5vw" }}>{riders}</div>
      </div>
      <div style={{ background: `${podColor}20`, color: podColor, border: `1px solid ${podColor}50`, borderRadius: 4, padding: "0.2vh 0.4vw", fontFamily: "'DM Mono', monospace", fontSize: "0.48vw", fontWeight: 600, flexShrink: 0 }}>{pod}</div>
    </div>
  );
}

export default function Slide11Roster() {
  const callouts = [
    { title: "Full roster, one screen", body: "Every family, their riders, and pod assignment — all in a searchable list coaches can manage in seconds." },
    { title: "Pods keep training focused", body: "Coaches group families by age or skill level. Pod assignments filter events, carpools, and broadcasts automatically." },
    { title: "Broadcast to the whole team or one pod", body: "Write a message once and send it to every family, a specific pod, or selected households — with full delivery tracking." },
  ];

  const rosterEntries: RosterEntry[] = [
    { family: "Johnson Family", riders: "Emma (14), Jake (12)", pod: "Varsity", podColor: PRIMARY },
    { family: "Wheeler Family", riders: "Sam (13)", pod: "JV Blue", podColor: "#4A7EC7" },
    { family: "Torres Family", riders: "Mia (11), Leo (11)", pod: "JV Blue", podColor: "#4A7EC7" },
    { family: "Chen Family", riders: "Lily (15)", pod: "Varsity", podColor: PRIMARY },
    { family: "Park Family", riders: "Noah (12)", pod: "Beginners", podColor: AMBER },
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
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.58vw", color: "#5A5550" }}>trailtribemtb.com/admin</span>
            </div>
          </div>
          {/* App layout */}
          <div style={{ height: "calc(100% - 3.6vh)", display: "flex", overflow: "hidden" }}>
            {/* Sidebar */}
            <div style={{ width: "11vw", background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}`, flexShrink: 0, display: "flex", flexDirection: "column", padding: "1.5vh 0.6vw 1vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.6vw", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "2.2vh", paddingLeft: "0.5vw" }}>TrailTeam</div>
              {NAV_ITEMS.map(({ label, active }) => (
                <div key={label} style={{ padding: "0.65vh 0.6vw", borderRadius: 5, marginBottom: "0.2vh", background: active ? "#2A2724" : "transparent", color: active ? "#F0E8DD" : "#5A5550", fontSize: "0.62vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: active ? 600 : 400 }}>{label}</div>
              ))}
            </div>
            {/* Main — two-column */}
            <div style={{ flex: 1, background: APP_BG, overflow: "hidden", padding: "1.6vh 1.2vw", display: "flex", gap: "0.8vw" }}>

              {/* Roster panel */}
              <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: "0.6vh", minWidth: 0 }}>
                {/* Tab bar */}
                <div style={{ display: "flex", gap: "0.3vw", borderBottom: `1.5px solid ${CARD_BORDER}`, paddingBottom: "0.5vh" }}>
                  {["Approvals", "Roster", "Invites", "Events"].map((tab, i) => (
                    <div key={tab} style={{ padding: "0.3vh 0.6vw", fontSize: "0.55vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: i === 1 ? 700 : 400, color: i === 1 ? PRIMARY : MUTED, borderBottom: i === 1 ? `2px solid ${PRIMARY}` : "2px solid transparent", marginBottom: "-1.5px", cursor: "pointer" }}>{tab}</div>
                  ))}
                </div>

                {/* Search + view toggle */}
                <div style={{ display: "flex", gap: "0.4vw" }}>
                  <div style={{ flex: 1, background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 6, padding: "0.4vh 0.6vw", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.55vw", color: MUTED }}>🔍 Search families…</div>
                </div>

                {/* Roster list */}
                <div style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, overflow: "hidden", flex: 1 }}>
                  <div style={{ padding: "0.5vh 0.8vw", background: SECTION_BG, borderBottom: `1px solid ${CARD_BORDER}`, display: "flex", gap: "0.5vw" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.5vw", color: MUTED, flex: 1 }}>FAMILY</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.5vw", color: MUTED }}>POD</span>
                  </div>
                  {rosterEntries.map(r => <RosterRow key={r.family} {...r} />)}
                </div>
              </div>

              {/* Broadcast compose panel */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6vh", minWidth: 0 }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.65vw", fontWeight: 600 }}>Team Broadcast</div>
                <div style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, padding: "0.8vh 0.8vw", flex: 1, display: "flex", flexDirection: "column", gap: "0.7vh" }}>
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "0.48vw", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3vh" }}>Send to</div>
                    <div style={{ display: "flex", gap: "0.3vw" }}>
                      {["All Team", "Varsity", "JV Blue"].map((opt, i) => (
                        <div key={opt} style={{ padding: "0.3vh 0.5vw", borderRadius: 20, fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.5vw", fontWeight: i === 0 ? 700 : 400, background: i === 0 ? PRIMARY : SECTION_BG, color: i === 0 ? "#fff" : MUTED, border: i === 0 ? "none" : `1px solid ${CARD_BORDER}`, cursor: "pointer" }}>{opt}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "0.48vw", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3vh" }}>Subject</div>
                    <div style={{ background: APP_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 5, padding: "0.4vh 0.5vw", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.55vw", color: TEXT }}>Weekend race — final logistics</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "0.48vw", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3vh" }}>Message</div>
                    <div style={{ background: APP_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 5, padding: "0.5vh 0.5vw", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.52vw", color: TEXT, lineHeight: 1.4, height: "10vh" }}>
                      Hey team! Quick reminder for Saturday's Cascades Cup race at Chelan Butte…
                    </div>
                  </div>
                  <button style={{ background: PRIMARY, color: "#fff", border: "none", borderRadius: 6, padding: "0.6vh", width: "100%", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.58vw", fontWeight: 600, cursor: "pointer" }}>
                    Send to All Team (12 families)
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Right — callouts */}
      <div style={{ width: "44vw", height: "100vh", display: "flex", flexDirection: "column", padding: "7vh 6vw 7vh 2.5vw", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>How It Works &gt; 05</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw" }}>10</div>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3vw", margin: "0 0 5vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" as any }}>
          Keep everyone<br />in the loop
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
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw", letterSpacing: "0.1em" }}>trailtribemtb.com</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.15em", textTransform: "uppercase" }}>Coaches / 2025–26</div>
        </div>
      </div>
    </div>
  );
}
