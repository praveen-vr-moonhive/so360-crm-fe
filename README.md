# SO360 CRM Frontend

React MFE for the CRM module. Provides the full B2B sales UI — pipeline kanban, lead management, quote builder, marketing automation, and customer activity tracking.

## Module Federation Details

| | |
|-|-|
| Federation Name | `crm_app` |
| Remote Entry | `http://localhost:3004/assets/remoteEntry.js` |
| Exposed Module | `./App` → `./src/App.tsx` |
| Port | 3004 |
| Shell Route | `/crm/*` |
| Shell Wrapper | `RemoteCRM.tsx` in `so360-shell-fe` |

## Tech Stack

| | |
|-|-|
| Framework | React 19.2 |
| Build Tool | Vite 5.4 |
| Language | TypeScript |
| Styling | Tailwind CSS 3.4 |
| Federation | @originjs/vite-plugin-federation 1.4 |
| Icons | Lucide React |
| Runtime | Node.js 22.12+ |

## Shared Singletons (via federation)
- `react`, `react-dom`, `react-router-dom`
- `framer-motion`, `lucide-react`
- `@so360/shell-context`, `@so360/design-system`, `@so360/event-bus`, `@so360/formatters`

## Pages & Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/crm` | `DashboardPage` | KPI overview |
| `/crm/pipeline` | `PipelinePage` | Kanban deal board (60s auto-poll) |
| `/crm/deals/:id` | `DealDetailPage` | Deal info, timeline, project link, invoice status |
| `/crm/leads` | `LeadsPage` | Lead list with qualification and conversion |
| `/crm/leads/:id` | `LeadDetailPage` | Lead detail with storefront activity |
| `/crm/customers` | `CustomersPage` | Customer list with credit limit management |
| `/crm/quotes` | `QuotesPage` | Quote list with approval workflow |
| `/crm/quotes/:id` | `QuoteDetailPage` | Quote builder with stock availability |
| `/crm/tasks` | `TasksPage` | Task list with bulk update |
| `/crm/tasks/:id` | `TaskDetailPage` | Task detail and notes |
| `/crm/marketing` | `MarketingOverviewPage` | Marketing KPIs |
| `/crm/marketing/campaigns` | `MarketingCampaignsPage` | Campaign management |
| `/crm/marketing/campaigns/:id` | `MarketingCampaignDetailPage` | Campaign detail |
| `/crm/marketing/abandoned-carts` | `MarketingAbandonedCartsPage` | Cart recovery |
| `/crm/marketing/abandoned-carts/:id` | `MarketingAbandonedCartDetailPage` | Cart detail |
| `/crm/marketing/coupons` | `MarketingCouponsPage` | Coupon management |
| `/crm/marketing/newsletter` | `MarketingNewsletterPage` | Newsletter subscribers |
| `/crm/marketing/reviews` | `MarketingReviewsPage` | Review moderation |
| `/crm/marketing/segments` | `MarketingSegmentsPage` | Customer segments |
| `/crm/marketing/wishlists` | `MarketingWishlistPage` | Wishlist tracking |
| `/crm/settings` | `SettingsPage` | CRM configuration |

## How to Run

### Prerequisites
- Node.js 22.12+
- Shared packages built

### Build Shared Packages First
```bash
cd ../../so360-shell-fe/packages/shell-context && npm run build
cd ../design-system && npm run build
cd ../event-bus && npm run build
```

### MFE Preview Mode (Shell integration)
```bash
npm install
npm run build && npm run preview    # port 3004
# Shell loads from http://localhost:3004/assets/remoteEntry.js
```

### Standalone Dev Mode
```bash
npm run dev    # port 3004, no remoteEntry.js produced
```

> **Critical**: Use `build && preview` for Shell integration. `npm run dev` does NOT produce `remoteEntry.js`.

## Environment Variables
```env
VITE_BASE_URL=http://localhost:3004/
VITE_SO360_CRM_API=http://localhost:3003
VITE_SO360_CORE_API=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## API Proxying
In preview mode, Vite proxies:
- `/crm-api/*` → CRM BE (3003)
- `/v1/*` → Core BE (3000)

## Cross-Module Integrations

### Uses
- `PeopleSelector` from `@so360/design-system` — Sales rep assignment on deals
- `UserSelector` — Task assignment
- Storefront activity data from Daily Store (via CRM BE proxy)
