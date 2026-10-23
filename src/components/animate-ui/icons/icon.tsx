'use client';

/* A lean stand-in for animate-ui's icon base (animate-ui.com/docs/icons). The icon files in this
   folder are vendored unchanged from its Lucide set and only need these four exports, so the
   shadcn helpers the upstream base pulls in (cn, useIsInView, Slot) are left out.

   `animate` plays the icon's motion; with `loop`, it replays on a fixed period (`loopDelay`,
   measured start to start). The "default-loop" variant is preferred, since it returns to rest by
   itself; icons without one play "default" and ease back. Reduced motion keeps icons still. */

import * as React from 'react';
import {
  useAnimation,
  useReducedMotion,
  type LegacyAnimationControls,
  type SVGMotionProps,
  type Variants,
} from 'motion/react';

type AnimateIconContextValue = {
  controls: LegacyAnimationControls | undefined;
  animation: string;
};

const AnimateIconContext = React.createContext<AnimateIconContextValue>({
  controls: undefined,
  animation: 'default',
});

const useAnimateIconContext = () => React.useContext(AnimateIconContext);

function getVariants<
  V extends { default: T; [key: string]: T },
  T extends Record<string, Variants>,
>(animations: V): T {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { animation } = useAnimateIconContext();
  return (animations[animation as keyof V] as T) ?? animations.default;
}

type IconProps<T> = Omit<SVGMotionProps<SVGSVGElement>, 'animate'> & {
  size?: number;
  animate?: boolean;
  animation?: T | 'default-loop';
  loop?: boolean;
  loopDelay?: number;
};

type IconWrapperProps<T> = IconProps<T> & {
  icon: React.ComponentType<IconProps<T>>;
};

function IconWrapper<T extends string>({
  icon: IconComponent,
  size = 28,
  animate = false,
  animation = 'default-loop',
  loop = false,
  loopDelay = 0,
  ...props
}: IconWrapperProps<T>) {
  const controls = useAnimation();
  const reduce = useReducedMotion();
  const play = animate && !reduce;

  React.useEffect(() => {
    if (!play) {
      controls.start('initial');
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const started = performance.now();
      controls.set('initial');
      await controls.start('animate');
      if (!live) return;
      await controls.start('initial');
      if (!live || !loop) return;
      timer = setTimeout(run, Math.max(0, loopDelay - (performance.now() - started)));
    };
    void run();
    return () => {
      live = false;
      clearTimeout(timer);
      // Only stop here: the next run (or `start('initial')`) settles the pose, and controls must
      // not be set while the icon is unmounting.
      controls.stop();
    };
  }, [play, loop, loopDelay, controls]);

  return (
    <AnimateIconContext.Provider value={{ controls, animation }}>
      <IconComponent size={size} {...props} />
    </AnimateIconContext.Provider>
  );
}

export {
  IconWrapper,
  useAnimateIconContext,
  getVariants,
  type IconProps,
  type IconWrapperProps,
  type AnimateIconContextValue,
};
