const base = import.meta.env.BASE_URL;

export default function Slide2Coaches() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", backgroundColor: "#0F0C0A", display: "flex" }}>
      {/* Left image strip */}
      <div style={{ width: "35vw", height: "100vh", position: "relative", flexShrink: 0 }}>
        <img
          src={`${base}trail-hero.jpg`}
          alt="Trail"
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "linear-gradient(to right, rgba(15,12,10,0) 0%, rgba(15,12,10,1) 100%)" }} />
      </div>

      {/* Right content */}
      <div style={{
        width: "65vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "7vh 7vw",
        boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "5vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            TrailTribe &gt; For Coaches
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw" }}>
            02
          </div>
        </div>

        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "3.2vw", margin: "0 0 5vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" }}>
          Everything coaches need, in one place
        </h2>

        {/* 2×2 feature grid */}
        <div style={{ display: "flex", gap: "4vw" }}>
          <div style={{ flex: 1 }}>
            <div style={{ width: "2.5vw", height: "1px", background: "#C49A6C", marginBottom: "2vh" }} />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
              Event Scheduling
            </h3>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
              Schedule practices and races as single events or full series — everything in one calendar.
            </p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ width: "2.5vw", height: "1px", background: "#C49A6C", marginBottom: "2vh" }} />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
              RSVP Tracking
            </h3>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
              Track RSVPs with coach vs. rider attendance counts so you always know who's showing up.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", marginTop: "5vh" }}>
          <div style={{ flex: 1 }}>
            <div style={{ width: "2.5vw", height: "1px", background: "#C49A6C", marginBottom: "2vh" }} />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
              Team Broadcasts
            </h3>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
              Send messages to the whole team or individual pods with full delivery tracking.
            </p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ width: "2.5vw", height: "1px", background: "#C49A6C", marginBottom: "2vh" }} />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "1.4vw", margin: "0 0 1.2vh 0", fontWeight: 500 }}>
              Roster Management
            </h3>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.1vw", lineHeight: 1.6, margin: 0, textWrap: "pretty" }}>
              Approve new families, assign pods, and manage the roster across the full season.
            </p>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw", letterSpacing: "0.1em" }}>
            trailtribe.app
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Coaches / 2025–26
          </div>
        </div>
      </div>
    </div>
  );
}
