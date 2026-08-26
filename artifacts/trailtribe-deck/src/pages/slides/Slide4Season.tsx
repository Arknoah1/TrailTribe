export default function Slide4Season() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", backgroundColor: "#0F0C0A", padding: "7vh 8vw", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      {/* Radial glow — top right */}
      <div style={{ position: "absolute", top: "-5vh", right: "-5vw", width: "45vw", height: "45vw", background: "radial-gradient(circle, rgba(196,154,108,0.06) 0%, rgba(15,12,10,0) 70%)", pointerEvents: "none" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "5vh" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          TrailTeam &gt; Season Flow
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw" }}>
          04
        </div>
      </div>

      <div style={{ display: "flex", gap: "6vw", flex: 1 }}>
        {/* Left — title block */}
        <div style={{ width: "30vw", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3.2vw", margin: "0 0 3vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" }}>
            How your season runs
          </h2>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.15vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
            From the first invite link to the final race, TrailTeam keeps every part of the season organized and on track.
          </p>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ width: "1px", height: "3vh", background: "#C49A6C", marginBottom: "1vh" }} />
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Season / 2025–26
            </div>
          </div>
        </div>

        {/* Right — 4 numbered steps */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3.5vh" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "2vw", fontWeight: "bold", flexShrink: 0, lineHeight: 1 }}>01</div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 0.8vh 0", fontWeight: 500 }}>Coaches send an invite link</h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.05vw", lineHeight: 1.5, margin: 0 }}>Families sign up in minutes — no app store required to get started.</p>
            </div>
          </div>
          <div style={{ width: "100%", height: "1px", background: "rgba(196,154,108,0.2)" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "2vw", fontWeight: "bold", flexShrink: 0, lineHeight: 1 }}>02</div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 0.8vh 0", fontWeight: 500 }}>Riders are assigned to pods</h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.05vw", lineHeight: 1.5, margin: 0 }}>Beginners, intermediate, and advanced groups keep practices focused.</p>
            </div>
          </div>
          <div style={{ width: "100%", height: "1px", background: "rgba(196,154,108,0.2)" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "2vw", fontWeight: "bold", flexShrink: 0, lineHeight: 1 }}>03</div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 0.8vh 0", fontWeight: 500 }}>Events notify the team automatically</h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.05vw", lineHeight: 1.5, margin: 0 }}>Reminders go out as each date approaches — no manual nudges needed.</p>
            </div>
          </div>
          <div style={{ width: "100%", height: "1px", background: "rgba(196,154,108,0.2)" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "2vw", fontWeight: "bold", flexShrink: 0, lineHeight: 1 }}>04</div>
            <div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 0.8vh 0", fontWeight: 500 }}>Re-enrollment keeps rosters clean</h3>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.05vw", lineHeight: 1.5, margin: 0 }}>End-of-season re-enrollment flows keep the roster accurate year to year.</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "3vh", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw", letterSpacing: "0.1em" }}>
          trailteam.app
        </div>
      </div>
    </div>
  );
}
