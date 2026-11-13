'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from './icon';

/* Agentic Control's mark, drawn for the Hub (not part of animate-ui's set): an open rounded frame
   around "AI", with three four-point sparkles in the frame's open corner. Its motion: the frame and
   letters redraw while the sparkles twinkle one after another. */

type AgenticSparkProps = IconProps<keyof typeof animations>;

/** A four-point sparkle centred on (x, y), with slightly plump concave sides. */
const sparkle = (x: number, y: number, r: number) => {
  const k = r * 0.1;
  const p = (n: number) => +n.toFixed(2);
  return (
    `M${p(x)} ${p(y - r)}` +
    `Q${p(x + k)} ${p(y - k)} ${p(x + r)} ${p(y)}` +
    `Q${p(x + k)} ${p(y + k)} ${p(x)} ${p(y + r)}` +
    `Q${p(x - k)} ${p(y + k)} ${p(x - r)} ${p(y)}` +
    `Q${p(x - k)} ${p(y - k)} ${p(x)} ${p(y - r)}Z`
  );
};

export const AGENTIC_PATHS = {
  frame: 'M10.5 5.5H6A3.5 3.5 0 0 0 2.5 9v8A3.5 3.5 0 0 0 6 20.5h8a3.5 3.5 0 0 0 3.5-3.5v-4',
  a: 'M6.1 16.2 8.5 9.8l2.4 6.4',
  bar: 'M7.3 14.7h2.4',
  i: 'M13.7 9.8v6.4',
  big: sparkle(15.3, 4.6, 3.3),
  small: sparkle(21.3, 3.4, 1.5),
  mid: sparkle(20.2, 9.6, 2.2),
};

const draw = (delay: number, duration = 0.55) => ({
  initial: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0.2, 1],
    transition: { duration, delay, ease: [0.65, 0, 0.35, 1] as const },
  },
});

const twinkle = (delay: number) => ({
  initial: { scale: 1, rotate: 0, opacity: 1 },
  animate: {
    scale: [1, 0.2, 1.3, 1],
    rotate: [0, 45, 90, 90],
    opacity: [1, 0.3, 1, 1],
    transition: { duration: 0.7, delay, ease: 'easeInOut' as const, times: [0, 0.35, 0.7, 1] },
  },
});

const animations = {
  default: {
    frame: draw(0, 0.7),
    a: draw(0.25, 0.4),
    bar: draw(0.5, 0.2),
    i: {
      initial: { scaleY: 1, opacity: 1 },
      animate: {
        scaleY: [0, 1.15, 1],
        opacity: [0, 1, 1],
        transition: { duration: 0.4, delay: 0.55, ease: 'easeOut' },
      },
    },
    big: twinkle(0.1),
    small: twinkle(0.3),
    mid: twinkle(0.5),
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: AgenticSparkProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);
  const line = (key: 'frame' | 'a' | 'bar' | 'i') => (
    <motion.path d={AGENTIC_PATHS[key]} variants={variants[key]} initial="initial" animate={controls} style={key === 'i' ? { transformBox: 'fill-box', transformOrigin: 'center bottom' } : undefined} />
  );
  const star = (key: 'big' | 'small' | 'mid') => (
    <motion.path
      d={AGENTIC_PATHS[key]}
      fill="currentColor"
      strokeWidth={0.6}
      variants={variants[key]}
      initial="initial"
      animate={controls}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    />
  );

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {line('frame')}
      {line('a')}
      {line('bar')}
      {line('i')}
      {star('big')}
      {star('small')}
      {star('mid')}
    </motion.svg>
  );
}

function AgenticSpark(props: AgenticSparkProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  AgenticSpark,
  AgenticSpark as AgenticSparkIcon,
  type AgenticSparkProps,
  type AgenticSparkProps as AgenticSparkIconProps,
};
