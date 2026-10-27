'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from './icon';

type LibraryProps = IconProps<keyof typeof animations>;

/* Lucide's library: three volumes and a leaning one. On play, the volumes rise in turn and the last one
   tips further, as if just taken from the shelf. */
const animations = {
  default: {
    book1: {
      initial: { y: 0 },
      animate: { y: [0, -1.5, 0], transition: { duration: 0.45, delay: 0, ease: 'easeInOut' } },
    },
    book2: {
      initial: { y: 0 },
      animate: { y: [0, -1.5, 0], transition: { duration: 0.45, delay: 0.1, ease: 'easeInOut' } },
    },
    book3: {
      initial: { y: 0 },
      animate: { y: [0, -1.5, 0], transition: { duration: 0.45, delay: 0.2, ease: 'easeInOut' } },
    },
    leaning: {
      initial: { rotate: 0, transformOrigin: '20px 20px' },
      animate: {
        rotate: [0, 8, 0],
        transformOrigin: '20px 20px',
        transition: { duration: 0.55, delay: 0.25, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: LibraryProps) {
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
      <motion.path d="M4 4v16" variants={variants.book1} initial="initial" animate={controls} />
      <motion.path d="M8 8v12" variants={variants.book2} initial="initial" animate={controls} />
      <motion.path d="M12 6v14" variants={variants.book3} initial="initial" animate={controls} />
      <motion.path d="m16 6 4 14" variants={variants.leaning} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function Library(props: LibraryProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Library,
  Library as LibraryIcon,
  type LibraryProps,
  type LibraryProps as LibraryIconProps,
};
