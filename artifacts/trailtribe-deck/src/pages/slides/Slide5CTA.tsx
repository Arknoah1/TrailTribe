const base = import.meta.env.BASE_URL;

export default function Slide5CTA() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src={`${base}trail-golden.jpg`}
        alt="Mountain trail at golden hour"
        crossOrigin="anonymous"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.55) saturate(0.9)" }}
      />

      {/* Centered overlay box */}
      <div style={{
        position: "relative",
        width: "58vw",
        background: "rgba(15,12,10,0.87)",
        display: "flex",
        flexDirection: "column",
        padding: "8vh 6vw",
        boxSizing: "border-box",
        borderTop: "2px solid #C49A6C",
        alignItems: "center",
        textAlign: "center"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "4vh" }}>
          <div style={{ width: "1px", height: "4vh", background: "#C49A6C", marginBottom: "1vh" }} />
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "1vw", fontWeight: "bold" }}>N</div>
        </div>

        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "4.5vw", margin: "0 0 3vh 0", lineHeight: 1.1, fontWeight: 500, textWrap: "balance" }}>
          Ready to ride?
        </h2>

        <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.3vw", lineHeight: 1.6, margin: "0 0 5vh 0", maxWidth: "34vw", textWrap: "pretty" }}>
          Get your team on TrailTribe before the season starts.
        </p>

        <div style={{
          padding: "1.5vh 3vw",
          border: "1px solid #C49A6C",
          color: "#C49A6C",
          fontFamily: "'DM Mono', monospace",
          fontSize: "1vw",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          marginBottom: "4vh"
        }}>
          trailtribe.app
        </div>

        <div style={{ fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.9vw", letterSpacing: "0.15em" }}>
          Season 2025–26
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "5vh", left: "5vw", fontFamily: "'DM Mono', monospace", color: "#A8A096", fontSize: "0.8vw", letterSpacing: "0.1em" }}>
        trailtribe.app
      </div>
      <div style={{ position: "absolute", bottom: "5vh", right: "5vw", fontFamily: "'DM Mono', monospace", color: "#A8A096", fontSize: "0.8vw" }}>
        05
      </div>
    </div>
  );
}
