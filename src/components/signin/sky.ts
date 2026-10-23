/**
 * Day or night for the sign-in scene (SignInScene): always the sky outside, day from sunrise to sunset by the
 * viewer's own clock, unless the viewer flips it with the sky button (SkyToggle), which holds only while the page
 * is open: a reload brings back the sky outside (skyOverride). The server reckons by Manila's clock; SKY_BOOT
 * corrects it for other time zones before the first paint, and SceneMotion turns the sky when the sun rises or
 * sets while the page is open.
 */

export type Sky = "day" | "night";

/** Manila's clock, UTC+8 all year: the server's guess until the browser says otherwise. */
export const MANILA = 480;

/**
 * Whether the sun is up at `ms` on a clock `offset` minutes ahead of UTC, reckoned for the University
 * (14.61° N, four minutes of sun east of its time zone's meridian): the sun's declination and the equation
 * of time from the day of the year (NOAA's series), the hour angle from the clock, and up once the sun's
 * centre clears the horizon's refraction (-0.833°). Self-contained, because SKY_BOOT inlines its source.
 */
export function skyAt(ms: number, offset: number): Sky {
  const local = new Date(ms + offset * 60000);
  const year = local.getUTCFullYear();
  const day = (Date.UTC(year, local.getUTCMonth(), local.getUTCDate()) - Date.UTC(year, 0, 1)) / 86400000;
  const hours = local.getUTCHours() + local.getUTCMinutes() / 60;
  const g = ((2 * Math.PI) / 365) * (day + (hours - 12) / 24);
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const angle = ((hours + (eot + 4) / 60 - 12) * Math.PI) / 12;
  const lat = (14.61 * Math.PI) / 180;
  const height = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(angle);
  return height > -0.01454 ? "day" : "night";
}

/** The colour of the browser's own bar for each sky, matched to the page behind it (signin.css). */
export const SKY_THEME: Record<Sky, string> = { day: "#f3efe6", night: "#050505" };

/**
 * Runs as the sign-in page is parsed, from the script at the head of .signin: it sets the page's sky from the
 * viewer's own clock before anything paints, and the browser bar's colour with it.
 */
export const SKY_BOOT = `try{var m=document.currentScript.parentElement,s=(${skyAt})(Date.now(),-new Date().getTimezoneOffset()),c=document.querySelector('meta[name="theme-color"]');m.dataset.sky=s;if(c)c.content=s==="day"?"${SKY_THEME.day}":"${SKY_THEME.night}"}catch(e){}`;
