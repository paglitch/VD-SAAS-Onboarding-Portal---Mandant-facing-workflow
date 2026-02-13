# 🚀 SESSION 15 - ONBOARDING PORTAL COMPLETION

**Start Date:** 2026-02-13
**Status:** In Progress - Session Transfer
**Priority:** HIGH - Complete Mobile Signature Sync System

---

## 📍 CURRENT STATE (Session 14 Ende)

### ✅ COMPLETED:
1. **Onboarding Portal deployed** auf `https://app.vd.steuerberater-hildebrandt.de/onboarding/`
2. **Backend API Routes** funktionieren (Token Validation, etc.)
3. **Responsive Fix** - Desktop/Mobile Toggle versteckt auf Handy
4. **Backend Routes** für Session-Sync erstellt (lokal, noch nicht deployed):
   - `/api/signature-session/create`
   - `/api/signature-session/:id`
   - `/api/signature-session/:id/submit`

### ⚠️ TEILWEISE:
- **E-Mail Button** - Geändert zu `mailto:`, sollte aber In-App Modal werden

### ❌ TODO (Session 15):
1. **E-Mail Modal** statt mailto: Link (moderne In-App Lösung)
2. **Mobile Signature Page** (`/sign/:sessionId`)
3. **Desktop Portal Update** (QR + Polling)
4. **Backend Deploy** (Session-Sync Routes)
5. **End-to-End Test**

---

## 🎯 SESSION 15 ZIELE

### 1. E-Mail Modal (In-App, modern) ✨

**Was:** Statt `mailto:` Link ein schönes Modal IN der App

**Komponenten:**
```html
<!-- Modal Overlay -->
<div id="emailModal" class="email-modal" style="display:none">
  <div class="email-modal-content">
    <h2>Nachricht an uns senden</h2>
    <form onsubmit="sendEmail(event)">
      <input type="text" placeholder="Ihr Name" required>
      <input type="email" placeholder="Ihre E-Mail" required>
      <textarea placeholder="Ihre Nachricht..." rows="5" required></textarea>
      <button type="submit">Absenden</button>
      <button type="button" onclick="closeEmailModal()">Abbrechen</button>
    </form>
  </div>
</div>
```

**Backend:**
- Neue Route: `POST /api/contact/send`
- Nutzt `emailService.sendSimpleEmail()`
- Sendet an: `daniel.hildebrandt@steuerberater-hildebrandt.de`

**Files:**
- Frontend: `vd-portal-final/01-portal/vd-portal-v11-INLINE-TOGGLES.html`
- Backend: `vd-saas-backend/src/routes/contact.routes.ts` (neu)

---

### 2. Mobile Signature Page (2026 Standard) 📱

**Was:** Separate Page `/sign/:sessionId` für mobile Unterschrift

**URL:** `https://app.vd.steuerberater-hildebrandt.de/sign/:sessionId`

**Features:**
- ✅ **Fullscreen Canvas** (wie DocuSign 2026)
- ✅ **Touch-optimiert** (Finger-Dicke anpassbar)
- ✅ **Landscape-Mode** (horizontal unterschreiben)
- ✅ **Undo/Redo/Clear** Buttons
- ✅ **Submit** → POST zu Backend

**File:** `vd-portal-final/sign.html` (NEU!)

**Design:**
```
┌─────────────────────────────────────┐
│  ← Zurück          Unterschrift     │
├─────────────────────────────────────┤
│                                      │
│                                      │
│      [Canvas - Fullscreen]          │
│       Unterschreiben Sie hier       │
│                                      │
│                                      │
├─────────────────────────────────────┤
│  [Löschen] [Zurück]  [Fertig ✓]    │
└─────────────────────────────────────┘
```

**Flow:**
1. QR-Code scannen → `/sign/:sessionId`
2. Canvas lädt
3. User unterschreibt
4. "Fertig" → POST `/api/signature-session/:sessionId/submit`
5. Success → "Signatur übertragen! ✓"

---

### 3. Desktop Portal Update (QR + Polling) 🖥️

**Was:** QR-Code generiert Session-ID, pollt für Signatur

**Changes in `vd-portal-v11-INLINE-TOGGLES.html`:**

```javascript
// Bei "Smartphone" Button-Click:
async function setM(n, m) {
  if (m === 'phone') {
    // 1. Session erstellen
    const session = await createSignatureSession();

    // 2. QR-Code generieren mit /sign/:sessionId
    const qrUrl = `${window.location.origin}/sign/${session.sessionId}`;
    new QRCode(qrEl, { text: qrUrl, ... });

    // 3. Polling starten
    startPolling(session.sessionId, n);
  }
}

async function createSignatureSession() {
  const res = await fetch('/api/signature-session/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      onboardingToken: CFG.token
    })
  });
  return res.json();
}

function startPolling(sessionId, sigIndex) {
  const interval = setInterval(async () => {
    const res = await fetch(`/api/signature-session/${sessionId}`);
    const data = await res.json();

    if (data.session.completed) {
      clearInterval(interval);

      // Signatur in Canvas übernehmen
      SIG[sigIndex].strokes = JSON.parse(data.session.signatureData);
      SIG[sigIndex].eng.rd();

      // UI Update
      document.getElementById('qz' + sigIndex).style.display = 'none';
      document.getElementById('dz' + sigIndex).style.display = 'block';
    }
  }, 2000); // Poll alle 2 Sekunden
}
```

---

### 4. Backend Deploy (Session-Sync) 🚀

