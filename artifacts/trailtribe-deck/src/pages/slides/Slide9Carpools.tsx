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
  { label: "Carpools", active: true },
  { label: "Messages", active: false },
  { label: "Profile", active: false },
];

function RideCard({ driver, seats, location, offering }: { driver: string; seats: number; location: string; offering: boolean }) {
  return (
    <div style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, padding: "0.9vh 0.9vw", display: "flex", alignItems: "center", gap: "0.8vw" }}>
      {/* Avatar */}
      <div style={{ width: "2.2vw", height: "2.2vw", borderRadius: "50%", background: offering ? `${PRIMARY}22` : `${AMBER}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.65vw", fontWeight: 700, color: offering ? PRIMARY : AMBER }}>{driver[0]}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.65vw", fontWeight: 600 }}>{driver}</div>
        <div style={{ display: "flex", gap: "0.8vw", marginTop: "0.2vh" }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw" }}>🚗 {seats} seats open</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw" }}>📍 {location}</span>
        </div>
      </div>
      <button style={{
        background: offering ? PRIMARY : SECTION_BG,
        color: offering ? "#fff" : MUTED,
        border: offering ? "none" : `1px solid ${CARD_BORDER}`,
        borderRadius: 6, padding: "0.45vh 0.7vw",
        fontSize: "0.55vw", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600,
        cursor: "pointer", flexShrink: 0,
      }}>{offering ? "Claim Seat" : "My Ride"}</button>
    </div>
  );
}

export default function Slide9Carpools() {
  const callouts = [
    { title: "Per-event carpool boards", body: "Every practice and race has its own board — drivers post their route, families claim seats." },
    { title: "Offer a seat in one tap", body: "Drivers set their pickup spot and open seats; the app handles the coordination from there." },
    { title: "No more group-text chaos", body: "All ride logistics are in one place — no hunting through threads to find who has room." },
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
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.58vw", color: "#5A5550" }}>trailtribe.app/carpools/12</span>
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
            <div style={{ flex: 1, background: APP_BG, overflow: "hidden", padding: "1.6vh 1.4vw", display: "flex", flexDirection: "column", gap: "0.8vh" }}>

              {/* Back link */}
              <div style={{ fontFamily: "'DM Mono', monospace", color: PRIMARY, fontSize: "0.52vw", fontWeight: 600, marginBottom: "0.2vh" }}>← Carpools</div>

              {/* Event summary card */}
              <div style={{ background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ height: "0.3vh", background: PRIMARY }} />
                <div style={{ padding: "0.7vh 0.9vw", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: TEXT, fontSize: "0.72vw", fontWeight: 700 }}>Tuesday Skills Session</div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: MUTED, fontSize: "0.52vw", marginTop: "0.15vh" }}>Aug 12 · 4:30 PM · Methow Trails Trailhead</div>
                  </div>
                  <div style={{ background: `${PRIMARY}15`, color: PRIMARY, borderRadius: 6, padding: "0.4vh 0.6vw", fontFamily: "'DM Mono', monospace", fontSize: "0.52vw", fontWeight: 700 }}>Practice</div>
                </div>
              </div>

              {/* Offer/Need toggle */}
              <div style={{ display: "flex", gap: "0.4vw", marginTop: "0.2vh" }}>
                {["Available Rides", "Needs a Ride"].map((tab, i) => (
                  <div key={tab} style={{ padding: "0.5vh 0.9vw", borderRadius: 20, fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.55vw", fontWeight: 600, background: i === 0 ? PRIMARY : SECTION_BG, color: i === 0 ? "#fff" : MUTED, border: i === 0 ? "none" : `1px solid ${CARD_BORDER}`, cursor: "pointer" }}>{tab}</div>
                ))}
              </div>

              {/* Ride cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6vh" }}>
                <RideCard driver="Sarah K." seats={3} location="Winthrop Library" offering={true} />
                <RideCard driver="Tom R." seats={2} location="Mazama Store" offering={true} />
                <RideCard driver="You" seats={0} location="Twisp Park-and-Ride" offering={false} />
              </div>

              {/* Offer button */}
              <button style={{ marginTop: "0.4vh", background: SECTION_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 8, padding: "0.8vh", width: "100%", fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.6vw", fontWeight: 600, color: PRIMARY, cursor: "pointer" }}>
                + Offer a Ride
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right — callouts */}
      <div style={{ width: "44vw", height: "100vh", display: "flex", flexDirection: "column", padding: "7vh 6vw 7vh 2.5vw", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>How It Works &gt; 03</div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw" }}>08</div>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3vw", margin: "0 0 5vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" as any }}>
          Rides,<br />sorted
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
          <div style={{ fontFamily: "'DM Mono', monospace", color: AMBER, fontSize: "0.75vw", letterSpacing: "0.15em", textTransform: "uppercase" }}>Families / 2025–26</div>
        </div>
      </div>
    </div>
  );
}
