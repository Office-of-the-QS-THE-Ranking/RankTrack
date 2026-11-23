import { runtime } from "./index";

export const signOut = () => runtime().signOut();
export const heartbeat = (active: boolean) => runtime().heartbeat(active);
