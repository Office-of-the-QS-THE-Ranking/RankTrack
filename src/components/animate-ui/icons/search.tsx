"use client";

import { motion, useAnimation, useReducedMotion } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes, type MouseEvent } from "react";

export interface SearchIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SearchIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const SearchIcon = forwardRef<SearchIconHandle, SearchIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const reduceMotion = useReducedMotion();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => {
          if (reduceMotion === false) void controls.start("animate");
        },
        stopAnimation: () => {
          controls.stop();
          controls.set("normal");
        },
      };
    }, [controls, reduceMotion]);

    const handleMouseEnter = useCallback((event: MouseEvent<HTMLDivElement>) => {
      onMouseEnter?.(event);
      if (!isControlledRef.current && reduceMotion === false) void controls.start("animate");
    }, [controls, onMouseEnter, reduceMotion]);

    const handleMouseLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
      onMouseLeave?.(event);
      if (!isControlledRef.current) void controls.start("normal");
    }, [controls, onMouseLeave]);

    return (
      <div className={className} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <motion.svg
          aria-hidden="true"
          focusable="false"
          initial="normal"
          animate={controls}
          fill="none"
          height={size}
          width={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          transition={{ duration: 1, bounce: 0.3 }}
          variants={{
            normal: { x: 0, y: 0 },
            animate: { x: [0, 0, -3, 0], y: [0, -4, 0, 0] },
          }}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block" }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </motion.svg>
      </div>
    );
  },
);

SearchIcon.displayName = "SearchIcon";

export { SearchIcon };
