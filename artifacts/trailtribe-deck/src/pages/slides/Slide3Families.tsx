export default function Slide3Families() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", backgroundColor: "#0F0C0A", padding: "7vh 8vw", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      {/* Radial glow — top left */}
      <div style={{ position: "absolute", top: "-5vh", left: "-5vw", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(196,154,108,0.07) 0%, rgba(15,12,10,0) 70%)", pointerEvents: "none" }} />
      {/* Teal accent glow — bottom right */}
      <div style={{ position: "absolute", bottom: "-5vh", right: "-5vw", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgba(0,194,168,0.05) 0%, rgba(15,12,10,0) 70%)", pointerEvents: "none" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "5vh" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          TrailTeam &gt; For Families
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw" }}>
          03
        </div>
      </div>

      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3.2vw", margin: "0 0 6vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" }}>
        Built for busy families
      </h2>

      {/* 2×2 feature grid */}
      <div style={{ display: "flex", gap: "5vw" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw", marginBottom: "5vh" }}>
            <div style={{ flexShrink: 0, marginTop: "0.5vh" }}>
              <div style={{ width: "2.5vw", height: "1px", background: "#00C2A8" }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
                Household RSVPs
              </h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
                RSVP for every rider in your household at once — one tap, whole family confirmed.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div style={{ flexShrink: 0, marginTop: "0.5vh" }}>
              <div style={{ width: "2.5vw", height: "1px", background: "#00C2A8" }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
                Carpool Coordination
              </h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
                Coordinate carpools to every event directly in the app — offer seats or request a ride.
              </p>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw", marginBottom: "5vh" }}>
            <div style={{ flexShrink: 0, marginTop: "0.5vh" }}>
              <div style={{ width: "2.5vw", height: "1px", background: "#00C2A8" }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
                Calendar Sync
              </h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
                Sync the team calendar to Apple or Google Calendar and never miss a practice or race.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div style={{ flexShrink: 0, marginTop: "0.5vh" }}>
              <div style={{ width: "2.5vw", height: "1px", background: "#00C2A8" }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
                Event Reminders
              </h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
                Automatic reminders before practices and races — so no one shows up late to the trailhead.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw", letterSpacing: "0.1em" }}>
          trailtribemtb.com
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Families / 2025–26
        </div>
      </div>
    </div>
  );
}
