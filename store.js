const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(db) {
  db.meta = db.meta || {};
  db.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function now() {
  return new Date().toISOString();
}

function getPublicUser(user) {
  if (!user) return null;
  const {
    password,
    ...safe
  } = user;
  return safe;
}

function findUserByToken(token) {
  if (!token) return null;
  const db = readDb();
  return db.users.find((user) => Array.isArray(user.sessions) && user.sessions.includes(token)) || null;
}

function createSession(userId) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) return null;
  user.sessions = user.sessions || [];
  const token = uid('session');
  user.sessions.push(token);
  user.lastLoginAt = now();
  writeDb(db);
  return token;
}

function removeSession(userId, token) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) return false;
  user.sessions = (user.sessions || []).filter((item) => item !== token);
  writeDb(db);
  return true;
}

function createNotification(db, payload) {
  db.notifications.unshift({
    id: uid('note'),
    title: payload.title,
    message: payload.message,
    userId: payload.userId,
    kind: payload.kind || 'info',
    read: false,
    createdAt: now(),
    meta: payload.meta || {}
  });
}

function createActivity(db, payload) {
  db.activities.unshift({
    id: uid('activity'),
    type: payload.type,
    actorId: payload.actorId || null,
    actorName: payload.actorName || 'System',
    message: payload.message,
    createdAt: now(),
    meta: payload.meta || {}
  });
  db.activities = db.activities.slice(0, 50);
}

function calculateStats(db) {
  const openRequests = db.requests.filter((request) => request.status !== 'Fulfilled').length;
  const availableDonors = db.users.filter((user) => user.role === 'donor' && user.available).length;
  const hospitals = db.users.filter((user) => user.role === 'hospital').length;
  const bloodBanks = db.users.filter((user) => user.role === 'bloodbank').length;
  const completedAppointments = db.appointments.filter((item) => item.status === 'Completed').length;
  const inventoryUnits = db.inventory.reduce((sum, item) => sum + Number(item.units || 0), 0);
  return {
    donors: db.users.filter((user) => user.role === 'donor').length,
    hospitals,
    bloodBanks,
    openRequests,
    availableDonors,
    completedAppointments,
    inventoryUnits
  };
}

function bloodCompatibility() {
  return {
    'O-': ['O-'],
    'O+': ['O-', 'O+'],
    'A-': ['O-', 'A-'],
    'A+': ['O-', 'O+', 'A-', 'A+'],
    'B-': ['O-', 'B-'],
    'B+': ['O-', 'O+', 'B-', 'B+'],
    'AB-': ['O-', 'A-', 'B-', 'AB-'],
    'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
  };
}

function matchDonors(db, request) {
  const compatible = bloodCompatibility()[request.bloodGroup] || [];
  return db.users
    .filter((user) => user.role === 'donor')
    .filter((user) => user.available)
    .filter((user) => compatible.includes(user.bloodGroup))
    .filter((user) => user.city.toLowerCase() === request.city.toLowerCase())
    .sort((a, b) => Number(b.reliabilityScore || 0) - Number(a.reliabilityScore || 0));
}

module.exports = {
  DB_PATH,
  readDb,
  writeDb,
  uid,
  now,
  getPublicUser,
  findUserByToken,
  createSession,
  removeSession,
  createNotification,
  createActivity,
  calculateStats,
  matchDonors,
  bloodCompatibility
};
