chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "extractEmail",
    title: "Extract Email Addresses",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "extractEmail") {
    const selectedText = info.selectionText;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailAddresses = selectedText.match(emailRegex) || [];
    const uniqueEmails = [...new Set(emailAddresses)];

    // You can choose how to handle the extracted emails here (e.g., store them, display them, etc.)
    console.log("Extracted emails:", uniqueEmails);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateBadge") {
    const count = request.count;
    const text = count > 0 ? count.toString() : "";
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: text });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#ACFF00" }); // Theme primary color
  }
});