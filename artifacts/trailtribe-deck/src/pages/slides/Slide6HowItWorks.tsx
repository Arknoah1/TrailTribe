export default function Slide6HowItWorks() {
  const items = [
    { n: "01", label: "Dashboard", sub: "Upcoming events & RSVP at a glance" },
    { n: "02", label: "Calendar & RSVPs", sub: "Browse the full schedule, confirm attendance" },
    { n: "03", label: "Carpools", sub: "Find a ride or offer seats to teammates" },
    { n: "04", label: "Inviting Families", sub: "Send email invites or share a signup link" },
    { n: "05", label: "Roster & Broadcasts", sub: "Manage the team and send messages" },
  ];

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#0F0C0A", display: "flex", position: "relative"
    }}>
      {/* Subtle amber grid texture */}
      <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.04 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#C49A6C" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Left column — label */}
      <div style={{
        width: "38vw", height: "100vh", display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "10vh 4vw 10vh 7vw", boxSizing: "border-box", position: "relative"
      }}>
        {/* Overline */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.2vw", marginBottom: "4vh" }}>
          <div style={{ width: "3vw", height: "1px", background: "#C49A6C" }} />
          <span style={{
            fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.75vw",
            letterSpacing: "0.2em", textTransform: "uppercase"
          }}>TrailTeam</span>
        </div>

        {/* Section label rotated */}
        <div style={{ overflow: "hidden" }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD",
            fontSize: "5.5vw", lineHeight: 1.0, fontWeight: 500, margin: 0,
            textWrap: "balance" as any
          }}>
            How It<br />
            <span style={{ color: "#C49A6C" }}>Works</span>
          </h2>
        </div>

        <p style={{
          fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096",
          fontSize: "1.1vw", lineHeight: 1.6, margin: "3vh 0 0 0", maxWidth: "24vw",
          textWrap: "pretty" as any
        }}>
          A quick look at the five features your team will use every week.
        </p>
      </div>

      {/* Vertical divider */}
      <div style={{
        width: "1px", background: "linear-gradient(to bottom, transparent 8%, #2E2A26 30%, #2E2A26 70%, transparent 92%)",
        flexShrink: 0, alignSelf: "stretch"
      }} />

      {/* Right column — numbered list */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "10vh 7vw 10vh 5vw", boxSizing: "border-box", gap: "2.8vh"
      }}>
        {items.map(({ n, label, sub }) => (
          <div key={n} style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <span style={{
              fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.9vw",
              letterSpacing: "0.1em", flexShrink: 0, marginTop: "0.2vh"
            }}>{n}</span>
            <div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD",
                fontSize: "1.35vw", fontWeight: 600, lineHeight: 1.2
              }}>{label}</div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif", color: "#7A736A",
                fontSize: "0.95vw", lineHeight: 1.4, marginTop: "0.4vh"
              }}>{sub}</div>
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{
          position: "absolute", bottom: "5vh", right: "7vw",
          display: "flex", justifyContent: "space-between", alignItems: "center", width: "calc(62vw - 14vw)"
        }}>
          <span style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw", letterSpacing: "0.1em" }}>
            trailteam.app
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.75vw" }}>05</span>
        </div>
      </div>
    </div>
  );
}
