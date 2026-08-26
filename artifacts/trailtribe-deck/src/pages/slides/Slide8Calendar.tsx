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
  { label: "Calendar", active: true },
  { label: "Carpools", active: false },
  { label: "Messages", active: false },
  { label: "Profile", active: false },
];

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
// Aug 2025 starts on Friday (index 5)
const CALENDAR_ROWS = [
  [null, null, null, null, null, 1, 2],
  [3, 4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 15, 16],
  [17, 18, 19, 20, 21, 22, 23],
  [24, 25, 26, 27, 28, 29, 30],
  [31, null, null, null, null, null, null],
];
// Events: practice on 12, race on 17, practice on 19, practice on 26
const EVENT_DAYS: Record<number, "practice" | "race"> = {
  12: "practice",
  17: "race",
  19: "practice",
  26: "practice",
};

export default function Slide8Calendar() {
  const callouts = [
    { title: "Monthly overview at a glance", body: "Color-coded dots show every practice, race, and event on one grid — no surprises mid-week." },
    { title: "Tap to RSVP in seconds", body: "Select any event to see the detail, then confirm your attendance for your whole household." },
    { title: "Subscribe to your calendar app", body: "Export a private iCal link so events auto-sync to Apple Calendar, Google Calendar, or Outlook." },
  ];

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F0C0A", display: "flex" }}>

      {/* Left — mockup */}
      <div style={{ width: "56vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "4.5vh 2.5vw 4.5vh 4.5vw", boxSizing: "border-box" }}>
        <div style={{ width: "100%", height: "100%", background: "#1C1A17", borderRadius: "10px", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)" }}>
          {/* Browser chrome */}
          <div style={{ background: "#252320", height: "3.6vh", display: "flex", alignItems: "center", padding: "0 1vw", gap: "0.5vw", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "0.35vw" }}>
              {["#FF5F57","#FEBC2E","#28C840"].map(c => <div key={c} style={{ width: "0.65vw", height: "0.65vw", borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ flex: 1, background: "#1A1917", borderRadius: 4, margin: "0 0.8vw", height: "1.8vh", display: "flex", alignItems: "center", paddingLeft: "0.6vw" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.58vw", color: "#5A5550" }}>trailteam.app/calendar</span>
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
            {/* Main */}
            <div style={{ flex: 1, background: APP_BG, overflow: "hidden", display: "flex", gap: "1vw", padding: "1.6vh 1.2vw" }}>

              {/* Calendar grid */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.8vh" }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4vh" }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.75vw", fontWeight: 700 }}>August 2025</span>
                  <div style={{ display: "flex", gap: "0.4vw" }}>
                    <div style={{ width: "1.4vw", height: "2.2vh", background: SECTION_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "0.55vw", color: MUTED }}>‹</span>
                    </div>
                    <div style={{ width: "1.4vw", height: "2.2vh", background: SECTION_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "0.55vw", color: MUTED }}>›</span>
                    </div>
                  </div>
                </div>

                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.2vw" }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ textAlign: "center", fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "0.5vw", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: "0.4vh" }}>{d}</div>
                  ))}
                </div>

                {/* Calendar weeks */}
                {CALENDAR_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.2vw" }}>
                    {row.map((day, di) => {
                      const evType = day ? EVENT_DAYS[day] : undefined;
                      const isToday = day === 12;
                      return (
                        <div key={di} style={{
                          height: "4.5vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          background: isToday ? PRIMARY : day ? CARD_BG : "transparent",
                          border: day && !isToday ? `1px solid ${CARD_BORDER}` : "none",
                          borderRadius: 5,
                        }}>
                          {day && <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.6vw", fontWeight: isToday ? 700 : 400, color: isToday ? "#FFFFFF" : TEXT }}>{day}</span>}
                          {evType && !isToday && <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: evType === "race" ? AMBER : PRIMARY, marginTop: "0.15vh" }} />}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div style={{ display: "flex", gap: "1vw", marginTop: "0.5vh" }}>
                  {[["Practice", PRIMARY], ["Race", AMBER]].map(([lbl, color]) => (
                    <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "0.3vw" }}>
                      <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: color as string }} />
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.5vw" }}>{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Event detail panel */}
              <div style={{ width: "12vw", background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ height: "0.3vh", background: PRIMARY }} />
                <div style={{ background: SECTION_BG, padding: "0.6vh 0.8vw", borderBottom: `1px solid ${CARD_BORDER}` }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", color: PRIMARY, fontSize: "0.5vw", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Practice</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.7vw", fontWeight: 600, marginTop: "0.2vh" }}>Tuesday Skills Session</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw", marginTop: "0.2vh" }}>Aug 12 · 4:30 PM</div>
                </div>
                <div style={{ padding: "0.8vh 0.8vw", display: "flex", flexDirection: "column", gap: "0.6vh", flex: 1 }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw" }}>📍 Methow Trails Trailhead</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw" }}>🚗 4 carpool spots</div>
                  <div style={{ borderTop: `1px solid ${CARD_BORDER}`, paddingTop: "0.6vh", marginTop: "0.2vh" }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "0.48vw", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5vh" }}>Your RSVP</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35vh" }}>
                      <button style={{ background: PRIMARY, color: "#fff", border: "none", borderRadius: 5, padding: "0.55vh 0", fontSize: "0.55vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, cursor: "pointer" }}>✓ Going</button>
                      <button style={{ background: SECTION_BG, color: MUTED, border: `1px solid ${CARD_BORDER}`, borderRadius: 5, padding: "0.55vh 0", fontSize: "0.55vw", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}>Not Going</button>
                      <button style={{ background: SECTION_BG, color: MUTED, border: `1px solid ${CARD_BORDER}`, borderRadius: 5, padding: "0.55vh 0", fontSize: "0.55vw", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}>Maybe</button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Right — callouts */}
      <div style={{ width: "44vw", height: "100vh", display: "flex", flexDirection: "column", padding: "7vh 6vw 7vh 2.5vw", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>How It Works &gt; 02</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw" }}>07</div>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3vw", margin: "0 0 5vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" as any }}>
          Never miss<br />a practice
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
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw", letterSpacing: "0.1em" }}>trailteam.app</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.15em", textTransform: "uppercase" }}>Families / 2025–26</div>
        </div>
      </div>
    </div>
  );
}
