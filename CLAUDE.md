@AGENTS.md

# Gebzem — Claude Code başlangıç notları

Yeni bir oturumda önce şunları oku:
1. `docs/PROJE-DURUMU.md` — güncel durum, dış servisler, sıradaki işler, sahibin onayını bekleyenler
2. `docs/OTURUM-GUNLUGU.md` — A'dan Z'ye geçmiş: ne istendi, ne yapıldı, kararlar, hatalar ve dersler
3. `docs/MIMARI-AGAC.md` — kod ağacı, veritabanı ve akışlar
4. `docs/SOHBET-KAYDI.md` — sahibin bütün mesajları birebir ve Claude'un yanıtları (gizli değerler çıkarılmış)
5. `docs/DEGISIKLIK-GECMISI.md` — bütün commitler eskiden yeniye

## Kurallar
- Sahiple Türkçe ve samimi konuş. Her adımda: `npx tsc --noEmit -p .`, eslint, `npx next build`, 390px ekran görüntüsü, sadece ilgili dosyalarla commit (önce gizli değer taraması), push, Vercel deploy kontrolü, kısa Türkçe özet.
- Tasarım: gölge ve kenarlık yok; lavanta zeminde beyaz kartlar; Lucide ikon, emoji yok; mor tema; ana düğme siyah; 390px; yatay sayfa kaydırması yok.
- Kapsam Kocaeli'nin 12 ilçesi; mahalle yok; haritalar Google Maps.
- Gizli değerler (token, anahtar, OTP, şifre, gerçek kullanıcı telefonu) asla dosyaya, commit'e veya çıktıya yazılmaz. `.env.local` ve `kocaeli/` git dışında.
- Admin ayrı site; admin kodunda `createAdminClient()` kullanma; uygulamadan admin'e link verme.
- Canlı veritabanında gerçek kullanıcıları etkileyen yazmalardan önce sahibin onayını al. Migration'ı önce `sql-dryrun` ile dene; `CREATE OR REPLACE` öncesi canlı tanımı oku.
- Başka projelere dokunma: Vercel `gebzem`, `gbz-ver`, `2c-gebzem`; Google Cloud `gebzem-app-push`; Cloudflare `gbz-a2cloud`, D1, Pages. gcloud: `--configuration=gbzsehir --project=gbzsehir-rehber`.
