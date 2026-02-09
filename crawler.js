// Crawler Logic

// State
let queue = [];
let currentIndex = 0;
let results = [];
let isRunning = false;
let tabId = null; // The tab we are controlling

// DOM Elements
const currentUrlEl = document.getElementById("currentUrl");
const progressTextEl = document.getElementById("progressText");
const progressFillEl = document.getElementById("progressFill");
const emailsMatchesEl = document.getElementById("emailsMatches");
const phonesMatchesEl = document.getElementById("phonesMatches");
const logContainerEl = document.getElementById("logContainer");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");

const copyBtn = document.getElementById("copyBtn");

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    const data = await chrome.storage.local.get(['crawlerQueue']);
    if (data.crawlerQueue && Array.isArray(data.crawlerQueue)) {
        queue = data.crawlerQueue;
        log(`Loaded ${queue.length} URLs to visit.`);
        updateProgress();
        startCrawler();
    } else {
        log("No URLs found in queue.", "error");
    }
});

stopBtn.addEventListener("click", () => {
    isRunning = false;
    log("Stopping crawler...", "error");
    stopBtn.disabled = true;
    exportBtn.style.display = "block";
    copyBtn.style.display = "block";
    chrome.storage.local.set({ crawlerState: 'stopped' });
});

exportBtn.addEventListener("click", () => {
    exportResults();
});

copyBtn.addEventListener("click", () => {
    copyResults();
});

async function startCrawler() {
    isRunning = true;

    // Create a new tab to use for visiting sites
    // We create it inactive so doesn't steal focus constantly, 
    // but some sites might need focus to render.
    chrome.tabs.create({ url: 'about:blank', active: false }, (tab) => {
        tabId = tab.id;
        processNext();
    });
}

async function processNext() {
    if (!isRunning) return;

    if (currentIndex >= queue.length) {
        log("Queue finished!", "success");
        isRunning = false;
        stopBtn.style.display = "none";
        exportBtn.style.display = "block";
        copyBtn.style.display = "block";
        if (tabId) chrome.tabs.remove(tabId);
        return;
    }

    let url = queue[currentIndex];
    if (!url.startsWith('http')) url = 'https://' + url;

    currentUrlEl.textContent = url;
    updateProgress();
    log(`Visiting: ${url}`);

    try {
        // Navigate
        await chrome.tabs.update(tabId, { url: url });

        // Wait for load
        // Note: Real robustness requires webNavigation listeners, 
        // but for simplicity we'll poll or wait a fixed time + reliable listener
        await waitForLoad(tabId);

        // Wait a bit for dynamic content and scroll
        await new Promise(r => setTimeout(r, 5000));

        // Extract
        const data = await extractDataFromTab(tabId);

        if (data) {
            const emailCount = data.emails ? data.emails.length : 0;
            const phoneCount = data.phones ? data.phones.length : 0;
            log(`Found ${emailCount} emails, ${phoneCount} phones.`, "success");

            if (emailCount > 0 || phoneCount > 0) {
                results.push({
                    url: url,
                    emails: data.emails || [],
                    phones: data.phones || []
                });
                updateStats();
            }
        }

        // --- Deep Crawl Logic ---
        const deepLinks = await getDeepLinksFromTab(tabId);
        log(`Scanning for sub-pages... found ${deepLinks.length} candidates.`);

        if (deepLinks && deepLinks.length > 0) {
            let addedCount = 0;
            deepLinks.forEach(link => {
                // Dedup against queue AND history results
                const alreadyQueued = queue.includes(link);
                const alreadyVisited = results.some(r => r.url === link); // Rough check

                // We also need to check if we scraped it but found nothing (not in results).
                // ideally we maintain a `visited` set.
                // For now, let's just check queue.

                if (!alreadyQueued && !alreadyVisited) {
                    queue.push(link);
                    addedCount++;
                }
            });
            if (addedCount > 0) {
                log(`Added ${addedCount} sub-pages to queue.`, "success");
                updateProgress(); // Queue length changed
            }
        }

    } catch (err) {
        log(`Error: ${err.message}`, "error");
    }

    currentIndex++;
    // Small delay between requests
    setTimeout(processNext, 1000);
}

