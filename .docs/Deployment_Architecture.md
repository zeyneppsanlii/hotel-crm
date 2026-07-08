# OTEL YÖNETİM SİSTEMİ
## Deployment ve Altyapı Mimarisi

**Versiyon:** 1.0  
**Tarih:** 25 Şubat 2026  
**Durum:** Onay Bekliyor

---

## İÇİNDEKİLER

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Platform Seçimi](#2-platform-seçimi)
3. [Deployment Mimarisi](#3-deployment-mimarisi)
4. [CI/CD Pipeline](#4-cicd-pipeline)
5. [Güvenlik](#5-güvenlik)
6. [İzleme ve Yedekleme](#6-izleme-ve-yedekleme)
7. [Maliyet Modeli](#7-maliyet-modeli)
8. [Ölçekleme Stratejisi](#8-ölçekleme-stratejisi)

---

## 1. YÖNETİCİ ÖZETİ

Bu belge, otel CRM platformunun üretim ortamına deploy edilmesi için gereken altyapı mimarisini tanımlar.

### 1.1 Platform Kararları

| Servis | Platform | Gerekçe |
|--------|----------|---------|
| **Backend Hosting** | Fly.io | Docker-native, WebSocket desteği |
| **Frontend Hosting** | Fly.io | SSR desteği, düşük latency |
| **Database** | Fly.io Postgres | Managed, otomatik yedek |
| **Cache** | Upstash Redis | Serverless, kullanım bazlı fiyat |
| **Storage** | Tigris | S3-uyumlu, Fly.io native |
| **CDN/DNS** | Cloudflare | Ücretsiz, DDoS koruması |
| **CI/CD** | GitHub Actions | Ücretsiz, kolay entegrasyon |

### 1.2 Tahmini Maliyet

**MVP (1-5 otel):** ~$60/ay  
**Büyüme (10-25 otel):** ~$130-170/ay

---

## 2. PLATFORM SEÇİMİ

### 2.1 Neden Fly.io?

**Avantajlar:**
- ✅ Docker-native (Dockerfile'ı olduğu gibi kullanır)
- ✅ WebSocket desteği (sticky session built-in)
- ✅ Multi-region deployment kolay
- ✅ Düşük vendor lock-in (Docker taşınabilir)
- ✅ Makul fiyat (~$60/ay MVP için)

**Dezavantajlar:**
- ⚠️ Dashboard Railway kadar kullanıcı dostu değil
- ⚠️ Öğrenme eğrisi biraz daha dik

### 2.2 Elenen Alternatifler

| Platform | Neden Elendi |
|----------|--------------|
| **AWS/GCP/Azure** | Kompleks, pahalı, ekip için orantısız |
| **Serverless** | WebSocket uyumsuz (persistent connection gerekli) |
| **VPS (Hetzner/DO)** | Operasyonel yük çok yüksek (küçük ekip için) |
| **Vercel** | Backend WebSocket kısıtlı |

### 2.3 Kubernetes?

**Şimdi değil.** İleride (50+ otel, 5+ dev) geçilebilir:
- Managed Kubernetes (Civo, DOKS)
- Deployment belgede migration planı hazır

---

## 3. DEPLOYMENT MİMARİSİ

### 3.1 Genel Mimari

```
┌─────────────────────────────────────────┐
│           CLOUDFLARE                     │
│  DNS + CDN + DDoS + WAF + SSL           │
└───────────────┬─────────────────────────┘
                │ HTTPS
        ┌───────┼───────┐
        │       │       │
  ┌─────▼───┐ ┌▼──────┐ ┌▼─────────┐
  │Frontend │ │Backend│ │  Static  │
  │Next.js  │ │NestJS │ │  Assets  │
  │Fly.io   │ │Fly.io │ │Tigris/R2 │
  └─────────┘ └───┬───┘ └──────────┘
                  │
      ┌───────────┼──────────┐
      │           │          │
  ┌───▼──┐ ┌──────▼───┐ ┌───▼────┐
  │Fly.io│ │ Upstash  │ │ Tigris │
  │Postgr│ │  Redis   │ │Storage │
  └──────┘ └──────────┘ └────────┘
```

### 3.2 Backend Deployment

**Fly.io Configuration (fly.toml):**
```toml
app = "hotel-crm-backend"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 3000
  protocol = "tcp"
  
  [services.concurrency]
    hard_limit = 100
    soft_limit = 80
  
  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[env]
  NODE_ENV = "production"
  PORT = "3000"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

**Dockerfile (Multi-stage):**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health
CMD ["node", "dist/main.js"]
```

**Instance Stratejisi:**
- **Development:** 1 instance (shared-cpu-1x, 256MB)
- **Staging:** 1 instance (shared-cpu-1x, 512MB)
- **Production:** 2 instances minimum (High Availability)

### 3.3 Frontend Deployment

**fly.toml:**
```toml
app = "hotel-crm-frontend"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile.frontend"

[[services]]
  internal_port = 3001
  protocol = "tcp"
  
  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

[env]
  NODE_ENV = "production"
  PORT = "3001"
```

### 3.4 Database (Fly.io Postgres)

**Kurulum:**
```bash
flyctl postgres create \
  --name hotel-crm-db \
  --region fra \
  --vm-size shared-cpu-1x \
  --volume-size 10

flyctl postgres attach hotel-crm-db --app hotel-crm-backend
```

**Özellikler:**
- Primary node (1 instance)
- Günlük otomatik snapshot (7 gün saklama)
- PgBouncer (connection pooling)
- 10 GB başlangıç, ölçeklenebilir

### 3.5 Redis (Upstash)

**Kullanım Alanları:**
- WebSocket pub/sub
- Oturum cache
- API rate limiting
- Tenant config cache

**Pricing:** Serverless - 10,000 komut/gün ücretsiz

### 3.6 File Storage (Tigris)

**Buckets:**
- `hotel-crm-guests` - Misafir belgeleri (private)
- `hotel-crm-assets` - Cihaz görselleri (private)
- `hotel-crm-reports` - Raporlar (private)
- `hotel-crm-public` - Logo, medya (public)

**S3-Compatible API:**
```typescript
const s3 = new S3Client({
  endpoint: process.env.TIGRIS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY,
    secretAccessKey: process.env.TIGRIS_SECRET_KEY,
  },
});
```

---

## 4. CI/CD PIPELINE

### 4.1 Git Branching Model

```
main ────────────────────────── PRODUCTION
  │
  └── staging ──────────────── STAGING
         │
         ├── feature/xxx ──── Developer A
         └── fix/yyy ─────── Developer B
```

### 4.2 GitHub Actions - Staging

**.github/workflows/staging.yml:**
```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only --app hotel-crm-backend-staging
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_STAGING }}
```

### 4.3 GitHub Actions - Production

**.github/workflows/production.yml:**
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run test:e2e
      - run: npm run build

  migrate:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          flyctl ssh console -a hotel-crm-backend \
            -C "npm run migration:run"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only --strategy rolling
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

  health-check:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - run: |
          sleep 30
          curl -f https://api.hotel-crm.com/health || exit 1
```

### 4.4 Rollback Stratejisi

**Hızlı Rollback:**
```bash
flyctl releases rollback --app hotel-crm-backend
```

**Migration Rollback:**
```bash
flyctl ssh console -a hotel-crm-backend \
  -C "npm run migration:revert"
```

---

## 5. GÜVENLİK

### 5.1 Ağ Güvenliği

| Katman | Konfigürasyon |
|--------|---------------|
| **Cloudflare Proxy** | Backend IP gizli |
| **Fly.io Private Network** | DB ve Redis internal |
| **Cloudflare WAF** | SQL injection, XSS koruması |
| **Rate Limiting** | IP bazlı istek limiti |

### 5.2 SSL/TLS

- **Cloudflare Universal SSL** (otomatik, ücretsiz)
- **Minimum TLS 1.2**
- **HSTS** enabled
- **HTTP → HTTPS** redirect zorunlu

### 5.3 Secret Management

**Fly.io Secrets:**
```bash
flyctl secrets set DATABASE_URL="postgresql://..." \
  --app hotel-crm-backend

flyctl secrets set JWT_SECRET="xxx" \
  --app hotel-crm-backend

flyctl secrets set WHATSAPP_API_KEY="xxx" \
  --app hotel-crm-backend
```

**Özellikler:**
- Şifreli saklanır
- Asla loglanmaz
- Runtime'da env variable olarak inject edilir

### 5.4 Yedekleme

| Veri Türü | Yedekleme | Saklama | Test |
|-----------|-----------|---------|------|
| **PostgreSQL** | Otomatik snapshot | 7 gün | Aylık restore testi |
| **PostgreSQL** | Manuel pg_dump | 30 gün | Çeyrek restore testi |
| **Tigris Files** | Cross-region replication | Silinene kadar | Yılda 1 |
| **Redis** | Yedeklenmez | - | Uçucu veri |

---

## 6. İZLEME VE YEDEKLEME

### 6.1 İzleme Araçları

| Araç | Ne İzler | Uyarı |
|------|----------|-------|
| **UptimeRobot** | URL ping | 2 dk kesinti |
| **Sentry** | Uygulama hataları | Hata oranı artışı |
| **Fly.io Metrics** | CPU, RAM, response time | CPU > 85% |
| **Logtail** | Uygulama logları | Kritik log |

### 6.2 Felaket Kurtarma

| Senaryo | RTO | RPO | Prosedür |
|---------|-----|-----|----------|
| **Uygulama crash** | < 5 dk | 0 | Otomatik restart |
| **Instance arızası** | < 2 dk | 0 | 2. instance devralır |
| **Database arızası** | < 30 dk | < 24 saat | Snapshot restore |
| **Platform arızası** | < 4 saat | < 24 saat | Railway/Render'a taşı |

**RTO:** Recovery Time Objective (toparlanma süresi)  
**RPO:** Recovery Point Objective (veri kaybı)

---

## 7. MALİYET MODELİ

### 7.1 MVP Maliyeti (1-5 Otel)

| Servis | Plan | Tahmini Maliyet/Ay |
|--------|------|---------------------|
| Fly.io Backend (2x) | shared-cpu-1x, 512MB | ~$20 |
| Fly.io Frontend (1x) | shared-cpu-1x, 512MB | ~$10 |
| Fly.io Postgres | 1 GB RAM, 10 GB disk | ~$20 |
| Upstash Redis | Kullanım bazlı | ~$0-5 |
| Tigris Storage | 10 GB, 100 GB transfer | ~$5 |
| Cloudflare | Free tier | $0 |
| Sentry | Free tier | $0 |
| UptimeRobot | Free tier | $0 |
| GitHub Actions | Free tier | $0 |
| Alan Adı | Yıllık | ~$2/ay |
| **TOPLAM** | | **~$57-62/ay** |

### 7.2 Büyüme Fazı (10-25 Otel)

| Servis | Güncel Plan | Tahmini |
|--------|-------------|---------|
| Fly.io Backend (3-4x) | Ek instance | ~$40-60/ay |
| Fly.io Postgres | Replica ekle | ~$40/ay |
| Upstash Redis | Kullanım artışı | ~$10-20/ay |
| Tigris Storage | Daha fazla dosya | ~$15-25/ay |
| Sentry | Team plan | ~$26/ay |
| **TOPLAM** | | **~$130-170/ay** |

---

## 8. ÖLÇEKLEME STRATEJİSİ

### 8.1 Kademeli Büyüme

| Aşama | Tetikleyici | Aksiyon |
|-------|-------------|---------|
| **Aşama 0** | 1-5 otel | Mevcut mimari |
| **Aşama 1** | CPU > 70% | Backend instance sayısını artır |
| **Aşama 2** | DB yavaşlıyor | Read replica ekle |
| **Aşama 3** | 10+ otel | Kubernetes değerlendirmesi |
| **Aşama 4** | Ekip 5+ dev | Kubernetes geçişi |
| **Aşama 5** | Multi-region | Kubernetes multi-cluster |

### 8.2 Horizontal Scaling

```
Load Balancer
      │
      ├──► App Instance 1
      ├──► App Instance 2
      ├──► App Instance 3
      └──► App Instance 4
           │
           └──► Shared Redis
           └──► Shared PostgreSQL
```

### 8.3 Kubernetes Geçiş Planı

**Ne Zaman?**
- 50+ otel
- 5+ geliştirici
- Maliyetli ölçekleme ihtiyacı

**Nasıl?**
1. Staging Kubernetes cluster kur (Civo)
2. Frontend'i K8s'e taşı (stateless, kolay)
3. Backend'i K8s'e taşı (blue-green deployment)
4. Trafiği kademeli kaydır (%10 → %50 → %100)
5. Fly.io uygulamalarını kapat

**Araçlar:**
- Managed Kubernetes: Civo, DigitalOcean DOKS
- Helm charts (hazır template'ler)
- ArgoCD (GitOps deployment)

---

## SONRAKİ ADIMLAR

### Faz 1: Kurulum (Hafta 1)
- [ ] Fly.io hesabı aç
- [ ] Cloudflare hesabı aç, domain bağla
- [ ] Backend Dockerfile hazırla
- [ ] İlk deploy (staging)

### Faz 2: Database (Hafta 2)
- [ ] Fly.io Postgres kur
- [ ] Upstash Redis kur
- [ ] Secrets yapılandır
- [ ] İlk migration çalıştır

### Faz 3: CI/CD (Hafta 3)
- [ ] GitHub Actions staging pipeline
- [ ] GitHub Actions production pipeline
- [ ] Rollback testleri

### Faz 4: Monitoring (Hafta 4)
- [ ] Sentry entegrasyonu
- [ ] UptimeRobot monitörleri
- [ ] Health check endpoint'i

### Faz 5: Production (Hafta 5)
- [ ] Production deploy
- [ ] Load test
- [ ] Disaster recovery testi
- [ ] İlk otel canlıya alınır

---

## VARSAYIMLAR

1. Ekip 1-2 geliştirici (12+ ay)
2. Veri lokasyonu zorunluluğu yok
3. İlk 12 ayda < 10 otel
4. GitHub kullanılıyor
5. Özel network politikası yok
6. Mobil uygulama yok (sadece web)
7. RTO: 4 saat kabul edilebilir
8. RPO: 24 saat kabul edilebilir

---

## TERIMLER SÖZLÜĞÜ

| Terim | Açıklama |
|-------|----------|
| **Blue-Green Deployment** | İki ortam aynı anda çalışır, risksiz geçiş |
| **CDN** | Content Delivery Network |
| **CI/CD** | Continuous Integration/Deployment |
| **PaaS** | Platform as a Service |
| **RTO** | Recovery Time Objective |
| **RPO** | Recovery Point Objective |
| **WAF** | Web Application Firewall |
| **SSL/TLS** | Şifreleme protokolü |

---

**Belge Sonu**

*Bu belge, otel CRM platformunun deployment ve altyapı mimarisini tanımlar.*
