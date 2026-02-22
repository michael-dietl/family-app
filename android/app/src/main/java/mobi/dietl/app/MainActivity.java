package mobi.dietl.app;

import android.os.Bundle;
import android.net.Uri;
import android.util.Base64;
import android.content.Intent;
import android.content.ClipData;
import android.os.Build;
import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
	private JSONArray pendingShareItems;
	private String latestSharePayload;
	private String latestShareToken;

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

		this.bridge.getWebView().addJavascriptInterface(new Object() {
			@android.webkit.JavascriptInterface
			public String consumePendingSharePayload() {
				if (latestSharePayload == null || latestShareToken == null) {
					return null;
				}
				try {
					JSONObject wrapper = new JSONObject();
					wrapper.put("payload", latestSharePayload);
					wrapper.put("token", latestShareToken);
					return wrapper.toString();
				} catch (JSONException ignored) {
					return null;
				} finally {
					latestSharePayload = null;
					latestShareToken = null;
				}
			}
		}, "ShareTargetBridge");

		handleShareIntent(getIntent());
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

	@Override
	protected void onNewIntent(Intent intent) {
		super.onNewIntent(intent);
		setIntent(intent);
		handleShareIntent(intent);
	}

	@Override
	public void onResume() {
		super.onResume();
		dispatchShareItems();
	}

	private void handleShareIntent(Intent intent) {
		if (intent == null) {
			return;
		}
		String action = intent.getAction();
		if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
			return;
		}

		intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

		JSONArray payload = new JSONArray();
		Set<String> seenUris = new HashSet<>();

		addUriToPayload(payload, intent.getData(), seenUris);
		addUriToPayload(payload, intent.getParcelableExtra(Intent.EXTRA_STREAM), seenUris);

		ClipData clip = intent.getClipData();
		if (clip != null) {
			for (int i = 0; i < clip.getItemCount(); i++) {
				addUriToPayload(payload, clip.getItemAt(i).getUri(), seenUris);
			}
		}

		ArrayList<Uri> streamUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
		if (streamUris != null) {
			for (Uri uri : streamUris) {
				addUriToPayload(payload, uri, seenUris);
			}
		}

		if (payload.length() == 0) {
			return;
		}

		updateSharePayload(payload);
		dispatchShareItems();
	}

	private void dispatchShareItems() {
		if (pendingShareItems == null || pendingShareItems.length() == 0 || this.bridge == null || this.bridge.getWebView() == null) {
			return;
		}
		final String payload = pendingShareItems.toString();
		final String token = this.latestShareToken != null ? this.latestShareToken : "";
		final String quoted = JSONObject.quote(payload);
		final String quotedToken = JSONObject.quote(token);
		final String js = "(function(){ try { const items = JSON.parse(" + quoted + "); window.dispatchEvent(new CustomEvent('share-target',{ detail:{ items, token: " + quotedToken + " } })); } catch (e) { } })();";
		pendingShareItems = null;
		this.bridge.getWebView().post(new Runnable() {
			@Override
			public void run() {
				try {
					MainActivity.this.bridge.getWebView().evaluateJavascript(js, null);
				} catch (Exception ignored) {
				}
			}
		});
	}

	private void addUriToPayload(JSONArray payload, Uri uri, Set<String> seenUris) {
		if (uri == null) {
			return;
		}
		String uriString = uri.toString();
		if (uriString.isEmpty() || seenUris.contains(uriString)) {
			return;
		}
		grantPersistablePermission(uri);
		String mime = resolveMimeType(uri);
		if (!isSupportedMimeType(mime)) {
			return;
		}

		try {
			JSONObject obj = new JSONObject();
			obj.put("uri", uriString);
			obj.put("mimeType", mime);
			payload.put(obj);
			seenUris.add(uriString);
		} catch (JSONException ignored) {
		}
	}

	private void grantPersistablePermission(Uri uri) {
		if (uri == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
			return;
		}
		try {
			getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
		} catch (Exception ignored) {
		}
	}

	private void updateSharePayload(JSONArray payload) {
		this.pendingShareItems = payload;
		this.latestSharePayload = payload.toString();
		this.latestShareToken = UUID.randomUUID().toString();
	}

	private boolean isSupportedMimeType(String mime) {
		if (mime == null) {
			return false;
		}
		String normalized = mime.toLowerCase();
		return normalized.startsWith("image/") || normalized.startsWith("video/");
	}

	private String resolveMimeType(Uri uri) {
		if (uri == null) {
			return "";
		}
		String mime = null;
		try {
			mime = getApplicationContext().getContentResolver().getType(uri);
		} catch (Exception ignored) {
		}
		if (mime == null || mime.isEmpty()) {
			mime = guessMimeFromUri(uri);
		}
		return mime != null ? mime : "";
	}

	private String guessMimeFromUri(Uri uri) {
		if (uri == null) {
			return "image/jpeg";
		}
		String path = uri.getPath();
		if (path == null) {
			return "image/jpeg";
		}
		path = path.toLowerCase();
		if (path.endsWith(".mp4") || path.endsWith(".mov") || path.endsWith(".3gp") || path.endsWith(".mkv") || path.endsWith(".webm")) {
			return "video/mp4";
		}
		if (path.endsWith(".png")) {
			return "image/png";
		}
		if (path.endsWith(".gif")) {
			return "image/gif";
		}
		if (path.endsWith(".heic")) {
			return "image/heic";
		}
		if (path.endsWith(".bmp")) {
			return "image/bmp";
		}
		return "image/jpeg";
	}
}
