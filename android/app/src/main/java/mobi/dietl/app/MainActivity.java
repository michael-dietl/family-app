package mobi.dietl.app;

import android.os.Bundle;
import android.net.Uri;
import android.util.Base64;
import android.content.Intent;
import android.content.ClipData;
import android.os.Build;
import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		try {
			// WICHTIG: verhindert, dass das WebView hinter die Statusbar rutscht 
			WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

			// Add a lightweight JS bridge to read content:// URIs using ContentResolver
			this.bridge.getWebView().addJavascriptInterface(new Object() {
				@android.webkit.JavascriptInterface
				public String readContentUri(String uriStr) {
					try {
						Uri uri = Uri.parse(uriStr);
						InputStream is = getApplicationContext().getContentResolver().openInputStream(uri);
						if (is == null) return null;
						ByteArrayOutputStream buffer = new ByteArrayOutputStream();
						byte[] data = new byte[16384];
						int nRead;
						while ((nRead = is.read(data, 0, data.length)) != -1) {
							buffer.write(data, 0, nRead);
						}
						buffer.flush();
						byte[] bytes = buffer.toByteArray();
						return Base64.encodeToString(bytes, Base64.NO_WRAP);
					} catch (Exception e) {
						return null;
					}
				}
			}, "ContentReaderNative");

			// Add a lightweight JS bridge to launch a native picker (SAF / ACTION_OPEN_DOCUMENT)
			this.bridge.getWebView().addJavascriptInterface(new Object() {
				@android.webkit.JavascriptInterface
				public void pick(String jsonOptions) {
					try {
						Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
						intent.addCategory(Intent.CATEGORY_OPENABLE);
						// Allow images and videos by default
						intent.setType("*/*");
						String[] mimeTypes = new String[] { "image/*", "video/*" };
						intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
						intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
						startActivityForResult(intent, 42424);
					} catch (Exception e) {
						// ignore
					}
				}
			}, "NativePhotoPicker");
		} catch (Exception ignored) {
			// Best effort: if the WebView isn't ready, ignore
		}
	}

	@Override
	protected void onActivityResult(int requestCode, int resultCode, Intent data) {
		super.onActivityResult(requestCode, resultCode, data);
		if (requestCode == 42424) {
			try {
				JSONArray arr = new JSONArray();
				if (data == null) {
					// no data
				} else {
					if (data.getData() != null) {
						arr.put(data.getData().toString());
					}
					ClipData clip = data.getClipData();
					if (clip != null) {
						for (int i = 0; i < clip.getItemCount(); i++) {
							Uri uri = clip.getItemAt(i).getUri();
							arr.put(uri.toString());
						}
					}
				}
				final String json = arr.toString();
				// Post back to WebView thread
				this.bridge.getWebView().post(new Runnable() {
					@Override
					public void run() {
						try {
							String js = "(function(){ if(window.__nativePhotoPickerCallback){window.__nativePhotoPickerCallback(" + org.json.JSONObject.quote(json) + "); delete window.__nativePhotoPickerCallback; } })()";
							MainActivity.this.bridge.getWebView().evaluateJavascript(js, null);
						} catch (Exception e) {
							// ignore
						}
					}
				});
			} catch (Exception e) {
				// ignore
			}
		}
	}
}
