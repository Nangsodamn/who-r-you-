const firebaseConfig = {
    apiKey: "AIzaSyCk-9btSBih9tqB0bnrt-PIAHJH8GpkwvE",
    authDomain: "who-r-you-d15ff.firebaseapp.com",
    projectId: "who-r-you-d15ff",
    storageBucket: "who-r-you-d15ff.firebasestorage.app",
    messagingSenderId: "191405162194",
    appId: "1:191405162194:web:82e7852898b1107107370b"
};

const IMGBB_API_KEY = "1c45c407ab61538d6f87491f565fc8dc";

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

db.settings({
    timestampsInSnapshots: true,
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

db.enablePersistence({
    synchronizeTabs: true
}).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.log('Persistence not supported');
    }
});

provider.setCustomParameters({
    prompt: 'select_account'
});

console.log('✅ Firebase initialized successfully!');
console.log('📁 Project:', firebaseConfig.projectId);
