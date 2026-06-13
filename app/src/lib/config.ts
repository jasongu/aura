/**
 * Firebase web app config. These values are public by design —
 * security is enforced by Firestore rules and the function-side allowlist.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyC0XLmfiXeuILxPb84zNVj-SXDLQQn1wBE",
  authDomain: "aura-c4b26.firebaseapp.com",
  projectId: "aura-c4b26",
  storageBucket: "aura-c4b26.firebasestorage.app",
  messagingSenderId: "175460124412",
  appId: "1:175460124412:web:6506a9d32b93d7aa317979",
};

/** Must match the ALLOWED_EMAIL param on Cloud Functions + firestore.rules. */
export const ALLOWED_EMAIL = "jasongu9@gmail.com";

export const FUNCTIONS_REGION = "us-central1";