**Files to deploy:**
- `vd-saas-backend/src/routes/signature-session.routes.ts` ✅ (exists)
- `vd-saas-backend/src/routes/index.ts` ✅ (updated)
- `vd-saas-backend/src/routes/contact.routes.ts` (neu für E-Mail)

**Deploy Steps:**
```bash
cd C:/Users/PeterAlze/Desktop/Übergabe/vd-saas-backend
npm run build
ssh -i ~/.ssh/vd-hetzner-key root@app.vd.steuerberater-hildebrandt.de
# Upload + PM2 restart (wie gewohnt)
```

---

### 5. Portal Deploy (All Changes) 📦

**Files to deploy:**
- `vd-portal-final/01-portal/vd-portal-v11-INLINE-TOGGLES.html` (updated)
- `vd-portal-final/sign.html` (NEU!)

**Deploy Steps:**
```bash
cd C:/Users/PeterAlze/Desktop/Übergabe/vd-portal-final
tar -czf onboarding-portal-session15.tar.gz 01-portal/ sign.html
scp -i ~/.ssh/vd-hetzner-key onboarding-portal-session15.tar.gz root@app.vd...
ssh -i ~/.ssh/vd-hetzner-key root@app.vd...
cd /var/www/onboarding-portal
tar -xzf /tmp/onboarding-portal-session15.tar.gz
```

**NGINX Update:**
```nginx
# Add to /etc/nginx/sites-available/default
location /sign/ {
    alias /var/www/onboarding-portal/;
    try_files /sign.html =404;
}
```

---

## 📋 TESTING CHECKLIST

### Desktop Flow:
- [ ] Portal öffnen mit Token
- [ ] Zu Signatur-Screen navigieren
- [ ] "Smartphone" Button klicken
- [ ] QR-Code erscheint
- [ ] QR-Code scannen (mit echtem Handy!)

### Mobile Flow:
- [ ] QR-Code scannen → `/sign/:sessionId` öffnet
- [ ] Fullscreen Canvas sichtbar
- [ ] Mit Finger unterschreiben
- [ ] "Fertig" klicken
- [ ] Success-Message erscheint

### Desktop Polling:
- [ ] Desktop zeigt "Warte auf Unterschrift..."
- [ ] Nach Mobile-Submit: Signatur erscheint auf Desktop!
- [ ] QR verschwindet, Canvas mit Signatur sichtbar
- [ ] User kann weitermachen mit Portal

### E-Mail Modal:
- [ ] "Nachricht senden" Button klicken
- [ ] Modal öffnet
- [ ] Formular ausfüllen
- [ ] Submit → E-Mail wird gesendet
- [ ] Success-Toast erscheint

---

## 🔧 TECHNICAL DETAILS

### Session Storage (In-Memory Map):
```typescript
sessions = Map<sessionId, {
  id: string;
  onboardingToken: string;
  signatureData?: string; // JSON der Canvas-Strokes
  completed: boolean;
  expiresAt: Date;
}>
```

**Cleanup:** Alle 60 Sekunden expired sessions löschen

**Alternative (später):** Redis für Production-Scale

---

### Signature Data Format:
```json
{
  "strokes": [
    {
      "p": [{"x": 10, "y": 20}, {"x": 11, "y": 21}, ...],
      "w": 2.5
    }
  ]
}
```

**Transfer:**
- Mobile → Backend: `JSON.stringify(SIG[0].strokes)`
- Backend → Desktop: `signatureData` als String
- Desktop: `JSON.parse()` + render in Canvas

---

## 🎨 UI/UX 2026 Standards

### Mobile Signature Canvas:
- **Fullscreen:** 100vh - Header (60px)
- **Canvas Size:** Min 300x200, Max 800x400
- **Pen Width:** 2.5px (Finger), 1.5px (Stift)
- **Colors:**
  - Stroke: `#4a4d4e` (dark gray)
  - Background: `#ffffff`
  - Buttons: Google Material 2026 Style

### Animations:
- **Canvas appear:** fade-up 0.3s
- **Success:** checkmark animation
- **Error:** shake animation

### Accessibility:
- **Touch targets:** Min 44x44px
- **Labels:** Clear button text
- **Feedback:** Toast messages
- **Error states:** Red border + message

---

## 📞 CONTACTS & RESOURCES

**Deployed URLs:**
- Portal: `https://app.vd.steuerberater-hildebrandt.de/onboarding/`
- Sign (neu): `https://app.vd.steuerberater-hildebrandt.de/sign/:sessionId`
- API: `https://app.vd.steuerberater-hildebrandt.de/api/`

**SSH:**
```bash
ssh -i ~/.ssh/vd-hetzner-key root@app.vd.steuerberater-hildebrandt.de
```

**Logs:**
```bash
pm2 logs
tail -f /var/log/nginx/access.log
```

---

## 💡 NEXT CHAT START

**COPY/PASTE THIS:**
```
Load context from CONTEXT.md

Ich möchte mit SESSION 15 fortfahren: Onboarding Portal Mobile Signature Sync System.

Lies bitte SESSION_15_ONBOARDING_PORTAL_TODO.md für den kompletten Plan.

Wir müssen implementieren:
1. E-Mail Modal (In-App)
2. Mobile Signature Page (/sign/:sessionId)
3. Desktop QR + Polling
4. Backend deployen
5. Testen

Ready? Let's go! 🚀
```

---

**Status:** Ready for Session 15! ✅
**Last Updated:** 2026-02-13 17:05 UTC
