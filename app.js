(() => {
  const state = {
    token: localStorage.getItem('bloodconnect_token') || '',
    user: null,
    feed: [],
    campaigns: [],
    compatibility: {},
    dashboard: null,
    socket: null,
    onlineCount: 0
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const refs = {
    landingView: $('#landingView'),
    appView: $('#appView'),
    authModal: $('#authModal'),
    loginForm: $('#loginForm'),
    registerForm: $('#registerForm'),
    donorFilterForm: $('#donorFilterForm'),
    requestForm: $('#requestForm'),
    requestFilterForm: $('#requestFilterForm'),
    appointmentForm: $('#appointmentForm'),
    inventoryForm: $('#inventoryForm'),
    inventoryFilterForm: $('#inventoryFilterForm'),
    campaignForm: $('#campaignForm'),
    eligibilityForm: $('#eligibilityForm'),
    logoutBtn: $('#logoutBtn'),
    openLogin: $('#openLogin'),
    openRegister: $('#openRegister'),
    heroStart: $('#heroStart'),
    heroGuest: $('#heroGuest'),
    loginTabBtn: $('#loginTabBtn'),
    registerTabBtn: $('#registerTabBtn'),
    closeAuthModal: $('#closeAuthModal'),
    toggleAvailabilityBtn: $('#toggleAvailabilityBtn'),
    refreshDashboardBtn: $('#refreshDashboardBtn'),
    markAllReadBtn: $('#markAllReadBtn'),
    campaignExplore: $('#campaignExplore')
  };

  const api = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (state.token) headers['X-Session-Token'] = state.token;
    const response = await fetch(`/api${path}`, {
      ...options,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  };

  const saveSession = (token, user) => {
    state.token = token;
    state.user = user;
    localStorage.setItem('bloodconnect_token', token);
    document.body.className = '';
    document.body.classList.add(`role-${user.role}`);
  };

  const clearSession = () => {
    localStorage.removeItem('bloodconnect_token');
    state.token = '';
    state.user = null;
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    document.body.className = '';
  };

  const openModal = (mode = 'login') => {
    refs.authModal.classList.remove('hidden');
    setAuthMode(mode);
  };

  const closeModal = () => refs.authModal.classList.add('hidden');

  const setAuthMode = (mode) => {
    const login = mode === 'login';
    refs.loginForm.classList.toggle('hidden', !login);
    refs.registerForm.classList.toggle('hidden', login);
    refs.loginTabBtn.classList.toggle('active', login);
    refs.registerTabBtn.classList.toggle('active', !login);
  };

  const populateBloodSelects = () => {
    $$('.blood-group-select').forEach((select) => UI.renderSelectOptions(select));
  };

  const renderPublic = async () => {
    const [statsData, feedData] = await Promise.all([api('/public/stats'), api('/public/feed')]);
    state.feed = feedData.activities || [];
    state.campaigns = feedData.campaigns || [];
    state.compatibility = feedData.compatibility || {};
    UI.renderStats($('#heroStats'), statsData.stats);
    UI.renderFeed($('#liveFeedPreview'), state.feed);
    UI.renderCampaigns($('#campaignCards'), state.campaigns, false);
    UI.renderCompatibility($('#compatibilityGrid'), state.compatibility);
  };

  const updateProfile = () => {
    if (!state.user) return;
    $('#profileName').textContent = state.user.name;
    $('#profileMeta').textContent = `${state.user.role.toUpperCase()} · ${state.user.email}`;
    $('#profileBlood').textContent = state.user.bloodGroup || '-';
    $('#profileCity').textContent = state.user.city || '-';
    $('#profileStatus').textContent = state.user.available ? 'Available' : 'Unavailable';
    $('#profileStatus').className = `tag ${state.user.available ? 'tag-success' : 'tag-danger'}`;
    $('#sidebarUserRole').textContent = `${state.user.role.toUpperCase()} workspace`;
    $('#sessionRoleBadge').textContent = state.user.role.toUpperCase();
  };

  const setView = (authenticated) => {
    refs.landingView.classList.toggle('hidden', authenticated);
    refs.appView.classList.toggle('hidden', !authenticated);
    $('.site-header').classList.toggle('hidden', authenticated);
  };

  const switchTab = (tabId) => {
    $$('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
    const labelMap = {
      overviewTab: ['Overview Dashboard', 'Monitor donors, requests, and live blood response status.'],
      donorsTab: ['Donor Directory', 'Search, filter, and shortlist blood donors by type and city.'],
      requestsTab: ['Request Board', 'Create and manage urgent blood requests in real time.'],
      appointmentsTab: ['Appointments', 'Schedule, track, and complete donor visits.'],
      inventoryTab: ['Inventory Management', 'Track city-wise blood stock and updates.'],
      campaignsTab: ['Community Campaigns', 'Create donation drives and volunteer signups.'],
      adminTab: ['Admin Control', 'Verify accounts and monitor cross-platform activity.']
    };
    const [title, subtitle] = labelMap[tabId] || ['Dashboard', 'Blood donation operations'];
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
  };

  const connectSocket = () => {
    if (!state.user || state.socket) return;
    state.socket = io();
    state.socket.on('connect', () => {
      state.socket.emit('join', { userId: state.user.id, role: state.user.role });
      state.socket.emit('dashboard:watch', { city: state.user.city, bloodGroup: state.user.bloodGroup });
    });

    state.socket.on('presence:update', ({ onlineCount }) => {
      state.onlineCount = onlineCount || 0;
      $('#presenceBadge').textContent = `${state.onlineCount} online`;
    });

    state.socket.on('dashboard:refresh', () => loadDashboard(true));
    state.socket.on('request:new', (payload) => notifyAndRefresh(`New request: ${payload.request.patientName}`));
    state.socket.on('request:matched', (payload) => notifyAndRefresh(`You matched request ${payload.request.id}`));
    state.socket.on('appointment:new', (payload) => notifyAndRefresh(`Appointment scheduled: ${payload.appointment.id}`));
    state.socket.on('appointment:status', (payload) => notifyAndRefresh(`Appointment ${payload.appointment.id} changed to ${payload.appointment.status}`));
    state.socket.on('campaign:new', (payload) => notifyAndRefresh(`New campaign: ${payload.campaign.title}`));
    state.socket.on('campaign:joined', () => loadCampaignBoards());
    state.socket.on('profile:verification', ({ user }) => {
      if (state.user && user.id === state.user.id) {
        state.user = user;
        updateProfile();
        UI.showToast(`Verification updated: ${user.verified ? 'approved' : 'pending'}`, user.verified ? 'success' : 'info');
      }
    });
  };

  const notifyAndRefresh = (message) => {
    UI.showToast(message, 'info');
    loadDashboard(true);
  };

  const loadDashboard = async (silent = false) => {
    if (!state.user) return;
    try {
      const data = await api('/dashboard');
      state.dashboard = data;
      updateProfile();
      UI.renderStats($('#dashboardStats'), data.stats);
      UI.renderFeed($('#activityList'), data.activities || []);
      UI.renderFeed($('#notificationList'), (data.notifications || []).map((note) => ({
        title: note.title,
        message: note.message,
        createdAt: note.createdAt,
        kind: note.kind
      })));
      UI.renderMatches($('#matchBoard'), data.liveMatches || []);
      UI.renderCampaigns($('#campaignBoard'), data.campaigns || [], false);
      UI.renderCampaigns($('#campaignBoardApp'), data.campaigns || [], state.user.role !== 'admin');
      UI.renderInventory($('#inventoryBoard'), data.inventory || []);
      await Promise.all([loadDonors(), loadRequests(), loadAppointments(), loadAdmin()]);
      if (!silent) UI.showToast('Dashboard updated', 'success');
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const loadDonors = async (filters = null) => {
    if (!state.user) return;
    const formData = filters || Object.fromEntries(new FormData(refs.donorFilterForm).entries());
    const query = new URLSearchParams();
    if (formData.bloodGroup) query.set('bloodGroup', formData.bloodGroup);
    if (formData.city) query.set('city', formData.city);
    if (formData.onlyAvailable) query.set('onlyAvailable', 'true');
    const data = await api(`/donors?${query.toString()}`);
    UI.renderDonors($('#donorGrid'), data.donors, ['hospital', 'bloodbank', 'admin'].includes(state.user.role));
  };

  const loadRequests = async (filters = null) => {
    if (!state.user) return;
    const formData = filters || Object.fromEntries(new FormData(refs.requestFilterForm).entries());
    const query = new URLSearchParams();
    if (formData.bloodGroup) query.set('bloodGroup', formData.bloodGroup);
    if (formData.city) query.set('city', formData.city);
    if (formData.status) query.set('status', formData.status);
    const data = await api(`/requests?${query.toString()}`);
    UI.renderRequests($('#requestBoard'), data.requests, ['hospital', 'bloodbank', 'admin'].includes(state.user.role));
  };

  const loadAppointments = async () => {
    if (!state.user) return;
    const data = await api('/appointments');
    UI.renderAppointments($('#appointmentBoard'), data.appointments || []);
  };

  const loadInventory = async () => {
    if (!state.user) return;
    const query = new URLSearchParams(Object.fromEntries(new FormData(refs.inventoryFilterForm).entries()));
    const data = await api(`/inventory?${query.toString()}`);
    UI.renderInventory($('#inventoryBoard'), data.inventory || []);
  };

  const loadCampaignBoards = async () => {
    const data = await api('/campaigns');
    state.campaigns = data.campaigns || [];
    UI.renderCampaigns($('#campaignCards'), state.campaigns, false);
    if (state.user) UI.renderCampaigns($('#campaignBoardApp'), state.campaigns, state.user.role !== 'admin');
  };

  const loadAdmin = async () => {
    if (!state.user || state.user.role !== 'admin') return;
    const data = await api('/admin/overview');
    UI.renderUsers($('#adminUserBoard'), data.users || []);
    UI.renderFeed($('#adminActivityBoard'), data.activities || []);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target).entries());
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      saveSession(data.token, data.user);
      closeModal();
      setView(true);
      connectSocket();
      await loadDashboard();
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target).entries());
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      saveSession(data.token, data.user);
      closeModal();
      setView(true);
      connectSocket();
      await loadDashboard();
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      if (state.token) await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.warn(error.message);
    }
    clearSession();
    setView(false);
    await renderPublic();
    UI.showToast('Logged out', 'info');
  };

  const toggleAvailability = async () => {
    if (!state.user || state.user.role !== 'donor') return;
    try {
      const data = await api(`/donors/${state.user.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ available: !state.user.available })
      });
      state.user = { ...state.user, ...data.donor };
      updateProfile();
      UI.showToast(`Availability changed to ${state.user.available ? 'available' : 'unavailable'}`, 'success');
      await loadDashboard(true);
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleCreateRequest = async (event) => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(event.target).entries());
      const data = await api('/requests', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      event.target.reset();
      populateBloodSelects();
      UI.showToast(`Request ${data.request.id} created`, 'success');
      await loadDashboard(true);
      switchTab('requestsTab');
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleCreateAppointment = async (event) => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(event.target).entries());
      const data = await api('/appointments', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      UI.showToast(`Appointment ${data.appointment.id} scheduled`, 'success');
      event.target.reset();
      await loadDashboard(true);
      switchTab('appointmentsTab');
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleUpdateInventory = async (event) => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(event.target).entries());
      await api('/inventory', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      UI.showToast('Inventory saved', 'success');
      await loadInventory();
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleCampaignCreate = async (event) => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(event.target).entries());
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      event.target.reset();
      UI.showToast('Campaign created', 'success');
      await loadCampaignBoards();
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleEligibility = (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target).entries());
    const result = $('#eligibilityResult');
    const accepts = (state.compatibility[form.recipientBloodGroup] || []).includes(form.donorBloodGroup);
    result.innerHTML = accepts
      ? `<div class="text-success"><strong>Compatible:</strong> ${form.donorBloodGroup} can donate to ${form.recipientBloodGroup}.</div>`
      : `<div class="text-danger"><strong>Not compatible:</strong> ${form.donorBloodGroup} cannot donate to ${form.recipientBloodGroup}.</div>`;
  };

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      UI.showToast('Copied to clipboard', 'success');
    } catch {
      UI.showToast('Copy failed', 'error');
    }
  };

  const handleRequestMatches = async (requestId) => {
    try {
      const data = await api(`/matches/${requestId}`);
      switchTab('donorsTab');
      UI.renderDonors($('#donorGrid'), data.donors, ['hospital', 'bloodbank', 'admin'].includes(state.user.role));
      $('#pageTitle').textContent = `Matches for ${requestId}`;
      $('#pageSubtitle').textContent = `${data.donors.length} compatible donor(s) found for ${data.request.patientName}.`;
      UI.showToast(`Loaded ${data.donors.length} donor matches`, 'info');
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const updateRequestStatus = async (requestId, status) => {
    try {
      await api(`/requests/${requestId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      UI.showToast(`Request ${requestId} updated`, 'success');
      await loadDashboard(true);
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const updateAppointmentStatus = async (appointmentId, status) => {
    try {
      await api(`/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      UI.showToast(`Appointment ${appointmentId} updated`, 'success');
      await loadDashboard(true);
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const joinCampaign = async (campaignId) => {
    try {
      await api(`/campaigns/${campaignId}/join`, { method: 'POST' });
      UI.showToast('Joined campaign successfully', 'success');
      await loadDashboard(true);
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const verifyUser = async (userId, verified) => {
    try {
      await api(`/admin/users/${userId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verified })
      });
      UI.showToast('User verification updated', 'success');
      await loadAdmin();
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const markNotificationsSeen = async () => {
    try {
      if (!state.dashboard?.notifications?.length) return;
      await Promise.all(
        state.dashboard.notifications
          .filter((item) => !item.read)
          .map((item) => api(`/notifications/${item.id}/read`, { method: 'PATCH' }))
      );
      UI.showToast('Notifications marked as viewed', 'success');
      await loadDashboard(true);
    } catch (error) {
      UI.showToast(error.message, 'error');
    }
  };

  const handleDelegatedClicks = (event) => {
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) return handleCopy(copyButton.dataset.copy);

    const matchButton = event.target.closest('.match-btn');
    if (matchButton) return handleRequestMatches(matchButton.dataset.requestId);

    const fillButton = event.target.closest('.fill-request-btn');
    if (fillButton) return updateRequestStatus(fillButton.dataset.requestId, 'Fulfilled');

    const useDonorButton = event.target.closest('.use-donor-btn');
    if (useDonorButton) {
      switchTab('appointmentsTab');
      refs.appointmentForm.elements.donorId.value = useDonorButton.dataset.donorId;
      return UI.showToast(`Donor ID ${useDonorButton.dataset.donorId} added to appointment form`, 'info');
    }

    const completeButton = event.target.closest('.appointment-complete-btn');
    if (completeButton) return updateAppointmentStatus(completeButton.dataset.appointmentId, 'Completed');

    const cancelButton = event.target.closest('.appointment-cancel-btn');
    if (cancelButton) return updateAppointmentStatus(cancelButton.dataset.appointmentId, 'Cancelled');

    const joinButton = event.target.closest('.join-campaign-btn');
    if (joinButton) return joinCampaign(joinButton.dataset.campaignId);

    const verifyButton = event.target.closest('.verify-user-btn');
    if (verifyButton) return verifyUser(verifyButton.dataset.userId, verifyButton.dataset.verified === 'true');
  };

  const bindEvents = () => {
    refs.openLogin.addEventListener('click', () => openModal('login'));
    refs.openRegister.addEventListener('click', () => openModal('register'));
    refs.heroStart.addEventListener('click', () => openModal('login'));
    refs.heroGuest.addEventListener('click', () => window.scrollTo({ top: document.querySelector('#features').offsetTop - 80, behavior: 'smooth' }));
    refs.closeAuthModal.addEventListener('click', closeModal);
    refs.loginTabBtn.addEventListener('click', () => setAuthMode('login'));
    refs.registerTabBtn.addEventListener('click', () => setAuthMode('register'));
    refs.loginForm.addEventListener('submit', handleLogin);
    refs.registerForm.addEventListener('submit', handleRegister);
    refs.logoutBtn.addEventListener('click', handleLogout);
    refs.toggleAvailabilityBtn.addEventListener('click', toggleAvailability);
    refs.refreshDashboardBtn.addEventListener('click', () => loadDashboard());
    refs.markAllReadBtn.addEventListener('click', markNotificationsSeen);
    refs.campaignExplore.addEventListener('click', loadCampaignBoards);
    refs.donorFilterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      loadDonors();
    });
    refs.requestFilterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      loadRequests();
    });
    refs.requestForm.addEventListener('submit', handleCreateRequest);
    refs.appointmentForm.addEventListener('submit', handleCreateAppointment);
    refs.inventoryForm.addEventListener('submit', handleUpdateInventory);
    refs.inventoryFilterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      loadInventory();
    });
    refs.campaignForm.addEventListener('submit', handleCampaignCreate);
    refs.eligibilityForm.addEventListener('submit', handleEligibility);
    document.addEventListener('click', handleDelegatedClicks);
    $$('.nav-btn').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    refs.authModal.addEventListener('click', (event) => {
      if (event.target === refs.authModal) closeModal();
    });
  };

  const boot = async () => {
    populateBloodSelects();
    bindEvents();
    try {
      await renderPublic();
      $('#presenceBadge').textContent = 'Live ready';
      if (!state.token) {
        setView(false);
        return;
      }
      const session = await api('/auth/me');
      saveSession(state.token, session.user);
      setView(true);
      connectSocket();
      await loadDashboard(true);
      const path = window.location.pathname;
      if (path.includes('dashboard')) switchTab('overviewTab');
    } catch (error) {
      clearSession();
      setView(false);
      UI.showToast(error.message, 'error');
    }
  };

  boot();
})();
