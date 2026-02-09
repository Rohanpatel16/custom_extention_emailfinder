# One-Click Contact Extractor

A powerful Chrome Extension to extract emails and phone numbers from websites automatically. Now features bulk URL processing and multiple export formats.

## Features

### 🔍 Smart Extraction
- **Automatic Detection**: Instantly finds emails and phone numbers on any visited webpage.
- **Intelligent Grouping**: Associates phone numbers with their corresponding emails when they appear together.
- **Verification**: Built-in verification status (uses external API if configured).

### 🤖 AutoVisit Crawler (New!)
- **Bulk Automation**: Paste a list of URLs and let the extension do the work.
- **Dedicated Runner**: Opens a separate window to process the queue without interruption.
- **Dynamic Loading**: Handles modern websites by waiting for content to load and scrolling automatically.
- **Robust Logic**: Uses the same advanced extraction algorithms as the manual tool.

### 💾 Export Options (New!)
- **CSV**: Standard format for CRM import.
- **Excel (XLS)**: Direct export to Excel-compatible format.
- **TXT**: Simple text file for quick copy-pasting.
- **Copy to Clipboard**: One-click copy for individual items or the entire list.

## Installation

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable "Developer mode" in the top right.
4.  Click "Load unpacked".
5.  Select the extension directory.

## Usage

### Manual Mode
1.  Navigate to any website.
2.  Open the extension popup.
3.  View the extracted emails and phones.
4.  Click "Export" to save the data.

### AutoVisit Mode
1.  Open the extension popup.
2.  Switch to the **"AutoVisit"** tab.
3.  Paste a list of URLs (one per line).
4.  Click **"Start Automation"**.
5.  A crawler window will open and begin processing.
6.  Once finished, you can export the aggregated results.

## Permissions
- `activeTab`: To access the current page's content.
- `storage`: To save settings and crawler queues.
- `scripting`: To inject extraction logic.
- `contextMenus`: For right-click extraction.

## Privacy
All extraction happens locally on your device. No data is sent to external servers unless you configure a verification API.
