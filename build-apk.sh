#!/usr/bin/env bash
# 로컬 Android APK 빌드 스크립트
# 사용법: bash build-apk.sh
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOCAL_PROPS="$PROJECT_ROOT/android/local.properties"
APK_OUT="$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release.apk"

echo "=== [1/4] local.properties 검증 ==="
# 항상 forward-slash 경로로 강제 생성 (역슬래시는 Java properties에서 이스케이프 처리됨)
ANDROID_SDK_PATH="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
if [ -z "$ANDROID_SDK_PATH" ]; then
  # 환경변수 없으면 Windows 기본 경로 사용
  ANDROID_SDK_PATH="C:/Users/$USERNAME/AppData/Local/Android/Sdk"
fi
# Windows 경로를 슬래시로 변환
ANDROID_SDK_PATH_SLASH="${ANDROID_SDK_PATH//\\//}"
echo "sdk.dir=$ANDROID_SDK_PATH_SLASH" > "$LOCAL_PROPS"
echo "  sdk.dir=$ANDROID_SDK_PATH_SLASH"

echo "=== [2/4] .env 로드 ==="
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
  echo "  .env 로드 완료"
else
  echo "  .env 없음 (건너뜀)"
fi

echo "=== [3/4] Gradle 빌드 ==="
cd "$PROJECT_ROOT/android"
./gradlew assembleRelease
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  echo ""
  echo "❌ BUILD FAILED (exit $BUILD_EXIT)"
  exit $BUILD_EXIT
fi

echo ""
echo "=== [4/4] 결과 ==="
if [ -f "$APK_OUT" ]; then
  APK_SIZE=$(du -sh "$APK_OUT" | cut -f1)
  echo "✅ APK 빌드 성공"
  echo "   위치: $APK_OUT"
  echo "   크기: $APK_SIZE"
  echo "   시각: $(date '+%Y-%m-%d %H:%M:%S')"
else
  echo "❌ APK 파일을 찾을 수 없음: $APK_OUT"
  exit 1
fi
