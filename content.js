// Regex for matching
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
// Phone regex: Matches 10-13 digits, allowing for separators like space, dot, dash, plus, parenthesis
// Note: This regex is decent but might pick up some false positives.
// Phone regex: Matches 10-15 digits, requiring valid separators or country codes to avoid prices/dates.
// Look for optional +CountryCode, followed by digits/spacers.
// Excludes patterns that look like prices/dates/ISOs.
// Basic regex to find candidates, refined validation happens in JS
const phoneRegex = /(?<![\w\/._=\-])(?:\+?\d{1,4}[ -]?)?(?:\(?\d{2,5}\)?[ -]?)?\d{3,5}[ -]?\d{3,5}(?![.\d])/g;

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
        const data = extractGroupedData();
        sendResponse({ data: data, popupScrollY: popupScrollY });
    } else if (request.action === "getDeepLinks") {
        const links = extractDeepLinks();
        sendResponse({ links: links });
    } else if (request.action === "savePopupScroll") {
        popupScrollY = request.scrollY || 0;
    }
    return true;
});


function extractDeepLinks() {
    // Keywords for contact/career pages
    const keywords = ["contact", "about", "career", "job", "team", "work-with-us", "touch"];
    const links = new Set();

    // Loose Check: strip www.
    const currentDomain = window.location.hostname;
    const baseDomain = currentDomain.replace(/^www\./, '');

    document.querySelectorAll("a[href]").forEach(a => {
        let href = a.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        // Browser normalizes a.href to absolute, but just in case
        const urlLower = href.toLowerCase();
        const text = a.innerText.toLowerCase();

        // 1. Check if internal link (contains domain OR starts with /)
        // Note: a.href is usually absolute in modern browsers
        const isInternal = urlLower.includes(baseDomain) || href.startsWith('/');

        if (!isInternal) return;

        // 2. Keyword Check
        const matchesKeyword = keywords.some(k => urlLower.includes(k) || text.includes(k));

        if (matchesKeyword) {
            links.add(href);
        }
    });
    return [...links];
}


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
                    // Filter valid phones
                    const validPhones = phones.filter(isValidPhone);
                    if (validPhones.length > 0) {
                        const uniquePhones = [...new Set(validPhones)];
                        phoneFound = uniquePhones;
                        uniquePhones.forEach(p => connectedPhones.add(p));
                        break;
                    }
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

    // results.sort((a, b) => a.email.localeCompare(b.email)); // Removed to preserve found order

    // Find loose phones
    const allText = document.body.innerText;
    const allPhones = allText.match(phoneRegex) || [];
    // Filter loose phones too
    const loosePhones = [...new Set(allPhones)].filter(p => !connectedPhones.has(p) && isValidPhone(p));

    return {
        groups: results,
        loosePhones: loosePhones
    };
}
