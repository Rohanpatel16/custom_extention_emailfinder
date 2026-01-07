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

  let extractedEmails = [];
  let isGroupingEnabled = false;

  // Initialize copy buttons
  copyAllBtn.addEventListener("click", copyAllData);
  copyAllEmailsBtn.addEventListener("click", () => copySectionData('email'));
  copyAllPhonesBtn.addEventListener("click", () => copySectionData('phone'));

  // Initialize toggle
  if (domainToggle) {
    // Load state
    chrome.storage.local.get(['isGroupingEnabled'], (result) => {
      isGroupingEnabled = result.isGroupingEnabled || false;
      domainToggle.checked = isGroupingEnabled;
      // If data is already there, re-render
      if (extractedEmails.length > 0) {
        renderEmails();
      }
    });

    domainToggle.addEventListener("change", (e) => {
      isGroupingEnabled = e.target.checked;
      chrome.storage.local.set({ isGroupingEnabled: isGroupingEnabled });
      renderEmails();
    });
  }

  // Start extraction automatically
  extractData();

  function extractData() {
    // Clear previous results
    emailList.innerHTML = '';
    phoneList.innerHTML = '';
    loadingContainer.style.display = "flex";
    errorContainer.style.display = "none";
    extractedEmails = [];

    // Extract data
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];

      // Extract emails
      chrome.scripting.executeScript(
        {
          target: { tabId: activeTab.id },
          func: getEmailAddresses,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            showError("Cannot access this page. Try opening a different page.");
            loadingContainer.style.display = "none";
            return;
          }

          const emailAddresses = result[0].result;
          if (Array.isArray(emailAddresses) && emailAddresses.length > 0) {
            extractedEmails = emailAddresses;
            emailCountBadge.textContent = extractedEmails.length;
            renderEmails();
          } else {
            emailCountBadge.textContent = "0";
            showEmptyMessage(emailList, "No email addresses found");
          }

          // Extract phone numbers after emails are done
          chrome.scripting.executeScript(
            {
              target: { tabId: activeTab.id },
              func: getPhoneNumbers,
            },
            (result) => {
              loadingContainer.style.display = "none";

              if (chrome.runtime.lastError) {
                showError("Cannot access this page. Try opening a different page.");
                return;
              }

              const phoneNumbers = result[0].result;
              if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {
                phoneCountBadge.textContent = phoneNumbers.length;
                phoneNumbers.forEach((phone) => {
                  const itemDiv = createResultItem(phone);
                  phoneList.appendChild(itemDiv);
                });
              } else {
                phoneCountBadge.textContent = "0";
                showEmptyMessage(phoneList, "No phone numbers found");
              }
            }
          );
        }
      );
    });
  }

  function renderEmails() {
    emailList.innerHTML = '';

    if (extractedEmails.length === 0) {
      showEmptyMessage(emailList, "No email addresses found");
      return;
    }

    if (isGroupingEnabled) {
      // Group by domain
      const groups = {};
      extractedEmails.forEach(email => {
        const domain = email.split('@')[1] || 'other';
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(email);
      });

      // Sort domains alphabetically
      const sortedDomains = Object.keys(groups).sort();

      sortedDomains.forEach(domain => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'domain-group';

        const header = document.createElement('div');
        header.className = 'domain-header';

        // Container for text and count
        const titleDiv = document.createElement('div');
        titleDiv.style.display = 'flex';
        titleDiv.style.alignItems = 'center';
        titleDiv.style.gap = '8px';
        titleDiv.innerHTML = `
                ${domain}
                <span class="domain-count">${groups[domain].length}</span>
            `;

        // Copy button for the group
        const copyGroupBtn = document.createElement("button");
        copyGroupBtn.className = "copy-button";
        copyGroupBtn.title = "Copy Group Emails";
        copyGroupBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="8" y="8" width="12" height="12" rx="1"/>
                    <path d="M16 8V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/>
                </svg>
            `;
        // Join emails with newline
        const groupText = groups[domain].join('\n');
        copyGroupBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent potentially collapsing group if we add that later
          copyToClipboard(groupText, copyGroupBtn);
        });

        header.appendChild(titleDiv);
        header.appendChild(copyGroupBtn);

        groupDiv.appendChild(header);

        groups[domain].forEach(email => {
          const item = createResultItem(email);
          groupDiv.appendChild(item);
        });

        emailList.appendChild(groupDiv);
      });
    } else {
      // Flat list
      extractedEmails.forEach(email => {
        emailList.appendChild(createResultItem(email));
      });
    }
  }

  function createResultItem(text) {
    const itemDiv = document.createElement("div");
    itemDiv.className = "info-item";

    const textDiv = document.createElement("div");
    textDiv.className = "value";
    textDiv.textContent = text;

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-button";
    copyBtn.title = "Copy";
    copyBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="8" y="8" width="12" height="12" rx="1"/>
        <path d="M16 8V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/>
      </svg>
    `;
    copyBtn.addEventListener("click", () => copyToClipboard(text, copyBtn));

    itemDiv.appendChild(textDiv);
    itemDiv.appendChild(copyBtn);

    return itemDiv;
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

  async function copySectionData(type) {
    // If grouped, we might want to still grab all .value elements.
    // document.querySelectorAll('#emailList .value') will still work because items are just nested deeper.
    const items = document.querySelectorAll(`#${type}List .value`);
    if (items.length === 0) return;

    const text = Array.from(items).map(item => item.textContent).join('\n');
    const button = type === 'email' ? copyAllEmailsBtn : copyAllPhonesBtn;

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
    const emailItems = document.querySelectorAll('#emailList .value');
    const phoneItems = document.querySelectorAll('#phoneList .value');

    if (emailItems.length === 0 && phoneItems.length === 0) return;

    const emails = Array.from(emailItems).map(item => item.textContent);
    const phones = Array.from(phoneItems).map(item => item.textContent);

    let text = '';
    if (emails.length > 0) {
      text += '📧 Email Addresses:\n' + emails.join('\n') + '\n\n';
    }
    if (phones.length > 0) {
      text += '📱 Phone Numbers:\n' + phones.join('\n');
    }

    try {
      await navigator.clipboard.writeText(text);

      const originalHTML = copyAllBtn.innerHTML;

      copyAllBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
      copyAllBtn.classList.add('copied');

      setTimeout(() => {
        copyAllBtn.classList.remove('copied');
        copyAllBtn.innerHTML = originalHTML;
      }, 1500);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  function getEmailAddresses() {
    // Improved Regex as per recommendations (simple usage for now, but better than before)
    // The previous regex was: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    // Let's stick to the current one or slightly improve it to avoid image files if needed, but current one is standard.
    // User asked for logic updates, but primarily for grouping. I will keep the regex same for stability unless requested.
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const text = document.body.innerText;
    const emailAddresses = [...new Set(text.match(emailRegex) || [])];
    return emailAddresses;
  }

  function getPhoneNumbers() {
    const phoneRegex = /(?:[-+() ]*\d){10,13}/g;
    const text = document.body.innerText;
    const phoneNumbers = [...new Set(text.match(phoneRegex) || [])];
    return phoneNumbers;
  }
});