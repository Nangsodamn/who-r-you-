# 📱 MINI MESSENGER - COMPLETE SETUP GUIDE

## 💬 Real-time Chat App with Firebase, IMGBB & Render Deployment

---

# 📁 PROJECT STRUCTURE

```
mini-messenger/
│
├── index.html              # Login page
├── chat.html               # Main chat application
├── firebase-config.js      # Firebase + IMGBB configuration
├── app.js                  # Main application logic
├── style.css               # clean theme
└── README.md               # Setup guide
```

---

# 🔥 PART 1: FIREBASE SETUP

## 📌 Step 1: Create Firebase Project

1. Go to **[Firebase Console](https://console.firebase.google.com/)**
2. Click **"Create a project"**
3. Project name: `mini-messenger` (or any name)
4. Disable Google Analytics
5. Click **"Create Project"**

---

## 📌 Step 2: Register Web App

1. Click **"</>"** (Web icon)
2. App nickname: `mini-messenger-web`
3. **Uncheck** "Also set up Firebase Hosting"
4. Click **"Register app"**
5. **COPY YOUR FIREBASE CONFIG** 

---

## 📌 Step 3: Enable Google Authentication

1. Left sidebar → **Authentication**
2. Click **"Get started"**
3. Click **"Sign-in method"** tab
4. Click **"Google"** → Enable → **Save**

---

## 📌 Step 4: Create Firestore Database

1. Left sidebar → **Firestore Database**
2. Click **"Create database"**
3. Start in **"Test mode"**
4. Location: **asia-southeast1** (Singapore)
5. Click **"Enable"**

---

## 📌 Step 5: Set Firestore Rules

1. Click **"Rules"** tab
2. Replace everything with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

✅ **Firebase Ready!**

---

# 🖼️ PART 2: IMGBB API SETUP

## 📌 Step 1: Get API Key

1. Go to **[IMGBB API](https://api.imgbb.com/)**
2. Click **"Get API Key"**
3. Sign up / Login
4. Copy your API key

```
IMGBB_API_KEY = "your key"
```

✅ **IMGBB Ready!**

---

# ⚙️ PART 3: PROJECT CONFIGURATION

## 📌 Step 1: Create `firebase-config.js`

Create this file and **PASTE YOUR OWN CONFIG**:

```javascript
// ============================================
// 🔥 FIREBASE CONFIGURATION - palitan mo ito, syempre kailangan yan wag engot
// ============================================

// 1️⃣ change this your own
const firebaseConfig = {
    apiKey: "PASTE_YOUR_API_KEY_HERE",
    authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
    projectId: "PASTE_YOUR_PROJECT_ID_HERE",
    storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
    messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
    appId: "PASTE_YOUR_APP_ID_HERE"
};

// 2️⃣ IMGBB API KEY
const IMGBB_API_KEY = "PASTE_YOUR_IMGBB_API_KEY_HERE";

// ✅ THIS IS ALL GOODS
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

console.log('✅ Firebase Ready!');
console.log('📁 Project:', firebaseConfig.projectId);
```

---

## 📌 Step 2: Add Other Files

**Download and add these files to your folder:**

| File | Description | Note |
|------|-------------|------|
| `index.html` | Login page | **change if you want** |
| `chat.html` | Main chat | **change if you want** |
| `app.js` | Chat logic | **change if you want** |
| `style.css` | UI | **change if you want** |

---

# 🚀 PART 4: DEPLOY TO RENDER

## 📌 Step 1: Upload to GitHub

1. Go to **[GitHub.com](https://github.com)**
2. Click **"New"** repository
3. Name: `ikaw na bahala kung anong ilagay mo`
4. Click **"Create repository"**

**Upload files:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YourProjectName.git
git push -u origin main
```

OR drag & drop files directly on GitHub.

---

## 📌 Step 2: Deploy on Render

1. Go to **[Render.com](https://render.com)**
2. Sign up with **GitHub**
3. Click **"New +"** → **"Web service"**

**Configuration:**
```
Name: mini-messenger
Branch: main
Build Command: npm install
Start Command: npm start
```

4. Click **"Create Web Service"**

---

## 📌 Step 3: Add Authorized Domain

1. Go back to **Firebase Console**
2. **Authentication** → **Settings** → **Authorized domains**
3. Click **"Add domain"**
4. Add your Render URL:
```
yourprojectname.onrender.com
```
5. Click **"Save"**

✅ **Your app is live!** 🎉

---

# 👑 PART 5: DEVELOPER CREDITS

## 📌 Change your name syempre bagohin mo na lahat ganon ka naman eh

### In `index.html`:
```html
<!-- Find this -->
<span class="dev-name">ARI</span>
<!-- Change your name-->
<span class="dev-name">YOUR NAME</span>
```

### In `chat.html`:
```html
<!-- Find this -->
<div class="developer-name">ARI</div>
<!-- Change mo ito-->
<div class="developer-name">YOUR NAME</div>

<!-- Find this -->
<strong>ARI</strong>
<!-- Change it-->
<strong>YOUR NAME</strong>
```

---

# ✅ PART 6: TESTING CHECKLIST

```
☐ Firebase project created
☐ Firebase config copied
☐ Google Auth enabled
☐ Firestore database created
☐ Rules published
☐ IMGBB API key obtained
☐ firebase-config.js updated
☐ All 5 files in folder
☐ Uploaded to GitHub
☐ Deployed to Render
☐ Authorized domain added
☐ Developer name changed
```

---

# ❓ PART 7: TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| ❌ Can't login | Enable Google Auth in Firebase |
| ❌ Firebase not working | Check config in `firebase-config.js` |
| ❌ Messages not sending | Check Firestore Rules |
| ❌ Images not uploading | Check IMGBB API key, file < 5MB |
| ❌ Blank page on Render | Add domain to Authorized domains |
| ❌ Red badge half cut | CSS fix: `.user-item-avatar { overflow: visible !important; }` |

---

## 📸 SCREENSHOTS

| **Login Screen** | **Chat Screen** |
|:----------------:|:---------------:|
| ![Login](https://i.ibb.co/Hf9F1JFj/Screenshot-20260212-212246.png) | ![Chat](https://i.ibb.co/m595jbQn/Screenshot-20260212-212234.png) |

### ✨ Features Shown:
- ✅ Google Sign-In Interface
- ✅ Real-time World Group Chat
- ✅ Online User
- ✅ Online/Offline Status Indicators
- ✅ Clean design 
- 
---

# 🎯 QUICK REFERENCE CARD

```javascript
// ============================================
// 🔥 FIREBASE-CONFIG.JS - ITO LANG PALITAN!
// ============================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",           
    authDomain: "YOUR_DOMAIN",        
    projectId: "YOUR_PROJECT_ID",     
    storageBucket: "YOUR_BUCKET",     
    messagingSenderId: "YOUR_ID",     
    appId: "YOUR_APP_ID"             
};

const IMGBB_API_KEY = "YOUR_IMGBB_KEY"; 

```

---

# ✨ DEVELOPER

```
██████╗ ███████╗██╗   ██╗
██╔══██╗██╔════╝██║   ██║
██║  ██║█████╗  ██║   ██║
██║  ██║██╔══╝  ╚██╗ ██╔╝
██████╔╝███████╗ ╚████╔╝ 
╚═════╝ ╚══════╝  ╚═══╝  
```

**Developer:** ARI
**Role:** Developer  
**Stack:** Firebase, JavaScript, CSS, HTML
**Project:** Mini Messenger  
**Year:** 2026  

---

# 📱 LIVE DEMO

```
https://chat-d546.onrender.com
```
# NOTE 

```
This is for mobile phone  📱
```
---
