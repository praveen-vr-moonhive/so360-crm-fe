/**
 * Feature flags for CRM functionality
 * Enable/disable features based on backend implementation status
 */

export const FEATURES = {
    // Deal Actions
    DEAL_INVOICE_REQUEST: true,   // Show invoice request button (with graceful error handling)
    DEAL_PROJECT_CREATION: true,  // Show project creation button (with graceful error handling)
    DEAL_PROJECT_LINKING: true,   // Enable when /deals/:id/link-project is implemented

    // Activities
    DEAL_ACTIVITIES_ENDPOINT: false, // Enable when /activities/deal/:id is implemented
    GLOBAL_ACTIVITIES_ENDPOINT: false, // Enable when /activities is implemented

    // Tasks
    TASK_DESCRIPTION_FIELD: false, // Enable when 'description' column added to tasks table

    // Future features
    LEAD_SCORING: true,
    CUSTOM_FIELDS: true,
    DOCUMENT_UPLOAD: true,
} as const;

export type FeatureFlag = keyof typeof FEATURES;

/**
 * Check if a feature is enabled
 */
export const isFeatureEnabled = (feature: FeatureFlag): boolean => {
    return FEATURES[feature];
};

/**
 * Get all enabled features
 */
export const getEnabledFeatures = (): FeatureFlag[] => {
    return Object.entries(FEATURES)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature as FeatureFlag);
};
