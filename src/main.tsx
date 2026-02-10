import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

import { ShellContext, ShellContextType } from '@so360/shell-context';

// Mock Provider for Standalone Development
const MockShellProvider = ({ children }: { children: React.ReactNode }) => {
    const mockContext: ShellContextType = {
        user: {
            id: 'mock-user-id',
            email: 'admin@so360.com',
            full_name: 'System Admin',
            avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'
        },
        tenants: [
            { id: '3cf1c619-cb9b-48ac-9387-447418d1beee', name: 'Acme Corp' }
        ],
        currentTenant: { id: '3cf1c619-cb9b-48ac-9387-447418d1beee', name: 'Acme Corp' },
        orgs: [
            { id: 'org-1', name: 'Primary Org', tenant_id: '3cf1c619-cb9b-48ac-9387-447418d1beee' }
        ],
        currentOrg: { id: 'org-1', name: 'Primary Org', tenant_id: '3cf1c619-cb9b-48ac-9387-447418d1beee' },
        isLoading: false,
        error: null,
        refreshContext: async () => { console.log('Mock refresh'); },
        setUser: () => { },
        setCurrentTenant: () => { },
        setCurrentOrg: () => { },
        accessToken: 'mock-access-token',
        enabledModules: ['crm', 'inventory', 'accounting'],
        isModuleEnabled: () => true,
        toggleModule: async () => { console.log('Mock toggleModule'); },
        refreshModules: async () => { console.log('Mock refreshModules'); },
        modulesLoading: false
    };

    return (
        <ShellContext.Provider value={mockContext}>
            {children}
        </ShellContext.Provider>
    );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <BrowserRouter>
            <MockShellProvider>
                <App />
            </MockShellProvider>
        </BrowserRouter>
    </React.StrictMode>
);
