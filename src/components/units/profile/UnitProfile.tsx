"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { UnitProfileData } from "@/lib/governance/hub-types";
import { achievementsOf, seasonOf, seasonsOf } from "@/lib/merit";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { Notice } from "@/components/ui/primitives";
import { Select } from "@/components/ui/pickers";
import { UnitMark } from "../UnitMark";
import { History } from "./History";
import { Overview } from "./Overview";
import { Recognitions } from "./Recognitions";
import { Settings } from "./Settings";
import { Submissions } from "./Submissions";
import { SectionLevel, TABS, properName, type ProfileTab } from "./shared";

/**
 * A unit's profile in the Office workspace: the season's standing and dashboard, its submissions, the
 * honours it has earned, its record across cycles and its account settings. The cycle picker scopes every
 * tab; History shows all cycles with the chosen one picked out.
 */
export function UnitProfile({ data, variant, titleId }: { data: UnitProfileData; variant: "modal" | "page"; titleId: string }) {
  const idBase = useId();
  const body = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ProfileTab>("Overview");
  const [cycle, setCycle] = useState(data.currentCycle || data.cycles[0]?.id || "");
  const seasons = useMemo(() => seasonsOf(data.cycles.map((c) => c.id), data.evidence), [data.cycles, data.evidence]);
  const season = seasons.find((s) => s.cycle === cycle) ?? seasonOf(cycle, data.evidence);
  const badges = useMemo(() => achievementsOf(seasons, data.recognition.length, data.currentCycle), [seasons, data.recognition.length, data.currentCycle]);
  const earned = badges.reduce((a, b) => a + b.tier, 0);
  const { unit, coordinators } = data;
  const Title = variant === "page" ? "h1" : "h2";

  // A new tab starts at its top.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <SectionLevel.Provider value={variant === "page" ? 2 : 3}>
      <div className={`up up--${variant}`}>
        <header className="up-head">
          <div className="up-head__id">
            <UnitMark emblem={unit.emblem} code={unit.code} className="up-crest" />
            <div className="up-head__text">
              <Title id={titleId} className="up-head__title">
                {unit.name}
              </Title>
              <p className="up-head__meta">
                <span>{unit.kind}</span>
                <span>{coordinators.length > 1 ? `${coordinators.length} coordinators` : coordinators.length ? `Coordinator ${properName(coordinators[0].name)}` : "No coordinators yet"}</span>
                <span className="up-head__honour">
                  <b>{season.honour.numeral}</b> {season.honour.name}
                </span>
              </p>
            </div>
          </div>
          {data.cycles.length > 0 && (
            <label className="up-cycle">
              <span className="sr-only">Reporting cycle</span>
              <Select className="select" value={cycle} onChange={setCycle}>
                {data.cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`Cycle ${c.id}`}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </header>
        <div className="up-tabs">
          <Tabs
            tabs={TABS}
            value={tab}
            onChange={setTab}
            label={`${unit.name} sections`}
            idBase={idBase}
            counts={{ Submissions: season.items.length, Recognitions: earned }}
          />
        </div>
        <div className="up-body" ref={body}>
          {unit.status === "Archived" && (
            <Notice tone="warn" icon="archive">
              {unit.mergedIntoName ? `Merged into ${unit.mergedIntoName}. ` : "Archived. "}
              {unit.archivedReason} Its submissions stay credited to it and appear in every report.
            </Notice>
          )}
          <TabPanel key={tab} idBase={idBase} index={TABS.indexOf(tab)} className="up-panel">
            {tab === "Overview" && <Overview data={data} season={season} badges={badges} current={cycle === data.currentCycle} onOpen={setTab} />}
            {tab === "Submissions" && <Submissions season={season} />}
            {tab === "Recognitions" && <Recognitions data={data} badges={badges} cycle={cycle} />}
            {tab === "History" && <History seasons={seasons} cycle={cycle} />}
            {tab === "Account settings" && <Settings data={data} />}
          </TabPanel>
        </div>
      </div>
    </SectionLevel.Provider>
  );
}
