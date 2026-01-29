package mobi.dietl.app;

import android.net.Uri;
import android.util.Base64;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "ContentReader")
public class ContentReaderPlugin extends Plugin {

  public void readContentUri(PluginCall call) {
    String uriStr = call.getString("uri");
    if (uriStr == null) {
      call.reject("Missing uri");
      return;
    }

    try {
      Context ctx = getContext();
      Uri uri = Uri.parse(uriStr);
      InputStream is = ctx.getContentResolver().openInputStream(uri);
      if (is == null) {
        call.reject("Could not open InputStream");
        return;
      }

      ByteArrayOutputStream buffer = new ByteArrayOutputStream();
      byte[] data = new byte[16384];
      int nRead;
      while ((nRead = is.read(data, 0, data.length)) != -1) {
        buffer.write(data, 0, nRead);
      }
      buffer.flush();

      byte[] bytes = buffer.toByteArray();
      String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

      JSObject ret = new JSObject();
      ret.put("data", base64);
      ret.put("size", bytes.length);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Error reading uri: " + e.getMessage(), e);
    }
  }
}
