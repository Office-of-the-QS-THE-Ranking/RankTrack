"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TabPanel } from "@/components/ui/interactive";
import type { DashboardView } from "./DashboardViewSwitch";

export function DashboardViewPanel({ view, views, children }: { view: DashboardView; views: DashboardView[]; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const index = views.indexOf(view);
  const direction = index > 0 ? 1 : -1;

  return (
    <div style={{ minWidth: 0 }}>
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        <motion.div
          key={view}
          custom={direction}
          variants={{
            enter: (sign: number) => ({ opacity: 0, x: reduceMotion ? 0 : sign * 16 }),
            visible: { opacity: 1, x: 0 },
            exit: (sign: number) => ({ opacity: 0, x: reduceMotion ? 0 : -sign * 16 }),
          }}
          initial="enter"
          animate="visible"
          exit="exit"
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        >
          <TabPanel idBase="dashboard-view" index={index}>
            {children}
          </TabPanel>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
