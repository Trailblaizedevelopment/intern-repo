export type ScoutPrivacySettings = {
  tier1_introducible: boolean;
  tier2_introducible: boolean;
  tier3_introducible: boolean;
  tier4_introducible: boolean;
};

export const DEFAULT_PRIVACY: ScoutPrivacySettings = {
  tier1_introducible: true,
  tier2_introducible: true,
  tier3_introducible: false,
  tier4_introducible: false,
};

export function isIntroducible(tier: 1 | 2 | 3 | 4, settings: ScoutPrivacySettings): boolean {
  switch (tier) {
    case 1:
      return settings.tier1_introducible;
    case 2:
      return settings.tier2_introducible;
    case 3:
      return settings.tier3_introducible;
    case 4:
      return settings.tier4_introducible;
    default:
      return false;
  }
}

/** All tiers are discoverable; introducible is the naming/propose gate. */
export function isDiscoverable(_tier: 1 | 2 | 3 | 4): boolean {
  return true;
}
