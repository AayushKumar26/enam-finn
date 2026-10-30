#!/usr/bin/env bash
# Builds FINN.apk without Android Studio: apktool (smali + aapt) and the JDK's jarsigner.
# Usage: APKTOOL=/path/to/apktool.jar [FINN_KEY=gemini-key] [FINN_BACKUP_KEY=groq-key] ./build_apk.sh
set -e
APKTOOL=${APKTOOL:-apktool.jar}
rm -rf build && mkdir -p build/src/assets
cp -r android/* build/src/ && cp -r web/* build/src/assets/
# Optionally bake a demo AI key into the build only (never commit it).
printf 'window.FINN_BUILTIN_KEY = "%s";\nwindow.FINN_BACKUP_KEY = "%s";\n' "${FINN_KEY:-}" "${FINN_BACKUP_KEY:-}" > build/src/assets/js/config.js
java -jar "$APKTOOL" b build/src -o build/unsigned.apk
[ -f finn.keystore ] || keytool -genkeypair -keystore finn.keystore -storepass finn1234 -keypass finn1234 \
  -alias finn -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=FINN"
cp build/unsigned.apk FINN.apk
jarsigner -keystore finn.keystore -storepass finn1234 -sigalg SHA256withRSA -digestalg SHA-256 FINN.apk finn
echo "Built FINN.apk"
