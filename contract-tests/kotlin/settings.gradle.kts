// The widget contract's Kotlin readers, tested on a plain JVM — no Android
// build, no emulator. Run with the app's own wrapper:
//   ./android/gradlew -p contract-tests/kotlin test
pluginManagement {
  repositories {
    gradlePluginPortal()
    mavenCentral()
  }
}

rootProject.name = "widget-contract-tests"
