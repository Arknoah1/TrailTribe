const base = import.meta.env.BASE_URL;

export default function Slide1Title() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", backgroundColor: "#000" }}>
      <img
        src={`${base}trail-hero.jpg`}
        alt="Mountain bike trail"
        crossOrigin="anonymous"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* Dark gradient from left so left side stays visible */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "55vw", height: "100%", background: "linear-gradient(to right, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%)" }} />

      {/* Right overlay panel */}
      <div style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: "50vw",
        height: "58vh",
        background: "rgba(15,12,10,0.88)",
        display: "flex",
        flexDirection: "column",
        padding: "5vh 5vw",
        boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "7vh" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.85vw", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            TrailTeam
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "1px", height: "2vh", background: "#C49A6C", marginBottom: "0.5vh" }} />
            <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.9vw", fontWeight: "bold" }}>N</div>
          </div>
        </div>

        <div style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.2em", marginBottom: "1.5vh", textTransform: "uppercase" }}>
          The App / Mountain Bike Teams
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0E8DD", fontSize: "5vw", margin: "0 0 2.5vh 0", lineHeight: 1.05, fontWeight: 500, textWrap: "balance" }}>
          TrailTeam
        </h1>

        <p style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#A8A096", fontSize: "1.3vw", lineHeight: 1.5, margin: 0, maxWidth: "30vw", textWrap: "pretty" }}>
          The app your mountain bike team actually uses.
        </p>

        <div style={{ marginTop: "auto", fontFamily: "'DM Mono', monospace", color: "#7A736A", fontSize: "0.8vw", letterSpacing: "0.1em" }}>
          trailtribemtb.com
        </div>
      </div>

      {/* Bottom-left accent line */}
      <div style={{ position: "absolute", bottom: "6vh", left: "5vw", display: "flex", alignItems: "center", gap: "1.5vw" }}>
        <div style={{ width: "4vw", height: "1px", background: "#C49A6C" }} />
        <span style={{ fontFamily: "'DM Mono', monospace", color: "#C49A6C", fontSize: "0.8vw", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Season 2025–26
        </span>
      </div>
    </div>
  );
}
