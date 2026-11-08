# AthletiQ on iPhone

On iPhone, AthletiQ installs from Safari as a **Home Screen web app**: no App Store and no Apple
Developer account. It opens full-screen from its own icon and **updates automatically** on every
deploy. On **iOS 16.4 or later** it receives **push notifications** like a native app.

> Why not an App Store app? Apple only allows installing native apps through the App Store
> (or TestFlight/Ad Hoc, which need a paid developer account and expire or are capped).
> A Home Screen web app gives nearly the same experience for free and stays in sync with the
> Android app and website. An App Store version can be added later if needed.

## What you set up once

Push notifications for iPhone (and for Android/desktop browsers) use the same Firebase project as
the Android app. If you've already done step 1 of [ANDROID.md](ANDROID.md), continue from step 2.

### 1. Firebase project and server key

Create the Firebase project and set `FCM_SERVICE_ACCOUNT` on the API server exactly as described
in ANDROID.md, step 1. The same key sends to Android phones and iPhones.

### 2. Register the web app in Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → your **AthletiQ** project →
   **Project settings** (gear icon) → **General** → **Your apps** → **Add app** → **Web** (`</>`).
2. Nickname `AthletiQ Web`. Leave _Firebase Hosting_ **unticked** → **Register app**.
3. Firebase shows a `firebaseConfig` block. Note these four values:

   | Firebase value      | Amplify variable                    |
   | ------------------- | ----------------------------------- |
   | `apiKey`            | `VITE_FIREBASE_API_KEY`             |
   | `projectId`         | `VITE_FIREBASE_PROJECT_ID`          |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId`             | `VITE_FIREBASE_APP_ID`              |

   These values are public by design (they identify the project, they don't grant access).

### 3. Create the Web Push key

**Project settings → Cloud Messaging** tab → **Web configuration** → **Web Push certificates** →
**Generate key pair**. Copy the long key shown under _Key pair_; this is `VITE_FIREBASE_VAPID_KEY`.

### 4. Add the values to Amplify and redeploy

AWS Console → **Amplify** → the AthletiQ app → **Hosting → Environment variables → Manage
variables**. Add the five variables from steps 2–3, **Save**, then **Redeploy this version** (or
push any commit).

Until they're set, the app works normally and simply doesn't offer notifications.

### 5. Check it

On an iPhone (iOS 16.4+), follow _Installing on an iPhone_ below, then **Account → Notifications →
Turn on**. Register a test student from `https://www.edupilots.in/register` in another browser:
admins should get "New registration" within seconds.

## Installing on an iPhone (send this to coaches and admins)

1. Open **Safari** (it must be Safari) and go to **https://www.edupilots.in**.
2. Tap the **Share** button (square with an arrow), scroll, tap **Add to Home Screen** → **Add**.
3. Open **AthletiQ from the new Home Screen icon** (not from Safari) and sign in.
4. Tap your initials (top right) → **Turn on notifications** → **Allow**.
5. On the first GPS check-in, tap **Allow** for location.

The app also shows these steps in a banner when an iPhone user opens the site in Safari.

## How updates work

Every frontend deploy reaches iPhones automatically the next time the app is opened. If someone
seems to be on an old version, ask them to swipe the app closed and open it again.

## Limitations on iPhone (Apple rules)

- Notifications only work in the Home Screen app (not in a Safari tab) on iOS 16.4+.
- The Home Screen app has its own sign-in, separate from Safari.
- If the app isn't opened for several weeks, iOS may clear its data; users simply sign in again.
- Location is only available while the app is open (enough for check-in / check-out).

## Troubleshooting

| Problem                                     | Fix                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| No "Add to Home Screen"                     | Must be Safari (Chrome on iPhone hides it on older iOS). Scroll down in the Share sheet.                          |
| No "Turn on notifications" option           | Open the app from the Home Screen icon; check iOS is 16.4+ (Settings → General → About); check Amplify variables. |
| Notifications turned on but nothing arrives | `FCM_SERVICE_ACCOUNT` set on the API and the API restarted? iPhone Settings → Notifications → AthletiQ → Allow.   |
| "Notifications blocked"                     | iPhone Settings → Notifications → AthletiQ → **Allow Notifications**, then try again.                             |
| Location doesn't work                       | Settings → Privacy & Security → Location Services → on; Safari Websites → **While Using the App**.                |
| Removed and re-added the app                | Sign in and turn notifications on again (each install gets a new notification address).                           |
