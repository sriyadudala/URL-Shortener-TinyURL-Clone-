/* ==========================================================================
   LuminaLink Frontend Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const shortenForm = document.getElementById('shorten-form');
  const longUrlInput = document.getElementById('long-url');
  const customAliasInput = document.getElementById('custom-alias');
  const expiresAtInput = document.getElementById('expires-at');
  const submitBtn = document.getElementById('submit-btn');

  // Accordion
  const toggleAdvancedBtn = document.getElementById('toggle-advanced');
  const advancedOptions = document.getElementById('advanced-options');

  // Result Section
  const resultContainer = document.getElementById('result-container');
  const closeResultBtn = document.getElementById('close-result');
  const generatedUrlInput = document.getElementById('generated-url');
  const copyBtn = document.getElementById('copy-btn');
  const resultQrcodeDiv = document.getElementById('result-qrcode');
  const resultOriginalLink = document.getElementById('result-original-link');
  const resultExpirationText = document.getElementById('result-expiration-text');
  const viewNewStatsBtn = document.getElementById('view-new-stats-btn');

  // Dashboard Section
  const linksGrid = document.getElementById('links-grid');
  const dashboardEmpty = document.getElementById('dashboard-empty');
  const dashboardLoading = document.getElementById('dashboard-loading');
  const refreshBtn = document.getElementById('refresh-btn');
  const searchInput = document.getElementById('search-input');

  // Modal Analytics
  const analyticsModal = document.getElementById('analytics-modal');
  const closeModalBtn = document.getElementById('close-modal');
  const modalShortCode = document.getElementById('modal-short-code');
  const modalLongUrl = document.getElementById('modal-long-url');
  const statTotalClicks = document.getElementById('stat-total-clicks');
  const statStatus = document.getElementById('stat-status');
  const statCreatedDate = document.getElementById('stat-created-date');
  const modalQrcodeDiv = document.getElementById('modal-qrcode');
  const downloadQrBtn = document.getElementById('download-qr-btn');
  const referrersList = document.getElementById('referrers-list');

  // State Variables
  let currentLinksData = [];
  let currentActiveCode = null;
  let timelineChartInstance = null;
  let devicesChartInstance = null;
  let browsersChartInstance = null;

  // Initialize App
  init();

  function init() {
    setupEventListeners();
    fetchLinks();
  }

  function setupEventListeners() {
    // Accordion Toggle
    toggleAdvancedBtn.addEventListener('click', () => {
      toggleAdvancedBtn.classList.toggle('active');
      advancedOptions.classList.toggle('open');
    });

    // Shorten Form Submit
    shortenForm.addEventListener('submit', handleShortenSubmit);

    // Copy Result Button
    copyBtn.addEventListener('click', () => {
      copyToClipboard(generatedUrlInput.value, copyBtn);
    });

    // Close Result Box
    closeResultBtn.addEventListener('click', () => {
      resultContainer.classList.add('hide');
    });

    // View Stats from Result Box
    viewNewStatsBtn.addEventListener('click', () => {
      if (currentActiveCode) {
        openAnalyticsModal(currentActiveCode);
      }
    });

    // Refresh Dashboard
    refreshBtn.addEventListener('click', () => {
      refreshBtn.querySelector('i').classList.add('fa-spin');
      fetchLinks().then(() => {
        setTimeout(() => {
          refreshBtn.querySelector('i').classList.remove('fa-spin');
        }, 500);
      });
    });

    // Search Input Filter
    searchInput.addEventListener('input', () => {
      renderLinksGrid(filterLinks(currentLinksData, searchInput.value));
    });

    // Close Modal
    closeModalBtn.addEventListener('click', closeAnalyticsModal);
    analyticsModal.addEventListener('click', (e) => {
      if (e.target === analyticsModal) {
        closeAnalyticsModal();
      }
    });

    // Download QR Code
    downloadQrBtn.addEventListener('click', handleQrDownload);
  }

  /* ==========================================================================
     API Calls & Logic
     ========================================================================== */

  async function handleShortenSubmit(e) {
    e.preventDefault();

    const longUrl = longUrlInput.value.trim();
    const customCode = customAliasInput.value.trim();
    const expiresAt = expiresAtInput.value;

    if (!longUrl) {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    // Set Loading State
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Shortening...</span> <i class="fa-solid fa-circle-notch fa-spin"></i>`;

    try {
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longUrl, customCode, expiresAt })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create short URL');
      }

      // Display Result
      currentActiveCode = data.code;
      displayResult(data);
      showToast('URL shortened successfully!', 'success');

      // Reset Form fields
      longUrlInput.value = '';
      customAliasInput.value = '';
      expiresAtInput.value = '';

      // Refresh Dashboard Links
      fetchLinks();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Shorten Link</span> <i class="fa-solid fa-wand-magic-sparkles"></i>`;
    }
  }

  function displayResult(data) {
    resultContainer.classList.remove('hide');
    generatedUrlInput.value = data.shortUrl;

    resultOriginalLink.href = data.longUrl;
    resultOriginalLink.textContent = data.longUrl;

    if (data.expiresAt) {
      const expDate = new Date(data.expiresAt).toLocaleString();
      resultExpirationText.innerHTML = `<strong>Expires:</strong> <span style="color: var(--accent-amber);">${expDate}</span>`;
    } else {
      resultExpirationText.innerHTML = `<strong>Expires:</strong> Never`;
    }

    // Generate QR Code inside result-qrcode
    resultQrcodeDiv.innerHTML = '';
    new QRCode(resultQrcodeDiv, {
      text: data.shortUrl,
      width: 100,
      height: 100,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    // Smooth scroll to result
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function fetchLinks() {
    dashboardLoading.classList.remove('hide');
    dashboardEmpty.classList.add('hide');

    try {
      const response = await fetch('/api/urls');
      const links = await response.json();

      currentLinksData = links;
      renderLinksGrid(filterLinks(currentLinksData, searchInput.value));
    } catch (err) {
      showToast('Error loading link directory', 'error');
    } finally {
      dashboardLoading.classList.add('hide');
    }
  }

  function filterLinks(links, query) {
    if (!query) return links;
    const q = query.toLowerCase().trim();
    return links.filter(link => 
      link.code.toLowerCase().includes(q) || 
      link.longUrl.toLowerCase().includes(q)
    );
  }

  function renderLinksGrid(links) {
    linksGrid.innerHTML = '';

    if (links.length === 0) {
      dashboardEmpty.classList.remove('hide');
      return;
    }

    dashboardEmpty.classList.add('hide');

    links.forEach(link => {
      const fullShortUrl = `${window.location.origin}/${link.code}`;
      const statusClass = link.isExpired ? 'status-expired' : 'status-active';
      const statusText = link.isExpired ? 'Expired' : 'Active';
      const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      const card = document.createElement('div');
      card.className = 'glass-card link-card';
      card.innerHTML = `
        <div class="card-top">
          <div class="code-title">/${link.code}</div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        
        <div class="card-long-url" title="${escapeHtml(link.longUrl)}">
          <i class="fa-solid fa-arrow-right-to-bracket" style="margin-right: 6px; color: var(--text-dim);"></i>
          ${escapeHtml(link.longUrl)}
        </div>

        <div class="card-stats-row">
          <span class="stat-pill"><i class="fa-solid fa-chart-simple"></i> ${link.clicks} clicks</span>
          <span class="stat-pill"><i class="fa-regular fa-calendar"></i> ${formattedDate}</span>
        </div>

        <div class="card-actions">
          <button class="icon-action-btn copy-card-btn" data-url="${fullShortUrl}">
            <i class="fa-regular fa-copy"></i> Copy
          </button>
          <button class="icon-action-btn stats-card-btn" data-code="${link.code}">
            <i class="fa-solid fa-chart-line"></i> Analytics
          </button>
          <button class="icon-action-btn delete-btn delete-card-btn" data-code="${link.code}">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      `;

      // Attach Card Button Event Listeners
      const copyBtnEl = card.querySelector('.copy-card-btn');
      copyBtnEl.addEventListener('click', () => copyToClipboard(fullShortUrl, copyBtnEl));

      const statsBtnEl = card.querySelector('.stats-card-btn');
      statsBtnEl.addEventListener('click', () => openAnalyticsModal(link.code));

      const deleteBtnEl = card.querySelector('.delete-card-btn');
      deleteBtnEl.addEventListener('click', () => deleteLink(link.code));

      linksGrid.appendChild(card);
    });
  }

  async function deleteLink(code) {
    if (!confirm(`Are you sure you want to delete /${code}?`)) return;

    try {
      const response = await fetch(`/api/urls/${code}`, { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to delete link');

      showToast(`Link /${code} deleted`, 'info');
      fetchLinks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  /* ==========================================================================
     Analytics Modal & Charts
     ========================================================================== */

  async function openAnalyticsModal(code) {
    try {
      const response = await fetch(`/api/stats/${code}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Unable to fetch analytics');

      // Populate Modal Fields
      modalShortCode.textContent = `/${data.code}`;
      modalLongUrl.textContent = data.longUrl;
      modalLongUrl.href = data.longUrl;
      statTotalClicks.textContent = data.clicks;
      
      statStatus.textContent = data.isExpired ? 'Expired' : 'Active';
      statStatus.style.color = data.isExpired ? 'var(--accent-rose)' : 'var(--accent-emerald)';

      statCreatedDate.textContent = new Date(data.createdAt).toLocaleDateString();

      // Modal QR Code
      modalQrcodeDiv.innerHTML = '';
      const fullUrl = `${window.location.origin}/${data.code}`;
      new QRCode(modalQrcodeDiv, {
        text: fullUrl,
        width: 140,
        height: 140,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });

      // Render Analytics Charts & Lists
      renderCharts(data.visits);
      renderReferrers(data.visits);

      // Show Modal
      analyticsModal.classList.remove('hide');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function closeAnalyticsModal() {
    analyticsModal.classList.add('hide');
  }

  function renderCharts(visits) {
    // 1. Timeline Data (Group by date)
    const visitsByDate = {};
    visits.forEach(v => {
      const dateStr = new Date(v.timestamp).toLocaleDateString();
      visitsByDate[dateStr] = (visitsByDate[dateStr] || 0) + 1;
    });

    const timelineLabels = Object.keys(visitsByDate);
    const timelineCounts = Object.values(visitsByDate);

    // Destroy existing chart instance
    if (timelineChartInstance) timelineChartInstance.destroy();

    const timelineCtx = document.getElementById('timeline-chart').getContext('2d');
    timelineChartInstance = new Chart(timelineCtx, {
      type: 'line',
      data: {
        labels: timelineLabels.length ? timelineLabels : ['No Clicks Yet'],
        datasets: [{
          label: 'Clicks',
          data: timelineCounts.length ? timelineCounts : [0],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ec4899'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#a09cb0' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
          y: { ticks: { color: '#a09cb0', stepSize: 1 }, grid: { color: 'rgba(255, 255, 255, 0.05)' }, beginAtZero: true }
        }
      }
    });

    // 2. Devices Data
    const devicesCount = {};
    visits.forEach(v => {
      const dev = v.device || 'Desktop';
      devicesCount[dev] = (devicesCount[dev] || 0) + 1;
    });

    const deviceLabels = Object.keys(devicesCount);
    const deviceValues = Object.values(devicesCount);

    if (devicesChartInstance) devicesChartInstance.destroy();
    const devicesCtx = document.getElementById('devices-chart').getContext('2d');
    devicesChartInstance = new Chart(devicesCtx, {
      type: 'doughnut',
      data: {
        labels: deviceLabels.length ? deviceLabels : ['Desktop'],
        datasets: [{
          data: deviceValues.length ? deviceValues : [1],
          backgroundColor: ['#8b5cf6', '#06b6d4', '#ec4899', '#10b981'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#a09cb0', font: { size: 11 } } }
        }
      }
    });

    // 3. Browsers Data
    const browsersCount = {};
    visits.forEach(v => {
      const b = v.browser || 'Other';
      browsersCount[b] = (browsersCount[b] || 0) + 1;
    });

    const browserLabels = Object.keys(browsersCount);
    const browserValues = Object.values(browsersCount);

    if (browsersChartInstance) browsersChartInstance.destroy();
    const browsersCtx = document.getElementById('browsers-chart').getContext('2d');
    browsersChartInstance = new Chart(browsersCtx, {
      type: 'doughnut',
      data: {
        labels: browserLabels.length ? browserLabels : ['Chrome'],
        datasets: [{
          data: browserValues.length ? browserValues : [1],
          backgroundColor: ['#3b82f6', '#f59e0b', '#ec4899', '#10b981', '#6e6a82'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#a09cb0', font: { size: 11 } } }
        }
      }
    });
  }

  function renderReferrers(visits) {
    referrersList.innerHTML = '';

    if (!visits || visits.length === 0) {
      referrersList.innerHTML = `<li class="referrer-item"><span>Direct / None</span><span class="count">0</span></li>`;
      return;
    }

    const referrerCounts = {};
    visits.forEach(v => {
      const ref = v.referrer || 'Direct';
      referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    });

    const sortedReferrers = Object.entries(referrerCounts).sort((a, b) => b[1] - a[1]);

    sortedReferrers.forEach(([ref, count]) => {
      const li = document.createElement('li');
      li.className = 'referrer-item';
      li.innerHTML = `
        <span><i class="fa-solid fa-compass" style="margin-right: 6px; color: var(--accent-cyan);"></i> ${escapeHtml(ref)}</span>
        <span class="count">${count}</span>
      `;
      referrersList.appendChild(li);
    });
  }

  function handleQrDownload() {
    const qrImg = modalQrcodeDiv.querySelector('img') || modalQrcodeDiv.querySelector('canvas');
    if (!qrImg) return;

    let src = '';
    if (qrImg.tagName.toLowerCase() === 'img') {
      src = qrImg.src;
    } else if (qrImg.tagName.toLowerCase() === 'canvas') {
      src = qrImg.toDataURL('image/png');
    }

    const a = document.createElement('a');
    a.href = src;
    a.download = `lumina-qr-${modalShortCode.textContent.replace('/', '')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('QR Code downloaded', 'success');
  }

  /* ==========================================================================
     Helper Utilities
     ========================================================================== */

  function copyToClipboard(text, btnElement) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!', 'success');
      if (btnElement) {
        const originalText = btnElement.innerHTML;
        btnElement.classList.add('copied');
        btnElement.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
        setTimeout(() => {
          btnElement.classList.remove('copied');
          btnElement.innerHTML = originalText;
        }, 2000);
      }
    }).catch(() => {
      showToast('Failed to copy text', 'error');
    });
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${iconClass}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
