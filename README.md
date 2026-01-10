# EmailMaster - Advanced Contact Extractor & Verifier

A professional Chrome Extension that extracts emails and phone numbers from any webpage, intelligently groups them by association, and verifies email validity using the Apify API. Designed for sales professionals and recruiters who need clean, verified data instantly.

![Main Interface](screenshots/main_view.png)

## 🚀 Key Features

### 1. **Intelligent Extraction & Grouping**
-   **Contextual Linking**: Automatically detects phone numbers located near emails in the DOM and groups them together.
-   **Domain Grouping**: Toggle "Group by Domain" to organize results by company (e.g., all `@google.com` emails together).
-   **Loose Phone Detection**: Numbers found on the page that aren't linked to an email are captured in a separate "Phone Numbers" section.

### 2. **Built-in Email Verification**
-   **One-Click Verify**: Verify individual emails or click **Verify All** to process the entire list.
-   **Status Badges**:
    *   ✅ **Valid**: Safe to send.
    *   ❌ **Invalid/Error**: Do not send.
    *   ⚠️ **Risky/Catch-All**: Use with caution.
-   **Usage Tracking**:
    *   Tracks your monthly usage of **Decisive** (Paid) vs **Free** results.
    *   Displays your **Remaining Free Credits** (based on the standard 5,000 monthly limit) directly in Settings.

### 3. **Smart Actions**
-   **Copy**: One-click copy for emails, phones, or entire groups.
    *   Format: `email : : phone_number` (stripping leading `+`).
-   **WhatsApp Integration**: Click the WhatsApp icon next to any number to open a chat immediately.
-   **CSV Export**: Download all extracted and verified data into a clean CSV file.

### 4. **Settings & Filters**
-   **Blacklist**: Add domains (e.g., `gmail.com`) to ignore them permanently.
-   **Auto-Reset Usage**: Updating your API Token automatically resets your usage statistics for the new billing cycle.
-   **Dark Mode**: A beautiful, high-contrast dark theme with neon accents (`#ACFF00`) and glassmorphism effects.

![Settings Panel](screenshots/settings_view.png)

---

## 🛠️ Installation

1.  **Download** this repository.
2.  Open Chrome and go to `chrome://extensions/`.
3.  Enable **Developer Mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the folder containing this project.

---

## ⚙️ Configuration

1.  Click the extension icon.
2.  Click the **Settings (Gear)** icon in the top right.
3.  **Apify Token**: Enter your Apify API Token to enable email verification.
    *   *Note: Using verification costs credits on Apify ($1 per 1,000 results).*
    *   *Free Tier allows ~5,000 verifications/month.*
4.  **Blacklist**: Add any domains you want to hide from results.

---

## 📖 Usage Guide

### Usage Tracking
The extension helps you stay within your budget:
-   **Used (Decisive)**: Counts results that cost money (`Valid`, `Invalid`, `Disposable`).
-   **Remaining (Free Tier)**: Counts down from 5,000. Shows how many more free decisive verifications you can perform this month.
-   **Est. Cost**: Shows the real-time cost of your current session's usage.

### Copying Data
-   **Copy All**: Uses the clipboard icon in the top header.
-   **Copy Group**: Uses the clipboard icon in the group header.
-   **Copy Item**: Hover over any email or phone row to see the copy button.

### Exporting
Click the **Export CSV** button in the header to save a `.csv` file containing:
-   Email
-   Associated Phones
-   Verification Status
-   Quality Score
-   Role / Free Status

---

## 💻 Tech Stack
-   **Manifest V3**: Secure and performant.
-   **Vanilla JS**: No frameworks, just speed.
-   **CSS Variables**: distinct theming.
-   **Apify API**: For robust backend verification.

---

## 🔒 Privacy
This extension operates entirely locally.
-   Extracted data is **never** sent to any server other than the verification API (Apify) when you explicitly click "Verify".
-   Settings are stored in `chrome.storage.local` on your machine.
