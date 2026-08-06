# RLS Politikaları — Uygulanan Durum ve Çalışma Kitabı (Runbook)

> Diğer `.docs/*.md` dosyaları **hedef tasarımı** anlatır. Bu dosya farklı: burada
> **fiilen uygulanmış** RLS kurulumu, "neden böyle" gerekçeleri ve yeni tablo
> eklerken izlenecek adımlar var. Kod/SQL değiştikçe **bu dosya elle güncellenmeli**.
> İlgili kaynaklar: `backend/prisma/schema.prisma`,
> `backend/prisma/migrations/20260710120000_single_schema_rls/migration.sql`,
> `backend/src/common/tenant/*`, `docker/postgres/init/01-app-role.sql`.

## 1. Model özeti

Tek şema (`public`) + PostgreSQL Row-Level Security. Şema-per-tenant **değil**.

- **Paylaşılan tablo (RLS YOK):** `tenants`. Yönetimseldir ve tenant bağlamı
  kurulmadan sorgulanabilir. (Bir zamanlar planlanan `tenant_users` kaldırıldı —
  kimlik modeli tek-tenant; bkz. Backend_Architecture §8.1.)
- **Kiracıya ait tablolar (tenant_id + RLS):** `users`, `guests`, `conversations`,
  `messages`, `tickets`, `devices`, `device_alerts`. Her biri `tenant_id uuid NOT NULL`
  taşır ve `tenant_isolation` policy'siyle korunur.

## 2. İki-rol kuralı (EN KRİTİK NOKTA)

RLS yalnızca **superuser OLMAYAN** ve **BYPASSRLS OLMAYAN** roller için uygulanır.
`FORCE ROW LEVEL SECURITY` bile superuser'ı durduramaz. Bu yüzden:

| Rol | Yetki | Nerede | Env |
|-----|-------|--------|-----|
| `hotelcrm` | superuser — DDL/migration | Prisma Migrate | `DIRECT_DATABASE_URL` (`directUrl`) |
| `hotelcrm_app` | NOSUPERUSER NOBYPASSRLS — sadece DML | Uygulama runtime | `DATABASE_URL` |

Runtime'ı superuser/owner rolle bağlarsan **izolasyon sessizce çöker** (her tenant
her satırı görür). Bu her ortam için geçerlidir — sadece lokal bir ayar değildir.
Rol `docker/postgres/init/01-app-role.sql` ile provision edilir (boş volume'de
otomatik; mevcut volume'de elle bir kez uygulanır — idempotent).

## 3. İzolasyon nasıl çalışır

1. İstek `x-tenant-id` header'ı taşır. `TenantMiddleware` bunu `req.tenantId`'ye koyar.
2. `TenantPrismaService.run()` her işi bir transaction içinde açar ve ilk iş olarak:
   ```sql
   SELECT set_config('app.current_tenant_id', <tenantId>, true);
   ```
   `is_local = true` → değer transaction sonunda sıfırlanır, havuzdaki (pooler)
   bağlantılar arasında sızmaz.
3. Policy bu oturum değişkenini okur:
   ```sql
   CREATE POLICY tenant_isolation ON <table>
     USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
   ```
   - `USING` → hangi satırlar **okunabilir/görünür** (SELECT/UPDATE/DELETE).
   - `WITH CHECK` → hangi satırlar **yazılabilir** (INSERT/UPDATE). Başka tenant'ın
     id'siyle satır yazmayı engeller.
   - `current_setting(..., true)` ikinci arg = `missing_ok`: değişken set değilse
     `NULL` döner, `tenant_id = NULL` → hiçbir satır. Yani **bağlam yoksa 0 satır**.

Her kiracı tablosu ayrıca `FORCE ROW LEVEL SECURITY` kullanır ki tablo sahibi
(owner) bile policy'lere tabi olsun.

## 4. Önemli davranışlar / tuzaklar

- **INSERT'te `tenant_id`'yi uygulama doldurur.** RLS satırları *filtreler*, kolonu
  *doldurmaz*. Servis katmanı `tenantId`'yi `TenantPrismaService.run((tx, tenantId) => …)`
  üzerinden alıp insert'e yazar.
- **Bağlam yoksa yazma da başarısız olur** (WITH CHECK NULL'a düşer). Header'sız
  istek zaten `requireTenantId()` ile 400 alır.
- **Prisma policy'leri yönetmez.** Yeni tablo eklerken policy'i elle yazmazsan tablo
  RLS'siz kalır → sızıntı. Bkz. §5.
- **Migration'lar superuser ile koşar** (owner), bu yüzden migration içinden yapılan
  veri işlemleri RLS'e tabi değildir; bu beklenen davranıştır.

## 5. Yeni kiracı tablosu eklerken (drift'i önleyen checklist)

Her yeni **tenant-scoped** tablo için:

1. `schema.prisma`'da modele `tenantId String @map("tenant_id") @db.Uuid` + `tenant`
   ilişkisi + `@@index([tenantId])` ekle.
2. `npx prisma migrate dev --name <ad>` ile migration üret.
3. Üretilen migration SQL'inin sonuna RLS bloğunu **elle** ekle:
   ```sql
   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "<table>" FORCE  ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "<table>"
     USING      ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid)
     WITH CHECK ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);
   ```
4. `hotelcrm_app` yetkileri: `ALTER DEFAULT PRIVILEGES` sayesinde yeni tablolar
   otomatik granted gelir (init script'e bakın). Ekstra iş gerekmez.
5. Bu dosyanın §1 listesine tabloyu ekle.
6. §6'daki testle izolasyonu doğrula.

> Paylaşılan/yönetimsel bir tablo ekliyorsan (tenant'a bağlı değilse) RLS ekleme —
> ama bunun bilinçli bir karar olduğundan emin ol.

## 6. İzolasyonu doğrulama

İki tenant tohumlu olmalı (`tenants` tablosunda). Uygulama ayaktayken:

```bash
A=11111111-1111-1111-1111-111111111111   # Hotel Alpha
B=22222222-2222-2222-2222-222222222222   # Hotel Beta

# Alpha yalnız kendi kullanıcılarını görmeli
curl -s localhost:3000/users -H "x-tenant-id: $A"
# Beta yalnız kendi kullanıcılarını görmeli
curl -s localhost:3000/users -H "x-tenant-id: $B"
# Bağlam yoksa reddedilir
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/users   # -> 400
```

DB tarafında rol bayraklarını doğrulama (runtime rolü asla superuser olmamalı):
```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'hotelcrm_app';
-- beklenen: f | f
```

Bir tablonun RLS durumunu görme:
```sql
SELECT relname, relrowsecurity AS enabled, relforcerowsecurity AS forced
FROM pg_class WHERE relname = '<table>';
```

Bruno karşılığı: `backend/api/bruno` altında "List users" (Alpha) ve
"List users as Beta" isteklerini peş peşe koşarak aynı izolasyonu görebilirsin.
