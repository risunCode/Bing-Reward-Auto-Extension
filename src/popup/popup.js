import { generateLongRandomTopics, generateTopicsOrganicFast } from "../modules/logic/generator.js";

// Elements
const countInput = document.getElementById('count');
const searchIdInput = document.getElementById('searchId');
const delaySecInput = document.getElementById('delaySec');
const genBtn = document.getElementById('genBtn');
const startOpenBtn = document.getElementById('startOpenBtn');
const saveBtn = document.getElementById('saveBtn');
const emergencyStopBtn = document.getElementById('emergencyStopBtn');
const results = document.getElementById('results');
const topicList = document.getElementById('topicList');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const progressText = document.getElementById('progressText');

// no UA/mobile spoofing code

let generatedTopics = [];
let isRunning = false;
let currentTabIndex = 0;
let progressTimer = null;

// Load saved values from localStorage
function loadSavedValues() {
  const saved = localStorage.getItem('bingAutomate');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.searchId) searchIdInput.value = data.searchId;
      if (data.delaySec) delaySecInput.value = data.delaySec;
      if (data.count) countInput.value = data.count;
    } catch (e) {
      console.error('Error loading saved data:', e);
    }
  }

  // UA/mobile spoofing removed
}

// Save current values to localStorage
async function saveValues() {
  // Keep button label as "Save" and show a toast instead
  saveBtn.disabled = true;
  const data = {
    searchId: searchIdInput.value.trim(),
    delaySec: delaySecInput.value,
    count: countInput.value
  };
  localStorage.setItem('bingAutomate', JSON.stringify(data));
  showToast('Settings saved!');
  setTimeout(() => {
    saveBtn.disabled = false;
  }, 250);
}

function showToast(message) {
  try {
    // Remove existing toast if present
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    // force reflow to enable transition
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    }, 1400);
  } catch (e) {
    // Fallback: alert
    console.warn('Toast failed:', e);
  }
}

saveBtn.addEventListener('click', saveValues);

genBtn.addEventListener('click', async () => {
  const count = parseInt(countInput.value, 10);
  if (!Number.isFinite(count) || count < 1) {
    alert('Count must be >= 1');
    return;
  }

  genBtn.disabled = true;
  genBtn.textContent = 'Generating...';
  try {
    // Only two modes: Online Organic Fast, then Offline fallback
    const withTimeout = (p, ms) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);

    let success = false;
    try {
      console.debug('[Generate] Trying organic fast...');
      const organicFast = await withTimeout(generateTopicsOrganicFast(count, 6, 8), 1600);
      if (Array.isArray(organicFast) && organicFast.length) {
        generatedTopics = organicFast;
        renderTopics();
        updateStatus('Generated (organic multi-source fast)', 0, generatedTopics.length);
        success = true;
      }
    } catch (_) { /* timeout -> fallback */ }

    if (!success) {
      const offline = generateLongRandomTopics(count, 6, 8);
      generatedTopics = offline;
      renderTopics();
      updateStatus('Generated (offline fallback)', 0, generatedTopics.length);
    }

    // Enable start button on any generation result
    startOpenBtn.disabled = false;
    startOpenBtn.classList.remove('primary');
    startOpenBtn.classList.add('success');
  } catch (e) {
    console.error(e);
    alert('Failed to generate topics.');
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = 'Generate';
  }
});

// no UA test/random handlers

function renderTopics() {
  topicList.innerHTML = '';
  for (const t of generatedTopics) {
    const li = document.createElement('li');
    li.textContent = t;
    topicList.appendChild(li);
  }
  results.classList.toggle('hidden', generatedTopics.length === 0);
}

function updateStatus(status, current, total) {
  statusText.textContent = status;
  progressText.textContent = `${current}/${total} tabs`;
  statusBar.classList.remove('hidden');
}

startOpenBtn.addEventListener('click', async () => {
  if (isRunning) {
    // Stop task
    isRunning = false;
    startOpenBtn.textContent = 'Start Task';
    startOpenBtn.classList.add('primary');
    startOpenBtn.classList.remove('success');
    updateStatus('Stopped', currentTabIndex, generatedTopics.length);
    emergencyStopBtn.disabled = true;
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    try { await chrome.runtime.sendMessage({ type: 'STOP_ALL' }); } catch {}
    return;
  }

  const searchId = searchIdInput.value.trim();
  const delaySec = parseFloat(delaySecInput.value);
  if (!searchId) {
    alert('Please enter SearchID (form).');
    return;
  }
  if (!generatedTopics.length) {
    alert('No topics generated yet.');
    return;
  }

  // Start task
  isRunning = true;
  currentTabIndex = 0;
  startOpenBtn.textContent = 'Stop Task';
  startOpenBtn.classList.remove('primary');
  startOpenBtn.classList.remove('success');
  updateStatus('Starting...', 0, generatedTopics.length);
  emergencyStopBtn.disabled = false;

  const delayMs = Number.isFinite(delaySec) ? Math.max(0, delaySec) * 1000 : 3000;
  
  // Send message to background to start opening tabs
  await chrome.runtime.sendMessage({
    type: 'OPEN_BING_TABS',
    payload: { queries: generatedTopics, searchId, delayMs }
  });

  // Simulate progress updates (since we can't get real-time updates from background)
  simulateProgress();
});

function simulateProgress() {
  const delayMs = Number.isFinite(parseFloat(delaySecInput.value)) ? parseFloat(delaySecInput.value) * 1000 : 3000;
  
  progressTimer = setInterval(() => {
    if (!isRunning || currentTabIndex >= generatedTopics.length) {
      clearInterval(progressTimer);
      progressTimer = null;
      if (isRunning) {
        isRunning = false;
        startOpenBtn.textContent = 'Start Task';
        startOpenBtn.classList.add('primary');
        startOpenBtn.classList.remove('success');
        updateStatus('Completed', generatedTopics.length, generatedTopics.length);
      }
      emergencyStopBtn.disabled = true;
      return;
    }
    
    currentTabIndex++;
    updateStatus('Opening tabs...', currentTabIndex, generatedTopics.length);
  }, delayMs);
}

// Initialize
loadSavedValues();

// Emergency Stop click
emergencyStopBtn.addEventListener('click', async () => {
  try { await chrome.runtime.sendMessage({ type: 'STOP_ALL' }); } catch {}
  isRunning = false;
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  startOpenBtn.textContent = 'Start Task';
  startOpenBtn.classList.add('primary');
  startOpenBtn.classList.remove('success');
  updateStatus('Task stopped', currentTabIndex, generatedTopics.length);
  emergencyStopBtn.disabled = true;
});
