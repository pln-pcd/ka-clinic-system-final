import React from "react";

interface CursorProps {
  x: number;
  y: number;
  clicking?: boolean;
  opacity?: number;
}

/**
 * Cursor.tsx
 * A simple OS-style arrow pointer used to simulate user interaction throughout
 * the login flow scene.  Scales slightly on click to simulate a press state.
 */
export const Cursor: React.FC<CursorProps> = ({
  x,
  y,
  clicking = false,
  opacity = 1,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: clicking ? "scale(0.86)" : "scale(1)",
        transformOrigin: "top left",
        pointerEvents: "none",
        zIndex: 9999,
        opacity,
        // Remotion does not support CSS transitions during scrubbing,
        // so we compute everything per-frame via interpolate() at call-site.
      }}
    >
      <svg
        width={28}
        height={32}
        viewBox="0 0 28 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Drop shadow */}
        <path
          d="M4 3L4 24L9 18L13 27L16.5 25L12.5 16L20 16L4 3Z"
          fill="rgba(0,0,0,0.22)"
          transform="translate(1.5,1.5)"
        />
        {/* Arrow body */}
        <path
          d="M4 3L4 24L9 18L13 27L16.5 25L12.5 16L20 16L4 3Z"
          fill="white"
          stroke="#1a1a1a"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
