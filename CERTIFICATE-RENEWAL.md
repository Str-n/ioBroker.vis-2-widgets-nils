# Renewing the ioBroker LAN HTTPS certificate

## Current setup

The certificate installed on September 5, 2026 covers `192.168.178.40`,
`raspberrypi`, and `pi`. It is active on **web.1**, serving HTTPS on port **8082**,
using ioBroker certificate entries `lanHomePublic` and `lanHomePrivate`.
The admin adapter was not switched to this certificate.

- Server certificate expires: **September 5, 2027**.
- Issuing CA: **Home ioBroker LAN CA**, expiring **September 2, 2036**.
- Automatic renewal is enabled through a daily systemd timer (installed
  September 5, 2026). The server certificate is renewed when 30 days or less remain.
- Scripts, keys, configuration, and backups are on the Pi in
  `/home/pi/.local/share/iobroker-lan-tls/`.

That directory has permissions `700`; private keys and original configuration
backups have permissions `600`. Keep an access-controlled backup of this directory.
Only the public CA certificate should be transferred to client devices.

## Automatic renewal

The Pi runs `iobroker-lan-certificate.timer` daily at **04:00 in the Pi's local
timezone**, with a random delay of up to 15 minutes. At installation the timezone
was Europe/Berlin (CEST). `Persistent=true` catches up a missed check after the Pi
starts again.

The timer starts `iobroker-lan-certificate.service`, which runs as user `pi`:

```bash
/bin/bash /home/pi/.local/share/iobroker-lan-tls/renew.sh --if-due
```

If the certificate is valid for more than 30 days, the check exits without changing
it or restarting the web adapter. Otherwise it runs the renewal procedure below.
A lock prevents overlapping manual and automatic renewals. A `renewal.pending`
marker remains if renewal fails, so the next daily check retries even if a new
certificate was already written locally. After import and restart, the script
checks the live dashboard using the CA and removes the marker only on success.

The timer renews the **server certificate**, not the CA. The CA must eventually
be replaced and trusted on devices again. Renewal refuses to issue a one-year
certificate if the CA has insufficient remaining validity. Failures are recorded
in the systemd journal; no email or phone notifications are configured.

Check the schedule and recent results from your computer:

```bash
ssh pi@192.168.178.40 'systemctl list-timers iobroker-lan-certificate.timer --no-pager'
ssh pi@192.168.178.40 'sudo journalctl -u iobroker-lan-certificate.service -n 50 --no-pager'
```

Run the expiry check immediately:

```bash
ssh pi@192.168.178.40 'sudo systemctl start iobroker-lan-certificate.service'
```

A successful oneshot service normally becomes `inactive (dead)` when finished;
the **timer** should remain active and enabled.

Disable or re-enable scheduling:

```bash
ssh pi@192.168.178.40 'sudo systemctl disable --now iobroker-lan-certificate.timer'
ssh pi@192.168.178.40 'sudo systemctl enable --now iobroker-lan-certificate.timer'
```

Unit files are installed at:

```text
/etc/systemd/system/iobroker-lan-certificate.service
/etc/systemd/system/iobroker-lan-certificate.timer
```

Copies are retained in the protected TLS directory, along with
`renew-before-automation.sh`, a backup of the original manual renewal script.
After editing a unit file, run `sudo systemctl daemon-reload` and
`sudo systemctl restart iobroker-lan-certificate.timer` on the Pi.

## Renew the server certificate manually

Automatic renewal normally handles expiration. To force an immediate renewal,
use the procedure below. Keep SSH access available during the change.

1. Check the existing certificate:

   ```bash
   ssh pi@192.168.178.40 'openssl x509 -in /home/pi/.local/share/iobroker-lan-tls/server.crt -noout -dates -ext subjectAltName'
   ```

2. Run the installed renewal script:

   ```bash
   ssh pi@192.168.178.40 'bash /home/pi/.local/share/iobroker-lan-tls/renew.sh'
   ```

   The script checks the CA's remaining validity, creates a new private key and
   a server certificate valid for 365 days, and verifies all three addresses.
   It backs up the previous server files in a timestamped `renewal-backup-*`
   directory, imports the replacement into ioBroker, and restarts **web.1**.
   The dashboard may briefly disconnect.

   If the script fails, inspect the error before retrying. It does not roll back
   automatically; the daily timer retries while `renewal.pending` exists.
   If the CA validity check fails, a new CA must be created and
   trusted on the client devices; this script renews server certificates only.

3. Repeat step 1 to check the new expiration.

4. Verify the live HTTPS endpoint using the commands below.

5. Open the dashboard from its existing home-screen icon. Routine renewal reuses
   the CA, so reinstalling the CA or recreating the icon should not be needed.

## Verify HTTPS after renewal

Copy the public CA to your computer through SSH:

```bash
scp pi@192.168.178.40:/home/pi/.local/share/iobroker-lan-tls/ca.crt ./home-iobroker-lan-ca.crt
```

