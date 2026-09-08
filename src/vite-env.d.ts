/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    // Declared so services can read the LITERAL `import.meta.env.VITE_SO360_CRM_API`.
    // Vite only substitutes that exact expression at build time — reading the
    // value off a captured `env` object leaves undefined in the built bundle,
    // which previously sent CRM calls to whatever the fallback pointed at.
    readonly VITE_SO360_CRM_API?: string;
    readonly VITE_SO360_CORE_API?: string;
    readonly VITE_SO360_DAILYSTORE_API?: string;
    readonly VITE_SO360_INVENTORY_API?: string;
    readonly VITE_SO360_FULFILLMENT_API?: string;
    readonly VITE_SO360_ACCOUNTING_API?: string;
    readonly VITE_SO360_NEURA_API?: string;
    readonly VITE_SO360_INBOX_API?: string;
    readonly VITE_SO360_SIGN_API?: string;
    readonly VITE_SO360_PROJECTS_API?: string;
    // Add more env variables as needed
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
