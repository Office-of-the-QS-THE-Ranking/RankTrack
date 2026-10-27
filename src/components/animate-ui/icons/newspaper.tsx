'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from './icon';

type NewspaperProps = IconProps<keyof typeof animations>;

/* Lucide's newspaper. On play, the picture block settles and the two lines of copy are set. */
const animations = {
  default: {
    sheet: {},
    picture: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0.6, 1],
        opacity: [0, 1],
        transition: { duration: 0.35, ease: 'easeOut' },
      },
    },
    line1: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.35, delay: 0.2, ease: 'easeOut' },
      },
    },
    line2: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, delay: 0.4, ease: 'easeOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: NewspaperProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

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
      <motion.path
        d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"
        variants={variants.sheet}
        initial="initial"
        animate={controls}
      />
      <motion.rect width="8" height="4" x="10" y="6" rx="1" variants={variants.picture} initial="initial" animate={controls} />
      <motion.path d="M18 14h-8" variants={variants.line1} initial="initial" animate={controls} />
      <motion.path d="M15 18h-5" variants={variants.line2} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function Newspaper(props: NewspaperProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Newspaper,
  Newspaper as NewspaperIcon,
  type NewspaperProps,
  type NewspaperProps as NewspaperIconProps,
};
