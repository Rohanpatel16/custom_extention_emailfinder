// Regex for matching
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
// Phone regex: Matches 10-13 digits, allowing for separators like space, dot, dash, plus, parenthesis
// Note: This regex is decent but might pick up some false positives.
const phoneRegex = /(?:[-+() ]*\d){10,13}/g;

let lastEmailCount = 0;
let blacklist = [];

// Initialize blacklist
chrome.storage.local.get(['blacklist'], (result) => {
    blacklist = result.blacklist || [];
    updateBadge(); // Re-run with loaded blacklist
});

// Listen for blacklist changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.blacklist) {
        blacklist = changes.blacklist.newValue || [];
        lastEmailCount = -1; // Force update
        updateBadge();
    }
});

// Function to scan page for emails and update badge
function updateBadge() {
    const text = document.body.innerText;
    const matches = text.match(emailRegex) || [];

    // Filter by blacklist and dedup
    const unique = new Set();
    matches.forEach(email => {
        const lowerEmail = email.toLowerCase();
        const domain = lowerEmail.split('@')[1] || '';
        // Only add if not blacklisted
        if (!blacklist.includes(domain)) {
            unique.add(lowerEmail);
        }
    });

    const count = unique.size;

    // Always send update if it changed OR if we just loaded (to sync initially)
    if (count !== lastEmailCount || lastEmailCount === 0) {
        lastEmailCount = count;
        try {
            chrome.runtime.sendMessage({
                action: "updateBadge",
                count: count
            });
        } catch (e) {
            // Context invalidated
        }
    }
}

// Initial scan
// updateBadge(); // Called after storage load now

// Live updates
let timeout = null;
const observer = new MutationObserver(() => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
        updateBadge();
    }, 1000); // Debounce 1s
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
});


// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getData") {
        const data = extractGroupedData();
        sendResponse({ data: data });
    }
    return true;
});


/**
 * Heuristic function to group emails with nearby phone numbers.
 * Also returns loose phones (unconnected).
 */
function extractGroupedData() {
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);

    let node;
    while (node = walker.nextNode()) {
        // Reset lastIndex for the global regex or use a new one to ensure we don't skip
        emailRegex.lastIndex = 0;
        if (emailRegex.test(node.nodeValue)) {
            textNodes.push(node);
        }
    }

    const results = [];
    const processedEmails = new Set(); // Stores lowercase emails
    const connectedPhones = new Set(); // Stores phones connected to emails

    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const emailsInNode = text.match(emailRegex) || [];

        emailsInNode.forEach(email => {
            const lowerEmail = email.toLowerCase();
            if (processedEmails.has(lowerEmail)) return;
            processedEmails.add(lowerEmail);

            // Find 'context' - the container element
            let container = textNode.parentElement;
            let phoneFound = [];
            let attempts = 0;

            // Traverse up
            while (container && container !== document.body && attempts < 4) {
                const containerText = container.innerText;
                const phones = containerText.match(phoneRegex);

                if (phones && phones.length > 0) {
                    const uniquePhones = [...new Set(phones)];
                    phoneFound = uniquePhones;
                    uniquePhones.forEach(p => connectedPhones.add(p));
                    break;
                }

                container = container.parentElement;
                attempts++;
            }

            results.push({
                email: email, // Keep original casing
                phones: phoneFound || []
            });
        });
    });

    results.sort((a, b) => a.email.localeCompare(b.email));

    // Find loose phones
    const allText = document.body.innerText;
    const allPhones = allText.match(phoneRegex) || [];
    const loosePhones = [...new Set(allPhones)].filter(p => !connectedPhones.has(p));

    return {
        groups: results,
        loosePhones: loosePhones
    };
}
