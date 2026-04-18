import type { SVGProps } from "react";

/**
 * CopilotMark — brand glyph inspired by GitHub Copilot's visual language
 * (two mirrored stylized curves forming a wing/propeller) but drawn
 * uniquely for Copilot Buddy. Uses a gradient fill so it sits well on
 * any dark background.
 */
export function CopilotMark({
  className,
  size = 20,
  gradientId = "cb-mark-grad",
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number; gradientId?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="55%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      {/* Rounded-square base */}
      <rect x="1" y="1" width="30" height="30" rx="8" fill={`url(#${gradientId})`} />
      {/* Inner glyph: two mirrored crescents that form a stylized "co-pilot"
          wing. Drawn with white at 92% opacity so the gradient reads
          through subtly at the edges. */}
      <path
        d="M16 6.75
           c-4.2 0-6.9 2.4-7.55 6
           c-.2 1.05.75 1.9 1.8 1.55
           c1.6-.5 3.1-.3 4.35.45
           c1.3.78 2.15 2.05 2.4 3.55
           c.15.85 1.25 1.05 1.7.3
           c.95-1.55 2.4-2.4 4.1-2.4
           c.95 0 1.55-.95 1.2-1.85
           C22.65 9.2 19.7 6.75 16 6.75Z"
        fill="#ffffff"
        fillOpacity="0.95"
      />
      <path
        d="M22.45 16.7
           c-1.55 0-2.8 1.15-3.2 2.6
           c-.4 1.5-1.6 2.55-3.2 2.55
           c-1.5 0-2.75-.95-3.2-2.35
           c-.3-.95-1.55-1.05-2-.15
           c-.9 1.85-.35 4.05 1.3 5.35
           c2.7 2.15 6.75 1.95 9.3-.45
           c1.9-1.8 2.75-4.35 2.45-6.65
           c-.1-.75-.75-1.3-1.45-0.9Z"
        fill="#ffffff"
        fillOpacity="0.85"
      />
      {/* Tiny spark eye */}
      <circle cx="21.6" cy="11.3" r="1.2" fill="#0b0d12" />
    </svg>
  );
}
