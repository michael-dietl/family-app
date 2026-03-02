# PocketBase Push Setup

This project uses FCM + @capacitor/push-notifications. Secrets are not committed.

## 1) Firebase setup (Android)
1. Create a Firebase project and add an Android app with package name `mobi.dietl.app`.
2. Download `google-services.json` and place it at:
   `android/app/google-services.json`
3. Rebuild/sync the Android project.

## 2) PocketBase collections
Create a collection named `device_tokens` with fields:
- `token` (text, unique, required)
- `platform` (text, optional)
- `userId` (text, optional)

## 3) Token registration
The app registers FCM tokens after PocketBase auth and upserts into `device_tokens`.
See `src/services/pushTokenService.ts`.

## 4) PocketBase hook to send pushes
Use a server-side hook when a `notifications` record is created. Example (pb_hooks):

```js
/// <reference path="../pb_data/types.d.ts" />
// File: pb_hooks/notify_push.pb.js

onRecordAfterCreateRequest((e) => {
  if (e.collection.name !== 'notifications') return;

  const title = e.record.get('title') || 'Updates';
  const body = e.record.get('body') || 'Neue Änderungen sind verfügbar';

  // Load device tokens
  const tokens = $app.dao().findRecordsByFilter('device_tokens', '', '').map(r => r.get('token')).filter(Boolean);
  if (!tokens.length) return;

  // Send to FCM
  const serverKey = $os.getenv('FCM_SERVER_KEY');
  if (!serverKey) {
    console.warn('FCM_SERVER_KEY not configured');
    return;
  }

  const payload = {
    registration_ids: tokens,
    notification: { title, body },
    data: { title, body }
  };

  const res = $http.request({
    method: 'POST',
    url: 'https://fcm.googleapis.com/fcm/send',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'key=' + serverKey
    },
    body: JSON.stringify(payload)
  });

  if (res.status >= 400) {
    console.warn('FCM send failed', res.status, res.body);
  }
});
```

Set the env var on your PocketBase host:
- `FCM_SERVER_KEY=...`

## 5) Notes
- Android 13+ requires `POST_NOTIFICATIONS` permission (added in manifest).
- Foreground notifications are mirrored using `LocalNotifications`.
