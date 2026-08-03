window.UI = (() => {
  const bloodGroups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const priorityClass = (priority = '') => {
    const map = { Critical: 'tag-danger', Urgent: 'text-warning', Normal: 'text-success' };
    return map[priority] || '';
  };

  const statusBadge = (status = '') => {
    const tone = {
      Open: 'tag-danger',
      Processing: 'text-warning',
      Scheduled: 'text-warning',
      Completed: 'text-success',
      Fulfilled: 'text-success',
      Cancelled: 'text-danger'
    }[status] || '';
    return `<span class="tag ${tone}">${escapeHtml(status)}</span>`;
  };

  const renderStats = (target, stats = {}) => {
    if (!target) return;
    const cards = [
      ['Donors', stats.donors ?? 0, 'Registered blood donors'],
      ['Available now', stats.availableDonors ?? 0, 'Ready for live matching'],
      ['Open requests', stats.openRequests ?? 0, 'Pending fulfillment'],
      ['Blood units', stats.inventoryUnits ?? 0, 'Tracked inventory total'],
      ['Hospitals', stats.hospitals ?? 0, 'Connected organizations'],
      ['Blood banks', stats.bloodBanks ?? 0, 'Supply nodes'],
      ['Completed appointments', stats.completedAppointments ?? 0, 'Donation visits finished']
    ];
    target.innerHTML = cards
      .map(
        ([label, value, hint]) => `
          <article class="stat-card">
            <div class="label">${escapeHtml(label)}</div>
            <div class="value">${escapeHtml(value)}</div>
            <div class="hint">${escapeHtml(hint)}</div>
          </article>
        `
      )
      .join('');
  };

  const renderFeed = (target, items = []) => {
    if (!target) return;
    if (!items.length) {
      target.innerHTML = '<div class="empty-state">No recent activity found.</div>';
      return;
    }
    target.innerHTML = items
      .map(
        (item) => `
          <article class="feed-item">
            <div class="meta">
              <span class="tag">${escapeHtml(item.type || item.kind || 'update')}</span>
              <span class="tag">${escapeHtml(formatDate(item.createdAt))}</span>
            </div>
            <strong>${escapeHtml(item.actorName || item.title || 'System event')}</strong>
            <p class="line-clamp-2">${escapeHtml(item.message || '')}</p>
          </article>
        `
      )
      .join('');
  };

  const renderCompatibility = (target, compatibility = {}) => {
    if (!target) return;
    target.innerHTML = bloodGroups
      .map(
        (group) => `
          <div class="compatibility-item">
            <h4>${escapeHtml(group)}</h4>
            <p class="muted">Can receive from</p>
            <div class="meta">${(compatibility[group] || [])
              .map((item) => `<span class="tag">${escapeHtml(item)}</span>`)
              .join(' ')}</div>
          </div>
        `
      )
      .join('');
  };

  const renderSelectOptions = (select) => {
    if (!select) return;
    const isFilter = !select.required;
    const lead = isFilter ? '<option value="">All blood groups</option>' : '<option value="">Select blood group</option>';
    select.innerHTML = lead + bloodGroups.map((group) => `<option value="${group}">${group}</option>`).join('');
  };

  const renderDonors = (target, donors = [], canAssign = false) => {
    if (!target) return;
    if (!donors.length) {
      target.innerHTML = '<div class="empty-state">No donors match this filter.</div>';
      return;
    }
    target.innerHTML = donors
      .map(
        (donor) => `
          <article class="card">
            <div class="meta">
              <span class="tag">${escapeHtml(donor.bloodGroup)}</span>
              <span class="tag">${escapeHtml(donor.city)}</span>
              <span class="tag ${donor.available ? 'tag-success' : 'tag-danger'}">${donor.available ? 'Available' : 'Unavailable'}</span>
            </div>
            <h4 class="card-title">${escapeHtml(donor.name)}</h4>
            <p>Email: ${escapeHtml(donor.email)}</p>
            <p>Phone: ${escapeHtml(donor.phone || 'N/A')}</p>
            <p>Reliability score: ${escapeHtml(donor.reliabilityScore || 0)}</p>
            <p>Last donation: ${escapeHtml(donor.lastDonation || 'Not shared')}</p>
            <div class="actions">
              <button class="btn btn-soft copy-btn" data-copy="${escapeHtml(donor.id)}">Copy ID</button>
              ${canAssign ? `<button class="btn btn-primary use-donor-btn" data-donor-id="${escapeHtml(donor.id)}">Use for appointment</button>` : ''}
            </div>
          </article>
        `
      )
      .join('');
  };

  const renderRequests = (target, requests = [], canManage = false) => {
    if (!target) return;
    if (!requests.length) {
      target.innerHTML = '<div class="empty-state">No blood requests available.</div>';
      return;
    }
    target.innerHTML = requests
      .map(
        (request) => `
          <article class="request-card">
            <div class="meta">
              <span class="tag ${priorityClass(request.priority)}">${escapeHtml(request.priority)}</span>
              <span class="tag">${escapeHtml(request.bloodGroup)}</span>
              ${statusBadge(request.status)}
            </div>
            <h4>${escapeHtml(request.patientName)}</h4>
            <p>${escapeHtml(request.hospital)} · ${escapeHtml(request.city)}</p>
            <p>${escapeHtml(request.units)} unit(s) needed · Contact ${escapeHtml(request.contactName || 'N/A')}</p>
            <p>${escapeHtml(request.notes || 'No additional notes')}</p>
            <div class="actions">
              <button class="btn btn-soft copy-btn" data-copy="${escapeHtml(request.id)}">Copy request ID</button>
              <button class="btn btn-soft match-btn" data-request-id="${escapeHtml(request.id)}">View matches</button>
              ${canManage ? `<button class="btn btn-primary fill-request-btn" data-request-id="${escapeHtml(request.id)}">Mark fulfilled</button>` : ''}
            </div>
          </article>
        `
      )
      .join('');
  };

  const renderMatches = (target, liveMatches = []) => {
    if (!target) return;
    if (!liveMatches.length) {
      target.innerHTML = '<div class="empty-state">No active matches at the moment.</div>';
      return;
    }
    target.innerHTML = liveMatches
      .map(
        ({ request, donors }) => `
          <article class="card">
            <div class="meta">
              <span class="tag ${priorityClass(request.priority)}">${escapeHtml(request.priority)}</span>
              <span class="tag">${escapeHtml(request.bloodGroup)}</span>
              <span class="tag">${escapeHtml(request.city)}</span>
            </div>
            <h4 class="card-title">${escapeHtml(request.patientName)}</h4>
            <p>${escapeHtml(request.hospital)} needs ${escapeHtml(request.units)} unit(s).</p>
            <div class="meta">
              ${donors.length ? donors.map((donor) => `<span class="tag">${escapeHtml(donor.name)} · ${escapeHtml(donor.bloodGroup)}</span>`).join('') : '<span class="tag tag-danger">No donor found yet</span>'}
            </div>
          </article>
        `
      )
      .join('');
  };

  const renderInventory = (target, inventory = []) => {
    if (!target) return;
    if (!inventory.length) {
      target.innerHTML = '<div class="empty-state">No inventory records available.</div>';
      return;
    }
    target.innerHTML = inventory
      .map(
        (item) => `
          <article class="inventory-card">
            <div class="meta">
              <span class="tag">${escapeHtml(item.bloodGroup)}</span>
              <span class="tag">${escapeHtml(item.city)}</span>
            </div>
            <h4>${escapeHtml(item.units)} unit(s)</h4>
            <p>Owner: ${escapeHtml(item.ownerId)}</p>
            <p>Updated: ${escapeHtml(formatDate(item.updatedAt))}</p>
          </article>
        `
      )
      .join('');
  };

  const renderCampaigns = (target, campaigns = [], showJoin = false) => {
    if (!target) return;
    if (!campaigns.length) {
      target.innerHTML = '<div class="empty-state">No campaigns yet.</div>';
      return;
    }
    target.innerHTML = campaigns
      .map((campaign) => {
        const percent = campaign.seats ? Math.round((Number(campaign.registered || 0) / Number(campaign.seats || 1)) * 100) : 0;
        return `
          <article class="card">
            <div class="meta">
              <span class="tag">${escapeHtml(campaign.city)}</span>
              <span class="tag">${escapeHtml(campaign.date)}</span>
            </div>
            <h4 class="card-title">${escapeHtml(campaign.title)}</h4>
            <p>${escapeHtml(campaign.venue)} · Organized by ${escapeHtml(campaign.organizer)}</p>
            <p>${escapeHtml(campaign.description || '')}</p>
            <div class="progress"><span style="width: ${percent}%;"></span></div>
            <p>${escapeHtml(campaign.registered || 0)} / ${escapeHtml(campaign.seats || 0)} seats filled</p>
            <div class="actions">
              ${showJoin ? `<button class="btn btn-primary join-campaign-btn" data-campaign-id="${escapeHtml(campaign.id)}">Join campaign</button>` : ''}
            </div>
          </article>
        `;
      })
      .join('');
  };

  const renderAppointments = (target, appointments = []) => {
    if (!target) return;
    if (!appointments.length) {
      target.innerHTML = '<div class="empty-state">No appointments scheduled.</div>';
      return;
    }
    target.innerHTML = appointments
      .map(
        (item) => `
          <article class="request-card">
            <div class="meta">
              <span class="tag">${escapeHtml(item.requestId)}</span>
              ${statusBadge(item.status)}
            </div>
            <h4>${escapeHtml(item.location)}</h4>
            <p>Donor ID: ${escapeHtml(item.donorId)}</p>
            <p>Scheduled at: ${escapeHtml(formatDate(item.scheduledAt))}</p>
            <p>${escapeHtml(item.note || 'No additional note')}</p>
            <div class="actions">
              <button class="btn btn-soft copy-btn" data-copy="${escapeHtml(item.id)}">Copy appointment ID</button>
              <button class="btn btn-primary appointment-complete-btn" data-appointment-id="${escapeHtml(item.id)}">Complete</button>
              <button class="btn btn-danger appointment-cancel-btn" data-appointment-id="${escapeHtml(item.id)}">Cancel</button>
            </div>
          </article>
        `
      )
      .join('');
  };

  const renderUsers = (target, users = []) => {
    if (!target) return;
    if (!users.length) {
      target.innerHTML = '<div class="empty-state">No users found.</div>';
      return;
    }
    target.innerHTML = users
      .map(
        (user) => `
          <article class="user-card">
            <div class="meta">
              <span class="tag">${escapeHtml(user.role)}</span>
              <span class="tag">${escapeHtml(user.city)}</span>
              <span class="tag ${user.verified ? 'tag-success' : 'tag-danger'}">${user.verified ? 'Verified' : 'Pending'}</span>
            </div>
            <h4>${escapeHtml(user.name)}</h4>
            <p>${escapeHtml(user.email)}</p>
            <p>${escapeHtml(user.bloodGroup || '—')} · ${escapeHtml(user.phone || 'No phone')}</p>
            <div class="actions">
              <button class="btn btn-soft copy-btn" data-copy="${escapeHtml(user.id)}">Copy ID</button>
              <button class="btn btn-primary verify-user-btn" data-user-id="${escapeHtml(user.id)}" data-verified="${user.verified ? 'false' : 'true'}">${user.verified ? 'Set pending' : 'Verify now'}</button>
            </div>
          </article>
        `
      )
      .join('');
  };

  const showToast = (message, tone = 'info') => {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const node = document.createElement('div');
    node.className = `toast ${tone}`;
    node.innerHTML = `<strong>${escapeHtml(tone.toUpperCase())}</strong><div class="mt-8">${escapeHtml(message)}</div>`;
    root.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  };

  return {
    bloodGroups,
    renderStats,
    renderFeed,
    renderCompatibility,
    renderSelectOptions,
    renderDonors,
    renderRequests,
    renderMatches,
    renderInventory,
    renderCampaigns,
    renderAppointments,
    renderUsers,
    statusBadge,
    showToast,
    formatDate
  };
})();
