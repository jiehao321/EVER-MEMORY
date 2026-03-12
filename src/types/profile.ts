export interface ProfileDerivedField {
  value: string;
  confidence: number;
  evidenceRefs: string[];
}

export interface ProfileCommunicationStyle {
  tendency: string;
  confidence: number;
  evidenceRefs: string[];
}

export interface ProjectedProfile {
  userId: string;
  updatedAt: string;
  stable: {
    displayName?: string;
    preferredAddress?: string;
    timezone?: string;
    explicitPreferences: Record<string, string>;
    explicitConstraints: string[];
  };
  derived: {
    communicationStyle?: ProfileCommunicationStyle;
    likelyInterests: ProfileDerivedField[];
    workPatterns: ProfileDerivedField[];
  };
  behaviorHints: string[];
}
