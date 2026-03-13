export type ProfileFactSource = 'stable_explicit' | 'derived_inference';
export type ProfileGuardrailLevel = 'canonical' | 'weak_hint';

export interface ProfileDerivedField {
  value: string;
  confidence: number;
  evidenceRefs: string[];
  source: 'derived_inference';
  guardrail: 'weak_hint';
  canonical: false;
}

export interface ProfileCommunicationStyle {
  tendency: string;
  confidence: number;
  evidenceRefs: string[];
  source: 'derived_inference';
  guardrail: 'weak_hint';
  canonical: false;
}

export interface ProfileStableField<T extends string = string> {
  value: T;
  source: 'stable_explicit';
  canonical: true;
  evidenceRefs: string[];
}

export interface ProjectedProfile {
  userId: string;
  updatedAt: string;
  stable: {
    displayName?: ProfileStableField;
    preferredAddress?: ProfileStableField;
    timezone?: ProfileStableField;
    explicitPreferences: Record<string, ProfileStableField>;
    explicitConstraints: Array<ProfileStableField>;
  };
  derived: {
    communicationStyle?: ProfileCommunicationStyle;
    likelyInterests: ProfileDerivedField[];
    workPatterns: ProfileDerivedField[];
  };
  behaviorHints: string[];
}
