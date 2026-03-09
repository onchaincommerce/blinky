"use client";

import { useEffect, useId, useRef } from "react";

type EyeLogoProps = {
  className?: string;
};

const MAX_LOOK_X = 26;
const MAX_LOOK_Y = 12;
const OUTER_EYE_PATH =
  "M56 160C104 88 194 52 320 52C446 52 536 88 584 160C536 232 446 268 320 268C194 268 104 232 56 160Z";
const INNER_EYE_PATH =
  "M74 160C118 102 202 72 320 72C438 72 522 102 566 160C522 218 438 248 320 248C202 248 118 218 74 160Z";

export function EyeLogo({ className }: EyeLogoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId().replace(/:/g, "");
  const eyeFillId = `${baseId}-eye-fill`;
  const irisId = `${baseId}-iris`;
  const pupilId = `${baseId}-pupil`;
  const eyeClipId = `${baseId}-eye-clip`;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;

    const setPosition = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (!Number.isFinite(distance) || distance === 0) {
        root.style.setProperty("--eye-look-x", "0px");
        root.style.setProperty("--eye-look-y", "0px");
        return;
      }

      const strength = Math.min(1, distance / 320);
      const normalX = deltaX / distance;
      const normalY = deltaY / distance;
      const lookX = normalX * MAX_LOOK_X * strength;
      const lookY = normalY * MAX_LOOK_Y * strength;

      root.style.setProperty("--eye-look-x", `${lookX.toFixed(1)}px`);
      root.style.setProperty("--eye-look-y", `${lookY.toFixed(1)}px`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setPosition(event.clientX, event.clientY);
      });
    };

    const reset = () => {
      cancelAnimationFrame(frame);
      root.style.setProperty("--eye-look-x", "0px");
      root.style.setProperty("--eye-look-y", "0px");
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    reset();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);

  return (
    <div
      aria-label="Blinky eye logo"
      className={["eye-logo", className].filter(Boolean).join(" ")}
      ref={rootRef}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="eye-logo-svg"
        fill="none"
        viewBox="0 0 640 320"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient
            id={eyeFillId}
            cx="0"
            cy="0"
            gradientTransform="translate(320 160) rotate(90) scale(120 276)"
            gradientUnits="userSpaceOnUse"
            r="1"
          >
            <stop stopColor="#FFF8FA" />
            <stop offset="0.52" stopColor="#F6E9EC" />
            <stop offset="0.8" stopColor="#E7C9D0" />
            <stop offset="1" stopColor="#CE9EA9" />
          </radialGradient>
          <radialGradient id={irisId} cx="0" cy="0" r="1" gradientTransform="translate(302 138) rotate(51.5) scale(156)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E7F8FF" />
            <stop offset="0.2" stopColor="#9FD8FF" />
            <stop offset="0.5" stopColor="#4C90D9" />
            <stop offset="0.8" stopColor="#20345B" />
            <stop offset="1" stopColor="#090B14" />
          </radialGradient>
          <radialGradient id={pupilId} cx="0" cy="0" r="1" gradientTransform="translate(310 150) rotate(55.3048) scale(78)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1A2437" />
            <stop offset="0.6" stopColor="#04070D" />
            <stop offset="1" stopColor="#000000" />
          </radialGradient>
          <clipPath id={eyeClipId}>
            <path d={INNER_EYE_PATH} />
          </clipPath>
        </defs>

        <path d={OUTER_EYE_PATH} fill="#05080F" />
        <path d={OUTER_EYE_PATH} fill="#0B1017" fillOpacity="0.28" />

        <g className="eye-logo-open">
          <g clipPath={`url(#${eyeClipId})`}>
            <path d={INNER_EYE_PATH} fill={`url(#${eyeFillId})`} />
            <path d="M88 116C138 124 194 141 242 166" stroke="#A51325" strokeLinecap="round" strokeOpacity="0.55" strokeWidth="4" />
            <path d="M102 140C158 148 212 170 262 196" stroke="#B6172C" strokeLinecap="round" strokeOpacity="0.48" strokeWidth="3" />
            <path d="M100 184C148 182 205 178 256 168" stroke="#8E1023" strokeLinecap="round" strokeOpacity="0.44" strokeWidth="3" />
            <path d="M542 116C494 124 444 142 394 168" stroke="#A51325" strokeLinecap="round" strokeOpacity="0.55" strokeWidth="4" />
            <path d="M532 146C478 152 430 174 378 198" stroke="#B6172C" strokeLinecap="round" strokeOpacity="0.48" strokeWidth="3" />
            <path d="M530 182C482 182 430 178 382 168" stroke="#8E1023" strokeLinecap="round" strokeOpacity="0.44" strokeWidth="3" />
            <path d="M124 102C170 128 198 152 228 196" stroke="#C12435" strokeLinecap="round" strokeOpacity="0.34" strokeWidth="2.5" />
            <path d="M516 102C470 128 442 152 412 196" stroke="#C12435" strokeLinecap="round" strokeOpacity="0.34" strokeWidth="2.5" />

            <g className="eye-logo-gaze">
              <circle cx="320" cy="160" fill={`url(#${irisId})`} r="84" />
              <circle cx="320" cy="160" fill="#111B2E" fillOpacity="0.36" r="52" />
              <circle cx="320" cy="160" fill={`url(#${pupilId})`} r="36" />
              <circle cx="286" cy="126" fill="white" fillOpacity="0.94" r="14" />
              <circle cx="302" cy="146" fill="white" fillOpacity="0.48" r="6" />
              <circle cx="354" cy="192" fill="#8BE7FF" fillOpacity="0.16" r="18" />
            </g>
          </g>
        </g>

        <path
          className="eye-logo-lid-top"
          d="M92 150C140 101 220 76 320 76C420 76 500 101 548 150"
          stroke="#2F3644"
          strokeOpacity="0.96"
          strokeLinecap="round"
          strokeWidth="18"
        />
        <path
          className="eye-logo-lid-bottom"
          d="M92 170C140 219 220 244 320 244C420 244 500 219 548 170"
          stroke="#151A24"
          strokeOpacity="0.92"
          strokeLinecap="round"
          strokeWidth="14"
        />
      </svg>
    </div>
  );
}
