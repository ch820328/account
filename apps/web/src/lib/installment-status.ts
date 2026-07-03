export type InstallmentLike = {
  active: boolean;
  totalPeriods: number | null;
  completedPeriods: number;
};

/** All scheduled periods have been charged. */
export function isInstallmentFinished(s: InstallmentLike): boolean {
  return s.totalPeriods != null && s.completedPeriods >= s.totalPeriods;
}

/** Manually paused, still has remaining periods. */
export function isInstallmentPaused(s: InstallmentLike): boolean {
  return !s.active && !isInstallmentFinished(s);
}
