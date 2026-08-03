/* ============================================
   LifeDrop — shared data layer (localStorage-backed)
   No server required. All data lives in the browser.
   ============================================ */

const LifeDropData = (() => {
  const KEYS = {
    session: 'lifedrop_session',
    donors: 'lifedrop_donors',
    patients: 'lifedrop_patients',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('LifeDropData: failed to read', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------- Session (demo-only auth, not secure — client-side storage) ----------

  function login(email, password) {
    // Demo auth: any email/password combo with both fields filled works.
    // This is intentionally not real authentication — there is no server
    // to verify credentials against. Good enough for a local demo/prototype.
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }
    const session = { email, loginAt: new Date().toISOString() };
    write(KEYS.session, session);
    return session;
  }

  function logout() {
    localStorage.removeItem(KEYS.session);
  }

  function getSession() {
    return read(KEYS.session, null);
  }

  // ---------- Donor history ----------

  function seedDonorsIfEmpty() {
    const existing = read(KEYS.donors, null);
    if (existing) return;
    const sample = [
      { id: uid('d'), name: 'Asha Menon', bloodType: 'O-', date: '2026-05-14', location: 'Springfield Community Center', units: 1, notes: 'Regular donor, no complications.' },
      { id: uid('d'), name: 'Ravi Kumar', bloodType: 'B+', date: '2026-04-02', location: 'City General Blood Bank', units: 1, notes: 'First-time donor.' },
      { id: uid('d'), name: 'Elena Fischer', bloodType: 'AB+', date: '2026-02-20', location: 'Springfield Community Center', units: 1, notes: '' },
    ];
    write(KEYS.donors, sample);
  }

  function getDonors() {
    seedDonorsIfEmpty();
    return read(KEYS.donors, []);
  }

  function addDonorRecord(record) {
    const donors = getDonors();
    const entry = { id: uid('d'), ...record };
    donors.unshift(entry);
    write(KEYS.donors, donors);
    return entry;
  }

  function deleteDonorRecord(id) {
    const donors = getDonors().filter((d) => d.id !== id);
    write(KEYS.donors, donors);
  }

  // ---------- Patients ----------

  function getPatients() {
    return read(KEYS.patients, []);
  }

  function addPatient(record) {
    const patients = getPatients();
    const entry = { id: uid('p'), createdAt: new Date().toISOString(), ...record };
    patients.unshift(entry);
    write(KEYS.patients, patients);
    return entry;
  }

  function deletePatient(id) {
    const patients = getPatients().filter((p) => p.id !== id);
    write(KEYS.patients, patients);
  }

  return {
    login, logout, getSession,
    getDonors, addDonorRecord, deleteDonorRecord,
    getPatients, addPatient, deletePatient,
  };
})();
