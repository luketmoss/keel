---
name: stack-android
description: Conventions, scaffold, and CI for native Android projects in Keel (Kotlin, Jetpack Glance and Compose, Gradle Kotlin DSL, WorkManager). Use when working in a project folder whose CLAUDE.md names android as its stack.
---

# Android stack

Native Android in Kotlin: a Jetpack Glance home-screen widget, Jetpack Compose
for any in-app screen, built with Gradle. Authoritative for any project, or
component of one, whose CLAUDE.md names `android`.

This is not the `mobile` stack. `stack-mobile` is Expo's managed workflow and
deliberately has no native code; a home-screen widget needs native code and a
dev build, so it lives here instead. Do not put an Expo app in this stack or a
widget in that one.

## Install is by sideload

Nothing here is published to a store. CI produces a signed release APK as a
workflow artifact, and the person installs it by downloading it to the phone
(or `adb install`). There are no App Bundles, no Play Console and no release
track, and an issue that asks for one is a new stack decision, not a small
change.

## Testing is not human-gated

The owner is the only user and has waived the on-phone check before merge.
`/test` runs what CI runs, from the project folder:

```bash
./gradlew test lintRelease assembleRelease
```

Criteria that are pure logic or checkable in CI pass on evidence: JVM unit tests
(`./gradlew test`) cover parsing, the request queue, state reducers and anything
with no Android framework in it, and a green `assembleRelease` proves the APK
builds and signs.

Criteria that need a phone, a launcher, or a widget on the home screen cannot be
checked in CI. They are **not** passed and not failed: `/test` lists them back
as **waived by the owner, not verified**, and the run continues to Ready to Ship
and merge. They are never reported as passing. They are:

- what the widget looks like or how it resizes on a launcher
- a tap on the widget, or any gesture
- background restrictions: Doze, battery saver, a force-stopped app
- offline behaviour: airplane mode, a request queued and sent later
- permissions prompts and notifications

`/ship` writes those behaviours into the issue's `## Results` as things to watch
after install, with the reminder that the APK to install comes from the merge's
CI run (the `main` run, not a debug build made for the PR). If one is wrong on
the phone the owner reports it and it is fixed as a new issue. In a
multi-component project this applies to the criteria the `android/` component
owns.

Instrumented tests and an emulator are not used. They are slow, flaky in CI and
would still not be a launcher, so the line is drawn at the JVM.

## Conventions

**Stack**

- Kotlin, with Gradle's Kotlin DSL (`*.gradle.kts`) and a version catalog,
  `gradle/libs.versions.toml`. A dependency version lives in the catalog and
  nowhere else
- Jetpack Glance for widgets, Jetpack Compose for any in-app screen
- WorkManager for anything that runs in the background or must survive being
  offline
- **HTTP: OkHttp.** The widget talks to Google Apps Script web apps, which
  answer a POST with a 302 to a different host; OkHttp follows it the way a
  browser does and needs no engine or coroutine adapter to be pulled in for a
  single call
- **JSON: kotlinx.serialization.** Compile-time generated, no reflection, so it
  survives R8 without keep rules and it is Kotlin-native (nullable and default
  values mean what they say)
- The Gradle wrapper is pinned and committed, `gradle-wrapper.jar` included.
  Upgrading Gradle or the Android Gradle Plugin is its own change

**Code**

- A widget holds no state of its own. Glance redraws it from what it is given,
  so state lives in Glance's state definition or a repository, and a tap runs an
  `ActionCallback` that enqueues work and returns
- Network calls happen in a `CoroutineWorker`, never in a callback or a
  receiver. Work is unique and named, has a `NetworkType.CONNECTED` constraint,
  and uses exponential backoff
- A write must be safe to send twice. WorkManager retries, so the caller
  generates the id (a UUID) once, when the person taps, and the server stores it
  once
- Logic that has to be tested lives in plain Kotlin classes with no `Context`.
  The widget, the worker and the activity stay thin and call into them
- Theme values come from one theme module, never inline hex
- Compose: state hoisted, `remember` only for what is genuinely UI-local, and
  no business logic in a composable

**Secrets**

- An API key is never committed. It reaches the build as a Gradle property or an
  environment variable and is read into `BuildConfig`. It is in the APK, which
  is on the phone, so a key the APK carries must be scoped to what the app is
  allowed to do and nothing more
- The signing keystore and its passwords are never committed (`.gitignore`
  excludes `*.jks` and `*.keystore`), and never printed, echoed or written to a
  log

## Signing

A release APK must be signed with the same key every time, or Android refuses to
install it over the previous one.

Create the keystore once, on your own machine:

```bash
keytool -genkeypair -v -keystore <slug>-release.jks -alias <slug> \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then set four repository secrets. They are repo-wide like every secret, so each
is prefixed with the upper-cased slug:

| Secret | Holds |
|---|---|
| `<SLUG>_ANDROID_KEYSTORE_BASE64` | the keystore file, base64 on one line |
| `<SLUG>_ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `<SLUG>_ANDROID_KEY_ALIAS` | the alias given to `keytool` |
| `<SLUG>_ANDROID_KEY_PASSWORD` | the key password |

```bash
base64 -w0 <slug>-release.jks | gh secret set <SLUG>_ANDROID_KEYSTORE_BASE64
gh secret set <SLUG>_ANDROID_KEYSTORE_PASSWORD
gh secret set <SLUG>_ANDROID_KEY_ALIAS
gh secret set <SLUG>_ANDROID_KEY_PASSWORD
```

`gh secret set` with no `--body` prompts for the value, which keeps it out of
the shell history.

**Back the keystore up outside the repo** — a password manager's attachments,
or an encrypted drive — together with its passwords and alias. A repository secret
cannot be read back, and a lost key cannot be recovered or replaced: the only
way forward is to uninstall the app, losing its data, and install one signed
with a new key. Do this before the first release, not after.

The workflow uses the secrets to sign and for nothing else. It never prints
them: no `echo`, no `set -x`, no step that dumps the environment. GitHub masks a
secret's exact value in logs, but a base64 of it or a substring is not masked,
so the rule is not to emit them at all.

## Multi-component projects

A project with an Android component lists it in its `## Stacks` table, in the
parent project's own CLAUDE.md:

```markdown
| Path | Stack |
|---|---|
| `frontend/` | web |
| `android/` | android |
```

Per `CONVENTIONS.md` §Multi-component projects the longest matching path wins,
so `thrive/CLAUDE.md` with an `android/` row resolves
`thrive/android/app/src/main/kotlin/Widget.kt` to this skill, and no further
change to the conventions is needed. In that layout `<slug>` in
[scaffold.md](scaffold.md)'s paths reads as `<slug>/android`, and the CI job is
named `android`.

## Scaffold and CI

The project scaffold, the CLAUDE.md template and the CI workflow are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.
