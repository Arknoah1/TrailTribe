import { type ReactNode } from "react";

const INK = "#0a0c10";

interface IllustrationProps {
  className?: string;
}


export function BikeWheelArc({ className = "" }: IllustrationProps) {
  const cx = 40, cy = 40, r = 32;
  const spokes = 8;
  return (
    <svg viewBox="0 0 80 80" className={`inline-block ${className}`} aria-hidden="true">
      {/* Tire */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth="6" />
      <circle cx={cx} cy={cy} r={r - 5} fill="none" stroke="hsl(222 22% 18%)" strokeWidth="2" />
      {/* Spokes */}
      {Array.from({ length: spokes }).map((_, i) => {
        const angle = (i * Math.PI * 2) / spokes;
        const x2 = cx + (r - 7) * Math.cos(angle);
        const y2 = cy + (r - 7) * Math.sin(angle);
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke={INK} strokeWidth="1.5" />;
      })}
      {/* Hub */}
      <circle cx={cx} cy={cy} r={5} fill="hsl(174 100% 38%)" stroke={INK} strokeWidth="2" />
      <circle cx={cx} cy={cy} r={2} fill={INK} />
    </svg>
  );
}

export function TrailDot({ className = "", color = "hsl(174 100% 38%)" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 28" className={`inline-block ${className}`} aria-hidden="true">
      {/* Pin body */}
      <path
        d="M12 2 C7.03 2 3 6.03 3 11 C3 17.25 12 26 12 26 C12 26 21 17.25 21 11 C21 6.03 16.97 2 12 2 Z"
        fill={color}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Inner circle */}
      <circle cx="12" cy="11" r="4" fill={INK} />
      <circle cx="12" cy="11" r="2" fill={color} />
    </svg>
  );
}

export function PodBadgeShape({ className = "", color = "hsl(174 100% 38%)", children }: { className?: string; color?: string; children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 80 70" className={`inline-block ${className}`} aria-hidden="true">
      {/* Hexagon */}
      <polygon
        points="40,4 74,22 74,58 40,76 6,58 6,22"
        fill={color}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyTrailState({ className = "", message = "Nothing here yet", children }: { className?: string; message?: string; children?: ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <svg viewBox="0 0 200 160" className="w-48 h-auto mb-4" aria-hidden="true">
        {/* Sky */}
        <rect x="0" y="0" width="200" height="160" fill="transparent" />
        {/* Mountains */}
        <path
          d="M0 110 L30 60 L55 80 L80 40 L110 70 L135 45 L160 75 L180 55 L200 80 L200 160 L0 160 Z"
          fill="hsl(222 22% 18%)"
          stroke={INK}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M0 135 L25 110 L50 120 L80 100 L110 118 L140 105 L170 120 L200 110 L200 160 L0 160 Z"
          fill="hsl(226 24% 14%)"
          stroke={INK}
          strokeWidth="2"
        />
        {/* Pine trees */}
        {[20, 55, 150, 175].map((tx, i) => (
          <g key={i} transform={`translate(${tx}, 75)`}>
            <polygon points="0,0 -7,20 7,20" fill="hsl(174 100% 22%)" stroke={INK} strokeWidth="1.5" />
            <polygon points="0,-8 -9,15 9,15" fill="hsl(174 100% 28%)" stroke={INK} strokeWidth="1.5" />
            <rect x="-2" y="20" width="4" height="5" fill={INK} />
          </g>
        ))}
        {/* Trail path */}
        <path
          d="M30 155 Q70 130 100 140 Q130 148 170 135"
          fill="none"
          stroke="hsl(174 100% 38%)"
          strokeWidth="3"
          strokeDasharray="6 4"
          strokeLinecap="round"
        />
        {/* Rider on descent */}
        <g transform="translate(100, 108)">
          {/* Bike frame */}
          <line x1="-8" y1="4" x2="8" y2="4" stroke={INK} strokeWidth="2.5" />
          <line x1="0" y1="4" x2="-4" y2="-4" stroke={INK} strokeWidth="2.5" />
          <line x1="0" y1="4" x2="4" y2="-4" stroke={INK} strokeWidth="2" />
          {/* Wheels */}
          <circle cx="-8" cy="8" r="5" fill="none" stroke={INK} strokeWidth="2.5" />
          <circle cx="8" cy="8" r="5" fill="none" stroke={INK} strokeWidth="2.5" />
          {/* Rider body */}
          <circle cx="0" cy="-8" r="4" fill="hsl(37 91% 55%)" stroke={INK} strokeWidth="2" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke={INK} strokeWidth="2.5" />
          <line x1="0" y1="-1" x2="-5" y2="2" stroke={INK} strokeWidth="2" />
          <line x1="0" y1="-1" x2="5" y2="2" stroke={INK} strokeWidth="2" />
        </g>
        {/* TrailDot marker */}
        <g transform="translate(85, 60)">
          <path
            d="M6 0 C2.7 0 0 2.7 0 6 C0 9.75 6 16 6 16 C6 16 12 9.75 12 6 C12 2.7 9.3 0 6 0 Z"
            fill="hsl(174 100% 38%)"
            stroke={INK}
            strokeWidth="1.5"
          />
          <circle cx="6" cy="6" r="2.5" fill={INK} />
        </g>
      </svg>
      <p className="text-muted-foreground font-sans text-sm font-medium">{message}</p>
      {children}
    </div>
  );
}
