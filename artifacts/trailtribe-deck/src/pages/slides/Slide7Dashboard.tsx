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

export default function Slide7Dashboard() {
  const callouts = [
    { title: "Upcoming events front and center", body: "Your next practices and races surface immediately — no hunting through menus." },
    { title: "Household RSVP in one tap", body: "See who in your family is going and update your attendance directly from the card." },
    { title: "RSVP status at a glance", body: "Green check, red X, or pending — coaches and families always know where everyone stands." },
  ];

  const navItems = [
    { label: "Dashboard", active: true },
    { label: "Calendar", active: false },
    { label: "Carpools", active: false },
    { label: "Messages", active: false },
    { label: "Profile", active: false },
  ];

  const eventCards = [
    { type: "practice", typeColor: PRIMARY, title: "Tuesday Skills Session", date: "Aug 12, 2025", location: "Methow Trails Trailhead", rsvp: "yes" as const },
    { type: "race", typeColor: AMBER, title: "Cascades Cup XCO — Round 4", date: "Aug 17, 2025", location: "Chelan Butte", rsvp: "none" as const },
  ];

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F0C0A", display: "flex" }}>

      {/* Left — mockup */}
      <div style={{ width: "56vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "4.5vh 2.5vw 4.5vh 4.5vw", boxSizing: "border-box" }}>
        <div style={{ width: "100%", height: "100%", background: "#1C1A17", borderRadius: "10px", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)" }}>

          {/* Browser chrome */}
          <div style={{ background: "#252320", height: "3.6vh", display: "flex", alignItems: "center", padding: "0 1vw", gap: "0.5vw", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "0.35vw" }}>
              {["#FF5F57","#FEBC2E","#28C840"].map(c => (
                <div key={c} style={{ width: "0.65vw", height: "0.65vw", borderRadius: "50%", background: c }} />
              ))}
            </div>
            <div style={{ flex: 1, background: "#1A1917", borderRadius: 4, margin: "0 0.8vw", height: "1.8vh", display: "flex", alignItems: "center", paddingLeft: "0.6vw" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.58vw", color: "#5A5550" }}>trailteam.app/dashboard</span>
            </div>
          </div>

          {/* App layout */}
          <div style={{ height: "calc(100% - 3.6vh)", display: "flex", overflow: "hidden" }}>
            {/* Sidebar */}
            <div style={{ width: "11vw", background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}`, flexShrink: 0, display: "flex", flexDirection: "column", padding: "1.5vh 0.6vw 1vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.6vw", letterSpacing: "0.15em", textTransform: "uppercase" as const, marginBottom: "2.2vh", paddingLeft: "0.5vw" }}>TrailTeam</div>
              {navItems.map(({ label, active }) => (
                <div key={label} style={{ padding: "0.65vh 0.6vw", borderRadius: 5, marginBottom: "0.2vh", background: active ? "#2A2724" : "transparent", color: active ? "#F0E8DD" : "#5A5550", fontSize: "0.62vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: active ? 600 : 400 }}>{label}</div>
              ))}
            </div>

            {/* Main content */}
            <div style={{ flex: 1, background: APP_BG, overflow: "hidden", padding: "1.6vh 1.4vw" }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "0.3vh" }}>Dashboard</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.58vw", marginBottom: "1.4vh" }}>What's happening this week.</div>

              {/* Summary chips */}
              <div style={{ display: "flex", gap: "0.6vw", marginBottom: "1.4vh" }}>
                {[["3", "Upcoming"], ["2", "RSVPs pending"], ["4", "Carpool spots"]].map(([n, l]) => (
                  <div key={l} style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 6, padding: "0.5vh 0.7vw", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: PRIMARY, fontSize: "0.85vw", fontWeight: 700 }}>{n}</span>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.5vw" }}>{l}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7vh" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.72vw", fontWeight: 600 }}>Upcoming Events</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: PRIMARY, fontSize: "0.52vw", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>View Calendar</span>
              </div>

              {/* Event cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
                {eventCards.map(({ type, typeColor, title, date, location, rsvp }) => (
                  <div key={title} style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ height: "0.3vh", background: typeColor }} />
                    <div style={{ background: SECTION_BG, padding: "0.5vh 0.8vw", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1.5px solid ${CARD_BORDER}` }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: typeColor, fontSize: "0.52vw", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 700 }}>{type}</span>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw" }}>{date}</span>
                    </div>
                    <div style={{ padding: "0.8vh 0.8vw 0.9vh" }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.75vw", fontWeight: 600, marginBottom: "0.3vh" }}>{title}</div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.58vw", marginBottom: "0.7vh" }}>📍 {location}</div>
                      <div style={{ borderTop: `1px solid ${CARD_BORDER}`, paddingTop: "0.5vh", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4vw" }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "0.5vw", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>RSVP:</span>
                          {rsvp === "yes"
                            ? <span style={{ color: PRIMARY, fontSize: "0.55vw", fontWeight: 700, fontFamily: "'DM Mono', monospace", textTransform: "uppercase" as const }}>✓ Going</span>
                            : <span style={{ color: MUTED, fontSize: "0.55vw", fontFamily: "'DM Mono', monospace", fontStyle: "italic" }}>No response yet</span>
                          }
                        </div>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: PRIMARY, fontSize: "0.52vw", fontWeight: 700 }}>Details →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — callouts */}
      <div style={{ width: "44vw", height: "100vh", display: "flex", flexDirection: "column", padding: "7vh 6vw 7vh 2.5vw", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>How It Works &gt; 01</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw" }}>06</div>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3vw", margin: "0 0 5vh 0", lineHeight: 1.1, fontWeight: 500 }}>
          Your team,<br />at a glance
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "3.5vh" }}>
          {callouts.map(({ title, body }) => (
            <div key={title}>
              <div style={{ width: "2.5vw", height: "1px", background: AMBER, marginBottom: "1.5vh" }} />
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.2vw", fontWeight: 500, marginBottom: "0.8vh" }}>{title}</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "0.95vw", lineHeight: 1.55 }}>{body}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw", letterSpacing: "0.1em" }}>trailteam.app</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.15em", textTransform: "uppercase" as const }}>Families / 2025–26</div>
        </div>
      </div>
    </div>
  );
}
