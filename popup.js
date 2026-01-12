document.addEventListener("DOMContentLoaded", () => {
  // Initialize UI elements
  const emailList = document.getElementById("emailList");
  const phoneList = document.getElementById("phoneList");
  const loadingContainer = document.getElementById("loading");
  const errorContainer = document.getElementById("error");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const copyAllEmailsBtn = document.getElementById("copyAllEmailsBtn");
  const copyAllPhonesBtn = document.getElementById("copyAllPhonesBtn");
  const emailCountBadge = document.getElementById("emailCount");
  const phoneCountBadge = document.getElementById("phoneCount");
  const domainToggle = document.getElementById("domainToggle");
  // Settings UI
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettings = document.getElementById("closeSettings");
  const blacklistInput = document.getElementById("blacklistInput");
  const addBlacklistBtn = document.getElementById("addBlacklistBtn");
  const blacklistItems = document.getElementById("blacklistItems");
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const resetUsageBtn = document.getElementById("resetUsageBtn");
  const usageDecisiveEl = document.getElementById("usageDecisive");
  const usageRemainingEl = document.getElementById("usageRemaining");
  const usageCostEl = document.getElementById("usageCost");

  let extractedGroups = [];
  let extractedLoosePhones = [];
  let blacklist = [];
  let isGroupingEnabled = false;

  // Initialize copy & export buttons
  const exportCsvBtn = document.getElementById("exportCsvBtn");

  copyAllBtn.addEventListener("click", copyAllData);
  if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportToCsv);
  copyAllEmailsBtn.addEventListener("click", () => copySectionData('email'));
  copyAllPhonesBtn.addEventListener("click", () => copySectionData('phone'));

  // Load settings
  chrome.storage.local.get(['isGroupingEnabled', 'blacklist'], (result) => {
    isGroupingEnabled = result.isGroupingEnabled || false;
    if (domainToggle) domainToggle.checked = isGroupingEnabled;

    blacklist = result.blacklist || [];
    renderBlacklistUI();
  });

  if (domainToggle) {
    domainToggle.addEventListener("change", (e) => {
      isGroupingEnabled = e.target.checked;
      chrome.storage.local.set({ isGroupingEnabled: isGroupingEnabled });
      renderData();
    });
  }

  // Settings Logic
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
      if (settingsPanel.style.display === "block") {
        renderUsageUI();
      }
    });
  }
  if (closeSettings) {
    closeSettings.addEventListener("click", () => {
      settingsPanel.style.display = "none";
    });
  }

  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all verification results?")) {
        verificationCache = {};
        chrome.storage.local.set({ verificationCache: {} });
        renderData();
        showToast("Cache Cleared");
      }
    });
  }

  if (resetUsageBtn) {
    resetUsageBtn.addEventListener("click", () => {
      if (confirm("Reset usage statistics?")) {
        resetUsageStats();
        showToast("Usage Stats Reset");
      }
    });
  }

  if (addBlacklistBtn) {
    addBlacklistBtn.addEventListener("click", addToBlacklist);
  }

  function addToBlacklist() {
    const domain = blacklistInput.value.trim().toLowerCase();
    if (domain && !blacklist.includes(domain)) {
      blacklist.push(domain);
      chrome.storage.local.set({ blacklist: blacklist });
      blacklistInput.value = '';
      renderBlacklistUI();
      renderData(); // Re-render with new filter
    }
  }

  // Toast Helper
  function showToast(message, type = 'info') {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.className = "toast show";
    if (type === 'error') toast.classList.add("error");

    setTimeout(() => {
      toast.className = "toast";
    }, 3500);
  }

  function removeFromBlacklist(domain) {
    blacklist = blacklist.filter(d => d !== domain);
    chrome.storage.local.set({ blacklist: blacklist });
    renderBlacklistUI();
    renderData();
  }

  function renderBlacklistUI() {
    blacklistItems.innerHTML = '';
    blacklist.forEach(domain => {
      const tag = document.createElement("div");
      tag.className = "blacklist-tag";
      tag.innerHTML = `
            ${domain}
            <span class="remove-tag">×</span>
          `;
      tag.querySelector(".remove-tag").addEventListener("click", () => removeFromBlacklist(domain));
      blacklistItems.appendChild(tag);
    });
  }

  // Ensure Phone List section is visible

  // Ensure Phone List section is visible
  if (phoneList) {
    const section = phoneList.closest('.section');
    if (section) {
      section.style.display = 'block';
    }
  }

  // Start extraction automatically
  extractData();

  function extractData() {
    // Clear previous results
    emailList.innerHTML = '';
    phoneList.innerHTML = '';
    loadingContainer.style.display = "flex";
    errorContainer.style.display = "none";
    extractedGroups = [];
    extractedLoosePhones = [];

    // Request data from content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];

      chrome.tabs.sendMessage(activeTab.id, { action: "getData" }, (response) => {
        loadingContainer.style.display = "none";

        if (chrome.runtime.lastError) {
          showError("Please refresh the page to enable extraction.");
          return;
        }

        if (response && response.data) {
          // New structure: { groups: [], loosePhones: [] }
          extractedGroups = response.data.groups || [];
          extractedLoosePhones = response.data.loosePhones || [];
          renderData();
        } else {
          showEmptyMessage(emailList, "No data found");
        }
      });
    });
  }

  function renderData() {
    emailList.innerHTML = '';
    phoneList.innerHTML = '';

    // Filter groups based on blacklist
    // A group is an individual email item here {email, phones}
    const filteredGroups = extractedGroups.filter(item => {
      const domain = item.email.split('@')[1] || '';
      return !blacklist.includes(domain.toLowerCase());
    });

    // Update counts
    const totalEmails = filteredGroups.length;
    emailCountBadge.textContent = totalEmails;

    phoneCountBadge.textContent = extractedLoosePhones.length;


    if (filteredGroups.length === 0) {
      showEmptyMessage(emailList, "No email addresses found" + (blacklist.length > 0 ? " (check blacklist)" : ""));
    } else {
      renderEmails(filteredGroups);
    }

    if (extractedLoosePhones.length === 0) {
      showEmptyMessage(phoneList, "No extra phone numbers found");
    } else {
      renderPhones();
    }
  }

  function renderEmails(data) {
    // If no data passed, fallback to all (though call site should pass filtered)
    const itemsToRender = data || extractedGroups;

    if (isGroupingEnabled) {
      // Group by DOMAIN
      const groups = {};
      itemsToRender.forEach(item => {
        const domain = item.email.split('@')[1] || 'other';
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(item);
      });

      const sortedDomains = Object.keys(groups).sort();

      sortedDomains.forEach(domain => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'domain-group';

        const header = document.createElement('div');
        header.className = 'domain-header';

        const titleDiv = document.createElement('div');
        titleDiv.style.display = 'flex';
        titleDiv.style.alignItems = 'center';
        titleDiv.style.gap = '8px';
        titleDiv.innerHTML = `${domain} <span class="domain-count">${groups[domain].length}</span>`;

        // Copy button for group
        const copyGroupBtn = createCopyButton();
        const groupText = groups[domain].map(formatItemForCopy).join('\n');

        copyGroupBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          copyToClipboard(groupText, copyGroupBtn);
        });

        header.appendChild(titleDiv);
        header.appendChild(copyGroupBtn);
        groupDiv.appendChild(header);

        groups[domain].forEach(item => {
          const itemEl = createResultItem(item);
          groupDiv.appendChild(itemEl);
        });

        emailList.appendChild(groupDiv);
      });

    } else {
      // Flat list
      itemsToRender.forEach(item => {
        emailList.appendChild(createResultItem(item));
      });
    }
  }

  function renderPhones() {
    extractedLoosePhones.forEach(phone => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "info-item";

      const textDiv = document.createElement("div");
      textDiv.className = "value";
      textDiv.textContent = phone;

      const actionsDiv = createActionButtonsForPhone(phone);

      itemDiv.appendChild(textDiv);
      itemDiv.appendChild(actionsDiv);
      phoneList.appendChild(itemDiv);
    });
  }

  function createResultItem(item) {
    const itemDiv = document.createElement("div");
    itemDiv.className = "info-item";
    itemDiv.style.flexDirection = "column";
    itemDiv.style.alignItems = "flex-start";
    itemDiv.style.gap = "4px";

    // Top row: Email + Copy
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.width = "100%";
    topRow.style.alignItems = "center";
    topRow.style.gap = "8px";

    const emailSpan = document.createElement("div");
    emailSpan.className = "value";
    emailSpan.textContent = item.email;
    emailSpan.style.fontWeight = "500";

    // Check if verified
    let statusEl = null;
    if (verificationCache && verificationCache[item.email]) {
      statusEl = createStatusBadge(verificationCache[item.email]);
    } else {
      // Verify Button
      statusEl = document.createElement("button");
      statusEl.className = "verify-btn";
      statusEl.title = "Verify Email";
      statusEl.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
        `;
      statusEl.addEventListener("click", (e) => {
        e.stopPropagation();
        verifyEmail(item.email, statusEl);
      });
    }

    const copyBtn = createCopyButton();
    const copyText = formatItemForCopy(item);
    copyBtn.addEventListener("click", () => copyToClipboard(copyText, copyBtn));

    // Right side actions container
    const actionsRight = document.createElement("div");
    actionsRight.style.display = "flex";
    actionsRight.style.alignItems = "center";
    actionsRight.style.gap = "4px";

    actionsRight.appendChild(statusEl);
    actionsRight.appendChild(copyBtn);

    topRow.appendChild(emailSpan);
    topRow.appendChild(actionsRight);
    itemDiv.appendChild(topRow);

    // Bottom row: Phones (if any)
    if (item.phones && item.phones.length > 0) {
      item.phones.forEach(phone => {
        const phoneRow = document.createElement("div");
        phoneRow.style.display = "flex";
        phoneRow.style.alignItems = "center";
        phoneRow.style.justifyContent = "space-between";
        phoneRow.style.width = "100%";
        phoneRow.style.fontSize = "0.9em";
        phoneRow.style.color = "#666";
        phoneRow.style.marginTop = "2px";

        // Left side: Icon + Number
        const phoneLeft = document.createElement("div");
        phoneLeft.style.display = "flex";
        phoneLeft.style.alignItems = "center";
        phoneLeft.style.gap = "6px";
        phoneLeft.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>${phone}</span>
            `;

        const actionsDiv = createActionButtonsForPhone(phone);

        phoneRow.appendChild(phoneLeft);
        phoneRow.appendChild(actionsDiv);
        itemDiv.appendChild(phoneRow);
      });
    }

    return itemDiv;
  }

  function createActionButtonsForPhone(phone) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.gap = "4px";
    container.style.alignItems = "center";

    // WhatsApp Button
    const waBtn = document.createElement("a");
    const cleanDigits = phone.replace(/\D/g, '');
    waBtn.href = "#";
    waBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = `https://api.whatsapp.com/send/?phone=${cleanDigits}&text&type=phone_number&app_absent=0`;
      chrome.tabs.create({ url: url, active: false });
    });
    waBtn.className = "copy-button"; // Reuse style
    waBtn.title = "Chat on WhatsApp";
    waBtn.innerHTML = `
         <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471.148-.67.445-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
         </svg>
      `;
    // Small tweak to align styling
    waBtn.style.display = "flex";
    waBtn.style.alignItems = "center";
    waBtn.style.padding = "4px";
    waBtn.style.color = "#25D366"; // WhatsApp Green

    // Copy Button
    const copyBtn = createCopyButton();
    copyBtn.style.padding = "4px";

    const cleanPhoneForCopy = phone.replace(/^\+/, '');
    copyBtn.addEventListener("click", () => copyToClipboard(cleanPhoneForCopy, copyBtn));

    container.appendChild(waBtn);
    container.appendChild(copyBtn);
    return container;
  }


  // Format: email : : number (stripping +)
  function formatItemForCopy(item) {
    let str = item.email;
    if (item.phones.length > 0) {
      // Join multiple phones if exists, strip +
      const phones = item.phones.map(p => p.replace(/^\+/, '')).join(", ");
      str += " : : " + phones;
    }
    return str;
  }

  function createCopyButton() {
    const btn = document.createElement("button");
    btn.className = "copy-button";
    btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="8" y="8" width="12" height="12" rx="1"/>
            <path d="M16 8V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/>
        </svg>
     `;
    return btn;
  }

  function showEmptyMessage(container, message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "empty-state";
    messageDiv.textContent = message;
    container.appendChild(messageDiv);
  }

  function showError(message) {
    errorContainer.style.display = "block";
    errorContainer.textContent = message;
  }

  async function copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const originalHTML = button.innerHTML;
      button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      button.classList.add('copied');
      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = originalHTML;
      }, 1500);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  async function copyAllData() {
    let fullText = "";

    if (extractedGroups.length > 0) {
      fullText += extractedGroups.map(formatItemForCopy).join('\n');
    }

    // User requested specific format. If we add Loose phones, maybe separate them?
    // "option to copy the number associated with and email" -> satisfied
    // "only number option as well like before they should be saprate" -> satisfied
    // If I copy ALL, should I include loose phones?
    // The user's example only showed email lines. 
    // I'll append loose phones at the bottom for completeness, separated by newline.

    if (extractedLoosePhones.length > 0) {
      if (fullText) fullText += "\n\n";
      fullText += extractedLoosePhones.map(p => p.replace(/^\+/, '')).join('\n');
    }

    if (fullText) copyToClipboard(fullText, copyAllBtn);
  }

  async function copySectionData(type) {
    let text = "";
    if (type === 'email') {
      text = extractedGroups.map(formatItemForCopy).join('\n');
    } else if (type === 'phone') {
      const connected = extractedGroups.flatMap(i => i.phones);
      const all = [...connected, ...extractedLoosePhones];
      const unique = [...new Set(all)];
      text = unique.map(p => p.replace(/^\+/, '')).join('\n');
    }

    if (!text) return;

    const button = type === 'email' ? copyAllEmailsBtn : copyAllPhonesBtn;
    await copyToClipboard(text, button);
  }

  function exportToCsv() {
    if (extractedGroups.length === 0 && extractedLoosePhones.length === 0) {
      alert("No data to export.");
      return;
    }

    const rows = [["Email", "Phones", "Verification", "Quality", "Role", "Free"]];

    extractedGroups.forEach(item => {
      const phones = item.phones.join("; ");
      let status = "Unverified";
      let quality = "";
      let role = "";
      let free = "";

      if (verificationCache && verificationCache[item.email]) {
        const v = verificationCache[item.email];
        status = v.result || "Unknown";
        quality = v.quality || "";
        role = v.role ? "Yes" : "No";
        free = v.free ? "Yes" : "No";
      }

      rows.push([
        `"${item.email}"`,
        `"${phones}"`,
        status,
        quality,
        role,
        free
      ]);
    });

    extractedLoosePhones.forEach(phone => {
      rows.push(["", `"${phone}"`, "", "", "", ""]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "extracted_emails.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- Verification Logic ---
  const apiTokenInput = document.getElementById("apiTokenInput");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const verifyAllBtn = document.getElementById("verifyAllBtn");
  let apifyToken = "";
  // Cache for verification results
  let verificationCache = {};
  let usageDecisive = 0;
  let usageFree = 0;

  // Load API token & Cache
  chrome.storage.local.get(['apifyToken', 'verificationCache', 'usageDecisive', 'usageFree'], (result) => {
    apifyToken = result.apifyToken || ""; // Token removed for security
    verificationCache = result.verificationCache || {};
    usageDecisive = result.usageDecisive || 0;
    usageFree = result.usageFree || 0;
    renderUsageUI();

    if (apiTokenInput) apiTokenInput.value = apifyToken;

    // Add event listener for Verify All
    if (verifyAllBtn) {
      verifyAllBtn.addEventListener("click", () => {
        const allEmails = extractedGroups.map(g => g.email);
        verifyEmails(allEmails, verifyAllBtn);
      });
    }
  });

  if (saveTokenBtn) {
    saveTokenBtn.addEventListener("click", () => {
      const token = apiTokenInput.value.trim();
      if (token) {
        if (token !== apifyToken) {
          resetUsageStats();
          showToast("New Token: Usage Reset");
        }
        apifyToken = token;
        chrome.storage.local.set({ apifyToken: token });
        const originalText = saveTokenBtn.innerText;
        saveTokenBtn.innerText = "Saved!";
        setTimeout(() => saveTokenBtn.innerText = originalText, 1500);
      }
    });
  }

  async function verifyEmail(email, btn) {
    if (!apifyToken) {
      showToast("Please set Apify API Token in Settings.", "error");
      if (settingsPanel) settingsPanel.style.display = "block";
      return;
    }

    const originalContent = btn.innerHTML;
    btn.innerHTML = `<div class="loader" style="width:10px;height:10px;border-width:1px;"></div>`;
    btn.disabled = true;

    try {
      const results = await runActorSync([email]);

      if (results && results.length > 0) {
        const result = results.find(r => r.email === email) || results[0];
        updateStoredEmailStatus(email, result);
        trackUsage(result);
        const newBadge = createStatusBadge(result);
        btn.replaceWith(newBadge);
        showToast(`Verified: ${result.result}`);
      } else {
        throw new Error("No data returned");
      }
    } catch (err) {
      console.error(err);
      const isUsageError = err.message.includes("usage") || err.message.includes("billing");
      if (isUsageError) {
        showToast("Apify Usage Limit Exceeded! Check Settings.", "error");
      } else {
        showToast("Verification failed: " + err.message, "error");
      }

      // Restore UI
      if (btn) {
        btn.innerHTML = originalContent;
        btn.disabled = false;
      }
    }
  }

  async function verifyEmails(emails, btnToUpdate) {
    if (!apifyToken) {
      showToast("Please set Apify API Token in Settings.", "error");
      if (settingsPanel) settingsPanel.style.display = "block";
      return;
    }

    const toVerify = emails.filter(e => !verificationCache[e]);
    if (toVerify.length === 0) {
      showToast("All extracted emails are already verified!");
      return;
    }

    if (!confirm(`Verify ${toVerify.length} emails? This will deduct credits ($1/1k).`)) {
      return;
    }

    const originalText = btnToUpdate ? btnToUpdate.innerHTML : "";
    if (btnToUpdate) {
      btnToUpdate.innerHTML = `Verifying...`;
      btnToUpdate.disabled = true;
    }

    // Batching to prevent timeout
    const BATCH_SIZE = 20;
    let successCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < toVerify.length; i += BATCH_SIZE) {
        const chunk = toVerify.slice(i, i + BATCH_SIZE);

        // Update UI info if possible (optional)
        if (btnToUpdate) btnToUpdate.innerText = `Verifying ${Math.min(i + BATCH_SIZE, toVerify.length)}/${toVerify.length}...`;

        try {
          const results = await runActorSync(chunk);
          results.forEach(res => {
            updateStoredEmailStatus(res.email, res);
            trackUsage(res);
          });
          successCount += results.length;
        } catch (e) {
          console.error("Batch failed", e);
          failedCount += chunk.length;
          // If usage limit, stop strictly
          if (e.message.includes("usage") || e.message.includes("billing")) {
            throw e;
          }
        }

        // Render progress
        renderData();
        // Small delay between chunks
        await new Promise(r => setTimeout(r, 500));
      }

      showToast(`Verification Complete: ${successCount} processed.`);

    } catch (err) {
      console.error(err);
      const isUsageError = err.message.includes("usage") || err.message.includes("billing");
      if (isUsageError) {
        showToast("Apify Usage Limit Exceeded!", "error");
      } else {
        showToast("Bulk verified with some errors.", "error");
      }
    } finally {
      if (btnToUpdate) {
        btnToUpdate.innerHTML = originalText;
        btnToUpdate.disabled = false;
      }
    }
  }

  // Modified to use Sync endpoint
  async function runActorSync(emails) {
    // Endpoint: https://api.apify.com/v2/acts/VJ5w50TP6mAbyimyO/run-sync-get-dataset-items
    const response = await fetch(`https://api.apify.com/v2/acts/VJ5w50TP6mAbyimyO/run-sync-get-dataset-items?token=${apifyToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: emails })
    });

    if (!response.ok) {
      // Try to parse error
      const errData = await response.json();
      if (errData.error) {
        throw new Error(errData.error.message);
      }
      throw new Error(`Apify Error: ${response.status} ${response.statusText}`);
    }

    // The response body IS the array of items
    const data = await response.json();
    return data;
  }

  // Deprecated: startApifyRun, waitForRun, getRunResults - Removed in favor of runActorSync


  function updateStoredEmailStatus(email, resultData) {
    verificationCache[email] = resultData;
    chrome.storage.local.set({ verificationCache: verificationCache });
  }

  function createStatusBadge(data) {
    const div = document.createElement("div");
    div.className = "verification-status";

    let icon = "";
    let text = data.result;
    let statusClass = "status-unknown";

    if (data.result === "ok") {
      statusClass = "status-valid";
      icon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
      text = "Valid";
    } else if (data.result === "invalid" || data.result === "error") {
      statusClass = "status-invalid";
      icon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
      text = data.result === "error" ? "Error" : "Invalid";
    } else {
      statusClass = "status-risky";
      icon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
      text = data.result === "catch_all" ? "Catch-All" : (data.result === "disposable" ? "Disposable" : "Risky");
    }

    div.classList.add(statusClass);
    // Tooltip
    div.title = `Quality: ${data.quality || ''}\nResult: ${data.result}\nSub: ${data.subresult || ''}\nRole: ${data.role || ''}\nFree: ${data.free || ''}`;
    div.innerHTML = `${icon}`;
    // Removed inline padding to allow CSS to control sizing strictly
    return div;
  }

  function trackUsage(result) {
    if (!result || !result.result) return;
    // Decisive (Paid): ok, disposable, invalid
    if (['ok', 'disposable', 'invalid'].includes(result.result)) {
      usageDecisive++;
    } else {
      // Free: catch_all, unknown, etc
      usageFree++;
    }
    chrome.storage.local.set({ usageDecisive, usageFree });
    renderUsageUI();
  }

  function resetUsageStats() {
    usageDecisive = 0;
    usageFree = 0;
    chrome.storage.local.set({ usageDecisive, usageFree });
    renderUsageUI();
  }

  function renderUsageUI() {
    if (usageDecisiveEl) usageDecisiveEl.textContent = usageDecisive.toLocaleString();

    if (usageRemainingEl) {
      const FREE_LIMIT = 5000;
      const remaining = Math.max(0, FREE_LIMIT - usageDecisive);
      usageRemainingEl.textContent = remaining.toLocaleString();
    }

    if (usageCostEl) {
      const cost = (usageDecisive / 1000) * 1;
      usageCostEl.textContent = '$' + cost.toFixed(2);
    }
  }
});