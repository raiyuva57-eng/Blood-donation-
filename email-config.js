/* ============================================
   LifeDrop — EmailJS configuration
   ============================================
   This is the ONLY file you need to edit to make real OTP emails send.

   1. Create a free account at https://www.emailjs.com
   2. Add an Email Service (e.g. connect your Gmail) → copy its Service ID
   3. Create an Email Template with these variables in the body:
        {{to_email}}       - the recipient's address
        {{otp_code}}       - the 6-digit code
        {{expires_minutes}} - how many minutes the code is valid for
      → copy the Template ID
   4. Go to Account → General → copy your Public Key
   5. Paste all three values below.

   SECURITY: only ever put your PUBLIC key here. EmailJS also has a
   "Private Key" / access token in Account → Security — that one must
   NEVER go in this file or anywhere else in browser-visible code, since
   anyone can view this file's source. The public key is safe to expose;
   EmailJS is specifically designed for that.

   If these are left blank, the app automatically falls back to showing
   the OTP on-screen instead of emailing it, so the reset flow still
   works for local testing without an EmailJS account.
   ============================================ */

window.LifeDropEmailConfig = {
  publicKey: '',   // e.g. 'AbCdEfGhIjKlMnOp'
  serviceId: '',   // e.g. 'service_abc1234'
  templateId: '',  // e.g. 'template_xyz9876'
};
