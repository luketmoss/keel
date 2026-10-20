# android stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a project or component of this stack is created.

`<slug>` is the project folder, or `<slug>/android` for a component of a
multi-component project. `<package>` is the application id, such as
`com.example.<slug>`, and `<package path>` is the same with `/` for `.`.
Version numbers below are the pins at the time of writing; bump them in the
catalog, nowhere else.

## Scaffold

```
<slug>/
├── CLAUDE.md
├── .gitignore
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradlew
├── gradlew.bat
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
├── docs/design/.gitkeep
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── kotlin/<package path>/
        │   │   ├── MainActivity.kt
        │   │   ├── core/Greeting.kt        # plain Kotlin: the testable part
        │   │   └── widget/
        │   │       ├── AppWidget.kt
        │   │       └── AppWidgetReceiver.kt
        │   └── res/
        │       ├── values/strings.xml
        │       └── xml/app_widget_info.xml
        └── test/kotlin/<package path>/core/GreetingTest.kt
```

`gradle-wrapper.jar` and the two scripts are generated, not typed. With any
Gradle installed, run once in `<slug>/`:

```bash
gradle wrapper --gradle-version 8.11.1 --distribution-type bin
```

then add `distributionSha256Sum` to `gradle-wrapper.properties` with the value
from gradle.org's checksums page for that version, and commit all four files.
The wrapper is pinned so that CI and a laptop build with the same Gradle.

### .gitignore

```
.gradle/
build/
local.properties
.idea/
*.iml
*.jks
*.keystore
```

### settings.gradle.kts

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "<slug>"
include(":app")
```

### build.gradle.kts

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
```

### gradle.properties

```
org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
org.gradle.caching=true
android.useAndroidX=true
kotlin.code.style=official
```

### gradle/libs.versions.toml

```toml
[versions]
agp = "8.7.3"
kotlin = "2.0.21"
composeBom = "2024.12.01"
activityCompose = "1.9.3"
glance = "1.1.1"
workManager = "2.10.0"
okhttp = "4.12.0"
serialization = "1.7.3"
coroutines = "1.9.0"
junit = "4.13.2"

[libraries]
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
androidx-compose-material3 = { module = "androidx.compose.material3:material3" }
androidx-compose-ui = { module = "androidx.compose.ui:ui" }
androidx-glance-appwidget = { module = "androidx.glance:glance-appwidget", version.ref = "glance" }
androidx-glance-material3 = { module = "androidx.glance:glance-material3", version.ref = "glance" }
androidx-work-runtime-ktx = { module = "androidx.work:work-runtime-ktx", version.ref = "workManager" }
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
junit = { module = "junit:junit", version.ref = "junit" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

### app/build.gradle.kts

The release signing config reads four environment variables and is attached
only when they are all set, so a laptop without the keystore still builds an
unsigned release and CI always signs. Nothing is read from a file in the repo.

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "<package>"
    compileSdk = 35

    defaultConfig {
        applicationId = "<package>"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    val signed = keystorePath != null &&
        System.getenv("ANDROID_KEYSTORE_PASSWORD") != null &&
        System.getenv("ANDROID_KEY_ALIAS") != null &&
        System.getenv("ANDROID_KEY_PASSWORD") != null

    signingConfigs {
        if (signed) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (signed) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { compose = true }
    lint { warningsAsErrors = false; abortOnError = true }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
}
```

### app/proguard-rules.pro

```
# kotlinx.serialization needs no keep rules for @Serializable classes; add
# project-specific rules below only when a release build proves one is needed.
```

### app/src/main/AndroidManifest.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="false"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <receiver
            android:name=".widget.AppWidgetReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/app_widget_info" />
        </receiver>
    </application>
</manifest>
```

### app/src/main/res/values/strings.xml

```xml
<resources>
    <string name="app_name"><slug></string>
    <string name="widget_description">Replace with what the widget shows.</string>
</resources>
```

### app/src/main/res/xml/app_widget_info.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/widget_description"
    android:minWidth="110dp"
    android:minHeight="110dp"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:updatePeriodMillis="0"
    android:widgetCategory="home_screen" />
```

`updatePeriodMillis="0"` is deliberate: the platform's timer is coarse and
wakes the device. A widget that must refresh asks WorkManager.

### core/Greeting.kt

The placeholder for the testable part. Replace it with the project's real
logic; keep the shape, which is plain Kotlin with no `Context`.

```kotlin
package <package>.core

object Greeting {
    fun forName(name: String?): String =
        if (name.isNullOrBlank()) "Hello" else "Hello, ${name.trim()}"
}
```

