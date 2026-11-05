# Soundsnap İndirici (Chrome Eklentisi)

Soundsnap arama sonuçlarında her sesin yanına bir **indirme butonu** ekler. Butona bastığınızda sesin oynatıcıda kullanılan MP3 sürümü bilgisayarınıza indirilir.

## Kurulum

1. Chrome'da `chrome://extensions` adresini açın.
2. Sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** butonuna tıklayın.
4. Bu klasörü seçin: `soundsnap-downloader`
5. Eklenti yüklendikten sonra Soundsnap'te bir arama sayfası açın ve sayfayı yenileyin.

Chrome dışındaki Chromium tabanlı tarayıcılarda (Edge, Brave, Opera) da `edge://extensions` / `brave://extensions` gibi adreslerden aynı şekilde yüklenebilir.

## Kullanım

- Arama sonucundaki sesin altındaki aksiyon satırında indirme (aşağı ok) simgesine tıklayın.
- Ses, tarayıcının **İndirilenler** klasörüne `ses-adı.mp3` olarak kaydedilir.
- İndirme sırasında sağ altta kısa bir bildirim görünür.

## Nasıl çalışıyor?

1. Eklenti, sayfadaki `dynamic_data` içinden Soundsnap'in herkese açık Typesense arama anahtarını okur.
2. Ses kimliği (nid) ile Typesense'ten sesin dosya yolunu bulur.
3. Soundsnap'in oynatıcısının kullandığı `/play?t=e&p=...` adresini oturum çerezleriyle çağırır.
4. Sunucunun döndürdüğü imzalı MP3 bağlantısını tarayıcıya indirtir.

## Notlar

- İndirilen dosya, sitedeki **önizleme/akış MP3** sürümüdür; orijinal 96 kHz / 24-bit WAV dosyası abonelik gerektirir.
- Ses henüz sunucuda hazır değilse eklenti birkaç kez otomatik dener. Yine olmazsa sesi sayfada bir kez oynatıp butona tekrar basın.
- Seslerin lisansı Soundsnap'in kendi lisans koşullarına tabidir. Kişisel/deneme kullanımı için indirin; ticari kullanımda lisansı kontrol edin.
