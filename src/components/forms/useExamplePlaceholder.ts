"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const EXAMPLES: Record<string, readonly string[]> = {
  affiliation: [
    "E.g. Office for Student Affairs", "E.g. World Health Organization", "E.g. Philippine Red Cross",
    "E.g. Department of Social Welfare and Development", "E.g. Barangay Health Center",
  ],
  title: [
    "E.g. Kalinga: Community Health and Wellness Day", "E.g. Project Basa: Reading Together",
    "E.g. Gulayan sa Barangay", "E.g. Ready Together: Disaster Preparedness Workshop", "E.g. Clean Water, Healthy Families",
  ],
  lead: [
    "E.g. UST Central Student Council", "E.g. UST Faculty of Medicine and Surgery",
    "E.g. UST Red Cross Youth Council", "E.g. UST College of Education", "E.g. UST Engineering Student Council",
  ],
  "collaborators.name": [
    "E.g. Philippine Red Cross", "E.g. Office for Student Affairs", "E.g. Barangay Health Center",
    "E.g. Department of Social Welfare and Development", "E.g. Local Youth Development Office",
  ],
  community: [
    "E.g. Families in Barangay 630, Manila", "E.g. Learners at a partner public elementary school",
    "E.g. Thomasians", "E.g. Members of a community livelihood association", "E.g. Senior citizens at a partner community center",
  ],
  background: [
    "E.g. Community consultations identified a need for practical health education.",
    "E.g. Partner teachers requested additional reading support for young learners.",
    "E.g. Residents want to strengthen their household disaster preparedness.",
    "E.g. The community requested training on managing a small livelihood project.",
    "E.g. Families identified waste segregation as a priority for their neighborhood.",
  ],
  objective: [
    "E.g. Equip families with practical skills for healthier daily living.",
    "E.g. Improve learners’ reading confidence through guided activities.",
    "E.g. Help residents develop and practice a household emergency plan.",
    "E.g. Strengthen local leaders’ capacity to sustain a community garden.",
    "E.g. Enable youth volunteers to lead regular environmental activities.",
  ],
  "results.result.0": [
    "E.g. Deliver two health education sessions for 30 participating families.",
    "E.g. Complete four guided reading sessions and distribute learning materials.",
    "E.g. Develop a community emergency plan with local leaders.",
    "E.g. Establish a demonstration garden and a maintenance schedule.",
    "E.g. Run a waste segregation workshop and evaluate what participants learned.",
  ],
  "results.result.1": [
    "E.g. Volunteers improve their facilitation and community engagement skills.",
    "E.g. Student organizers gain experience planning inclusive learning activities.",
    "E.g. Implementers practice coordinating with local emergency responders.",
    "E.g. The team learns to monitor project outcomes with community partners.",
    "E.g. Volunteers document lessons to improve the next project cycle.",
  ],
  "results.result.2": [
    "E.g. Participating families can demonstrate basic first aid practices.",
    "E.g. Learners gain confidence reading short passages independently.",
    "E.g. Households identify evacuation routes and emergency contacts.",
    "E.g. Community members maintain the garden with locally available materials.",
    "E.g. Residents apply proper waste segregation at home.",
  ],
  emergencyPlan: [
    "E.g. Assign a trained first aider and brief participants on evacuation routes.",
    "E.g. Keep a first aid kit on site and coordinate with the barangay health team.",
    "E.g. Provide shaded rest areas, drinking water and scheduled breaks.",
    "E.g. Pause outdoor activities during severe weather and move to a safe venue.",
    "E.g. Designate an emergency vehicle and confirm the nearest treatment facility.",
  ],
  hospital: [
    "E.g. UST Hospital, España Boulevard, Manila", "E.g. The partner barangay’s health center",
    "E.g. The nearest municipal health office", "E.g. The local district hospital", "E.g. The community’s designated primary care clinic",
  ],
  ownership: [
    "E.g. Train local volunteers to continue the sessions after the project ends.",
    "E.g. Turn over learning materials and a simple activity guide to community leaders.",
    "E.g. Form a community team to maintain the garden and record its progress.",
    "E.g. Agree on monthly follow-up meetings with the partner organization.",
    "E.g. Identify local resources to support the next cycle of activities.",
  ],
  environment: [
    "E.g. Ask participants to bring reusable tumblers and utensils.",
    "E.g. Provide labeled bins and brief everyone on proper waste segregation.",
    "E.g. Use digital handouts and print only essential materials.",
    "E.g. Reuse workshop materials and avoid single-use decorations.",
    "E.g. Leave the venue clean and coordinate waste disposal with the community.",
  ],
};

/** Empty fields type an example, hold it for eight seconds, then erase it. */
export function useExamplePlaceholder(key: string, value: string, fallback?: string, offset = 0) {
  const examples = EXAMPLES[key];
  const reducedMotion = useReducedMotion();
  const start = examples?.length ? offset % examples.length : 0;
  const placeholder = examples?.[start] ?? fallback;
  const [hint, setHint] = useState(placeholder ?? "");
  const animate = !!examples?.length && !value && reducedMotion === false;

  useEffect(() => {
    if (!animate || !examples) return;
    let index = start;
    let length = 0;
    let timer: ReturnType<typeof setTimeout>;
    const begin = () => {
      length = 0;
      setHint("");
      timer = setTimeout(type, 45);
    };
    const type = () => {
      const text = examples[index];
      setHint(text.slice(0, ++length));
      timer = setTimeout(length < text.length ? type : erase, length < text.length ? 45 : 8000);
    };
    const erase = () => {
      setHint(examples[index].slice(0, --length));
      if (length > 0) timer = setTimeout(erase, 25);
      else {
        index = (index + 1) % examples.length;
        timer = setTimeout(begin, 300);
      }
    };
    begin();
    return () => clearTimeout(timer);
  }, [animate, examples, start]);

  return animate ? hint : placeholder;
}
