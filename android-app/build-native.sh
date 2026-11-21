#!/usr/bin/env bash
# Cross-compiles the native library for the stick's 32-bit ARM and drops it in the APK's jniLibs.
# CI only: needs a Rust toolchain with the armv7 target and an Android NDK (see docs/firetv.md).
set -euo pipefail

api=30
target=armv7-linux-androideabi
root="$(cd "$(dirname "$0")/.." && pwd -P)"

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ndk="${ANDROID_NDK_LATEST_HOME:-${ANDROID_NDK_HOME:-}}"
if [ -z "$ndk" ]; then
  [ -n "$sdk" ] || {
    echo "ANDROID_HOME or ANDROID_NDK_HOME is required" >&2
    exit 1
  }
  ndk="$(ls -d "$sdk"/ndk/* | sort -V | tail -1)"
fi
bin="$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin"
[ -x "$bin/armv7a-linux-androideabi$api-clang" ] || {
  echo "no NDK compiler in $bin" >&2
  exit 1
}

# ring's build script looks up the legacy arm-linux-androideabi-clang, which the NDK no longer
# ships. Forwarder scripts, not symlinks: the NDK wrapper resolves its own directory.
aliases="$(mktemp -d)"
trap 'rm -rf "$aliases"' EXIT
for suffix in "" "++"; do
  printf '#!/bin/sh\nexec "%s/armv7a-linux-androideabi%s-clang%s" "$@"\n' \
    "$bin" "$api" "$suffix" >"$aliases/arm-linux-androideabi-clang$suffix"
done
printf '#!/bin/sh\nexec "%s/llvm-ar" "$@"\n' "$bin" >"$aliases/arm-linux-androideabi-ar"
chmod +x "$aliases"/arm-linux-androideabi-*

export PATH="$aliases:$bin:$PATH"
export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="armv7a-linux-androideabi$api-clang"

cargo build --release --target "$target" \
  --manifest-path "$root/android-app/native/Cargo.toml"

libs="$root/android-app/app/src/main/jniLibs/armeabi-v7a"
mkdir -p "$libs"
cp "$root/android-app/native/target/$target/release/librespot_jni.so" \
  "$libs/librespot_jni.so"
echo "packaged $libs/librespot_jni.so"
