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