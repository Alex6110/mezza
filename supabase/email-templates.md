# Email di Supabase in italiano

Dove: Authentication > Emails (modelli). Incolla oggetto e corpo. Non toccare le variabili tra doppie graffe.

## Conferma registrazione (Confirm signup)
**Oggetto:** Conferma il tuo account Mezza
```html
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h2 style="color:#0b7f73">Mezza</h2>
  <p>Ciao! Conferma il tuo indirizzo email per iniziare a dividere le spese.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0b7f73;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none">Conferma email</a></p>
  <p style="color:#666;font-size:13px">Se non hai creato tu l'account, ignora questo messaggio.</p>
</div>
```

## Recupero password (Reset password)
**Oggetto:** Reimposta la password di Mezza
```html
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h2 style="color:#0b7f73">Mezza</h2>
  <p>Hai chiesto di reimpostare la password.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0b7f73;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none">Scegli una nuova password</a></p>
  <p style="color:#666;font-size:13px">Se non l'hai chiesto tu, puoi ignorare questo messaggio: la password non cambia.</p>
</div>
```

## Cambio email (Change email address)
**Oggetto:** Conferma il cambio di email su Mezza
```html
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h2 style="color:#0b7f73">Mezza</h2>
  <p>Hai chiesto di cambiare l'email del tuo account da {{ .Email }} a {{ .NewEmail }}.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0b7f73;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none">Conferma il cambio</a></p>
  <p style="color:#666;font-size:13px">Se non sei stato tu, cambia subito la password.</p>
</div>
```
