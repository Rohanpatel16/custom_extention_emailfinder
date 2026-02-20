// Regex for matching
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
// Phone regex: Matches 10-13 digits, allowing for separators like space, dot, dash, plus, parenthesis
// Note: This regex is decent but might pick up some false positives.
// Phone regex: Matches 10-15 digits, requiring valid separators or country codes to avoid prices/dates.
// Look for optional +CountryCode, followed by digits/spacers.
// Excludes patterns that look like prices/dates/ISOs.
// Basic regex to find candidates, refined validation happens in JS
const phoneRegex = /(?<![\w\/._=\-])(?:(?:\+?\d{1,4}[ -]?)?\d{5}[ -]?\d{5}|(?:\+?\d{1,4}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)?\d{3,5}[ -]?\d{3,5})(?![.\d])/g;

function isValidPhone(phoneStr) {
    const clean = phoneStr.replace(/\D/g, '');
    // 1. Length check: India pincodes are 6 digits. Phones are usually 10.
    // Allow international 8-15.
    if (clean.length < 8 || clean.length > 15) return false;

    // 2. Year/Date check: Starts with 202x and has dash?
    // User found "2023-001..." being detected.
    // Refined: Only block if it looks like a year followed by dash (e.g. 2023-...)
    // Allow local numbers starting with 202...
    if (/^20[2-3]\d-/.test(phoneStr)) return false;

    // 3. Block specific LinkedIn/Job ID patterns
    // e.g. 3057526588 is often a job ID.
    // Blocking 10-digit numbers starting with 305 that have NO separators.
    if (/^305\d{7}$/.test(clean) && !/[- ]/.test(phoneStr)) return false;

    return true;
}

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
    }, 300); // Reduced to 300ms for instant feel
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
});


// Message listener
let popupScrollY = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getData") {
        extractGroupedDataAsync().then(data => {
            sendResponse({ data: data, popupScrollY: popupScrollY });
        });
        return true; // Indicates async response
    } else if (request.action === "savePopupScroll") {
        popupScrollY = request.scrollY || 0;
    }
    return true; // Keep channel open
});


/**
 * Async extraction to prevent UI freeze on huge pages.
 * Optimizes for specific known structures (Apify) and falls back to generic walking.
 */
async function extractGroupedDataAsync() {
    return new Promise((resolve) => {
        // Yield to let browser render
        setTimeout(() => {
            const results = [];
            const processedEmails = new Set();
            const connectedPhones = new Set();
            const loosePhonesSet = new Set();

            // 1. Identification Phase: Where to look?
            // Optimization for Apify or Code-like views
            let rootNodes = [];
            if (document.querySelector('.line-content pre')) {
                // Apify dataset view detected
                rootNodes = Array.from(document.querySelectorAll('.line-content pre'));
            } else {
                // Fallback: Use body, but we'll walk it carefully
                rootNodes = [document.body];
            }

            // Helper to process a text string
            const processText = (text, contextNode) => {
                if (!text || text.length < 5) return;

                // Emails
                let emailMatches = text.match(emailRegex) || [];
                emailMatches.forEach(email => {
                    const lower = email.toLowerCase();
                    if (processedEmails.has(lower)) return;
                    processedEmails.add(lower);

                    // Find connected phones nearby
                    // For Apify, contextNode is the <pre> tag usually
                    let phoneFound = [];
                    // Simple context check: Look in the same node or parent
                    let searchContext = contextNode ? (contextNode.parentElement || contextNode) : null;

                    if (searchContext) {
                        const contextText = searchContext.innerText || "";
                        const phones = contextText.match(phoneRegex);
                        if (phones) {
                            const validPhones = phones.filter(isValidPhone);
                            if (validPhones.length > 0) {
                                const uniquePhones = [...new Set(validPhones)];
                                phoneFound = uniquePhones;
                                uniquePhones.forEach(p => connectedPhones.add(p));
                            }
                        }
                    }

                    results.push({
                        email: email,
                        phones: phoneFound
                    });
                });

                // Phones (Loose)
                const phoneMatches = text.match(phoneRegex) || [];
                phoneMatches.forEach(p => {
                    if (isValidPhone(p)) loosePhonesSet.add(p);
                });
            };

            // 2. Processing Phase (Chunked)
            let nodeIndex = 0;
            const chunkSize = 500; // Process 500 nodes at a time

            const processChunk = () => {
                const startTime = performance.now();

                // If we are using specific roots (like Apify), we iterate them
                if (rootNodes.length > 1 || (rootNodes.length === 1 && rootNodes[0] !== document.body)) {
                    while (nodeIndex < rootNodes.length && performance.now() - startTime < 15) {
                        processText(rootNodes[nodeIndex].innerText, rootNodes[nodeIndex]);
                        nodeIndex++;
                    }
                } else {
                    // Generic TreeWalker for the whole body (Standard pages)
                    // Re-instantiate walker since we can't pause it easily across async without state, 
                    // but here we just do a blocking walk for short durations if possible, OR
                    // since we already have a freezing issue, we'll try a different strategy:
                    // Get ALL text nodes first? No, that's heavy.
                    // We'll stick to the original heavy synchronous logic for normal pages BUT
                    // wrapped in a minimal timeout to at least return the promise.
                    // For truly massive non-Apify pages, this might still be slow, but let's see.

                    // Actually, let's just do the TreeWalker here in one go for now,
                    // but specifically optimization: check body.innerText length.
                    if (document.body.innerText.length > 5000000) { // 5MB+ text
                        // Too big, naive regex on body only
                        const text = document.body.innerText;
                        processText(text, document.body); // One pass, loose context
                        nodeIndex = rootNodes.length; // Done
                    } else {
                        // Standard Walker
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                        let node;
                        while (node = walker.nextNode()) {
                            processText(node.nodeValue, node.parentElement);
                        }
                        nodeIndex = rootNodes.length;
                    }
                }

                if (nodeIndex < rootNodes.length) {
                    setTimeout(processChunk, 0); // Schedule next chunk
                } else {
                    // Done
                    const loosePhones = [...loosePhonesSet].filter(p => !connectedPhones.has(p));
                    resolve({
                        groups: results,
                        loosePhones: loosePhones
                    });
                }
            };

            processChunk();
        }, 10);
    });
}

/**
 * Standard synchronous extraction (Kept for badge updates / small checks)
 * simplified for performance.
 */
function extractGroupedData() {
    // This function is less critical now as we use the async one for the popup.
    // We can leave it as a lightweight scanner for the badge.
    const text = document.body.innerText;
    const emails = text.match(emailRegex) || [];
    const uniqueEmails = new Set(emails.map(e => e.toLowerCase()));
    // We won't do full phone extraction for badge to save resources
    return {
        groups: Array.from(uniqueEmails).map(e => ({ email: e, phones: [] })),
        loosePhones: []
    };
}
