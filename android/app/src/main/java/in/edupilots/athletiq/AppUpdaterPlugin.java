package in.edupilots.athletiq;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates for the sideloaded APK (no Play Store):
 * download the new APK into the app's cache (with progress), then hand it to Android's installer.
 * Android always shows its own "Install" confirmation for apps outside the Play Store.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    /** Has the user allowed AthletiQ to install updates? (Android 8+ asks once per app.) */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    /** Opens "Install unknown apps" for AthletiQ so the user can allow updates. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Downloads the APK once per version (re-uses a finished download); emits downloadProgress. */
    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String version = call.getString("version", "latest");
        if (url == null || !url.startsWith("https://")) {
            call.reject("A https url is required");
            return;
        }
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Could not prepare the update folder");
                return;
            }
            File target = new File(dir, "athletiq-" + version + ".apk");
            File part = new File(dir, "athletiq-" + version + ".apk.part");
            try {
                if (!target.exists()) {
                    // Keep only the update being downloaded.
                    File[] old = dir.listFiles();
                    if (old != null) {
                        for (File f : old) {
                            if (!f.equals(part)) {
                                //noinspection ResultOfMethodCallIgnored
                                f.delete();
                            }
                        }
                    }
                    HttpURLConnection conn = open(url);
                    long total = conn.getContentLengthLong();
                    try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                        byte[] buf = new byte[64 * 1024];
                        long done = 0;
                        int read;
                        int lastPercent = -1;
                        while ((read = in.read(buf)) != -1) {
                            out.write(buf, 0, read);
                            done += read;
                            if (total > 0) {
                                int percent = (int) (done * 100 / total);
                                if (percent != lastPercent) {
                                    lastPercent = percent;
                                    JSObject progress = new JSObject();
                                    progress.put("percent", percent);
                                    notifyListeners("downloadProgress", progress);
                                }
                            }
                        }
                    } finally {
                        conn.disconnect();
                    }
                    if (!part.renameTo(target)) throw new Exception("Could not save the update");
                }
                JSObject ret = new JSObject();
                ret.put("path", target.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                call.reject("Download failed: " + e.getMessage(), e);
            }
        }).start();
    }

    /** GitHub release links redirect to a CDN on another host: follow redirects explicitly. */
    private HttpURLConnection open(String url) throws Exception {
        String current = url;
        for (int i = 0; i < 6; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = c.getHeaderField("Location");
                c.disconnect();
                if (location == null) throw new Exception("Bad redirect");
                current = new URL(new URL(current), location).toString();
                if (!current.startsWith("https://")) throw new Exception("Refusing a non-https redirect");
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new Exception("HTTP " + code);
            }
            return c;
        }
        throw new Exception("Too many redirects");
    }

    /** Opens Android's installer for a downloaded APK. */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        File apk = new File(path);
        File updates = new File(getContext().getCacheDir(), "updates");
        if (!apk.exists() || !updates.equals(apk.getParentFile())) {
            call.reject("Update file not found");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
