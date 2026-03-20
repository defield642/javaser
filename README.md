# GeXuP (React Native)

Dark, game-optimizer style UI with Home, Game List, and Boost Status screens. One game at a time, server selection sorted by measured TCP latency.

## Setup

```bash
npm install
```

## Run (Android)

```bash
npx react-native run-android
```

## TCP Ping

This app uses `react-native-tcp-socket` to measure **TCP connect latency** to each server host/port. Update the server list with real targets:

`src/data/servers.ts`

## Permissions

`android/app/src/main/AndroidManifest.xml` includes a broad set of permissions (per your request). Some are sensitive or restricted by Android/Play policies. Remove any you don’t need.
