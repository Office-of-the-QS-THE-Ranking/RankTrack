import type * as Profile from "@/app/actions/profile";
import { runtime } from "./index";

export type { DeviceRow, LogRow, PrivacyInfo } from "@/app/actions/profile";

export const clearCookiesAndSignOut = (...a: Parameters<typeof Profile.clearCookiesAndSignOut>) => runtime().profile.clearCookiesAndSignOut(...a);
export const exportMyData = (...a: Parameters<typeof Profile.exportMyData>) => runtime().profile.exportMyData(...a);
export const loadDevices = (...a: Parameters<typeof Profile.loadDevices>) => runtime().profile.loadDevices(...a);
export const loadLogs = (...a: Parameters<typeof Profile.loadLogs>) => runtime().profile.loadLogs(...a);
export const loadOverview = (...a: Parameters<typeof Profile.loadOverview>) => runtime().profile.loadOverview(...a);
export const loadPrivacy = (...a: Parameters<typeof Profile.loadPrivacy>) => runtime().profile.loadPrivacy(...a);
export const saveNotificationPrefs = (...a: Parameters<typeof Profile.saveNotificationPrefs>) => runtime().profile.saveNotificationPrefs(...a);
export const saveProfile = (...a: Parameters<typeof Profile.saveProfile>) => runtime().profile.saveProfile(...a);
export const saveSessionPrefs = (...a: Parameters<typeof Profile.saveSessionPrefs>) => runtime().profile.saveSessionPrefs(...a);
export const signOutDevice = (...a: Parameters<typeof Profile.signOutDevice>) => runtime().profile.signOutDevice(...a);
export const switchActiveRole = (...a: Parameters<typeof Profile.switchActiveRole>) => runtime().profile.switchActiveRole(...a);
export const signOutOtherDevices = (...a: Parameters<typeof Profile.signOutOtherDevices>) => runtime().profile.signOutOtherDevices(...a);
