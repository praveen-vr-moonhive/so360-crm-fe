# SO360 Micro-Frontend (MFE) Development Guide

Welcome to the **SO360 Micro-Frontend Architecture**. This document serves as the official guide for developers building and integrating new modules (MFEs) into the SO360 ecosystem. By following these standards, we ensure a seamless, performant, and consistent experience across the entire platform.

---

## 🏗 Architecture Overview

SO360 uses a **Host-Remote** architecture powered by **Vite** and **Module Federation**.

- **Host (Shell)**: The main container that handles authentication, global navigation, and provides the shared context.
- **Remote (MFE)**: Independent applications (like CRM, Inventory, etc.) that are lazily loaded into the Shell.

### Key Technologies
- **Framework**: React 19 (Functional Components + Hooks)
- **Routing**: React Router Dom 7
- **Bundler**: Vite + `@originjs/vite-plugin-federation`
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React

---

## 🚀 Getting Started: MFE Setup

### 1. Vite Configuration
Your MFE must export its main entry point (usually `App.tsx`) via Module Federation.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  base: 'http://localhost:PORT/', // Specify your MFE port
  plugins: [
    react(),
    federation({
      name: 'your_module_name',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        'react-router-dom': { singleton: true },
        '@so360/shell-context': { singleton: true },
        '@so360/design-system': { singleton: true },
        // ...other shared libs
      },
    }),
  ],
  server: {
    port: PORT,
    cors: true,
  }
});
```

---

## 🔐 Integration with Shell Context

All MFEs must be "Shell-Aware". They should consume global state (User, Tenant, Org, Auth) from the `@so360/shell-context`.

### The Initializer Pattern
We use an `Initializer` component in `App.tsx` to sync Shell state with local services.

```tsx
const MfeShellInitializer = ({ children }) => {
    const shell = useContext(ShellContext);
    const [isSynced, setIsSynced] = useState(false);

    useEffect(() => {
        if (shell?.currentTenant?.id && shell?.currentOrg?.id) {
            // Sync to your local service layer
            yourService.setTenantId(shell.currentTenant.id);
            yourService.setOrgId(shell.currentOrg.id);
            
            if (shell.accessToken) {
              yourService.setAccessToken(shell.accessToken);
            }
            
            setIsSynced(true);
        }
    }, [shell]);

    if (!isSynced) return <LoadingSpinner />; // Standardized loader

    return <>{children}</>;
};
```

---

## 🎨 UI & Design Standards

### 1. Visual Aesthetics
SO360 follows a **Premium Dark Mode** aesthetic.
- **Backgrounds**: Use `bg-slate-950` for the page and `bg-slate-900/50` for cards/sections.
- **Borders**: Subtle borders using `border-slate-800`.
- **Primary Color**: Blue (`blue-600` for buttons, `blue-500` for accents).
- **Typography**: Inter or similar clean sans-serif. Use `tracking-tight` for headings.

### 2. Standardized Components
Always prioritize using components from `@so360/design-system`. If creating local components:
- **Tables**: Use the shared `Table` component for consistent data display.
- **Modals**: Use the standard `Modal` wrapper with backdrop blur (`backdrop-blur-sm`).
- **Badges**: Use the low-opacity background pattern:
  ```html
  <span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-full text-xs">
    Status
  </span>
  ```

### 3. Loading States
Never show a blank screen. Use **Skeletons** or the **Connecting to shell** pulse animation during initial synchronization.

---

## 📡 API Interaction Layer

MFEs SHOULD NOT call APIs directly from components. Use a centralized service layer.

### ApiClient Helper
Implement a class to handle headers and tenant injection automatically.

```typescript
class ApiClient {
    private async request(endpoint, options) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Tenant-Id': this.tenantId, // Injected from ShellContext
            'Authorization': `Bearer ${this.accessToken}`,
            ...options.headers,
        };
        // ... fetch implementation
    }
}
```

### Proxying for Development
Configure Vite proxies in `vite.config.ts` to avoid CORS issues and simplify local development:
```typescript
proxy: {
  '/your-api': {
    target: 'http://localhost:BACKEND_PORT',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/your-api/, ''),
  }
}
```

---

## 🛠 Advanced Patterns

### 1. Dynamic Forms & Custom Fields
The CRM module demonstrates how to implement dynamic forms based on backend configurations (e.g., custom field definitions).
- **Fetch Definitions**: Retrieve definitions in `useEffect` when the form/modal opens.
- **Controlled State**: Use a `custom_fields` object in your form state to store dynamic values.
- **Dynamic Rendering**: Map over definitions to render inputs (Text, Number, Date, Boolean).

### 2. Synchronization Persistence
Ensure that your MFE handles multi-tenant scenarios correctly by listening to `ShellContext` changes. If the tenant or org changes while the MFE is active, the initializer should re-sync.

---

## 📁 Recommended Project Structure

Keep your MFE organized to facilitate easier maintenance and pair programming.

```text
src/
├── components/          # Reusable UI components
│   ├── common/          # Layout, Tables, Modals
│   └── [feature]/       # Feature-specific components
├── hooks/              # Custom React hooks
├── pages/               # Page-level components (lazy loaded)
├── services/            # API client and business logic
├── types/               # TypeScript interfaces
├── utils/               # Helper functions
├── App.tsx              # Main entry, Routing & Initializer
└── main.tsx             # Standalone development entry
```

---

## ✅ Best Practices Checklist
- [ ] **Lazy Loading**: All routes in `App.tsx` should use `React.lazy()`.
- [ ] **Context Awareness**: The MFE must wait for `ShellContext` before making API calls.
- [ ] **Responsive Design**: Use Tailwind's responsive prefixes (`md:`, `lg:`) for all layouts.
- [ ] **Performance**: Share common libraries (React, Framer Motion) as singletons in Module Federation.
- [ ] **Error Boundaries**: Wrap your main module to prevent one MFE from crashing the entire Shell.

---

*This guide is maintained by the SO360 Core Team. For updates or questions, please reach out via the developer portal.*
