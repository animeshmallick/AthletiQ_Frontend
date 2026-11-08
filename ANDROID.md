# AthletiQ Android app

The Android app is a native shell ([Capacitor](https://capacitorjs.com)) around the live web app at
**https://www.edupilots.in**. It adds what a website can't do well on a phone: push notifications,
the hardware back button, a launcher icon and splash screen, edge-to-edge system bars and an offline
screen. It is distributed **outside the Play Store** as an APK on this repository's GitHub Releases.

## How updates reach phones

| Change                                                   | What users need to do                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Any screen, feature or bug fix (everything under `src/`) | **Nothing.** The app loads the website, so it updates on the next launch after Amplify deploys.                    |
| Native shell (`android/`, Capacitor plugins, icons)      | The app shows **"A new version of the app is available → Update"**. One tap downloads it; Android asks to install. |

Native shell releases are rare: they are only needed when plugins or Android settings change.

## One-time setup

### 1. Firebase (push notifications)

1. Open [console.firebase.google.com](https://console.firebase.google.com) → **Add project** →
   name it `AthletiQ` (Google Analytics is not needed).
2. **Add app → Android**:
   - Package name: `in.edupilots.athletiq` (must match exactly)
   - App nickname: `AthletiQ`
   - SHA-256 fingerprint: from `README.txt` in your signing-key folder (optional, recommended)
3. Download **`google-services.json`**. Don't put it in the repository; it goes into a GitHub
   secret (step 2).
4. **Project settings → Service accounts → Generate new private key.** This JSON lets the API
   send notifications. Keep it private. On the API server, base64-encode it onto one line and
   add it to the backend `.env` (then redeploy):

   ```bash
   base64 -w0 athletiq-firebase-adminsdk.json      # Linux / EC2
   ```

   ```env
   FCM_SERVICE_ACCOUNT=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Ii...
   ```

   Until this is set, the API accepts device registrations but sends nothing.

### 2. Signing key + GitHub secrets

Android only installs an update if it is signed with the **same key** as the installed app. The key
was generated once into `C:\Users\anime\athletiq-android-signing\`.

> **Back that folder up** (password manager / secure drive). If the key is lost, existing installs
> can't be updated; everyone would have to uninstall and reinstall.

GitHub → **AthletiQ_Frontend → Settings → Secrets and variables → Actions → New repository
secret**, add:

| Secret                      | Value                                                     |
| --------------------------- | --------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | contents of `ANDROID_KEYSTORE_BASE64.txt` (one long line) |
| `ANDROID_KEYSTORE_PASSWORD` | password from `README.txt`                                |
| `ANDROID_KEY_PASSWORD`      | same password                                             |
| `ANDROID_KEY_ALIAS`         | `athletiq`                                                |
| `GOOGLE_SERVICES_JSON`      | full contents of `google-services.json` from step 1       |

### 3. First release

GitHub → **Actions → Android app → Run workflow** (branch `mainline`). In ~5 minutes it publishes
a release tagged `android-v<n>` with `athletiq.apk`.

## Installing on a phone

Share this link (WhatsApp works well):

**https://github.com/animeshmallick/AthletiQ_Frontend/releases/latest/download/athletiq.apk**

Signed-in users on an Android browser also see **Get the Android app** in the account menu.

On the phone:

1. Open the link → the APK downloads → tap it.
2. Android asks to allow installs from the browser (**Settings → Allow from this source**), once.
3. Tap **Install**. Google Play Protect may say the app is unrecognised (normal outside the
   Play Store): **More details → Install anyway**.
4. Open AthletiQ, sign in, and allow **notifications** and **location** (needed for GPS check-in).

## Releasing a new native version

Push a change to `android/`, `capacitor.config.ts` or the Capacitor packages on `mainline` (or run the
workflow by hand). The version number goes up automatically. Installed apps check for updates at
launch (at most every 6 hours) and from **Account menu → Check for app update**.

## Developing

```bash
npm run build && npx cap sync android     # copy web assets + plugin config into android/
npx cap open android                      # open in Android Studio (needs JDK 21 + Android SDK)
```

To test against a local dev server on the same Wi-Fi:

```bash
CAP_SERVER_URL=http://192.168.1.10:5173 npx cap sync android
```

Debug builds can be inspected from desktop Chrome at `chrome://inspect`.

## Troubleshooting

| Problem                                         | Fix                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Workflow: "Add the ANDROID*KEYSTORE*\* secrets" | Step 2 isn't done, or a secret name is misspelt.                                                              |
| Workflow warning: no push notifications         | `GOOGLE_SERVICES_JSON` secret is missing.                                                                     |
| Phone: "App not installed"                      | An APK signed with a different key is installed: uninstall once, then install. Never change the key.          |
| No notifications                                | Notifications allowed for AthletiQ in Android settings? `FCM_SERVICE_ACCOUNT` set on the API?                 |
| GPS check-in says location unavailable          | Android settings → Apps → AthletiQ → Permissions → Location → **Allow only while using the app**, precise on. |
| Blank "You're offline" screen                   | No internet, or the website is down. It reconnects automatically.                                             |
