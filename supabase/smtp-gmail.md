# Email di Mezza con Gmail (senza dominio)

Supabase, senza SMTP personalizzato, manda email solo ai membri del tuo team e al massimo 2 all'ora: gli amici non riceverebbero la conferma di registrazione.

1. Meglio un Gmail dedicato all'app (es. mezza.app.tuonome@gmail.com), non quello personale.
2. In quell'account Google: Sicurezza > attiva la verifica in due passaggi > "Password per le app" > crea una password (16 caratteri).
3. Supabase > Authentication > Emails > SMTP Settings > attiva "Enable custom SMTP":
   - Sender email: il Gmail dedicato
   - Sender name: Mezza
   - Host: smtp.gmail.com
   - Port: 465
   - Username: il Gmail dedicato
   - Password: la password per le app
4. Salva. Il limite sale a 30 email l'ora; puoi cambiarlo in Authentication > Rate Limits.
5. Edge Functions > Secrets: aggiorna SMTP_USER e SMTP_PASS con lo stesso account, così anche gli inviti partono da lì.
6. Solo ora, in Authentication > Emails, puoi modificare i testi: incolla quelli di email-templates.md.
