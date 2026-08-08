const express = require('express');
const {
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
} = require('./store');

function createApi(realtime) {
  const router = express.Router();

  function tokenFromRequest(req) {
    return req.headers['x-session-token'] || (req.headers.authorization || '').replace('Bearer ', '').trim();
  }

  function attachCurrentUser(req, _res, next) {
    const token = tokenFromRequest(req);
    req.token = token;
    req.user = findUserByToken(token);
    next();
  }

  function requireAuth(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  }

  function requireRoles(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permission' });
      }
      next();
    };
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function lower(value) {
    return normalizeText(value).toLowerCase();
  }

  function emitDashboardRefresh(city) {
    realtime.broadcast('dashboard:refresh', { city, updatedAt: now() });
  }

  router.use(attachCurrentUser);

  router.get('/health', (_req, res) => {
    res.json({ ok: true, message: 'Blood donation system API running' });
  });

  router.get('/public/stats', (_req, res) => {
    const db = readDb();
    res.json({ stats: calculateStats(db) });
  });

  router.get('/public/feed', (_req, res) => {
    const db = readDb();
    res.json({
      activities: db.activities.slice(0, 8),
      campaigns: db.campaigns.slice(0, 6),
      compatibility: bloodCompatibility()
    });
  });

  router.post('/auth/register', (req, res) => {
    const db = readDb();
    const payload = req.body || {};
    const email = lower(payload.email);
    const role = normalizeText(payload.role || 'donor').toLowerCase();

    if (!payload.name || !email || !payload.password || !payload.bloodGroup || !payload.city) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (db.users.some((user) => lower(user.email) === email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = {
      id: uid(role),
      name: normalizeText(payload.name),
      email,
      password: String(payload.password),
      role: ['donor', 'hospital', 'bloodbank'].includes(role) ? role : 'donor',
      bloodGroup: normalizeText(payload.bloodGroup),
      city: normalizeText(payload.city),
      phone: normalizeText(payload.phone),
      available: payload.available !== false,
      verified: role === 'donor' ? false : true,
      reliabilityScore: role === 'donor' ? 70 : 85,
      lastDonation: normalizeText(payload.lastDonation),
      organization: normalizeText(payload.organization),
      sessions: [],
      createdAt: now()
    };

    db.users.unshift(user);
    createActivity(db, {
      type: 'user_registered',
      actorId: user.id,
      actorName: user.name,
      message: `${user.name} joined as ${user.role}.`
    });
    writeDb(db);

    const token = createSession(user.id);
    realtime.notifyRole('admin', 'admin:new-user', { user: getPublicUser(user) });

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: getPublicUser({ ...user, sessions: [token] })
    });
  });

  router.post('/auth/login', (req, res) => {
    const db = readDb();
    const email = lower(req.body?.email);
    const password = String(req.body?.password || '');
    const user = db.users.find((item) => lower(item.email) === email && String(item.password) === password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createSession(user.id);
    realtime.broadcast('presence:login', { userId: user.id, role: user.role });

    return res.json({
      message: 'Login successful',
      token,
      user: getPublicUser({ ...user, sessions: [token] })
    });
  });

  router.post('/auth/logout', requireAuth, (req, res) => {
    removeSession(req.user.id, req.token);
    res.json({ message: 'Logged out successfully' });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    res.json({ user: getPublicUser(req.user) });
  });

  router.get('/dashboard', requireAuth, (req, res) => {
    const db = readDb();
    const stats = calculateStats(db);
    const myRequests = db.requests.filter((request) => request.createdBy === req.user.id || req.user.role === 'admin');
    const myAppointments = db.appointments.filter((item) => {
      if (req.user.role === 'admin') return true;
      return item.donorId === req.user.id || item.recipientOrgId === req.user.id;
    });
    const myNotifications = db.notifications.filter((note) => note.userId === req.user.id).slice(0, 12);
    const liveMatches = db.requests
      .filter((request) => request.status === 'Open')
      .map((request) => ({ request, donors: matchDonors(db, request).slice(0, 5) }))
      .slice(0, 6);

    res.json({
      user: getPublicUser(req.user),
      stats,
      requests: myRequests,
      appointments: myAppointments,
      notifications: myNotifications,
      activities: db.activities.slice(0, 10),
      liveMatches,
      inventory: db.inventory,
      campaigns: db.campaigns
    });
  });

  router.get('/donors', requireAuth, (req, res) => {
    const db = readDb();
    const { bloodGroup = '', city = '', onlyAvailable = '' } = req.query;
    let donors = db.users.filter((item) => item.role === 'donor');
    if (bloodGroup) donors = donors.filter((item) => item.bloodGroup === bloodGroup);
    if (city) donors = donors.filter((item) => lower(item.city) === lower(city));
    if (String(onlyAvailable) === 'true') donors = donors.filter((item) => item.available);
    res.json({ donors: donors.map(getPublicUser) });
  });

  router.patch('/donors/:id/availability', requireRoles('donor', 'admin'), (req, res) => {
    const db = readDb();
    const donor = db.users.find((item) => item.id === req.params.id && item.role === 'donor');
    if (!donor) return res.status(404).json({ error: 'Donor not found' });
    if (req.user.role !== 'admin' && req.user.id !== donor.id) {
      return res.status(403).json({ error: 'You can update only your profile' });
    }
    donor.available = Boolean(req.body?.available);
    donor.updatedAt = now();
    createActivity(db, {
      type: 'availability_updated',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `${donor.name} is now ${donor.available ? 'available' : 'unavailable'} for donation.`
    });
    writeDb(db);
    emitDashboardRefresh(donor.city);
    realtime.notifyRole('admin', 'donor:availability', { donor: getPublicUser(donor) });
    res.json({ donor: getPublicUser(donor) });
  });

  router.get('/requests', requireAuth, (req, res) => {
    const db = readDb();
    const { status = '', city = '', bloodGroup = '' } = req.query;
    let requests = [...db.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (status) requests = requests.filter((item) => item.status === status);
    if (city) requests = requests.filter((item) => lower(item.city) === lower(city));
    if (bloodGroup) requests = requests.filter((item) => item.bloodGroup === bloodGroup);
    res.json({ requests });
  });

  router.post('/requests', requireRoles('hospital', 'bloodbank', 'admin'), (req, res) => {
    const db = readDb();
    const body = req.body || {};
    if (!body.patientName || !body.bloodGroup || !body.city || !body.units || !body.hospital) {
      return res.status(400).json({ error: 'Missing request fields' });
    }
    const request = {
      id: uid('req'),
      patientName: normalizeText(body.patientName),
      bloodGroup: normalizeText(body.bloodGroup),
      units: Number(body.units || 1),
      hospital: normalizeText(body.hospital),
      city: normalizeText(body.city),
      priority: normalizeText(body.priority || 'Normal'),
      contactName: normalizeText(body.contactName || req.user.name),
      contactPhone: normalizeText(body.contactPhone || req.user.phone),
      status: 'Open',
      createdBy: req.user.id,
      createdAt: now(),
      notes: normalizeText(body.notes)
    };

    db.requests.unshift(request);

    const matchedDonors = matchDonors(db, request).slice(0, 8);
    matchedDonors.forEach((donor) => {
      createNotification(db, {
        userId: donor.id,
        kind: 'warning',
        title: `Urgent ${request.bloodGroup} request`,
        message: `${request.hospital} needs ${request.units} unit(s) for ${request.patientName} in ${request.city}.`,
        meta: { requestId: request.id }
      });
      realtime.notifyUser(donor.id, 'request:matched', { request, donor: getPublicUser(donor) });
    });

    createActivity(db, {
      type: 'request_created',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `${req.user.name} created ${request.priority.toLowerCase()} ${request.bloodGroup} request for ${request.patientName}.`,
      meta: { requestId: request.id }
    });

    writeDb(db);
    emitDashboardRefresh(request.city);
    realtime.notifyRole('admin', 'request:new', { request, matchedDonors: matchedDonors.map(getPublicUser) });
    realtime.notifyCity(request.city, 'request:city-alert', { request });

    res.status(201).json({ request, matchedDonors: matchedDonors.map(getPublicUser) });
  });

  router.patch('/requests/:id/status', requireRoles('hospital', 'bloodbank', 'admin'), (req, res) => {
    const db = readDb();
    const request = db.requests.find((item) => item.id === req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const nextStatus = normalizeText(req.body?.status || request.status);
    request.status = nextStatus;
    request.updatedAt = now();
    createActivity(db, {
      type: 'request_status_updated',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `Request ${request.id} marked as ${nextStatus}.`,
      meta: { requestId: request.id }
    });
    writeDb(db);
    emitDashboardRefresh(request.city);
    realtime.broadcast('request:status', { request });
    res.json({ request });
  });

  router.get('/matches/:requestId', requireAuth, (req, res) => {
    const db = readDb();
    const request = db.requests.find((item) => item.id === req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const donors = matchDonors(db, request).map(getPublicUser);
    res.json({ request, donors });
  });

  router.get('/appointments', requireAuth, (req, res) => {
    const db = readDb();
    const appointments = db.appointments.filter((item) => {
      if (req.user.role === 'admin') return true;
      return item.donorId === req.user.id || item.recipientOrgId === req.user.id;
    });
    res.json({ appointments });
  });

  router.post('/appointments', requireRoles('hospital', 'bloodbank', 'admin'), (req, res) => {
    const db = readDb();
    const body = req.body || {};
    if (!body.requestId || !body.donorId || !body.scheduledAt || !body.location) {
      return res.status(400).json({ error: 'Missing appointment fields' });
    }
    const request = db.requests.find((item) => item.id === body.requestId);
    const donor = db.users.find((item) => item.id === body.donorId && item.role === 'donor');
    if (!request || !donor) {
      return res.status(404).json({ error: 'Linked request or donor not found' });
    }
    const appointment = {
      id: uid('appt'),
      requestId: request.id,
      donorId: donor.id,
      recipientOrgId: req.user.id,
      scheduledAt: body.scheduledAt,
      location: normalizeText(body.location),
      status: 'Scheduled',
      createdAt: now(),
      note: normalizeText(body.note)
    };
    db.appointments.unshift(appointment);
    request.status = 'Processing';
    donor.available = false;
    createNotification(db, {
      userId: donor.id,
      kind: 'success',
      title: 'Donation appointment scheduled',
      message: `You have been scheduled on ${appointment.scheduledAt} at ${appointment.location}.`,
      meta: { appointmentId: appointment.id, requestId: request.id }
    });
    createNotification(db, {
      userId: req.user.id,
      kind: 'info',
      title: 'Donor reserved',
      message: `${donor.name} has been assigned to request ${request.id}.`,
      meta: { appointmentId: appointment.id, donorId: donor.id }
    });
    createActivity(db, {
      type: 'appointment_created',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `${req.user.name} scheduled ${donor.name} for request ${request.id}.`,
      meta: { appointmentId: appointment.id, requestId: request.id }
    });
    writeDb(db);
    emitDashboardRefresh(request.city);
    realtime.notifyUser(donor.id, 'appointment:new', { appointment, request });
    realtime.notifyRole('admin', 'appointment:new', { appointment, donor: getPublicUser(donor) });
    res.status(201).json({ appointment, donor: getPublicUser(donor), request });
  });

  router.patch('/appointments/:id/status', requireRoles('donor', 'hospital', 'bloodbank', 'admin'), (req, res) => {
    const db = readDb();
    const appointment = db.appointments.find((item) => item.id === req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    const request = db.requests.find((item) => item.id === appointment.requestId);
    const donor = db.users.find((item) => item.id === appointment.donorId);
    appointment.status = normalizeText(req.body?.status || appointment.status);
    appointment.updatedAt = now();

    if (appointment.status === 'Completed' && request) {
      request.status = 'Fulfilled';
      if (donor) donor.available = false;
    }
    if (appointment.status === 'Cancelled' && donor) {
      donor.available = true;
      if (request) request.status = 'Open';
    }

    createActivity(db, {
      type: 'appointment_status_updated',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `Appointment ${appointment.id} marked as ${appointment.status}.`,
      meta: { appointmentId: appointment.id }
    });

    if (appointment.recipientOrgId) {
      createNotification(db, {
        userId: appointment.recipientOrgId,
        kind: 'info',
        title: 'Appointment updated',
        message: `Appointment ${appointment.id} is now ${appointment.status}.`,
        meta: { appointmentId: appointment.id }
      });
    }
    if (donor) {
      createNotification(db, {
        userId: donor.id,
        kind: 'info',
        title: 'Your appointment status changed',
        message: `Appointment ${appointment.id} is now ${appointment.status}.`,
        meta: { appointmentId: appointment.id }
      });
    }

    writeDb(db);
    emitDashboardRefresh(request?.city || donor?.city || '');
    realtime.broadcast('appointment:status', { appointment, request, donor: donor ? getPublicUser(donor) : null });
    res.json({ appointment, request, donor: donor ? getPublicUser(donor) : null });
  });

  router.get('/inventory', requireAuth, (req, res) => {
    const db = readDb();
    const { city = '' } = req.query;
    let inventory = [...db.inventory];
    if (city) inventory = inventory.filter((item) => lower(item.city) === lower(city));
    res.json({ inventory });
  });

  router.post('/inventory', requireRoles('bloodbank', 'admin'), (req, res) => {
    const db = readDb();
    const body = req.body || {};
    if (!body.bloodGroup || body.units === undefined || !body.city) {
      return res.status(400).json({ error: 'Missing inventory fields' });
    }
    const existing = db.inventory.find((item) => item.ownerId === req.user.id && item.bloodGroup === body.bloodGroup && lower(item.city) === lower(body.city));
    if (existing) {
      existing.units = Number(body.units);
      existing.updatedAt = now();
    } else {
      db.inventory.unshift({
        id: uid('inv'),
        ownerId: req.user.id,
        bloodGroup: body.bloodGroup,
        units: Number(body.units),
        city: normalizeText(body.city),
        updatedAt: now()
      });
    }
    createActivity(db, {
      type: 'inventory_updated',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `${req.user.name} updated blood inventory for ${body.bloodGroup}.`
    });
    writeDb(db);
    emitDashboardRefresh(body.city);
    realtime.broadcast('inventory:updated', { city: body.city });
    res.json({ inventory: db.inventory });
  });

  router.get('/campaigns', (_req, res) => {
    const db = readDb();
    res.json({ campaigns: db.campaigns });
  });

  router.post('/campaigns', requireRoles('bloodbank', 'admin'), (req, res) => {
    const db = readDb();
    const body = req.body || {};
    if (!body.title || !body.city || !body.venue || !body.date) {
      return res.status(400).json({ error: 'Missing campaign fields' });
    }
    const campaign = {
      id: uid('camp'),
      title: normalizeText(body.title),
      city: normalizeText(body.city),
      venue: normalizeText(body.venue),
      date: normalizeText(body.date),
      seats: Number(body.seats || 0),
      registered: 0,
      organizer: normalizeText(body.organizer || req.user.name),
      description: normalizeText(body.description)
    };
    db.campaigns.unshift(campaign);
    createActivity(db, {
      type: 'campaign_created',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `${req.user.name} created campaign ${campaign.title}.`
    });
    writeDb(db);
    realtime.broadcast('campaign:new', { campaign });
    res.status(201).json({ campaign });
  });

  router.post('/campaigns/:id/join', requireAuth, (req, res) => {
    const db = readDb();
    const campaign = db.campaigns.find((item) => item.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    campaign.registered = Math.min(Number(campaign.seats || 0), Number(campaign.registered || 0) + 1);
    createNotification(db, {
      userId: req.user.id,
      kind: 'success',
      title: 'Campaign joined',
      message: `You successfully joined ${campaign.title}.`,
      meta: { campaignId: campaign.id }
    });
    writeDb(db);
    realtime.broadcast('campaign:joined', { campaignId: campaign.id, registered: campaign.registered });
    res.json({ campaign });
  });

  router.get('/notifications', requireAuth, (req, res) => {
    const db = readDb();
    res.json({ notifications: db.notifications.filter((item) => item.userId === req.user.id).slice(0, 20) });
  });

  router.patch('/notifications/:id/read', requireAuth, (req, res) => {
    const db = readDb();
    const note = db.notifications.find((item) => item.id === req.params.id && item.userId === req.user.id);
    if (!note) return res.status(404).json({ error: 'Notification not found' });
    note.read = true;
    writeDb(db);
    res.json({ notification: note });
  });

  router.get('/admin/overview', requireRoles('admin'), (req, res) => {
    const db = readDb();
    const pendingVerification = db.users.filter((item) => !item.verified).length;
    const criticalRequests = db.requests.filter((item) => item.priority === 'Critical' && item.status !== 'Fulfilled').length;
    res.json({
      stats: calculateStats(db),
      pendingVerification,
      criticalRequests,
      users: db.users.map(getPublicUser),
      requests: db.requests,
      activities: db.activities.slice(0, 20),
      notifications: db.notifications.slice(0, 20)
    });
  });

  router.patch('/admin/users/:id/verify', requireRoles('admin'), (req, res) => {
    const db = readDb();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.verified = Boolean(req.body?.verified);
    user.updatedAt = now();
    createNotification(db, {
      userId: user.id,
      kind: user.verified ? 'success' : 'warning',
      title: 'Verification update',
      message: `Your account verification is now ${user.verified ? 'approved' : 'pending'}.`
    });
    createActivity(db, {
      type: 'user_verification_updated',
      actorId: req.user.id,
      actorName: req.user.name,
      message: `${req.user.name} changed verification for ${user.name}.`
    });
    writeDb(db);
    realtime.notifyUser(user.id, 'profile:verification', { user: getPublicUser(user) });
    res.json({ user: getPublicUser(user) });
  });

  return router;
}

module.exports = createApi;