function waitForLoad(tabId) {
    return new Promise((resolve) => {
        function listener(tid, changeInfo) {
            if (tid === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(listener);
        // Timeout fallback
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 15000);
    });
}

function extractDataFromTab(tabId) {
    return new Promise((resolve) => {
        // We use the already injected content.js to ensure exact parity with manual extraction
        chrome.tabs.sendMessage(tabId, { action: "getData" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.data) {
                // Formatting error catch or no content script ready
                console.warn("Crawler: Messaging failed or no data", chrome.runtime.lastError);
                resolve({ emails: [], phones: [] });
            } else {
                // content.js returns { groups: [...], loosePhones: [...] }
                // We need to flatten this for the crawler's simple format
                const groups = response.data.groups || [];
                const loosePhones = response.data.loosePhones || [];

                const emails = groups.map(g => g.email);
                // Collect phones from groups and loose ones
                let phones = [];
                groups.forEach(g => phones.push(...g.phones));
                phones.push(...loosePhones);

                resolve({
                    emails: [...new Set(emails)],
                    phones: [...new Set(phones)]
                });
            }
        });
    });
}

function getDeepLinksFromTab(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: "getDeepLinks" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.links) {
                resolve([]);
            } else {
                resolve(response.links);
            }
        });
    });
}

function updateProgress() {
    progressTextEl.textContent = `${currentIndex + 1}/${queue.length}`;
    const pct = ((currentIndex + 1) / queue.length) * 100;
    progressFillEl.style.width = `${pct}%`;
}

function updateStats() {
    const totalEmails = results.reduce((acc, r) => acc + r.emails.length, 0);
    const totalPhones = results.reduce((acc, r) => acc + r.phones.length, 0);
    emailsMatchesEl.textContent = totalEmails;
    phonesMatchesEl.textContent = totalPhones;

    // Auto-save to storage just in case
    chrome.storage.local.set({ crawlerResults: results });
}

function log(msg, type = "") {
    const div = document.createElement("div");
    div.className = "log-item " + (type === "success" ? "log-success" : type === "error" ? "log-error" : "");
    const time = new Date().toLocaleTimeString();
    div.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${msg}</span>`;
    logContainerEl.appendChild(div);
    logContainerEl.scrollTop = logContainerEl.scrollHeight;
}

function exportResults() {
    if (results.length === 0) {
        alert("No results to export.");
        return;
    }

    let csv = "URL,Email,Phone\n";
    results.forEach(r => {
        r.emails.forEach(e => {
            csv += `"${r.url}","${e}",""\n`;
        });
        r.phones.forEach(p => {
            csv += `"${r.url}","","${p}"\n`;
        });
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crawler_results.csv';
    document.body.appendChild(a);
    a.click();
}

async function copyResults() {
    if (results.length === 0) {
        alert("No results to copy.");
        return;
    }

    let textToCopy = "";
    results.forEach(r => {
        // MATCHING FORMAT: email : : phone1, phone2
        r.emails.forEach(email => {
            let line = email;
            if (r.phones.length > 0) {
                // Strip + from phones for consistency with popup.js
                const cleanPhones = r.phones.map(p => p.replace(/^\+/, '')).join(", ");
                line += " : : " + cleanPhones;
            }
            textToCopy += line + "\n";
        });

        // If there are phones but no emails on this page, list them? 
        // The user request said "in same format", which usually implies email-centric.
        // But if we have loose phones with no email, we should probably list them too or skip.
        // For now, let's attach phones to the first email found, or list them separately if no email?
        // Actually popup.js formatItemForCopy is 1-to-1 email to phone group. 
        // Since crawler results are Page -> {emails, phones}, let's just dump all combinations for that page.

        if (r.emails.length === 0 && r.phones.length > 0) {
            const cleanPhones = r.phones.map(p => p.replace(/^\+/, '')).join(", ");
            textToCopy += " : : " + cleanPhones + "\n";
        }
    });

    try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 1500);
    } catch (err) {
        console.error("Failed to copy: ", err);
        alert("Failed to copy to clipboard.");
    }
}
