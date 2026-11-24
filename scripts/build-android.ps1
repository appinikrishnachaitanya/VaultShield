param([switch]$SkipWebBuild)
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
Push-Location $workspaceRoot
try {
  $portableRoot = Join-Path $workspaceRoot '.android-toolchain'
  $javaDirectory = Get-ChildItem -LiteralPath (Join-Path $portableRoot 'java') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($javaDirectory) { $env:JAVA_HOME = $javaDirectory.FullName }
  if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { throw 'Java 21 is required. Set JAVA_HOME to a Java 21 installation.' }
  if (Test-Path -LiteralPath (Join-Path $portableRoot 'sdk/platforms/android-35/android.jar')) { $env:ANDROID_HOME = Join-Path $portableRoot 'sdk' }
  if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platforms/android-35/android.jar'))) { throw 'Install Android SDK Platform 35 and Build Tools 35.0.0, then set ANDROID_HOME.' }
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  $env:GRADLE_USER_HOME = Join-Path $workspaceRoot '.gradle-user-home'
  $env:Path = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:Path
  if (-not $SkipWebBuild) { & npm.cmd run build -- --mode android; if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' } }
  & (Join-Path $workspaceRoot 'node_modules/.bin/cap.cmd') sync android
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }
  & (Join-Path $workspaceRoot 'android/gradlew.bat') -p android assembleDebug --no-daemon --max-workers=2
  if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
  $apkFile = Join-Path $workspaceRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
  if (-not (Test-Path -LiteralPath $apkFile)) { throw 'Build finished without the expected APK.' }
  Write-Output "Debug APK: $apkFile"
} finally { Pop-Location }