Then run:

```bash
curl --cacert ./home-iobroker-lan-ca.crt -I https://192.168.178.40:8082/vis-2/
curl --cacert ./home-iobroker-lan-ca.crt --resolve raspberrypi:8082:192.168.178.40 -I https://raspberrypi:8082/vis-2/
curl --cacert ./home-iobroker-lan-ca.crt --resolve pi:8082:192.168.178.40 -I https://pi:8082/vis-2/
```

All three should complete without TLS errors and return HTTP 200. Do not use
`-k` or `--insecure`, which skip certificate verification. These checks passed
against the live server after the initial installation.

The `--resolve` arguments test hostname coverage independently of DNS. Normal
browser access also requires `raspberrypi` and `pi` to resolve correctly on the
client's network. Certificate SAN entries do not create DNS records. Names such
as `raspberrypi.fritz.box` and `raspberrypi.local` are not covered.

## Install the CA on Android — once per device

These steps are needed for initial setup or after replacing the CA, not after
routine server certificate renewal.

1. Copy `home-iobroker-lan-ca.crt` from your computer to the phone, for example
   over USB. The public CA is also available at:

   <https://192.168.178.40:8082/vis-2.0/lan-home-ca.crt>

   That URL may show a certificate warning before the CA is installed. Copying
   through SSH and USB avoids relying on an untrusted HTTPS download.

2. Open Android **Settings → Security & privacy → More security settings →
   Encryption & credentials → Install a certificate → CA certificate**.
   Menu names vary; search Settings for “CA certificate” if necessary. Select
   the copied `.crt` file and confirm with your device PIN. Use the CA certificate
   option rather than the Wi-Fi or client certificate option.

3. Check that the certificate is named **Home ioBroker LAN CA**. The CA created
   on September 5, 2026 has this SHA-256 fingerprint:

   ```text
   05:DC:A0:60:AD:D5:CA:79:EA:C3:27:FF:3B:21:7E:34:2F:46:C7:22:33:5A:26:D7:8A:08:A5:BC:96:DF:DD:ED
   ```

   To inspect the downloaded file on a computer:

   ```bash
   openssl x509 -in home-iobroker-lan-ca.crt -noout -fingerprint -sha256
   ```

4. Restart Chrome and open the dashboard:

   <https://192.168.178.40:8082/vis-2/index.html#EG>

   It must open without a certificate warning. Bypassing the warning does not
   satisfy Chrome's secure-origin requirement for app installation.

5. For initial fullscreen setup, delete the previous home-screen shortcut, wait
   for the dashboard and its **Home Screen Fullscreen** widget to load, then
   choose **Add to Home screen → Install** in Chrome, if offered. Launch using
   the new icon.

References: [Android certificate settings](https://support.google.com/pixelphone/answer/2844832?hl=en)
and [Chrome installation requirements](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest).

## Rollback

Disable the timer first and ensure the renewal service is not currently running:

```bash
ssh pi@192.168.178.40 'sudo systemctl disable --now iobroker-lan-certificate.timer; systemctl is-active iobroker-lan-certificate.service'
```

If the service is active, wait for it to finish before restoring files or settings.
Leave scheduling disabled until the rollback has been verified and any failure
has been resolved. A leftover `renewal.pending` marker causes a retry when the
timer is re-enabled.

To restore the certificate assignments from before the initial LAN certificate
installation:

```bash
ssh pi@192.168.178.40 'node /home/pi/.local/share/iobroker-lan-tls/install.cjs --rollback && cd /opt/iobroker && iobroker restart web.1'
```

This restores the original `defaultPublic` / `defaultPrivate` assignments. It
does not select the certificate from the most recent renewal. The original
certificate does not cover the IP address and can bring back Chrome's certificate
warning and fullscreen installation failure.

To undo a later renewal while retaining the LAN CA, restore a timestamped backup:

```bash
ssh pi@192.168.178.40
cd /home/pi/.local/share/iobroker-lan-tls
ls -d renewal-backup-*
# Replace the example directory with the actual backup you want to restore.
cp renewal-backup-YYYYMMDD-HHMMSS/server.key ./server.key
cp renewal-backup-YYYYMMDD-HHMMSS/server.crt ./server.crt
cp renewal-backup-YYYYMMDD-HHMMSS/server.csr ./server.csr
node ./install.cjs
cd /opt/iobroker
iobroker restart web.1
```

Check that the restored certificate has not expired, then repeat the live HTTPS
verification. Original ioBroker object backups are retained as `web-original.json`
and `certificates-original.json` in the protected directory.

## Changing addresses later

If the IP or desired hostnames change, update the `[names]` section of `server.cnf`
on the Pi before renewal. The scripts also explicitly verify `192.168.178.40`,
`raspberrypi`, and `pi`; update those checks in `renew.sh` and `install.cjs` when
replacing any of these addresses. Update DNS separately and verify the new URL
before recreating its home-screen app.
