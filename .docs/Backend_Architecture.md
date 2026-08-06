# OTEL YÖNETİM SİSTEMİ
## Backend Mimari Tasarım Belgesi

**Versiyon:** 1.0  
**Tarih:** 25 Şubat 2026  
**Durum:** Onay Bekliyor

---

## İÇİNDEKİLER

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Proje Kapsamı](#2-proje-kapsamı)
3. [İş Gereksinimleri](#3-iş-gereksinimleri)
4. [Fonksiyonel Gereksinimler](#4-fonksiyonel-gereksinimler)
5. [Backend Teknoloji Stack](#5-backend-teknoloji-stack)
6. [Mimari Tasarım](#6-mimari-tasarım)
7. [Multi-Tenant Mimarisi](#7-multi-tenant-mimarisi)
8. [Veritabanı Tasarımı](#8-veritabanı-tasarımı)
9. [API Tasarımı](#9-api-tasarımı)
10. [Kimlik Doğrulama ve Yetkilendirme](#10-kimlik-doğrulama-ve-yetkilendirme)
11. [Real-Time İletişim](#11-real-time-iletişim)
12. [Entegrasyonlar](#12-entegrasyonlar)
13. [Güvenlik](#13-güvenlik)
14. [Performans ve Ölçeklenme](#14-performans-ve-ölçeklenme)
15. [Riskler ve Azaltma Stratejileri](#15-riskler-ve-azaltma-stratejileri)
16. [Sonraki Adımlar](#16-sonraki-adımlar)

---

## 1. YÖNETİCİ ÖZETİ

Bu belge, otel CRM ve altyapı izleme platformunun backend mimarisini tanımlar. Sistem, otellerin misafir iletişimini, hizmet taleplerini ve altyapı cihazlarını merkezi olarak yönetmesini sağlar.

### 1.1 Temel Özellikler

- **Multi-Tenant SaaS:** Her otel bağımsız çalışır (tek şema + Row-Level Security)
- **WhatsApp Entegrasyonu:** Misafirlerle doğrudan mesajlaşma
- **Hizmet Talep Yönetimi:** Oda servisi, temizlik, teknik destek
- **IoT Altyapı İzleme:** Kameralar, sensörler, kart okuyucular
- **Real-Time Bildirimler:** WebSocket ile anlık güncellemeler
- **Rol Bazlı Erişim:** Yönetici, Müdür, Personel

### 1.2 Mimari Yaklaşım

**Modular Monolith** mimarisi seçildi:
- Tek uygulama, modüler yapı
- Kolay başlangıç ve deployment
- Düşük operasyonel yük
- İleride microservice'e geçilebilir

### 1.3 Teknoloji Seçimleri

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| Framework | NestJS | TypeScript, modüler yapı, enterprise-ready |
| Database | PostgreSQL | Row-Level Security, güvenilir, ACID |
| ORM | Prisma | Type-safe, migration desteği, modern |
| Cache | Redis | Hızlı, pub/sub desteği |
| Real-time | Socket.io | WebSocket, fallback desteği |
| Queue | Bull | Redis tabanlı, job scheduling |

---

## 2. PROJE KAPSAMI

### 2.1 Proje Hedefleri

1. **Operasyonel Verimlilik:** Misafir taleplerini hızlı çözüm
2. **Misafir Memnuniyeti:** Kolay iletişim, hızlı yanıt
3. **Altyapı Güvenilirliği:** Proaktif cihaz izleme
4. **Veri Güvenliği:** KVKK uyumlu, şifreli iletişim
5. **Ölçeklenebilirlik:** 1-100 otel arası büyüme

### 2.2 Kapsam Dışı

❌ Otel rezervasyon sistemi  
❌ Ön büro (PMS) entegrasyonu  
❌ Finans ve muhasebe  
❌ İnsan kaynakları  
❌ Envanter yönetimi

**Not:** İleride PMS entegrasyonu değerlendirilebilir.

### 2.3 Kullanıcı Profilleri

| Rol | Sorumluluk | Kullanım Sıklığı |
|-----|-----------|------------------|
| **Otel Müdürü** | Sistem ayarları, raporlar, kullanıcı yönetimi | Günlük |
| **Resepsiyon** | Misafir kayıt, talep oluşturma | Sürekli |
| **Personel** | Talepleri görüntüleme ve yanıtlama | Sürekli |
| **Teknik Ekip** | Altyapı izleme, bakım planları | Günlük |
| **Misafir** | WhatsApp üzerinden talep gönderme | İhtiyaç halinde |

---

## 3. İŞ GEREKSİNİMLERİ

### 3.1 Misafir İletişimi

**Hedef:** Misafirler otel ile WhatsApp üzerinden 7/24 iletişim kurabilmeli.

**İş Kuralları:**
- Misafir check-in sonrası otomatik karşılama mesajı
- Tüm konuşmalar veritabanında saklanır
- Personel 5 dakika içinde yanıt vermeli (SLA)
- Dil desteği: Türkçe, İngilizce

**Başarı Kriteri:** %90+ misafir memnuniyeti, <5 dk yanıt süresi

### 3.2 Hizmet Talep Yönetimi

**Hedef:** Misafir taleplerinin sistematik takibi ve çözümü.

**Talep Kategorileri:**
- Oda Servisi
- Temizlik
- Teknik Destek
- Resepsiyon
- Diğer

**İş Akışı:**
```
Talep Gelir → Kategorize Edilir → Atanır → İşleme Alınır → Tamamlanır → Kapatılır
```

**Başarı Kriteri:** %95 tamamlanma oranı, <30 dk ortalama çözüm süresi

### 3.3 Altyapı İzleme

**Hedef:** Otel cihazlarının proaktif izlenmesi.

**İzlenen Cihazlar:**
- Güvenlik kameraları (çevrimiçi/çevrimdışı durumu)
- Yangın sensörleri (alarm durumu)
- Kart okuyucular (çalışma durumu)
- Klima sistemleri (IoT sensörleri)

**Uyarı Seviyeleri:**
- 🟢 Normal
- 🟡 Dikkat (bakım gerekebilir)
- 🔴 Kritik (acil müdahale)

**Başarı Kriteri:** %99.5 uptime, <15 dk uyarı yanıt süresi

---

## 4. FONKSİYONEL GEREKSİNİMLER

### 4.1 Kullanıcı Yönetimi

**FR-001: Kullanıcı Kaydı**
- Otel müdürü yeni kullanıcı ekleyebilir
- Zorunlu alanlar: Ad, e-posta, rol
- E-posta doğrulama gönderilir
- İlk giriş için şifre belirleme

**FR-002: Rol Atama**
- Roller: Yönetici, Müdür, Personel
- Her rol farklı yetkilere sahip
- Bir kullanıcı birden fazla otelde farklı roller alabilir

**FR-003: Oturum Yönetimi**
- JWT ile kimlik doğrulama
- 24 saat token geçerliliği
- Refresh token ile otomatik yenileme
- Çıkış yapınca token geçersiz kılınır

### 4.2 Misafir Yönetimi

**FR-010: Misafir Kaydı**
- Ad, telefon, oda numarası zorunlu
- WhatsApp numarası otomatik doğrulama
- Check-in ve check-out tarihleri
- Notlar alanı (özel istekler)

**FR-011: Misafir Geçmişi**
- Önceki konaklamalar
- Geçmiş talepler ve memnuniyet skorları
- Tercihler (sessiz kat, yüksek kat vb.)

### 4.3 Konuşma Yönetimi

**FR-020: Yeni Konuşma**
- WhatsApp'tan gelen mesaj otomatik konuşma oluşturur
- Personel manuel konuşma başlatabilir
- Her misafir için tek aktif konuşma

**FR-021: Mesaj Gönderme**
- Metin, emoji, resim desteği
- Gönderim durumu: gönderildi, iletildi, okundu
- Mesaj geçmişi tam kaydedilir

**FR-022: Konuşma Atama**
- Konuşmalar belirli personele atanabilir
- Atama değişikliği loglanır
- Atanmamış konuşmalar havuzda bekler

### 4.4 Hizmet Talep Yönetimi

**FR-030: Talep Oluşturma**
- Kategori seçimi (oda servisi, temizlik, teknik vb.)
- Öncelik: Düşük, Orta, Yüksek, Acil
- Açıklama alanı
- Oda numarası otomatik doldurulur

**FR-031: Talep Atama**
- Müdür veya sistem otomatik atar
- Uygun personele bildirim gider
- Atama değişikliği mümkün

**FR-032: Talep İzleme**
- Durumlar: Bekliyor, İşlemde, Tamamlandı, İptal
- Her durum değişimi loglanır
- Tamamlama süresi kaydedilir

### 4.5 Altyapı İzleme

**FR-040: Cihaz Kayıt**
- Cihaz türü, model, seri numarası
- Konum (kat, alan)
- Bağlantı bilgileri (IP, protokol)

**FR-041: Cihaz İzleme**
- Çevrimiçi/çevrimdışı durumu
- Son sinyal zamanı
- Uyarı durumu

**FR-042: Uyarı Yönetimi**
- Uyarı oluşturulunca sorumlulara bildirim
- Uyarı onaylanabilir veya kapatılabilir
- Uyarı geçmişi tutulur

### 4.6 Raporlama

**FR-050: Talep Raporları**
- Günlük/haftalık/aylık talep sayısı
- Kategori bazında dağılım
- Ortalama çözüm süresi
- Personel performansı

**FR-051: Altyapı Raporları**
- Cihaz uptime oranları
- Uyarı sayıları ve türleri
- Bakım geçmişi

**FR-052: Misafir Memnuniyet Raporları**
- Memnuniyet skorları
- Şikayet oranı
- Yanıt süreleri

---

## 5. BACKEND TEKNOLOJİ STACK

### 5.1 Framework: NestJS

**Neden NestJS?**

| Özellik | Açıklama |
|---------|----------|
| **TypeScript Native** | Tip güvenliği, daha az hata |
| **Modüler Yapı** | Her özellik bağımsız module |
| **Dependency Injection** | Testedilebilir, maintainable kod |
| **Enterprise-Ready** | Mikroservis, GraphQL, WebSocket desteği |
| **Dokümantasyon** | Kapsamlı ve güncel |

**Alternatifler:** Express (çok basit), Fastify (hızlı ama ekosistem küçük)

### 5.2 Database: PostgreSQL

**Neden PostgreSQL?**

- **Row-Level Security (RLS):** Kiracı izolasyonu veritabanı katmanında zorunlu kılınır
- **ACID:** Veri tutarlılığı garanti
- **JSON Desteği:** Esnek veri modelleri
- **Full-Text Search:** Arama özellikleri
- **Güvenilirlik:** Production-grade, battle-tested

**Tek Şema + RLS Modeli:**

Tüm kiracılar tek bir `public` şemasını paylaşır. Kiracıya ait her tablo bir
`tenant_id` (uuid) kolonu taşır ve tabloya tanımlanan RLS politikaları, o an aktif
kiracının satırları dışındaki hiçbir satırı görünür kılmaz.

```sql
-- Tek şema, her tenant tablosunda tenant_id
public.tenants          -- otel kayıtları (paylaşılan, RLS yok)
public.users            -- tenant_id
public.guests           -- tenant_id
public.tickets          -- tenant_id
-- ...

-- Her tenant tablosunda RLS aktif ve zorunlu
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.tickets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

> **Neden schema-per-tenant değil?** Bkz. [§7.4 Karar Evrimi](#74-karar-evrimi).
> Kısaca: Prisma tek bir şemaya karşı tek bir migration yolu bekler; dinamik
> `search_path`/şema başına migration operasyonel yükü büyütür. Tek şema + RLS,
> izolasyonu DB katmanında zorunlu kılarken Prisma ile sorunsuz çalışır.

### 5.3 ORM: Prisma

**Neden Prisma?**

- **Type Safety:** Compile-time hata yakalama
- **Migration:** Güvenilir schema versiyonlama
- **Prisma Studio:** Built-in veritabanı GUI
- **Modern API:** Sezgisel sorgu yazımı

**Örnek Kullanım:**
```typescript
// Type-safe ve autocomplete
const users = await prisma.user.findMany({
  where: { email: { contains: '@hotel.com' } },
  include: { tickets: true },
});
```

### 5.4 Cache: Redis

**Kullanım Alanları:**

- Oturum cache (JWT token doğrulama)
- API rate limiting
- Pub/Sub (WebSocket mesajları)
- Sık erişilen verilerin cache'i

### 5.5 Real-Time: Socket.io

**WebSocket Olayları:**

- `message:new` - Yeni mesaj geldi
- `ticket:updated` - Talep durumu değişti
- `device:alert` - Cihaz uyarısı
- `notification` - Genel bildirim

### 5.6 Job Queue: Bull

**Kullanım Alanları:**

- Otomatik mesaj gönderimi (cron)
- E-posta gönderimi
- Rapor oluşturma (arka planda)
- Cihaz sağlık kontrolleri

---

## 6. MİMARİ TASARIM

### 6.1 Modular Monolith Mimarisi

```
backend/
├── src/
│   ├── auth/              ← Kimlik doğrulama
│   ├── tenants/           ← Otel yönetimi
│   ├── users/             ← Kullanıcı yönetimi
│   ├── guests/            ← Misafir yönetimi
│   ├── conversations/     ← WhatsApp mesajlaşma
│   ├── tickets/           ← Hizmet talepleri
│   ├── infrastructure/    ← IoT cihaz yönetimi
│   ├── reports/           ← Raporlama
│   ├── notifications/     ← Bildirimler
│   ├── common/            ← Paylaşılan kod
│   └── prisma/            ← Database service
```

**Her Module İçeriği:**
```
tickets/
├── tickets.module.ts      ← Module tanımı
├── tickets.controller.ts  ← API endpoint'leri
├── tickets.service.ts     ← İş mantığı
├── dto/                   ← Data Transfer Objects
│   ├── create-ticket.dto.ts
│   └── update-ticket.dto.ts
└── entities/              ← Prisma modelleri
    └── ticket.entity.ts
```

### 6.2 Katmanlı Mimari

```
┌─────────────────────────────────────┐
│         Controller Layer            │  ← HTTP/WebSocket endpoint'leri
│   (TicketController, TicketGateway) │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Service Layer               │  ← İş mantığı
│      (TicketService)                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        Repository Layer              │  ← Veri erişimi
│    (PrismaService, Prisma Client)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│           Database                   │  ← PostgreSQL
│  (Tek şema + Row-Level Security)     │
└─────────────────────────────────────┘
```

### 6.3 Dependency Injection

```typescript
// Örnek: TicketService
@Injectable()
export class TicketService {
  constructor(
    private prisma: PrismaService,      // Database
    private notifications: NotificationService,  // Bildirim
    private events: EventEmitter2,      // Event bus
  ) {}

  async createTicket(dto: CreateTicketDto) {
    // İş mantığı
    const ticket = await this.prisma.ticket.create({...});
    
    // Event yayınla
    this.events.emit('ticket.created', ticket);
    
    // Bildirim gönder
    await this.notifications.send({...});
    
    return ticket;
  }
}
```

**Avantajları:**
- Test edilebilir (mock injection)
- Bağımlılıklar açık ve net
- Loose coupling

---

## 7. MULTI-TENANT MİMARİSİ

### 7.1 Tek Şema + Row-Level Security (RLS) Modeli

Tüm kiracılar tek bir PostgreSQL şemasını (`public`) paylaşır. İzolasyon, uygulama
kodundaki `WHERE tenant_id = ...` filtreleriyle değil, her tabloya tanımlanan **RLS
politikalarıyla veritabanı katmanında** sağlanır. Bir servis yanlışlıkla filtreyi
unutsa bile veritabanı, aktif kiracının dışındaki satırları döndürmez.

**Yapı:**
```
PostgreSQL Database (tek şema: public)
├── tenants          ← Otel kayıtları (paylaşılan, RLS yok)
│
├── users            ← tenant_id + RLS
├── guests           ← tenant_id + RLS
├── conversations    ← tenant_id + RLS
├── messages         ← tenant_id + RLS
├── tickets          ← tenant_id + RLS
├── devices          ← tenant_id + RLS
└── device_alerts    ← tenant_id + RLS
```

Her kiracıya ait tablo bir `tenant_id UUID` kolonu taşır. Kiracı verisine erişen her
tablo için RLS **aktif ve zorunlu** (`FORCE`) kılınır ve bir izolasyon politikası
tanımlanır:

```sql
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.tickets
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

> **`FORCE ROW LEVEL SECURITY` neden gerekli?** Bir tablonun sahibi (owner) rolü,
> RLS politikalarını varsayılan olarak *baypas eder*. Uygulama, migration'ları
> çalıştıran sahip rolüyle (`hotelcrm`) bağlandığından, `FORCE` olmadan politikalar
> hiç uygulanmaz. Prod ortamında daha temiz yol, uygulamayı `BYPASSRLS` yetkisi
> **olmayan** ayrı bir rolle bağlamaktır; bu bir sonraki adım olarak planlanmıştır.

**Avantajları:**
- Tek migration yolu — Prisma ile sorunsuz çalışır
- İzolasyon DB katmanında zorunlu (kod hatası izolasyonu kıramaz)
- Yönetim kolaylığı: tek şema, tek yedek/geri yükleme akışı
- Cross-tenant analitik sorgular (yalnız yetkili bağlamda) mümkün

**Dikkat Edilecekler:**
- Her tenant tablosunda `tenant_id` üzerinde uygun indeks şart (bkz. §7.3)
- Bağlantı havuzunda (pooling) oturum değişkeni sızmaması için `SET LOCAL`
  yalnızca transaction içinde kullanılır (bkz. §7.2)

### 7.2 Tenant Context ve İzolasyon Soyutlaması

Her istekte kiracı bağlamı iki adımda kurulur:

1. **`TenantMiddleware`** — isteğin `x-tenant-id` başlığını okur, kiracıyı çözer ve
   request'e ekler.
2. **Tenant-aware erişim katmanı** — kiracı verisine dokunan her işlem bir
   transaction içinde çalışır; transaction başında oturum değişkeni yazılır ve RLS
   politikaları bu değişkeni okur.

```typescript
// 1) Middleware: x-tenant-id başlığını çöz
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    if (tenantId) req['tenantId'] = tenantId;
    next();
  }
}

// 2) Tenant-aware erişim: SET LOCAL + transaction
//    RLS, current_setting('app.current_tenant_id') değerini okur.
async runInTenantContext<T>(
  tenantId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return this.prisma.$transaction(async (tx) => {
    // SET LOCAL yalnız bu transaction boyunca geçerlidir (pool-safe).
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return work(tx);
  });
}
```

**İzolasyon bir soyutlamanın arkasındadır.** Feature modülleri (tickets, guests, …)
"RLS mi search_path mi" bilmez; yalnızca "şu anki kiracının verisi" ile çalışır.
Mekanizma değişse bile modül kodu değişmez.

### 7.3 İndeksleme

RLS politikaları her satır için `tenant_id = current_setting(...)` koşulunu
uyguladığından, `tenant_id` her tenant tablosunda indekslenir. Sık sorgulanan
kolonlar `tenant_id` ile **bileşik (composite)** indekslere alınır ki politika,
indeks kullanımını bozmasın:

```sql
CREATE INDEX idx_tickets_tenant           ON public.tickets(tenant_id);
CREATE INDEX idx_tickets_tenant_status    ON public.tickets(tenant_id, status);
CREATE INDEX idx_tickets_tenant_assigned  ON public.tickets(tenant_id, assigned_to);
```

### 7.4 Karar Evrimi

Bu sistem **önce schema-per-tenant** (her otel için ayrı PostgreSQL şeması, birebir
aynı tablolar) olarak tasarlanmıştı. Uygulama aşamasında iki kısıt öne çıktı ve
tasarım **tek şema + RLS**'e taşındı:

- **Prisma uyumu:** Prisma tek bir şemaya karşı tek bir migration/istemci modeli
  bekler. Dinamik `search_path` veya şema-başına ayrı migration'lar, ORM'in doğal
  akışının dışına çıkmayı ve kırılgan runtime hileleri gerektirir.
- **Operasyonel yük:** Şema-başına migration, N kiracıya N kez migration çalıştırma,
  şema-başına yedekleme/izleme ve provisyon karmaşıklığı demektir.
- **DB katmanında zorunlu izolasyon:** RLS, izolasyonu uygulama koduna bırakmak
  yerine veritabanında garanti eder; unutulan bir `WHERE` bile veri sızdırmaz.
- **Yönetim kolaylığı:** Tek şema; tek migration yolu, tek yedek/geri yükleme akışı.

Bu tercih, tam fiziksel izolasyondan (schema-per-tenant) mantıksal ama
DB-zorunlu izolasyona (RLS) geçiştir; ölçek ve compliance ihtiyaçları değişirse
büyük kiracılar ileride ayrı veritabanına taşınabilir.

---

## 8. VERİTABANI TASARIMI

### 8.1 Paylaşılan Tablo (RLS yok)

Aşağıdaki tek tablo tüm kiracılar arasında paylaşılır; kiracıya ait değildir, bu
yüzden RLS uygulanmaz. Kalan tüm tablolar kiracıya aittir ve `tenant_id` + RLS taşır.

**tenants**
```sql
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

> Not: schema-per-tenant tasarımındaki `schema_name` kolonu kaldırıldı — artık
> ayrı şema yok, kiracı yalnızca `tenant_id` ile temsil edilir.

> Not: Bir zamanlar planlanan `tenant_users` (kullanıcı ↔ tenant ↔ rol) tablosu
> **kaldırıldı.** Kimlik modeli tek-tenant'a sabitlendi: bir kullanıcı tam olarak
> bir otele aittir (iki otelde çalışan kişinin iki ayrı hesabı olur). "Kim, hangi
> otelde, hangi rolde" bilgisi doğrudan `users` tablosunda (`tenant_id` + `role`)
> tutulur. Tek-login-çok-otel ihtiyacı ileride doğarsa, bu additive bir katman
> (üyelik tablosu + tenant-arası raporlama yolu) olarak eklenir, yeniden yazım değil.

### 8.2 Kiracıya Ait Tablolar (tenant_id + RLS)

Aşağıdaki tabloların tümü `tenant_id UUID NOT NULL` kolonu taşır, `tenants(id)`'ye
referans verir ve her biri için RLS aktif + zorunlu kılınır (bkz. §7.1). `tenant_id`
üzerinde indeks ve sık sorgulanan kolonlarla bileşik indeksler tanımlanır. Not:
schema-per-tenant tasarımında şema başına benzersiz olan `email` gibi kolonlar,
artık tek şemada `(tenant_id, email)` olarak kiracı-kapsamlı benzersizdir.

**users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role);
```

**guests**
```sql
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  whatsapp_number VARCHAR(20),
  email VARCHAR(255),
  room_number VARCHAR(10),
  check_in_date DATE,
  check_out_date DATE,
  status VARCHAR(50) DEFAULT 'checked_in',
  notes TEXT,
  preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guests_tenant ON guests(tenant_id);
CREATE INDEX idx_guests_tenant_phone ON guests(tenant_id, phone);
CREATE INDEX idx_guests_tenant_room ON guests(tenant_id, room_number);
CREATE INDEX idx_guests_tenant_status ON guests(tenant_id, status);
```

**conversations**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  guest_id UUID REFERENCES guests(id),
  assigned_to UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_tenant_guest ON conversations(tenant_id, guest_id);
CREATE INDEX idx_conversations_tenant_assigned ON conversations(tenant_id, assigned_to);
CREATE INDEX idx_conversations_tenant_status ON conversations(tenant_id, status);
```

**messages**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  conversation_id UUID REFERENCES conversations(id),
  sender_type VARCHAR(50) NOT NULL, -- 'guest' or 'staff'
  sender_id UUID,
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  whatsapp_message_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_tenant_conversation ON messages(tenant_id, conversation_id);
CREATE INDEX idx_messages_tenant_created_at ON messages(tenant_id, created_at DESC);
```

**tickets**
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  guest_id UUID REFERENCES guests(id),
  conversation_id UUID REFERENCES conversations(id),
  category VARCHAR(100) NOT NULL,
  priority VARCHAR(50) DEFAULT 'medium',
  status VARCHAR(50) DEFAULT 'pending',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  room_number VARCHAR(10),
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX idx_tickets_tenant_guest ON tickets(tenant_id, guest_id);
CREATE INDEX idx_tickets_tenant_status ON tickets(tenant_id, status);
CREATE INDEX idx_tickets_tenant_assigned ON tickets(tenant_id, assigned_to);
CREATE INDEX idx_tickets_tenant_category ON tickets(tenant_id, category);
CREATE INDEX idx_tickets_tenant_created_at ON tickets(tenant_id, created_at DESC);
```

**devices**
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  device_type VARCHAR(100) NOT NULL,
  model VARCHAR(255),
  serial_number VARCHAR(255),
  location VARCHAR(255),
  floor VARCHAR(50),
  ip_address VARCHAR(50),
  status VARCHAR(50) DEFAULT 'online',
  last_heartbeat_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_tenant_type ON devices(tenant_id, device_type);
CREATE INDEX idx_devices_tenant_status ON devices(tenant_id, status);
CREATE INDEX idx_devices_tenant_location ON devices(tenant_id, location);
```

**device_alerts**
```sql
CREATE TABLE device_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  device_id UUID REFERENCES devices(id),
  alert_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) DEFAULT 'medium',
  message TEXT NOT NULL,
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_alerts_tenant ON device_alerts(tenant_id);
CREATE INDEX idx_device_alerts_tenant_device ON device_alerts(tenant_id, device_id);
CREATE INDEX idx_device_alerts_tenant_severity ON device_alerts(tenant_id, severity);
CREATE INDEX idx_device_alerts_tenant_ack ON device_alerts(tenant_id, is_acknowledged);
```

### 8.3 RLS Kurulumu

Kiracıya ait her tablo için migration, tabloları/indeksleri oluşturmanın yanında
RLS'i etkinleştirir ve izolasyon politikasını tanımlar. Prisma migration'ları raw
SQL adımlarını desteklediğinden, bu adım migration dosyasının sonuna eklenir:

```sql
-- Örnek: tickets tablosu için (her tenant tablosu için tekrarlanır)
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" FORCE  ROW LEVEL SECURITY;  -- sahip rolü de baypas edemesin

CREATE POLICY tenant_isolation ON "tickets"
  USING      ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);
```

`current_setting(..., true)` ikinci argümanı `true` olduğundan, oturum değişkeni
ayarlı değilken hata fırlatmaz; bunun yerine `NULL` döner ve hiçbir satır eşleşmez
(güvenli varsayılan: bağlam yoksa veri yok).

### 8.4 Migration Stratejisi

**İlk Kurulum:**
1. `public` şemasındaki tüm tabloları tek migration ile oluştur
2. Kiracı tablolarında RLS'i etkinleştir + politikaları tanımla (aynı migration)
3. `tenants`'a ilk kiracıyı, `users`'a ilk kullanıcıları ekle (seed)

**Güncelleme:**
```bash
# Tek şema → tek migration yolu. Şema-başına döngü yok.
npx prisma migrate dev --name add_guest_preferences
```

**Rollback Stratejisi:**
- Her migration geri alınabilir
- Backup alınmadan migration yapılmaz
- Hatalı migration durumunda otomatik rollback

---

## 9. API TASARIMI

### 9.1 RESTful Endpoint'ler

**Auth Endpoints**
```
POST   /auth/login              - Giriş yap
POST   /auth/logout             - Çıkış yap
POST   /auth/refresh            - Token yenile
GET    /auth/me                 - Mevcut kullanıcı bilgisi
```

**User Endpoints**
```
GET    /users                   - Kullanıcıları listele
POST   /users                   - Yeni kullanıcı oluştur
GET    /users/:id               - Kullanıcı detayı
PATCH  /users/:id               - Kullanıcı güncelle
DELETE /users/:id               - Kullanıcı sil
```

**Guest Endpoints**
```
GET    /guests                  - Misafirleri listele
POST   /guests                  - Yeni misafir kaydet
GET    /guests/:id              - Misafir detayı
PATCH  /guests/:id              - Misafir güncelle
GET    /guests/:id/history      - Misafir geçmişi
```

**Conversation Endpoints**
```
GET    /conversations           - Konuşmaları listele
POST   /conversations           - Yeni konuşma başlat
GET    /conversations/:id       - Konuşma detayı
GET    /conversations/:id/messages - Mesajları getir
POST   /conversations/:id/messages - Mesaj gönder
PATCH  /conversations/:id/assign   - Konuşma ata
```

**Ticket Endpoints**
```
GET    /tickets                 - Talepleri listele
POST   /tickets                 - Yeni talep oluştur
GET    /tickets/:id             - Talep detayı
PATCH  /tickets/:id             - Talep güncelle
PATCH  /tickets/:id/assign      - Talep ata
PATCH  /tickets/:id/status      - Durum değiştir
POST   /tickets/:id/resolve     - Talebi çöz
```

**Device Endpoints**
```
GET    /devices                 - Cihazları listele
POST   /devices                 - Yeni cihaz kaydet
GET    /devices/:id             - Cihaz detayı
PATCH  /devices/:id             - Cihaz güncelle
GET    /devices/:id/alerts      - Cihaz uyarıları
POST   /devices/:id/heartbeat   - Canlılık sinyali
```

**Report Endpoints**
```
GET    /reports/tickets         - Talep raporları
GET    /reports/devices         - Cihaz raporları
GET    /reports/satisfaction    - Memnuniyet raporları
```

### 9.2 Request/Response Formatı

**Standard Response:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-25T12:00:00Z",
    "requestId": "uuid"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "TICKET_NOT_FOUND",
    "message": "Belirtilen talep bulunamadı",
    "details": {}
  },
  "meta": {
    "timestamp": "2026-02-25T12:00:00Z",
    "requestId": "uuid"
  }
}
```

**Pagination:**
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

### 9.3 Validation

**DTO Örneği:**
```typescript
import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateTicketDto {
  @IsUUID()
  guestId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['room_service', 'housekeeping', 'technical', 'reception'])
  category: string;

  @IsEnum(['low', 'medium', 'high', 'urgent'])
  @IsOptional()
  priority?: string;
}
```

---

## 10. KİMLİK DOĞRULAMA VE YETKİLENDİRME

### 10.1 JWT Authentication

**Token Yapısı:**
```json
{
  "sub": "user-uuid",
  "email": "user@hotel.com",
  "tenants": [
    { "tenantId": "abc", "role": "admin" },
    { "tenantId": "xyz", "role": "staff" }
  ],
  "iat": 1234567890,
  "exp": 1234654290
}
```

**Access Token:** 24 saat  
**Refresh Token:** 30 gün

### 10.2 Role-Based Access Control (RBAC)

**Roller:**

| Rol | İzinler |
|-----|---------|
| **admin** | Tüm yetkiler (sistem yönetimi dahil) |
| **manager** | Kullanıcı yönetimi, raporlar, talep atama |
| **staff** | Talepleri görüntüleme ve yanıtlama |

**Permission Guard Örneği:**
```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('tickets:assign')
@Patch(':id/assign')
async assignTicket(@Param('id') id: string, @Body() dto: AssignTicketDto) {
  return this.ticketService.assign(id, dto);
}
```

### 10.3 Tenant Erişim Kontrolü

```typescript
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.headers['x-tenant-id'];
    
    // Kullanıcının bu tenant'a erişimi var mı?
    return user.tenants.some(t => t.tenantId === tenantId);
  }
}
```

---

## 11. REAL-TIME İLETİŞİM

### 11.1 WebSocket Events

**Client → Server:**
```typescript
socket.emit('conversation:join', { conversationId });
socket.emit('message:send', { conversationId, content });
socket.emit('ticket:subscribe', { ticketId });
```

**Server → Client:**
```typescript
socket.emit('message:new', { conversationId, message });
socket.emit('ticket:updated', { ticketId, status });
socket.emit('device:alert', { deviceId, alert });
socket.emit('notification', { type, data });
```

### 11.2 Socket.io Gateway

```typescript
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('message:send')
  async handleMessage(
    @MessageBody() data: SendMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    const message = await this.messagesService.create(data);
    
    // Konuşmadaki herkese gönder
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('message:new', message);
  }
}
```

### 11.3 Pub/Sub Pattern (Redis)

**Çoklu Instance Desteği:**
```typescript
// Instance A'da mesaj oluşturuldu
await redis.publish('messages', JSON.stringify({
  event: 'message:new',
  data: message,
}));

// Instance B bu event'i dinliyor
redis.subscribe('messages', (message) => {
  const event = JSON.parse(message);
  io.emit(event.event, event.data);
});
```

---

## 12. ENTEGRASYONLAR

### 12.1 WhatsApp Business API

**Provider:** Twilio / Meta Cloud API

**Webhook Endpoint:**
```
POST /webhooks/whatsapp
```

**İş Akışı:**
```
1. Misafir WhatsApp'tan mesaj gönderir
2. Provider webhook'u tetikler
3. Backend mesajı alır ve veritabanına kaydeder
4. Eğer yeni konuşma ise oluşturur
5. WebSocket ile frontend'e bildirim gönderir
6. Personel yanıt yazar
7. Backend yanıtı provider'a gönderir
8. Provider WhatsApp'a iletir
```

**Rate Limiting:**
- Günlük 1000 mesaj limiti (Business API)
- Bulk mesaj için ayrı kuyruk

### 12.2 IoT Cihaz Entegrasyonu

**Protokoller:**
- HTTP (REST API)
- MQTT (publish/subscribe)
- WebSocket (iki yönlü)

**Cihaz Kaydı:**
```typescript
POST /devices/register
{
  "deviceId": "cam-001",
  "type": "camera",
  "location": "lobby",
  "protocol": "mqtt"
}
```

**Heartbeat:**
```typescript
POST /devices/:id/heartbeat
{
  "timestamp": "2026-02-25T12:00:00Z",
  "status": "online",
  "metrics": {
    "uptime": 86400,
    "temperature": 45
  }
}
```

**Alert:**
```typescript
POST /devices/:id/alert
{
  "type": "connection_lost",
  "severity": "high",
  "message": "Kamera bağlantısı kesildi"
}
```

---

## 13. GÜVENLİK

### 13.1 Kimlik Doğrulama Güvenliği

- **Bcrypt** ile şifre hash (cost: 12)
- **JWT** ile stateless auth
- **Refresh token** rotation
- **Rate limiting** (5 başarısız giriş = 15 dk block)
- **2FA** (opsiyonel, ileride eklenebilir)

### 13.2 API Güvenliği

- **Helmet.js** - HTTP header güvenliği
- **CORS** - Sadece izinli origin'ler
- **Rate Limiting** - IP bazlı istek limiti
- **Input Validation** - DTO ve Pipes ile
- **SQL Injection** - Prisma ORM ile önlenir
- **XSS Protection** - Sanitization

### 13.3 Veri Güvenliği

- **Encryption at Rest** - Database seviyesinde
- **Encryption in Transit** - TLS/SSL zorunlu
- **PII Masking** - Loglardan hassas veri çıkar
- **Audit Logging** - Tüm kritik işlemler loglanır

### 13.4 KVKK Uyumu

- **Veri Minimizasyonu** - Sadece gerekli veri toplanır
- **Amaç Sınırlaması** - Toplanan veri amacına uygun kullanılır
- **Saklama Süresi** - Check-out sonrası 1 yıl
- **Silme Hakkı** - Kullanıcı verilerini silebilir
- **Taşınabilirlik** - Verileri export edebilir

---

## 14. PERFORMANS VE ÖLÇEKLEME

### 14.1 Caching Stratejisi

| Veri Türü | Cache Süresi | Invalidation |
|-----------|--------------|--------------|
| Kullanıcı bilgileri | 5 dakika | Güncelleme sonrası |
| Otel ayarları | 10 dakika | Manuel temizleme |
| Talep listesi | 1 dakika | Yeni talep veya güncelleme |
| Cihaz durumları | 30 saniye | Heartbeat geldiğinde |

### 14.2 Database Optimization

- **Indexler:** Sık sorgulanan kolonlarda
- **Connection Pool:** Max 20 connection
- **Query Optimization:** N+1 problem önleme
- **Pagination:** Tüm listeler sayfalı

### 14.3 Horizontal Scaling

```
Load Balancer
      │
      ├──► App Instance 1
      ├──► App Instance 2
      └──► App Instance 3
           │
           └──► Shared Redis
           └──► Shared PostgreSQL
```

### 14.4 Performans Hedefleri

| Metric | Target |
|--------|--------|
| API Response Time (P95) | < 200ms |
| WebSocket Latency | < 100ms |
| Database Query Time | < 50ms |
| Cache Hit Rate | > 80% |
| Uptime | 99.9% |

---

## 15. RİSKLER VE AZALTMA STRATEJİLERİ

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| WhatsApp API kesintisi | Orta | Yüksek | Fallback SMS, offline queue |
| Database migration hatası | Düşük | Kritik | Snapshot backup, rollback planı |
| Tenant veri sızıntısı | Düşük | Kritik | Row-level security, audit logs |
| Yüksek trafik | Orta | Orta | Auto-scaling, cache, CDN |
| Developer turnover | Yüksek | Orta | Dokümantasyon, kod review |

---

## 16. SONRAKİ ADIMLAR

### Faz 1: Temel Altyapı (Hafta 1-2)
- [x] NestJS projesi kurulumu
- [x] Prisma ORM entegrasyonu
- [x] PostgreSQL bağlantısı
- [ ] Auth module (JWT)
- [ ] Tenant module
- [ ] User CRUD

### Faz 2: Core Features (Hafta 3-4)
- [ ] Guest module
- [ ] Conversation module
- [ ] Message gönderme/alma
- [ ] WhatsApp webhook
- [ ] WebSocket setup

### Faz 3: Ticket System (Hafta 5-6)
- [ ] Ticket CRUD
- [ ] Atama mekanizması
- [ ] Durum yönetimi
- [ ] Bildirimler

### Faz 4: Infrastructure (Hafta 7-8)
- [ ] Device module
- [ ] Alert system
- [ ] Heartbeat monitoring
- [ ] Temel raporlar

### Faz 5: Polish & Deploy (Hafta 9-10)
- [ ] Error handling
- [ ] Logging
- [ ] Testing
- [ ] Documentation
- [ ] Fly.io deployment

---

## TERIMLER SÖZLÜĞÜ

| Terim | Açıklama |
|-------|----------|
| **DTO** | Data Transfer Object - Veri transfer nesnesi |
| **JWT** | JSON Web Token - Kimlik doğrulama token'ı |
| **ORM** | Object-Relational Mapping - Nesne-ilişkisel eşleme |
| **RBAC** | Role-Based Access Control - Rol bazlı erişim kontrolü |
| **WebSocket** | İki yönlü gerçek zamanlı iletişim protokolü |
| **Multi-Tenant** | Çoklu kiracı - Her müşteri izole ortam |
| **Schema** | Veritabanı şeması - Tablo yapısı |
| **Migration** | Veritabanı versiyonlama |
| **Pub/Sub** | Publish/Subscribe - Mesaj yayınlama/dinleme |
| **IoT** | Internet of Things - Nesnelerin interneti |

---

**Belge Sonu**

*Bu belge, otel CRM platformunun backend mimarisini tanımlar ve geliştirme ekibine rehberlik eder.*
