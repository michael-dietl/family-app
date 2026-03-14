package mobi.dietl.app;

import android.os.Bundle;
import android.net.Uri;
import android.util.Base64;
import android.content.Intent;
import android.content.ClipData;
import android.os.Build;
import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import androidx.exifinterface.media.ExifInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
	private static final int REQUEST_ACCESS_MEDIA_LOCATION = 42425;
	private static final int REQUEST_READ_MEDIA_IMAGES = 42426;
	private static final String GPS_LOG_TAG = "GPSMOBI";
	private static final int GPS_SELFTEST_MAX_SCAN = 250;
	private JSONArray pendingShareItems;
	private String latestSharePayload;
	private String latestShareToken;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		FirebaseApp.initializeApp(this);
		super.onCreate(savedInstanceState);
		ensureMediaReadPermission();
		ensureMediaLocationPermission();

		try {
			// WICHTIG: verhindert, dass das WebView hinter die Statusbar rutscht 
			WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

			// Add a lightweight JS bridge to read content:// URIs using ContentResolver
			this.bridge.getWebView().addJavascriptInterface(new Object() {
				@android.webkit.JavascriptInterface
				public String readContentUri(String uriStr) {
					try {
						Uri uri = Uri.parse(uriStr);
						InputStream is = getApplicationContext().getContentResolver().openInputStream(requireOriginalUriIfPossible(uri));
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

				@android.webkit.JavascriptInterface
				public String getContentUriMeta(String uriStr) {
					Cursor cursor = null;
					try {
						Uri uri = Uri.parse(uriStr);
						String mimeType = getApplicationContext().getContentResolver().getType(uri);
						String displayName = null;
						Long size = null;
						cursor = getApplicationContext().getContentResolver().query(uri, null, null, null, null);
						if (cursor != null && cursor.moveToFirst()) {
							int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
							if (nameIndex >= 0) {
								displayName = cursor.getString(nameIndex);
							}
							int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
							if (sizeIndex >= 0) {
								size = cursor.getLong(sizeIndex);
							}
						}

						JSONObject meta = new JSONObject();
						if (mimeType != null) meta.put("mimeType", mimeType);
						if (displayName != null) meta.put("displayName", displayName);
						if (size != null) meta.put("size", size);
						return meta.toString();
					} catch (Exception e) {
						return null;
					} finally {
						if (cursor != null) {
							cursor.close();
						}
					}
				}

				@android.webkit.JavascriptInterface
				public String copyContentUriToFile(String uriStr, String relativePath) {
					InputStream input = null;
					OutputStream output = null;
					try {
						Uri uri = Uri.parse(uriStr);
						File baseDir = getApplicationContext().getExternalFilesDir(null);
						if (baseDir == null) return null;
						File target = new File(baseDir, relativePath);
						File parent = target.getParentFile();
						if (parent != null && !parent.exists()) {
							parent.mkdirs();
						}
						input = getApplicationContext().getContentResolver().openInputStream(requireOriginalUriIfPossible(uri));
						if (input == null) return null;
						output = new FileOutputStream(target);
						byte[] buffer = new byte[16384];
						int length;
						while ((length = input.read(buffer)) > 0) {
							output.write(buffer, 0, length);
						}
						output.flush();
						return Uri.fromFile(target).toString();
					} catch (Exception e) {
						return null;
					} finally {
						try {
							if (input != null) input.close();
						} catch (Exception ignored) {
						}
						try {
							if (output != null) output.close();
						} catch (Exception ignored) {
						}
					}
				}

				@android.webkit.JavascriptInterface
				public String getContentUriGps(String uriStr) {
					Cursor cursor = null;
					InputStream input = null;
					try {
						Uri uri = Uri.parse(uriStr);
						Uri exifUri = requireOriginalUriIfPossible(uri);

						// 1) Prefer EXIF from the original content stream.
						input = getApplicationContext().getContentResolver().openInputStream(exifUri);
						if (input != null) {
							ExifInterface exif = new ExifInterface(input);
							float[] latLng = new float[2];
							if (exif.getLatLong(latLng)) {
								double lat = latLng[0];
								double lng = latLng[1];
								if (isValidGps(lat, lng)) {
									JSONObject gps = new JSONObject();
									gps.put("latitude", lat);
									gps.put("longitude", lng);
									gps.put("source", "exifinterface");
									return gps.toString();
								}
							}
						}

						// 2) Fallback to MediaStore location columns where available.
						String[] projection = new String[] {
							MediaStore.Images.ImageColumns.LATITUDE,
							MediaStore.Images.ImageColumns.LONGITUDE
						};
						cursor = getApplicationContext().getContentResolver().query(exifUri, projection, null, null, null);
						if (cursor != null && cursor.moveToFirst()) {
							int latIndex = cursor.getColumnIndex(MediaStore.Images.ImageColumns.LATITUDE);
							int lngIndex = cursor.getColumnIndex(MediaStore.Images.ImageColumns.LONGITUDE);
							if (latIndex >= 0 && lngIndex >= 0 && !cursor.isNull(latIndex) && !cursor.isNull(lngIndex)) {
								double lat = cursor.getDouble(latIndex);
								double lng = cursor.getDouble(lngIndex);
								if (isValidGps(lat, lng)) {
									JSONObject gps = new JSONObject();
									gps.put("latitude", lat);
									gps.put("longitude", lng);
									gps.put("source", "mediastore");
									return gps.toString();
								}
							}
						}

						return null;
					} catch (Exception e) {
						return null;
					} finally {
						try {
							if (input != null) input.close();
						} catch (Exception ignored) {
						}
						if (cursor != null) {
							cursor.close();
						}
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
						intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
						intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
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
		runGpsCopySelfTest();
	}

	private void runGpsCopySelfTest() {
		new Thread(() -> {
			Cursor cursor = null;
			InputStream sourceInput = null;
			FileInputStream copiedInput = null;
			try {
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
					if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
						Log.i(GPS_LOG_TAG, "SELFTEST skip: READ_MEDIA_IMAGES not granted");
						return;
					}
				} else {
					if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
						Log.i(GPS_LOG_TAG, "SELFTEST skip: READ_EXTERNAL_STORAGE not granted");
						return;
					}
				}

				Uri imagesUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
				String[] projection = new String[] {
					MediaStore.Images.Media._ID,
					MediaStore.Images.Media.DISPLAY_NAME
				};
				String sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC";
				cursor = getContentResolver().query(imagesUri, projection, null, null, sortOrder);
				if (cursor == null) {
					Log.i(GPS_LOG_TAG, "SELFTEST: no cursor from MediaStore");
					return;
				}

				int idIndex = cursor.getColumnIndex(MediaStore.Images.Media._ID);
				int nameIndex = cursor.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME);
				if (idIndex < 0) {
					Log.i(GPS_LOG_TAG, "SELFTEST: _ID column missing");
					return;
				}

				int scanned = 0;
				boolean found = false;
				while (cursor.moveToNext() && scanned < GPS_SELFTEST_MAX_SCAN) {
					scanned++;
					long id = cursor.getLong(idIndex);
					String displayName = nameIndex >= 0 ? cursor.getString(nameIndex) : null;
					Uri contentUri = Uri.withAppendedPath(imagesUri, Long.toString(id));
					Uri exifUri = requireOriginalUriIfPossible(contentUri);

					sourceInput = getContentResolver().openInputStream(exifUri);
					if (sourceInput == null) {
						continue;
					}

					ExifInterface sourceExif = new ExifInterface(sourceInput);
					float[] sourceLatLng = new float[2];
					if (!sourceExif.getLatLong(sourceLatLng) || !isValidGps(sourceLatLng[0], sourceLatLng[1])) {
						sourceInput.close();
						sourceInput = null;
						continue;
					}

					String relativePath = "galleries/gps_diag/diag_copy_" + id + ".jpg";
					String copiedUriString = copyContentUriToAppFile(contentUri, relativePath);
					sourceInput.close();
					sourceInput = null;
					if (copiedUriString == null) {
						Log.i(GPS_LOG_TAG, "SELFTEST copy failed for id=" + id + " name=" + displayName);
						continue;
					}

					Uri copiedUri = Uri.parse(copiedUriString);
					File copiedFile = new File(copiedUri.getPath());
					if (!copiedFile.exists()) {
						Log.i(GPS_LOG_TAG, "SELFTEST copied file missing path=" + copiedUriString);
						continue;
					}

					copiedInput = new FileInputStream(copiedFile);
					ExifInterface copiedExif = new ExifInterface(copiedInput);
					float[] copiedLatLng = new float[2];
					boolean copiedHasGps = copiedExif.getLatLong(copiedLatLng) && isValidGps(copiedLatLng[0], copiedLatLng[1]);
					copiedInput.close();
					copiedInput = null;

					Log.i(
						GPS_LOG_TAG,
						"SELFTEST source id=" + id
							+ " name=" + displayName
							+ " uri=" + contentUri
							+ " lat=" + sourceLatLng[0]
							+ " lng=" + sourceLatLng[1]
					);
					if (copiedHasGps) {
						Log.i(
							GPS_LOG_TAG,
							"SELFTEST copied uri=" + copiedUriString
								+ " lat=" + copiedLatLng[0]
								+ " lng=" + copiedLatLng[1]
						);
					} else {
						Log.i(GPS_LOG_TAG, "SELFTEST copied uri=" + copiedUriString + " has no usable GPS");
					}

					found = true;
					break;
				}

				if (!found) {
					Log.i(GPS_LOG_TAG, "SELFTEST no image with usable GPS found after scan=" + scanned);
				}
			} catch (Exception e) {
				Log.e(GPS_LOG_TAG, "SELFTEST failed", e);
			} finally {
				try {
					if (sourceInput != null) sourceInput.close();
				} catch (Exception ignored) {
				}
				try {
					if (copiedInput != null) copiedInput.close();
				} catch (Exception ignored) {
				}
				if (cursor != null) {
					cursor.close();
				}
			}
		}).start();
	}

	private void ensureMediaReadPermission() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED) {
				return;
			}
			ActivityCompat.requestPermissions(
				this,
				new String[] { Manifest.permission.READ_MEDIA_IMAGES },
				REQUEST_READ_MEDIA_IMAGES
			);
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
			return;
		}
		ActivityCompat.requestPermissions(
			this,
			new String[] { Manifest.permission.READ_EXTERNAL_STORAGE },
			REQUEST_READ_MEDIA_IMAGES
		);
	}

	private void ensureMediaLocationPermission() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED) {
			return;
		}
		ActivityCompat.requestPermissions(
			this,
			new String[] { Manifest.permission.ACCESS_MEDIA_LOCATION },
			REQUEST_ACCESS_MEDIA_LOCATION
		);
	}

	private Uri requireOriginalUriIfPossible(Uri uri) {
		if (uri == null) {
			return null;
		}
		if (!"content".equalsIgnoreCase(uri.getScheme())) {
			return uri;
		}
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
			return uri;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_MEDIA_LOCATION) != PackageManager.PERMISSION_GRANTED) {
			return uri;
		}
		try {
			return MediaStore.setRequireOriginal(uri);
		} catch (Exception ignored) {
			return uri;
		}
	}

	private String copyContentUriToAppFile(Uri uri, String relativePath) {
		InputStream input = null;
		OutputStream output = null;
		try {
			File baseDir = getApplicationContext().getExternalFilesDir(null);
			if (baseDir == null) return null;
			File target = new File(baseDir, relativePath);
			File parent = target.getParentFile();
			if (parent != null && !parent.exists()) {
				parent.mkdirs();
			}
			input = getApplicationContext().getContentResolver().openInputStream(requireOriginalUriIfPossible(uri));
			if (input == null) return null;
			output = new FileOutputStream(target);
			byte[] buffer = new byte[16384];
			int length;
			while ((length = input.read(buffer)) > 0) {
				output.write(buffer, 0, length);
			}
			output.flush();
			return Uri.fromFile(target).toString();
		} catch (Exception e) {
			return null;
		} finally {
			try {
				if (input != null) input.close();
			} catch (Exception ignored) {
			}
			try {
				if (output != null) output.close();
			} catch (Exception ignored) {
			}
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
						try {
							getContentResolver().takePersistableUriPermission(
								data.getData(),
								Intent.FLAG_GRANT_READ_URI_PERMISSION
							);
						} catch (Exception ignored) {
						}
						arr.put(data.getData().toString());
					}
					ClipData clip = data.getClipData();
					if (clip != null) {
						for (int i = 0; i < clip.getItemCount(); i++) {
							Uri uri = clip.getItemAt(i).getUri();
							try {
								getContentResolver().takePersistableUriPermission(
									uri,
									Intent.FLAG_GRANT_READ_URI_PERMISSION
								);
							} catch (Exception ignored) {
							}
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

	private boolean isValidGps(double latitude, double longitude) {
		if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) {
			return false;
		}
		if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
			return false;
		}
		return !(Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001);
	}
}
