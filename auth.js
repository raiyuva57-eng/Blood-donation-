/* ============================================
   LifeDrop — client-side auth
   ------------------------------------------
   HONEST LIMITATION: this app has no server, so there is no safe
   place to verify a password. Real authentication MUST happen on
   a server, because client-side JS can always be read and bypassed
   by whoever is using the browser. This file makes local storage
   as strong as that model allows:
     - Passwords are never stored in plain text — only a salted
       SHA-256 hash (via the browser's built-in Web Crypto API).
     - Each account gets its own random salt.
     - Repeated failed logins trigger a temporary lockout.
   This protects against someone glancing at localStorage and
   reading a password directly. It does NOT protect against
   someone reading this very file, which is why this is a demo
   pattern, not a substitute for real server-side auth.
   ============================================ */

const LifeDropAuth = (() => {
  const KEYS = {
    accounts: 'lifedrop_accounts',
    session: 'lifedrop_session',
    attempts: 'lifedrop_login_attempts',
  };

  const LOCKOUT_THRESHOLD = 5;       // failed attempts before lockout
  const LOCKOUT_MS = 2 * 60 * 1000;  // 2 minute lockout

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, salt) {
    const enc = new TextEncoder().encode(salt + ':' + password);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function getAccounts() {
    return read(KEYS.accounts, {});
  }

  function saveAccounts(accounts) {
    write(KEYS.accounts, accounts);
  }

  // ---------- Password strength ----------

  function checkPasswordStrength(password) {
    const checks = {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password),
    };
    const passed = Object.values(checks).filter(Boolean).length;
    let label = 'Weak';
    let level = 1;
    if (passed >= 5) { label = 'Strong'; level = 3; }
    else if (passed >= 3) { label = 'Medium'; level = 2; }
    return { checks, passed, label, level, valid: checks.length && passed >= 3 };
  }

  // ---------- Registration ----------

  async function register(email, password, fullName) {
    email = (email || '').trim().toLowerCase();
    if (!email || !password) throw new Error('Email and password are required.');

    const strength = checkPasswordStrength(password);
    if (!strength.valid) {
      throw new Error('Password is too weak. Use at least 8 characters with a mix of upper/lowercase, numbers, or symbols.');
    }

    const accounts = getAccounts();
    if (accounts[email]) {
      throw new Error('An account with that email already exists. Try signing in instead.');
    }

    const salt = randomSalt();
    const hash = await hashPassword(password, salt);
    accounts[email] = {
      email,
      fullName: fullName || email.split('@')[0],
      salt,
      hash,
      createdAt: new Date().toISOString(),
      role: 'user',
    };
    saveAccounts(accounts);
    return accounts[email];
  }

  // ---------- Lockout tracking ----------

  function getAttempts(email) {
    const all = read(KEYS.attempts, {});
    return all[email] || { count: 0, lockedUntil: null };
  }

  function recordFailedAttempt(email) {
    const all = read(KEYS.attempts, {});
    const current = all[email] || { count: 0, lockedUntil: null };
    current.count += 1;
    if (current.count >= LOCKOUT_THRESHOLD) {
      current.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    all[email] = current;
    write(KEYS.attempts, all);
    return current;
  }

  function clearAttempts(email) {
    const all = read(KEYS.attempts, {});
    delete all[email];
    write(KEYS.attempts, all);
  }

  function isLockedOut(email) {
    const a = getAttempts(email);
    if (a.lockedUntil && Date.now() < a.lockedUntil) {
      return Math.ceil((a.lockedUntil - Date.now()) / 1000);
    }
    return 0;
  }

  // ---------- Login ----------

  async function login(email, password) {
    email = (email || '').trim().toLowerCase();
    if (!email || !password) throw new Error('Email and password are required.');

    const lockedSeconds = isLockedOut(email);
    if (lockedSeconds > 0) {
      throw new Error(`Too many failed attempts. Try again in ${lockedSeconds}s.`);
    }

    const accounts = getAccounts();
    const account = accounts[email];
    if (!account) {
      recordFailedAttempt(email);
      throw new Error('Invalid email or password.');
    }

    const hash = await hashPassword(password, account.salt);
    if (hash !== account.hash) {
      const attempt = recordFailedAttempt(email);
      const remaining = LOCKOUT_THRESHOLD - attempt.count;
      if (remaining > 0) {
        throw new Error(`Invalid email or password. ${remaining} attempt(s) remaining before temporary lockout.`);
      }
      throw new Error('Too many failed attempts. Account temporarily locked for 2 minutes.');
    }

    clearAttempts(email);
    const session = { email: account.email, fullName: account.fullName, role: account.role, loginAt: new Date().toISOString() };
    write(KEYS.session, session);
    return session;
  }

  // ---------- Password reset (OTP via email) ----------
  // A 6-digit OTP is generated and stored against the account with a
  // 10-minute expiry, then sent to the user's inbox via EmailJS
  // (https://www.emailjs.com) — a service built specifically for sending
  // real email from client-side code with no backend server required.
  //
  // SECURITY NOTE: only EmailJS's PUBLIC key belongs here. EmailJS's private/
  // access token must never be placed in this file or any other browser-
  // visible code — see js/email-config.js for where to put the public key.

  const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes, standard OTP window

  function generateOtp() {
    // 6-digit numeric code, generated with the same crypto-secure randomness
    // used for password salts — not Math.random(), which is predictable.
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const num = new DataView(bytes.buffer).getUint32(0) % 1000000;
    return String(num).padStart(6, '0');
  }

  async function sendOtpEmail(email, otp) {
    const cfg = window.LifeDropEmailConfig;
    if (!cfg || !cfg.publicKey || !cfg.serviceId || !cfg.templateId) {
      // Not configured — caller falls back to on-screen display instead of email.
      return { sent: false, reason: 'EmailJS is not configured (see js/email-config.js).' };
    }
    if (typeof emailjs === 'undefined') {
      return { sent: false, reason: 'EmailJS SDK failed to load (check network/ad-blockers).' };
    }
    try {
      await emailjs.send(cfg.serviceId, cfg.templateId, {
        to_email: email,
        otp_code: otp,
        expires_minutes: RESET_TOKEN_TTL_MS / 60000,
      }, { publicKey: cfg.publicKey });
      return { sent: true };
    } catch (err) {
      return { sent: false, reason: (err && err.text) || 'EmailJS request failed.' };
    }
  }

  async function requestPasswordReset(email) {
    email = (email || '').trim().toLowerCase();
    if (!email) throw new Error('Enter your email address.');

    const accounts = getAccounts();
    const account = accounts[email];
    // Deliberately don't reveal whether the account exists — same pattern
    // a real backend should use to avoid leaking which emails are registered.
    if (!account) {
      return { otp: null, exists: false, emailSent: false };
    }

    const otp = generateOtp();
    account.resetToken = otp;
    account.resetTokenExpires = Date.now() + RESET_TOKEN_TTL_MS;
    accounts[email] = account;
    saveAccounts(accounts);

    const emailResult = await sendOtpEmail(email, otp);

    // The OTP is still returned to the caller so the UI can show it on-screen
    // as a fallback if email sending isn't configured or fails — never silently
    // strand the user with no way to complete the reset.
    return { otp, exists: true, emailSent: emailResult.sent, emailError: emailResult.reason };
  }

  function verifyResetToken(email, token) {
    email = (email || '').trim().toLowerCase();
    const accounts = getAccounts();
    const account = accounts[email];
    if (!account || !account.resetToken) {
      throw new Error('Invalid or expired code.');
    }
    if (Date.now() > account.resetTokenExpires) {
      throw new Error('This code has expired. Request a new one.');
    }
    if (account.resetToken !== token) {
      throw new Error('Incorrect code. Check your inbox and try again.');
    }
    return true;
  }

  async function completePasswordReset(email, token, newPassword) {
    email = (email || '').trim().toLowerCase();
    verifyResetToken(email, token);

    const strength = checkPasswordStrength(newPassword);
    if (!strength.valid) {
      throw new Error('Password is too weak. Use at least 8 characters with a mix of upper/lowercase, numbers, or symbols.');
    }

    const accounts = getAccounts();
    const account = accounts[email];
    const salt = randomSalt();
    const hash = await hashPassword(newPassword, salt);
    account.salt = salt;
    account.hash = hash;
    delete account.resetToken;
    delete account.resetTokenExpires;
    accounts[email] = account;
    saveAccounts(accounts);
    clearAttempts(email);
    return true;
  }

  function logout() {
    localStorage.removeItem(KEYS.session);
  }

  function getSession() {
    return read(KEYS.session, null);
  }

  function requireSession(redirectTo) {
    const session = getSession();
    if (!session) {
      window.location.href = redirectTo || 'login.html';
      return null;
    }
    return session;
  }

  // Seed a demo admin account so the admin page is reachable without
  // manual registration. Password is intentionally shown on the login
  // page since this is a local demo, not a real deployment.
  async function seedDemoAdmin() {
    const accounts = getAccounts();
    if (accounts['admin@lifedrop.local']) return;
    const salt = randomSalt();
    const hash = await hashPassword('Admin@2026', salt);
    accounts['admin@lifedrop.local'] = {
      email: 'admin@lifedrop.local',
      fullName: 'LifeDrop Admin',
      salt, hash,
      createdAt: new Date().toISOString(),
      role: 'admin',
    };
    saveAccounts(accounts);
  }

  return {
    register, login, logout, getSession, requireSession,
    checkPasswordStrength, seedDemoAdmin, isLockedOut,
    requestPasswordReset, verifyResetToken, completePasswordReset,
  };
})();
