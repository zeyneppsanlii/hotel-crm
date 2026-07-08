# OTEL YÖNETİM SİSTEMİ
## Frontend Mimari Tasarım Belgesi

**Versiyon:** 1.0  
**Tarih:** 25 Şubat 2026  
**Durum:** Onay Bekliyor

---

## İÇİNDEKİLER

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Teknoloji Stack](#2-teknoloji-stack)
3. [Proje Yapısı](#3-proje-yapısı)
4. [Routing ve Navigation](#4-routing-ve-navigation)
5. [State Management](#5-state-management)
6. [UI Component Library](#6-ui-component-library)
7. [Authentication](#7-authentication)
8. [Real-Time Features](#8-real-time-features)
9. [Performance Optimization](#9-performance-optimization)
10. [Responsive Design](#10-responsive-design)
11. [Testing Strategy](#11-testing-strategy)
12. [Deployment](#12-deployment)

---

## 1. YÖNETİCİ ÖZETİ

Bu belge, otel CRM platformunun frontend mimarisini tanımlar. Modern, performanslı ve kullanıcı dostu bir web uygulaması geliştirmek için Next.js 14 App Router kullanılmaktadır.

### 1.1 Temel Özellikler

- **Server-Side Rendering (SSR):** SEO ve ilk yüklenme hızı
- **Multi-Tenant Routing:** Her otel için dinamik routing
- **Real-Time Updates:** WebSocket ile anlık bildirimler
- **Responsive Design:** Desktop, tablet, mobil uyumlu
- **Type-Safe:** Full TypeScript desteği
- **Modern UI:** Tailwind CSS + shadcn/ui

### 1.2 Kullanıcı Akışları

**Giriş ve Dashboard:**
```
Login → Tenant Seçimi → Dashboard → Ana Menü
```

**Mesajlaşma:**
```
Konuşmalar Listesi → Konuşma Detayı → Mesaj Gönderme → Real-Time Güncelleme
```

**Talep Yönetimi:**
```
Talepler Listesi → Yeni Talep → Atama → Durum Güncelleme → Kapatma
```

---

## 2. TEKNOLOJİ STACK

### 2.1 Core Framework

**Next.js 14+** (App Router)

**Neden Next.js?**
- Server Components ve Client Components ayrımı
- Built-in routing ve layouts
- API Routes (Backend for Frontend pattern)
- Image optimization
- Production-ready

### 2.2 UI ve Styling

| Teknoloji | Kullanım |
|-----------|----------|
| **Tailwind CSS** | Utility-first CSS framework |
| **shadcn/ui** | Reusable component library |
| **Lucide Icons** | Icon set |
| **Radix UI** | Headless UI primitives |

### 2.3 State Management

| State Türü | Teknoloji | Kullanım |
|------------|-----------|----------|
| **Server State** | TanStack Query (React Query) | API data fetching, caching |
| **Client State** | Zustand | Global UI state |
| **Form State** | React Hook Form | Form validation |
| **URL State** | Next.js router | Filters, pagination |

### 2.4 Real-Time

- **Socket.io Client** - WebSocket bağlantısı
- **Custom hooks** - useSocket, useSocketEvent

### 2.5 Type Safety

- **TypeScript** (strict mode)
- **Zod** - Runtime validation
- **API type generation** - Backend schema'dan otomatik

---

## 3. PROJE YAPISI

```
frontend/
├── app/                          ← Next.js 14 App Router
│   ├── (auth)/                   ← Auth layout group
│   │   ├── login/
│   │   └── layout.tsx
│   ├── (dashboard)/              ← Dashboard layout group
│   │   ├── [tenantId]/           ← Dynamic tenant routing
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          ← Dashboard home
│   │   │   ├── conversations/
│   │   │   ├── tickets/
│   │   │   ├── guests/
│   │   │   ├── devices/
│   │   │   └── settings/
│   │   └── layout.tsx
│   ├── api/                      ← API routes (BFF)
│   │   ├── auth/
│   │   └── proxy/
│   └── layout.tsx                ← Root layout
├── components/
│   ├── ui/                       ← shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── features/                 ← Feature-specific components
│   │   ├── conversations/
│   │   ├── tickets/
│   │   └── devices/
│   └── layout/                   ← Layout components
│       ├── header.tsx
│       ├── sidebar.tsx
│       └── footer.tsx
├── lib/
│   ├── api/                      ← API client
│   ├── hooks/                    ← Custom hooks
│   ├── utils/                    ← Helper functions
│   └── validations/              ← Zod schemas
├── store/                        ← Zustand stores
│   ├── auth.ts
│   ├── ui.ts
│   └── tenant.ts
├── types/                        ← TypeScript types
│   ├── api.ts
│   └── models.ts
└── public/                       ← Static assets
```

---

## 4. ROUTING VE NAVIGATION

### 4.1 Multi-Tenant Routing

**Route Structure:**
```
/login                           ← Public
/[tenantId]/dashboard            ← Protected, tenant-specific
/[tenantId]/conversations        ← Protected
/[tenantId]/conversations/:id    ← Protected
/[tenantId]/tickets              ← Protected
/[tenantId]/guests               ← Protected
/[tenantId]/devices              ← Protected
/[tenantId]/settings             ← Protected, admin only
```

**Middleware:**
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tenantId = pathname.split('/')[1];
  
  // Verify tenant access
  const session = await getSession(request);
  if (!session.user.tenants.includes(tenantId)) {
    return NextResponse.redirect('/unauthorized');
  }
  
  return NextResponse.next();
}
```

### 4.2 Layout System

**Root Layout:**
```typescript
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

**Dashboard Layout:**
```typescript
// app/(dashboard)/[tenantId]/layout.tsx
export default function DashboardLayout({ children, params }) {
  return (
    <div className="flex h-screen">
      <Sidebar tenantId={params.tenantId} />
      <main className="flex-1 overflow-auto">
        <Header tenantId={params.tenantId} />
        {children}
      </main>
    </div>
  );
}
```

---

## 5. STATE MANAGEMENT

### 5.1 Server State (TanStack Query)

**API Fetching:**
```typescript
// hooks/useTickets.ts
export function useTickets(tenantId: string) {
  return useQuery({
    queryKey: ['tickets', tenantId],
    queryFn: () => api.tickets.list(tenantId),
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: true,
  });
}
```

**Mutations:**
```typescript
export function useCreateTicket(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => api.tickets.create(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tickets', tenantId]);
    },
  });
}
```

### 5.2 Client State (Zustand)

**UI Store:**
```typescript
// store/ui.ts
interface UIStore {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  theme: 'light',
  setTheme: (theme) => set({ theme }),
}));
```

**Auth Store:**
```typescript
// store/auth.ts
interface AuthStore {
  user: User | null;
  selectedTenant: string | null;
  setUser: (user: User) => void;
  setTenant: (tenantId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  selectedTenant: null,
  setUser: (user) => set({ user }),
  setTenant: (tenantId) => set({ selectedTenant: tenantId }),
  logout: () => set({ user: null, selectedTenant: null }),
}));
```

### 5.3 URL State

**Filters ve Pagination:**
```typescript
// hooks/useTicketFilters.ts
export function useTicketFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const filters = {
    status: searchParams.get('status') || 'all',
    category: searchParams.get('category') || 'all',
    page: Number(searchParams.get('page')) || 1,
  };
  
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`?${params.toString()}`);
  };
  
  return { filters, setFilter };
}
```

---

## 6. UI COMPONENT LIBRARY

### 6.1 shadcn/ui Components

**Kullanılan Bileşenler:**
- Button, Input, Textarea
- Dialog, Sheet, Popover
- Select, Checkbox, Radio
- Table, DataTable
- Tabs, Accordion
- Toast, Alert
- Form (React Hook Form entegrasyonu)

**Kurulum:**
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dialog
```

### 6.2 Custom Components

**ConversationList:**
```typescript
interface ConversationListProps {
  tenantId: string;
  onSelect: (id: string) => void;
}

export function ConversationList({ tenantId, onSelect }: ConversationListProps) {
  const { data: conversations } = useConversations(tenantId);
  
  return (
    <div className="space-y-2">
      {conversations?.map(conv => (
        <ConversationCard
          key={conv.id}
          conversation={conv}
          onClick={() => onSelect(conv.id)}
        />
      ))}
    </div>
  );
}
```

**TicketCard:**
```typescript
export function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{ticket.title}</CardTitle>
          <Badge variant={ticket.priority}>{ticket.priority}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{ticket.description}</p>
        <div className="mt-4 flex items-center gap-2">
          <Avatar user={ticket.assignedTo} />
          <span className="text-sm">{ticket.assignedTo?.name}</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 7. AUTHENTICATION

### 7.1 NextAuth.js

**Configuration:**
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        const res = await fetch('http://backend/auth/login', {
          method: 'POST',
          body: JSON.stringify(credentials),
        });
        
        const user = await res.json();
        if (res.ok && user) return user;
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.tenants = user.tenants;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.tenants = token.tenants;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

export { handler as GET, handler as POST };
```

### 7.2 Protected Routes

```typescript
// components/auth/ProtectedRoute.tsx
export function ProtectedRoute({ children, requiredRole }: Props) {
  const { data: session, status } = useSession();
  
  if (status === 'loading') return <Spinner />;
  if (!session) redirect('/login');
  
  const hasRole = session.user.role === requiredRole;
  if (!hasRole) return <Unauthorized />;
  
  return <>{children}</>;
}
```

---

## 8. REAL-TIME FEATURES

### 8.1 Socket.io Integration

**Socket Provider:**
```typescript
// providers/SocketProvider.tsx
export function SocketProvider({ children, tenantId }: Props) {
  const [socket, setSocket] = useState<Socket | null>(null);
  
  useEffect(() => {
    const newSocket = io('ws://backend', {
      query: { tenantId },
      auth: { token: getAccessToken() },
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, [tenantId]);
  
  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
```

**Custom Hook:**
```typescript
// hooks/useSocketEvent.ts
export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const socket = useSocket();
  
  useEffect(() => {
    if (!socket) return;
    
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler]);
}
```

**Usage:**
```typescript
// components/ConversationView.tsx
export function ConversationView({ conversationId }: Props) {
  const queryClient = useQueryClient();
  
  useSocketEvent('message:new', (message) => {
    if (message.conversationId === conversationId) {
      queryClient.invalidateQueries(['messages', conversationId]);
      // Optionally: optimistic update
    }
  });
  
  return <MessageList conversationId={conversationId} />;
}
```

### 8.2 Real-Time Updates

**Ticket Status Updates:**
```typescript
useSocketEvent('ticket:updated', (data) => {
  queryClient.setQueryData(['tickets', tenantId], (old) => {
    return old.map(ticket => 
      ticket.id === data.ticketId 
        ? { ...ticket, status: data.status }
        : ticket
    );
  });
  
  toast.success('Talep durumu güncellendi');
});
```

**Device Alerts:**
```typescript
useSocketEvent('device:alert', (alert) => {
  toast.error(`Cihaz Uyarısı: ${alert.message}`, {
    action: {
      label: 'Görüntüle',
      onClick: () => router.push(`/devices/${alert.deviceId}`),
    },
  });
});
```

---

## 9. PERFORMANCE OPTIMIZATION

### 9.1 Code Splitting

```typescript
// Dynamic import
const DeviceMonitor = dynamic(() => import('@/components/DeviceMonitor'), {
  loading: () => <Skeleton />,
  ssr: false, // Client-only component
});
```

### 9.2 Image Optimization

```typescript
import Image from 'next/image';

<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={50}
  priority // Above the fold
/>
```

### 9.3 Data Prefetching

```typescript
// Prefetch on hover
<Link 
  href={`/${tenantId}/tickets/${ticket.id}`}
  onMouseEnter={() => {
    queryClient.prefetchQuery(['ticket', ticket.id]);
  }}
>
  {ticket.title}
</Link>
```

### 9.4 Virtualization

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

export function MessageList({ messages }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(item => (
          <div key={item.index} style={{ transform: `translateY(${item.start}px)` }}>
            <MessageCard message={messages[item.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 9.5 Debouncing

```typescript
import { useDebouncedValue } from '@/hooks/useDebounce';

export function SearchInput() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  
  const { data } = useQuery({
    queryKey: ['search', debouncedSearch],
    queryFn: () => api.search(debouncedSearch),
    enabled: debouncedSearch.length > 2,
  });
  
  return <Input value={search} onChange={(e) => setSearch(e.target.value)} />;
}
```

---

## 10. RESPONSIVE DESIGN

### 10.1 Breakpoints (Tailwind)

```typescript
// Mobile-first approach
<div className="
  grid 
  grid-cols-1      // Mobile
  md:grid-cols-2   // Tablet
  lg:grid-cols-3   // Desktop
  gap-4
">
```

### 10.2 Mobile Navigation

```typescript
export function MobileNav() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <Navigation onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      
      <div className="hidden md:block">
        <Sidebar />
      </div>
    </>
  );
}
```

### 10.3 Responsive Tables

```typescript
// Mobile: Card view
// Desktop: Table view
export function TicketList({ tickets }: Props) {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}
      </div>
      
      {/* Desktop */}
      <div className="hidden md:block">
        <DataTable columns={columns} data={tickets} />
      </div>
    </>
  );
}
```

---

## 11. TESTING STRATEGY

### 11.1 Unit Tests (Vitest)

```typescript
import { render, screen } from '@testing-library/react';
import { TicketCard } from './TicketCard';

describe('TicketCard', () => {
  it('renders ticket title', () => {
    const ticket = { id: '1', title: 'Test Ticket', priority: 'high' };
    render(<TicketCard ticket={ticket} />);
    
    expect(screen.getByText('Test Ticket')).toBeInTheDocument();
  });
});
```

### 11.2 Integration Tests

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useTickets } from './useTickets';

describe('useTickets', () => {
  it('fetches tickets', async () => {
    const { result } = renderHook(() => useTickets('tenant-1'));
    
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    
    expect(result.current.data).toHaveLength(5);
  });
});
```

### 11.3 E2E Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test('user can create ticket', async ({ page }) => {
  await page.goto('/tenant-1/tickets');
  await page.click('button:has-text("Yeni Talep")');
  
  await page.fill('[name="title"]', 'Test Ticket');
  await page.fill('[name="description"]', 'Test description');
  await page.click('button:has-text("Oluştur")');
  
  await expect(page.locator('text=Test Ticket')).toBeVisible();
});
```

---

## 12. DEPLOYMENT

### 12.1 Build

```bash
npm run build
npm run start
```

### 12.2 Environment Variables

```env
# .env.production
NEXT_PUBLIC_API_URL=https://api.hotel-crm.com
NEXT_PUBLIC_WS_URL=wss://api.hotel-crm.com
NEXTAUTH_URL=https://app.hotel-crm.com
NEXTAUTH_SECRET=xxx
```

### 12.3 Fly.io Configuration

```toml
# fly.toml
app = "hotel-crm-frontend"

[build]
  dockerfile = "Dockerfile.frontend"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[env]
  NODE_ENV = "production"
  PORT = "3000"
```

### 12.4 Docker

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

---

## PERFORMANS HEDEFLERI

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Cumulative Layout Shift | < 0.1 |
| Bundle Size (Initial) | < 200KB |

---

## SONRAKİ ADIMLAR

- [ ] Next.js projesi kurulumu
- [ ] Tailwind + shadcn/ui setup
- [ ] Auth flow (NextAuth)
- [ ] Dashboard layout
- [ ] Conversations UI
- [ ] Tickets UI
- [ ] Devices UI
- [ ] WebSocket integration
- [ ] Mobile responsive
- [ ] Testing
- [ ] Deploy

---

**Belge Sonu**

*Bu belge, otel CRM platformunun frontend mimarisini tanımlar ve frontend ekibine rehberlik eder.*