### widget/AppWidget.kt

```kotlin
package <package>.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxSize
import androidx.glance.text.Text
import <package>.core.Greeting

class AppWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { Content() }
    }

    @Composable
    private fun Content() {
        Box(
            modifier = GlanceModifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = Greeting.forName(null))
        }
    }
}
```

### widget/AppWidgetReceiver.kt

```kotlin
package <package>.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

class AppWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AppWidget()
}
```

### MainActivity.kt

```kotlin
package <package>

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import <package>.core.Greeting

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme { Text(Greeting.forName(null)) }
        }
    }
}
```

### test/.../core/GreetingTest.kt

```kotlin
package <package>.core

import org.junit.Assert.assertEquals
import org.junit.Test

class GreetingTest {
    @Test
    fun blankNameGetsTheBareGreeting() {
        assertEquals("Hello", Greeting.forName("  "))
    }

    @Test
    fun nameIsTrimmed() {
        assertEquals("Hello, Ada", Greeting.forName(" Ada "))
    }
}
```

## CLAUDE.md template

```markdown
# CLAUDE.md — <slug>

<one-line purpose>

**Stack:** android — `.claude/skills/stack-android/SKILL.md` is authoritative.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to <slug>.

## Key commands

- `./gradlew test` — JVM unit tests
- `./gradlew lintRelease` — Android lint
- `./gradlew assembleRelease` — a release APK; signed only when the four
  `ANDROID_*` environment variables are set, otherwise unsigned
- `./gradlew installDebug` — to a connected phone or emulator

## Install

Sideloaded, never published. Download the `<slug>-apk` artifact from the latest
green run of `.github/workflows/<slug>.yml` and install it on the phone. The
signing keystore is backed up outside the repo; see the stack skill.
```

For a component of a multi-component project, there is no separate CLAUDE.md:
add the row below to the parent project's `## Stacks` table, add
`.claude/skills/stack-android/SKILL.md` to the sentence naming the skills, and
put the commands above in its `## Key commands` prefixed with `cd android &&`.

```markdown
| `android/` | android |
```

## CI workflow

Build, unit tests, lint, then a signed release APK uploaded as a workflow
artifact. Never published anywhere; the person installs it by sideload.

The cache key is prefixed with the slug like every other project's, and
`hashFiles` paths are relative to the repository root, not to the working
directory.

```yaml
name: <slug>
on:
  pull_request:
    paths: ['<slug>/**', '.github/workflows/<slug>.yml']
  push:
    branches: [main]
    paths: ['<slug>/**', '.github/workflows/<slug>.yml']
concurrency:
  group: <slug>-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '17'
      - uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: <slug>-gradle-${{ hashFiles('<slug>/**/*.gradle.kts', '<slug>/gradle/libs.versions.toml', '<slug>/gradle/wrapper/gradle-wrapper.properties') }}
          restore-keys: <slug>-gradle-
      - run: chmod +x gradlew
      - run: ./gradlew test lintRelease
      - name: Decode the keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.<SLUG>_ANDROID_KEYSTORE_BASE64 }}
        run: |
          echo "$KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.jks"
          echo "ANDROID_KEYSTORE_PATH=$RUNNER_TEMP/release.jks" >> "$GITHUB_ENV"
      - name: Assemble the signed release APK
        env:
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.<SLUG>_ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.<SLUG>_ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.<SLUG>_ANDROID_KEY_PASSWORD }}
        run: ./gradlew assembleRelease
      - uses: actions/upload-artifact@v4
        with:
          name: <slug>-apk
          path: <slug>/app/build/outputs/apk/release/*.apk
          if-no-files-found: error
          retention-days: 30
```

- The four secrets are used in exactly two steps, only to write the keystore
  and to sign. No step prints them, and none may: do not add `echo`, `set -x`
  or an environment dump to this job.
- `upload-artifact`'s `path` is relative to the repository root, not the working
  directory, which is why it carries the `<slug>/` prefix the steps above do
  not.
- A workflow artifact expires after `retention-days`. Rebuild from `main` for a
  fresh one; the build is the release.
- A pull request from a fork has no access to secrets, and this job fails at the
  keystore step for it. That is accepted: Keel's repository has no outside
  contributors, and a fork's APK should not be signed with our key.
- For a component of a multi-component project, the job is named after its
  path (`android`) and `<slug>` in the steps' paths reads as `<slug>/android`;
  the trigger filter, concurrency group and cache-key prefix stay the
  project's.
