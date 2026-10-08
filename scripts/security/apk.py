"""Read-only APK artifact checks. Optional smoke reads require the isolated emulator."""
import json, os, re, subprocess, sys, hashlib, zipfile
from pathlib import Path
apk = Path(sys.argv[1] if len(sys.argv) > 1 else '.tmp/security/release/kna-clinic-1.0.3.apk')
bundle = Path(sys.argv[2] if len(sys.argv) > 2 else 'C:/ka103/android/app/build/generated/assets/react/release/index.android.bundle')
sdk = Path(os.environ.get('ANDROID_SDK_ROOT', str(Path(os.environ.get('LOCALAPPDATA', '.')) / 'Android/Sdk')))
tools = sdk / 'build-tools/36.0.0'
results = []
def add(id, description, expected, actual, ok, area=8):
    results.append(dict(id=id, area=area, description=description, steps='Inspect the signed release APK; optional read-only isolated emulator inspection', expected=expected, actual=actual, status='PASS' if ok else 'FAIL'))
def run(args):
    return subprocess.run([str(a) for a in args], text=True, capture_output=True, check=True).stdout
certs = run([tools / ('apksigner.bat' if os.name == 'nt' else 'apksigner'), 'verify', '--print-certs', apk])
certificate = re.search(r'SHA-256 digest: ([a-f0-9]+)', certs).group(1)
previous = '4fef45c1eae069ede9b94c98567b94116f9765e778257a69ab729a3391b62bfe'
add('APK-SIGNATURE', 'APK signature is valid and matches v1.0.2', previous, certificate, certificate == previous)
badging = run([tools / ('aapt.exe' if os.name == 'nt' else 'aapt'), 'dump', 'badging', apk])
add('APK-VERSION', 'Release package and version allow an upgrade', 'com.anonymous.knarabiesmonitoring; 1.0.3; versionCode 4', badging.splitlines()[0], "versionCode='4'" in badging and "versionName='1.0.3'" in badging and "name='com.anonymous.knarabiesmonitoring'" in badging)
manifest = run([tools / ('aapt.exe' if os.name == 'nt' else 'aapt'), 'dump', 'xmltree', apk, 'AndroidManifest.xml'])
secure = all(re.search(rf'android:{name}.*\(type 0x12\)0x0\b', manifest) for name in ['usesCleartextTraffic', 'allowBackup'])
add('APK-TRANSPORT', 'Compiled manifest disables cleartext traffic and app backup', 'Both false', 'Both false' if secure else 'Manifest mismatch', secure, 7)
with zipfile.ZipFile(apk) as archive:
    contents = archive.read('assets/index.android.bundle')
    abis = sorted({n.split('/')[1] for n in archive.namelist() if n.startswith('lib/') and n.endswith('.so')})
add('APK-BUNDLE', 'Packaged bundle equals the final compiled output and includes remote revocation', 'Byte equality; revoke-device present', 'Byte equal; remote revocation included' if contents == bundle.read_bytes() and b'revoke-device' in contents else 'Mismatch', contents == bundle.read_bytes() and b'revoke-device' in contents)
add('APK-ABIS', 'Release includes all four Android architectures', 'arm64-v8a, armeabi-v7a, x86, x86_64', ', '.join(abis), abis == ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'])
if '--emulator' in sys.argv:
    adb = sdk / 'platform-tools/adb.exe'
    pid = run([adb, '-s', 'emulator-5580', 'shell', 'pidof', 'com.anonymous.knarabiesmonitoring']).strip()
    run([adb, '-s', 'emulator-5580', 'shell', 'uiautomator', 'dump', '/sdcard/ka-security-ui.xml'])
    run([adb, '-s', 'emulator-5580', 'pull', '/sdcard/ka-security-ui.xml', '.tmp/security/android-smoke.xml'])
    ui = Path('.tmp/security/android-smoke.xml').read_text(encoding='utf-8')
    errors = run([adb, '-s', 'emulator-5580', 'logcat', '-d', '-s', 'ReactNativeJS:E', 'AndroidRuntime:E'])
    ok = bool(pid) and 'K&amp;A CLINIC' in ui and 'Next' in ui and not errors.strip()
    add('APK-EMULATOR-LAUNCH', 'Release app renders onboarding without native/JS crash', 'Onboarding visible; process alive; zero app error logs', 'Onboarding visible; process alive; zero app error logs' if ok else 'Smoke check mismatch', ok, 9)
Path('docs/security-results').mkdir(parents=True, exist_ok=True)
Path('docs/security-results/apk-after.json').write_text(json.dumps(dict(date=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), sha256=hashlib.sha256(apk.read_bytes()).hexdigest(), bytes=apk.stat().st_size, certificateSha256=certificate, bundleSha256=hashlib.sha256(contents).hexdigest(), results=results), indent=2), encoding='utf-8')
print(f'APK: {sum(r["status"] == "PASS" for r in results)}/{len(results)} PASS')
sys.exit(any(r['status'] == 'FAIL' for r in results))
